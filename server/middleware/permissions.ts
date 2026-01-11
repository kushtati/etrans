/**
 * BACKEND MIDDLEWARE - Permission Checking
 * 
 * Sécurise les routes Express en vérifiant les permissions
 * À utiliser APRÈS authenticateJWT middleware
 */

import { Request, Response, NextFunction } from 'express';
import { Permission, hasPermissionFromToken } from '../utils/permissions';

// Types déjà définis dans server/types/express.d.ts
// Pas besoin de redéclarer

/**
 * Middleware de vérification de permission
 * @param permission - Permission requise
 * @returns Express middleware
 * 
 * @example
 * router.post('/expenses', authenticateJWT, requirePermission(Permission.ADD_EXPENSES), (req, res) => {
 *   // Route protégée
 * });
 */
export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Vérifier que l'utilisateur est authentifié
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié',
      });
    }

    // 2. Vérifier les permissions depuis JWT
    const userPermissions = req.user.permissions || '';
    const hasPermission = hasPermissionFromToken(userPermissions, permission);

    if (!hasPermission) {
      // Log la tentative d'accès non autorisée
      console.warn('[SECURITY] Permission denied:', {
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role,
        userPermissions,
        requiredPermission: permission,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      return res.status(403).json({
        success: false,
        message: 'Permission insuffisante',
        requiredPermission: permission,
      });
    }

    // Permission OK, continuer
    next();
  };
};

/**
 * Middleware vérifiant au moins une permission parmi plusieurs (OR logic)
 * @param permissions - Liste de permissions (une suffit)
 * @returns Express middleware
 */
export const requireAnyPermission = (permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié',
      });
    }

    const userPermissions = req.user.permissions || '';
    const hasAny = permissions.some((permission) =>
      hasPermissionFromToken(userPermissions, permission)
    );

    if (!hasAny) {
      console.warn('[SECURITY] No matching permission:', {
        userId: req.user.id,
        requiredPermissions: permissions,
        path: req.path,
      });

      return res.status(403).json({
        success: false,
        message: 'Permission insuffisante',
        requiredPermissions: permissions,
      });
    }

    next();
  };
};

/**
 * Middleware vérifiant toutes les permissions (AND logic)
 * @param permissions - Liste de permissions (toutes requises)
 * @returns Express middleware
 */
export const requireAllPermissions = (permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié',
      });
    }

    const userPermissions = req.user.permissions || '';
    const hasAll = permissions.every((permission) =>
      hasPermissionFromToken(userPermissions, permission)
    );

    if (!hasAll) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes',
        requiredPermissions: permissions,
      });
    }

    next();
  };
};

/**
 * Middleware pour ressources appartenant à l'utilisateur
 * Permet aux clients de voir uniquement leurs dossiers
 */
export const requireOwnershipOrPermission = (permission: Permission) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié',
      });
    }

    // Si l'utilisateur a la permission globale, OK
    const userPermissions = req.user.permissions || '';
    const hasPermission = hasPermissionFromToken(userPermissions, permission);

    if (hasPermission) {
      return next();
    }

    // Sinon, vérifier ownership dans la base de données
    const shipmentId = req.params.shipmentId || req.params.id;
    const userId = req.user.id;

    if (!shipmentId) {
      return res.status(400).json({
        success: false,
        message: 'ID dossier manquant',
      });
    }

    try {
      // Vérifier ownership avec Prisma
      const { prisma } = await import('../config/prisma');
      
      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
        select: { createdById: true },
      });

      if (!shipment) {
        return res.status(404).json({
          success: false,
          message: 'Dossier introuvable',
        });
      }

      // Vérifier que l'utilisateur est le créateur
      if (shipment.createdById === userId) {
        return next();
      }

      // Accès refusé
      console.warn('[SECURITY] Ownership denied:', {
        userId,
        shipmentId,
        createdById: shipment.createdById,
        timestamp: new Date().toISOString(),
      });

      return res.status(403).json({
        success: false,
        message: 'Accès refusé à cette ressource',
      });
      
    } catch (error) {
      console.error('[SECURITY] Ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur vérification ownership',
      });
    }
  };
};
