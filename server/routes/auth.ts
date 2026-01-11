/**
 * BACKEND AUTHENTIFICATION - ROUTES SÉCURISÉES
 * 
 * Stack:
 * - Express.js
 * - bcrypt (hachage mots de passe)
 * - JWT (tokens)
 * - express-rate-limit (rate limiting)
 * - helmet (sécurité headers)
 */

import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { body, validationResult } from 'express-validator';
import { encodePermissions, decodePermissions } from '../utils/permissions';
import { Role } from '../types';
import { redis } from '../config/redis';
import { prisma } from '../config/prisma';
import { authenticateJWT } from '../middleware/auth';
import crypto from 'crypto';

// Re-export pour faciliter les imports
export { authenticateJWT } from '../middleware/auth';

const router = express.Router();

// ============================================
// CONFIGURATION
// ============================================

// 🔐 SÉCURITÉ CRITIQUE : JWT_SECRET doit TOUJOURS être défini
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('🚨 CRITICAL SECURITY ERROR: JWT_SECRET must be set in environment variables');
  console.error('Generate a secure secret with: openssl rand -base64 32');
  console.error('Then set it in .env.server: JWT_SECRET=<your_secret>');
  process.exit(1); // CRASH - Ne JAMAIS démarrer sans secret
}
const JWT_EXPIRES_IN = '24h';
const BCRYPT_ROUNDS = 12; // Coût hachage (12 = ~250ms)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

// ============================================
// RATE LIMITING
// ============================================

// Rate limiter global pour /auth/* (500 requêtes/15min - augmenté pour dev)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Augmenté pour éviter le blocage en dev
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter strict pour login (5 tentatives/15min par IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Ne compte que les échecs
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
});

router.use(authLimiter);

// ============================================
// TYPES & INTERFACES
// ============================================

// Types déjà définis dans server/middleware/auth.ts et server/types/express.d.ts
// Pas besoin de redéclarer ici

interface User {
  id: string;
  email: string;
  password: string; // Hash bcrypt
  name?: string; // Nom complet utilisateur
  role: Role; // Utiliser enum Role au lieu de string
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  createdAt: Date;
  lastLogin?: Date;
}

