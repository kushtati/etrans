/**
 * 🔐 Middleware d'Authentification JWT
 * 
 * Vérifie les tokens JWT pour les routes protégées.
 * Utilise jsonwebtoken pour validation sécurisée.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { redis } from '../config/redis';
import { logger, logSecurity, logError } from '../config/logger';

// Interface pour les données du token JWT
export interface JWTPayload {
  id: string; // Pas userId, juste id
  email: string;
  name?: string;
  role: string;
  permissions: string;
  iat?: number;
  exp?: number;
}

// Constante expiration token (cohérent avec auth.ts)
const JWT_EXPIRES_IN: string | number = process.env.JWT_EXPIRES_IN || '24h';

// Étendre Request Express avec user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Middleware authentification JWT
 * ✅ Vérifie le token dans:
 *    1. Cookie httpOnly 'auth_token' (PRIORITAIRE - plus sécurisé)
 *    2. Header Authorization: Bearer <token> (fallback)
 * ✅ Vérifie blacklist Redis (tokens révoqués)
 */
export const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ✅ PRIORITÉ 1: Cookie httpOnly (plus sécurisé, protégé XSS)
    let token = req.cookies?.auth_token;
    
    // ✅ PRIORITÉ 2: Header Authorization (fallback pour API externe)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Remove "Bearer "
      }
    }
    
    // ❌ Aucun token trouvé
    if (!token) {
      return res.status(401).json({ 
        error: 'Token manquant',
        message: 'Authentification requise. Veuillez vous connecter.' 
      });
    }
    
    // ✅ CRITIQUE: Vérifier si token révoqué (blacklist Redis)
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const isRevoked = await redis.get(`revoked:${tokenHash}`);
      
      if (isRevoked) {
        logSecurity('BLACKLISTED_TOKEN_ATTEMPT', { 
          ip: req.ip,
          path: req.path 
        });
        
        return res.status(401).json({ 
          error: 'Token révoqué',
          message: 'Ce token a été révoqué. Reconnectez-vous.' 
        });
      }
    } catch (redisError) {
      // Redis indisponible : continuer (dégradé mais fonctionnel)
      logger.warn('Redis blacklist check failed', { error: redisError });
    }
    
    // Vérifier JWT_SECRET existe
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET missing in environment');
      return res.status(500).json({ 
        error: 'Configuration serveur incorrecte' 
      });
    }
    
    // Vérifier et décoder token
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    
    // Vérifier que le token contient les champs requis
    if (!decoded.id || !decoded.email) {
      return res.status(401).json({ 
        error: 'Token invalide',
        message: 'Token ne contient pas les informations requises.' 
      });
    }
    
    // Attacher user au request
    req.user = decoded;
    
    next();
    
  } catch (error: any) {
    // Gérer erreurs JWT spécifiques
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expiré',
        message: 'Votre session a expiré. Reconnectez-vous.'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      logSecurity('JWT_VERIFICATION_FAILED', { 
        ip: req.ip, 
        path: req.path,
        error: error.message 
      });
      
      return res.status(401).json({ 
        error: 'Token invalide',
        message: 'Votre session est invalide. Reconnectez-vous.'
      });
    }
    
    if (error.name === 'NotBeforeError') {
      return res.status(401).json({ 
        error: 'Token pas encore valide',
        message: 'Ce token n\'est pas encore actif.'
      });
    }
    
    // Erreur générique
    logError('JWT verification error', error, { 
      ip: req.ip, 
      path: req.path 
    });
    
    return res.status(401).json({ 
      error: 'Authentification échouée',
      message: 'Impossible de vérifier votre identité.'
    });
  }
};

/**
 * Middleware optionnel : Vérifier rôle spécifique
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Non authentifié' 
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      // ✅ Logger tentative accès non autorisé
      logSecurity('UNAUTHORIZED_ROLE_ACCESS', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        ip: req.ip
      });
      
      return res.status(403).json({ 
        error: 'Accès refusé',
        message: 'Vous n\'avez pas les permissions nécessaires'
      });
    }
    
    next();
  };
};

/**
 * Générer un JWT token (utilitaire pour login)
 */
export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    throw new Error('JWT_SECRET manquant dans variables environnement');
  }
  
  return jwt.sign(
    payload,
    jwtSecret,
    {
      expiresIn: JWT_EXPIRES_IN as any,
      issuer: 'transit-guinee-api',
      audience: 'transit-guinee-app'
    }
  );
};

/**
 * Vérifier token sans middleware (utilitaire)
 */
export const verifyToken = (token: string): { valid: boolean; payload?: JWTPayload; error?: string } => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return { valid: false, error: 'JWT_SECRET_MISSING' };
    }
    
    const payload = jwt.verify(token, jwtSecret) as JWTPayload;
    return { valid: true, payload };
    
  } catch (error: any) {
    return { 
      valid: false, 
      error: error.name // TokenExpiredError, JsonWebTokenError, etc.
    };
  }
};
