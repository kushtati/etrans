/**
 * 🔐 Middleware d'Authentification JWT
 * 
 * Vérifie les tokens JWT pour les routes protégées.
 * Utilise jsonwebtoken pour validation sécurisée.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
 */
export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
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
    
    // Vérifier JWT_SECRET existe
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('⚠️ JWT_SECRET manquant dans variables environnement!');
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
        message: 'Votre session a expiré. Reconnectez-vous.',
        expiredAt: error.expiredAt
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token invalide',
        message: 'Token malformé ou corrompu.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    if (error.name === 'NotBeforeError') {
      return res.status(401).json({ 
        error: 'Token pas encore valide',
        message: 'Ce token n\'est pas encore actif.'
      });
    }
    
    // Erreur générique
    console.error('[AUTH] JWT verification error:', error);
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
      return res.status(403).json({ 
        error: 'Accès refusé',
        message: `Rôle requis: ${allowedRoles.join(', ')}. Votre rôle: ${req.user.role}`
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
      expiresIn: '7d', // Token valide 7 jours
      issuer: 'transit-guinee-api',
      audience: 'transit-guinee-app'
    }
  );
};

/**
 * Vérifier token sans middleware (utilitaire)
 */
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;
    
    return jwt.verify(token, jwtSecret) as JWTPayload;
  } catch (error) {
    return null;
  }
};