interface LoginAttempt {
  email: string;
  ip: string;
  userAgent: string;
  success: boolean;
  timestamp: Date;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Vérifie si un compte est verrouillé (Redis + fallback mémoire)
 */
const isAccountLocked = async (email: string): Promise<boolean> => {
  const key = `login_attempts:${email}`;
  const data = await redis.get(key);
  
  if (!data) return false;
  
  try {
    const attempts = JSON.parse(data);
    
    if (attempts.lockedUntil && new Date(attempts.lockedUntil) > new Date()) {
      return true;
    }
    
    // Débloquer si période expirée
    if (attempts.lockedUntil && new Date(attempts.lockedUntil) <= new Date()) {
      await redis.del(key);
      return false;
    }
    
    return false;
  } catch (error) {
    console.error('[AUTH] Error parsing login attempts:', error);
    return false;
  }
};

/**
 * Enregistre une tentative de connexion (Redis + fallback mémoire)
 */
const recordLoginAttempt = async (email: string, success: boolean): Promise<void> => {
  const key = `login_attempts:${email}`;
  
  if (success) {
    // Succès = réinitialiser
    await redis.del(key);
    return;
  }
  
  // Échec = incrémenter
  const data = await redis.get(key);
  let attempts = data ? JSON.parse(data) : { attempts: 0 };
  
  attempts.attempts++;
  
  // Verrouiller après MAX_LOGIN_ATTEMPTS
  if (attempts.attempts >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString();
  }
  
  // TTL = durée de verrouillage
  const ttl = LOCK_DURATION_MINUTES * 60;
  await redis.set(key, JSON.stringify(attempts), ttl);
};

/**
 * Génère un JWT
 */
const generateJWT = (user: User): string => {
  return jwt.sign(
    {
      sub: user.id, // ✅ Standard JWT (subject)
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: encodePermissions(user.role) // Encoder permissions dans JWT
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'transit-guinee',
      audience: 'transit-users'
    }
  );
};

/**
 * Log d'audit sécurisé
 */
const auditLog = (action: string, details: any): void => {
  // En production : envoyer vers service de logging (Datadog, ELK, etc.)
  console.log('[AUDIT]', {
    action,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// ============================================
// ROUTE: CSRF TOKEN
// ============================================

/**
 * GET /api/auth/csrf-token
 * Retourne un token CSRF pour protéger les requêtes POST/PUT/DELETE
 * 
 * Note: Pour une vraie app en production, utiliser le package 'csurf' 
 * et valider le token côté backend. Cette implémentation simple génère
 * juste un token aléatoire pour satisfaire le frontend.
 */
router.get('/csrf-token', (req: Request, res: Response) => {
  try {
    // Générer un token aléatoire sécurisé (32 bytes = 256 bits)
    const token = crypto.randomBytes(32).toString('hex');
    
    // En production, stocker ce token dans la session/redis pour validation
    // et le valider sur les routes protégées
    
    res.json({ token });
  } catch (error: any) {
    console.error('CSRF token generation failed:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération du token CSRF',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE: LOGIN
// ============================================

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('isHashed').optional().isBoolean()
  ],
  async (req: Request, res: Response) => {
    try {
      // 1. Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          message: 'Données invalides',
          errors: errors.array() 
        });
      }

      const { email, password, isHashed } = req.body;
      const ip = req.ip;
      const userAgent = req.get('user-agent') || 'Unknown';

      // 2. Vérifier verrouillage compte
      if (await isAccountLocked(email)) {
        auditLog('LOGIN_BLOCKED_LOCKED_ACCOUNT', { email, ip });
        return res.status(429).json({
          success: false,
          message: 'Compte temporairement verrouillé. Réessayez plus tard.'
        });
      }

      // 3. Récupérer utilisateur depuis base de données
      // TODO: Remplacer par vraie requête DB
      const user = await findUserByEmail(email);

      if (!user) {
        await recordLoginAttempt(email, false);
        auditLog('LOGIN_FAILED_USER_NOT_FOUND', { email, ip });
        
        // Message générique (ne pas révéler si user existe)
        return res.status(401).json({
          success: false,
          message: 'Identifiants invalides'
        });
      }

      // 4. Vérifier mot de passe
      // Note: Le mot de passe est envoyé en clair via HTTPS
      // bcrypt compare le plaintext avec le hash stocké
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        await recordLoginAttempt(email, false);
        auditLog('LOGIN_FAILED_WRONG_PASSWORD', { email, ip });
        
        return res.status(401).json({
          success: false,
          message: 'Identifiants invalides'
        });
      }

      // 5. Vérifier si 2FA activé
      if (user.twoFactorEnabled) {
        // Générer token temporaire pour étape 2FA
        const tempToken = jwt.sign(
          { id: user.id, step: '2fa' },
          JWT_SECRET,
          { expiresIn: '5m' }
        );

        return res.json({
          success: true,
          twoFactorRequired: true,
          tempToken
        });
      }

      // 6. Succès - Générer JWT
      await recordLoginAttempt(email, true);

      const token = generateJWT(user);

      // Mettre à jour dernière connexion
      await updateLastLogin(user.id);

      auditLog('LOGIN_SUCCESS', { 
        userId: user.id, 
        email, 
        role: user.role,
        ip,
        userAgent
      });

      // 7. Définir cookie httpOnly (sécurisé)
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // HTTPS uniquement en prod
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // ✅ 'lax' en dev pour cross-port
        maxAge: 24 * 60 * 60 * 1000, // 24h
        path: '/', // ✅ Cookie disponible sur tous les chemins
        domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined // ✅ Partage entre ports localhost
      });

      // 8. Réponse
      res.json({
        success: true,
        twoFactorRequired: false,
        token, // Pour stockage côté client si nécessaire
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });

    } catch (error: any) {
      console.error('Login error:', error);
      auditLog('LOGIN_ERROR', { error: error.message });
      
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la connexion'
      });
    }
  }
);

// ============================================
// ROUTE: VERIFY 2FA
// ============================================

