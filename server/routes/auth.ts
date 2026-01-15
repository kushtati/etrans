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
import { logger, logSecurity, logError } from '../config/logger';

// Re-export pour faciliter les imports
export { authenticateJWT } from '../middleware/auth';

const router = express.Router();

// ============================================
// CONFIGURATION
// ============================================

/**
 * Validation robuste JWT_SECRET
 */
const validateJWTSecret = (secret: string | undefined): void => {
  if (!secret) {
    logger.error('JWT_SECRET not defined in environment');
    logger.error('Generate secure secret: openssl rand -base64 32');
    process.exit(1);
  }
  
  if (secret.length < 32) {
    logger.error('JWT_SECRET too short (minimum 32 characters)');
    process.exit(1);
  }
  
  // Vérifier entropie (caractères uniques)
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 10) {
    logger.error('JWT_SECRET has insufficient entropy (too repetitive)');
    logger.error('Generate secure secret: openssl rand -base64 32');
    process.exit(1);
  }
  
  // Avertir si patterns faibles
  const weakPatterns = ['test', 'dev', 'secret', 'password', '123', 'abc'];
  if (weakPatterns.some(p => secret.toLowerCase().includes(p))) {
    logger.warn('JWT_SECRET contains weak pattern, consider regenerating');
  }
};

const JWT_SECRET = process.env.JWT_SECRET!;
validateJWTSecret(JWT_SECRET);
const JWT_EXPIRES_IN = '24h';
const BCRYPT_ROUNDS = 12; // Coût hachage (12 = ~250ms)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

// ============================================
// RATE LIMITING
// ============================================

// Rate limiter global pour /auth/* (strict en production)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 500 : 100, // Strict en production
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
    logger.error('Error parsing login attempts', { error });
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

// auditLog supprimé - utiliser logger.info/warn/error directement

// ============================================
// ROUTE: CSRF TOKEN
// ============================================

/**
 * GET /api/auth/csrf-token
 * Génère et stocke un token CSRF dans Redis pour validation
 */
router.get('/csrf-token', async (req: Request, res: Response) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const sessionId = req.user?.id || req.ip || 'anonymous';
    
    // Stocker dans Redis avec TTL 1h
    await redis.set(`csrf:${sessionId}`, token, 3600);
    
    // Créer cookie XSRF-TOKEN pour validation cross-domain
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false, // Frontend doit pouvoir lire le token
      secure: process.env.NODE_ENV === 'production', // HTTPS uniquement en prod
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Cross-domain en prod
      maxAge: 60 * 60 * 1000, // 1h
      path: '/'
    });
    
    res.json({ token });
  } catch (error) {
    logError('CSRF token generation failed', error as Error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur génération token CSRF'
    });
  }
});

/**
 * Middleware validation CSRF
 */
const validateCSRF = async (req: Request, res: Response, next: NextFunction) => {
  const csrfToken = req.headers['x-csrf-token'] as string;
  const sessionId = req.user?.id || req.ip || 'anonymous';
  
  if (!csrfToken) {
    logSecurity('CSRF_TOKEN_MISSING', { sessionId, ip: req.ip });
    return res.status(403).json({ 
      success: false, 
      message: 'Token CSRF manquant' 
    });
  }
  
  try {
    const storedToken = await redis.get(`csrf:${sessionId}`);
    
    if (csrfToken !== storedToken) {
      logSecurity('CSRF_VALIDATION_FAILED', { sessionId, ip: req.ip });
      return res.status(403).json({ 
        success: false, 
        message: 'Token CSRF invalide' 
      });
    }
    
    next();
  } catch (error) {
    logError('CSRF validation error', error as Error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur validation CSRF' 
    });
  }
};

// ============================================
// ROUTE: LOGIN
// ============================================