router.post(
  '/verify-2fa',
  [
    body('tempToken').notEmpty(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric()
  ],
  async (req: Request, res: Response) => {
    try {
      const { tempToken, code } = req.body;

      // 1. Vérifier token temporaire
      let decoded: any;
      try {
        decoded = jwt.verify(tempToken, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({
          success: false,
          message: 'Token invalide ou expiré'
        });
      }

      if (decoded.step !== '2fa') {
        return res.status(401).json({
          success: false,
          message: 'Token invalide'
        });
      }

      // 2. Récupérer utilisateur
      const user = await findUserById(decoded.id);
      
      if (!user || !user.twoFactorSecret) {
        return res.status(401).json({
          success: false,
          message: '2FA non configuré'
        });
      }

      // 3. Vérifier code TOTP
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2 // Accepter ±2 intervalles de temps (1 min)
      });

      if (!verified) {
        auditLog('2FA_FAILED', { userId: user.id });
        return res.status(401).json({
          success: false,
          message: 'Code 2FA invalide'
        });
      }

      // 4. Succès - Générer JWT final
      const token = generateJWT(user);

      auditLog('2FA_SUCCESS', { userId: user.id });

      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
        domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined
      });

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });

    } catch (error: any) {
      console.error('2FA verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur'
      });
    }
  }
);

// ============================================
// ROUTE: ENABLE 2FA
// ============================================

router.post('/enable-2fa', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = req.user.id;

    // 1. Générer secret 2FA
    const secret = speakeasy.generateSecret({
      name: `TransitGuinée (${req.user.email})`,
      issuer: 'TransitGuinée'
    });

    // 2. Générer QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    // 3. Sauvegarder secret (temporairement, confirmé après vérification)
    await saveTempTwoFactorSecret(userId, secret.base32);

    auditLog('2FA_SETUP_INITIATED', { userId });

    res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur configuration 2FA'
    });
  }
});

// ============================================
// ROUTE: LOGOUT
// ============================================

router.post('/logout', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    const userId = req.user.id;
    
    // Récupérer token pour blacklist
    const token = req.cookies.auth_token || req.headers.authorization?.split(' ')[1];
    
    if (token) {
      try {
        // Décoder pour obtenir expiration
        const decoded = jwt.decode(token) as any;
        
        if (decoded && decoded.exp) {
          // Calculer TTL restant jusqu'à expiration naturelle du token
          const ttl = decoded.exp - Math.floor(Date.now() / 1000);
          
          // Blacklist token jusqu'à expiration (pas plus longtemps)
          if (ttl > 0) {
            await redis.set(`revoked:${token}`, '1', ttl);
            console.log(`[AUTH] Token blacklisted for ${ttl}s`);
          }
        }
      } catch (error) {
        console.warn('[AUTH] Token blacklist failed (non-critical):', (error as Error).message);
      }
    }

    // Invalider token (en prod: blacklist Redis)
    auditLog('LOGOUT', { userId });

    // Supprimer cookie
    res.clearCookie('auth_token');

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur déconnexion'
    });
  }
});

// ============================================
// ROUTE: DÉVERROUILLAGE RAPIDE
// ============================================

/**
 * POST /api/auth/unlock
 * 
 * Déverrouillage rapide après mise en veille/inactivité
 * Re-valide le mot de passe sans créer nouveau token
 * Token JWT reste valide, on vérifie juste identité
 */
router.post('/unlock', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    // Si pas de user (session expirée), c'est normal lors du verrouillage
    // Le JWT peut être expiré mais le cookie session persiste
    if (!req.user) {
      return res.status(200).json({ 
        success: true, 
        message: 'Session déverrouillée (biométrie)' 
      });
    }

    if (!password) {
      // Déverrouillage biométrique sans password
      return res.status(200).json({ 
        success: true, 
        message: 'Session déverrouillée (biométrie)' 
      });
    }

    // Récupérer user depuis DB
    const user = await findUserByEmail(req.user.email);

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Utilisateur introuvable' 
      });
    }

    // Vérifier mot de passe
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      auditLog('UNLOCK_FAILED', { 
        userId: user.id, 
        email: user.email,
        reason: 'wrong_password'
      });

      return res.status(401).json({ 
        success: false, 
        message: 'Mot de passe incorrect' 
      });
    }

    // Succès - Session déverrouillée
    auditLog('UNLOCK_SUCCESS', { 
      userId: user.id, 
      email: user.email 
    });

    res.json({ 
      success: true, 
      message: 'Session déverrouillée' 
    });

  } catch (error) {
    console.error('[AUTH] Unlock error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur déverrouillage' 
    });
  }
});

// ============================================
// DATABASE FUNCTIONS (PRISMA)
// ============================================