router.post(
  '/login',
  validateCSRF,
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 })
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

      const { email, password } = req.body;
      const ip = req.ip;
      const userAgent = req.get('user-agent') || 'Unknown';

      // 2. Vérifier verrouillage compte
      if (await isAccountLocked(email)) {
        logger.warn('Login blocked - account locked', { email, ip });
        return res.status(429).json({
          success: false,
          message: 'Compte temporairement verrouillé. Réessayez plus tard.'
        });
      }

      // 3. Récupérer utilisateur (avec timing protection intégré)
      const user = await findUserByEmail(email);

      // 4. Vérifier mot de passe (timing constant)
      let passwordMatch = false;
      if (user) {
        passwordMatch = await bcrypt.compare(password, user.password);
      }
      // Si user null, findUserByEmail a déjà fait dummy hash

      // 5. Enregistrer tentative
      await recordLoginAttempt(email, passwordMatch && !!user);

      // 6. Rejeter si échec (timing constant)
      if (!user || !passwordMatch) {
        logger.warn('Login failed', { 
          email, 
          ip,
          reason: !user ? 'user_not_found' : 'wrong_password'
        });
        
        return res.status(401).json({
          success: false,
          message: 'Identifiants invalides'
        });
      }

      // 7. Vérifier si 2FA activé
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

      // 8. Succès - Générer JWT
      const token = generateJWT(user);

      // Mettre à jour dernière connexion
      await updateLastLogin(user.id);

      logger.info('Login success', { 
        userId: user.id, 
        email, 
        role: user.role,
        ip
      });

      // 9. Définir cookie httpOnly (sécurisé)
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' requis pour cross-origin
        maxAge: 24 * 60 * 60 * 1000, // 24h
        path: '/',
        domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined
      });

      // 10. Réponse
      res.json({
        success: true,
        twoFactorRequired: false,
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });

    } catch (error) {
      logError('Login error', error as Error, { ip: req.ip });
      
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
        logger.warn('2FA verification failed', { userId: user.id });
        return res.status(401).json({
          success: false,
          message: 'Code 2FA invalide'
        });
      }

      // 4. Succès - Générer JWT final
      const token = generateJWT(user);

      logger.info('2FA verification success', { userId: user.id });

      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' requis pour cross-origin
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

    } catch (error) {
      logError('2FA verification error', error as Error);
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

    logger.info('2FA setup initiated', { userId });

    res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl
    });

  } catch (error) {
    logError('2FA setup error', error as Error);
    res.status(500).json({
      success: false,
      message: 'Erreur configuration 2FA'
    });
  }
});

// ============================================
// ROUTE: LOGOUT
// ============================================

router.post('/logout', authenticateJWT, validateCSRF, async (req: Request, res: Response) => {
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
          
          // Hash token pour économiser mémoire Redis
          if (ttl > 0) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await redis.set(`revoked:${tokenHash}`, '1', ttl);
            logger.info('Token blacklisted', { userId, ttl });
          }
        }
      } catch (error) {
        logger.warn('Token blacklist failed (non-critical)', { error });
      }
    }

    logger.info('User logged out', { userId });

    // Supprimer cookie
    res.clearCookie('auth_token');

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });

  } catch (error) {
    logError('Logout error', error as Error);
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
    const { password, biometricVerified } = req.body;

    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Session expirée, reconnectez-vous' 
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

    // Option 1: Mot de passe
    if (password) {
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        logger.warn('Unlock failed - wrong password', { 
          userId: user.id,
          email: user.email
        });

        return res.status(401).json({ 
          success: false, 
          message: 'Mot de passe incorrect' 
        });
      }
      
      logger.info('Unlock success - password', { userId: user.id });
      return res.json({ success: true, message: 'Session déverrouillée' });
    }
    
    // Option 2: Biométrie (validée par WebAuthn en amont)
    if (biometricVerified === true) {
      // NOTE: biometricVerified doit être validé par /api/webauthn/verify avant
      // Cette route ne fait que confirmer que la biométrie a été validée
      logger.info('Unlock success - biometric', { userId: user.id });
      return res.json({ success: true, message: 'Session déverrouillée (biométrie)' });
    }

    // Aucune méthode fournie
    return res.status(400).json({ 
      success: false, 
      message: 'Mot de passe ou biométrie requis' 
    });

  } catch (error) {
    logError('Unlock error', error as Error);
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
      twoFactorSecret: user.twoFactorSecret || undefined,
      createdAt: user.createdAt
    };
  } catch (error) {
    logError('Error in findUserByEmail', error as Error);
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
      twoFactorSecret: user.twoFactorSecret || undefined,
      createdAt: user.createdAt
    };
  } catch (error) {
    logError('Error in findUserById', error as Error);
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
    logError('Error in updateLastLogin', error as Error, { userId });
  }
}

async function saveTempTwoFactorSecret(userId: string, secret: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret }
    });
  } catch (error) {
    logError('Error in saveTempTwoFactorSecret', error as Error, { userId });
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

    // 🔥 CRITIQUE : Headers anti-cache (sécurité)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.removeHeader('ETag');

    // Décoder les permissions depuis le JWT (rapide, pas besoin cache)
    const permissions = decodePermissions(req.user.permissions);

    const response = {
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        permissions
      }
    };

    res.json(response);

  } catch (error) {
    logError('Get user info error', error as Error);
    
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
router.post('/refresh', authenticateJWT, validateCSRF, async (req: Request, res: Response) => {
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
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' requis pour cross-origin
      maxAge: 24 * 60 * 60 * 1000, // 24h
      path: '/',
      domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined
    });

    logger.info('Token refreshed', {
      userId: req.user.id,
      ip: req.ip
    });

    res.json({
      success: true,
      token: newToken
    });

  } catch (error) {
    logError('Token refresh error', error as Error);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors du rafraîchissement du token'
    });
  }
});

export default router;