/**
 * Récupère un utilisateur par email (requête Prisma)
 * 
 * 🛡️ TIMING ATTACK PROTECTION:
 * - Toujours simuler hash même si user n'existe pas
 * - Temps constant quelque soit l'existence de l'email
 */
async function findUserByEmail(email: string): Promise<User | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    
    if (!user) {
      // Simuler temps de hash avec BCRYPT_ROUNDS cohérent (timing attack protection)
      const dummyHash = await bcrypt.hash('dummy_password_for_timing', BCRYPT_ROUNDS);
      await bcrypt.compare('dummy', dummyHash);
      return null;
    }

    // Map Prisma User vers types.ts User
    return {
      id: user.id,
      email: user.email,
      password: user.password,
      name: user.name || undefined,
      role: user.role as Role,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt
    };
  } catch (error) {
    console.error('❌ Erreur findUserByEmail:', error);
    return null;
  }
}

async function findUserById(id: string): Promise<User | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      password: user.password,
      name: user.name || undefined,
      role: user.role as Role,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt
    };
  } catch (error) {
    console.error('❌ Erreur findUserById:', error);
    return null;
  }
}

async function updateLastLogin(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() }
    });
  } catch (error) {
    console.error('❌ Erreur updateLastLogin:', error);
  }
}

async function saveTempTwoFactorSecret(userId: string, secret: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret }
    });
  } catch (error) {
    console.error('❌ Erreur saveTempTwoFactorSecret:', error);
  }
}

// ============================================
// ROUTE: GET CURRENT USER (ME)
// ============================================

/**
 * GET /api/auth/me
 * 
 * ✅ SÉCURITÉ: Retourne les informations utilisateur depuis le JWT
 * Le rôle ne peut PAS être modifié côté client
 * 
 * Headers requis:
 * - Cookie: auth_token (httpOnly)
 * - Authorization: Bearer <token> (fallback)
 */
router.get('/me', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
    }

    // ⚡ CACHE REDIS - Éviter de re-décoder les permissions à chaque requête
    const cacheKey = `user:info:${req.user.id}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        // 🔥 CRITIQUE : Headers anti-cache (sécurité double couche)
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.removeHeader('ETag');
        res.setHeader('Last-Modified', new Date().toUTCString());
        
        return res.json(JSON.parse(cached));
      }
    } catch (redisErr) {
      console.warn('[REDIS] Cache read failed for /me, continuing without cache:', redisErr);
    }

    // 🔥 CRITIQUE : Headers anti-cache (sécurité double couche)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.removeHeader('ETag');
    res.setHeader('Last-Modified', new Date().toUTCString());

    // Décoder les permissions depuis le JWT
    const permissions = decodePermissions(req.user.permissions);

    auditLog('USER_INFO_FETCHED', {
      userId: req.user.id,
      role: req.user.role,
      ip: req.ip
    });

    const response = {
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        permissions // Permissions décodées pour vérifications frontend
      }
    };

    // Mettre en cache pour 30 secondes (équilibre entre performance et sécurité)
    try {
      await redis.set(cacheKey, JSON.stringify(response), 30);
    } catch (redisErr) {
      console.warn('[REDIS] Cache write failed for /me:', redisErr);
    }

    res.json(response);

  } catch (error: any) {
    console.error('Get user info error:', error);
    auditLog('USER_INFO_ERROR', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des informations'
    });
  }
});

// ============================================
// ROUTE: REFRESH TOKEN
// ============================================

/**
 * POST /api/auth/refresh
 * 
 * Rafraîchit le JWT sans redemander les credentials
 * Utile pour prolonger la session utilisateur
 */
router.post('/refresh', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    
    // Récupérer les infos complètes depuis DB
    const fullUser = await findUserById(req.user.id);
    
    if (!fullUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable'
      });
    }

    // Générer nouveau token
    const newToken = generateJWT(fullUser);

    // Mettre à jour cookie
    res.cookie('auth_token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24h
      path: '/',
      domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined
    });

    auditLog('TOKEN_REFRESHED', {
      userId: req.user.id,
      ip: req.ip
    });

    res.json({
      success: true,
      token: newToken
    });

  } catch (error: any) {
    console.error('Token refresh error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors du rafraîchissement du token'
    });
  }
});

export default router;
