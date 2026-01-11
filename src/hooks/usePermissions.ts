/**
 * REACT HOOK - usePermissions
 * 
 * Hook personnalisé pour vérifier les permissions côté client (UX uniquement).
 * 
 * ⚠️ SÉCURITÉ : Ce hook améliore l'UX mais n'est PAS une protection réelle.
 * Backend DOIT re-vérifier TOUTES les permissions avec middleware Express.
 * 
 * Voir: docs/SECURITY_CONTEXT.md pour architecture defense-in-depth complète
 */

import { useContext, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { TransitContext } from '../context/transitContext';
import { Permission, hasPermission, logPermissionCheck, canCreateShipment } from '../utils/permissions';
import { logger } from '../services/logger';

export const usePermissions = () => {
  const context = useContext(TransitContext);
  
  // SÉCURITÉ CRITIQUE : Valider role avant toute vérification
  if (!context || !context.role) {
    logger.error('usePermissions: role manquant ou context invalide');
    throw new Error('Session invalide - reconnexion requise');
  }
  
  const { role } = context;

  // Mémoïser les vérifications pour éviter re-calcul
  const permissions = useMemo(() => {
    try {
      return {
        // Finance
        canViewFinance: hasPermission(role, Permission.VIEW_FINANCE),
        canMakePayments: hasPermission(role, Permission.MAKE_PAYMENTS),
        canAddExpenses: hasPermission(role, Permission.ADD_EXPENSES),
        canApproveExpenses: hasPermission(role, Permission.APPROVE_EXPENSES),
        
        // Opérations
        canEditOperations: hasPermission(role, Permission.EDIT_OPERATIONS),
        canEditShipments: hasPermission(role, Permission.EDIT_SHIPMENTS),
        
        // Documents
        canUploadDocuments: hasPermission(role, Permission.UPLOAD_DOCUMENTS),
        canDeleteDocuments: hasPermission(role, Permission.DELETE_DOCUMENTS),
        
        // Admin
        canManageUsers: hasPermission(role, Permission.MANAGE_USERS),
        canViewAuditLogs: hasPermission(role, Permission.VIEW_AUDIT_LOGS),
        canExportData: hasPermission(role, Permission.EXPORT_DATA),
        
        // Vues
        canViewShipments: hasPermission(role, Permission.VIEW_SHIPMENTS),
        canViewOwnShipments: hasPermission(role, Permission.VIEW_OWN_SHIPMENTS),
        
        // Création
        canCreate: canCreateShipment(role),
      };
    } catch (error) {
      logger.error('usePermissions: erreur calcul permissions', error);
      // Retourner permissions VIDES par défaut (fail-safe sécurisé)
      return {
        canViewFinance: false,
        canMakePayments: false,
        canAddExpenses: false,
        canApproveExpenses: false,
        canEditOperations: false,
        canEditShipments: false,
        canUploadDocuments: false,
        canDeleteDocuments: false,
        canManageUsers: false,
        canViewAuditLogs: false,
        canExportData: false,
        canViewShipments: false,
        canViewOwnShipments: false,
        canCreate: false,
      };
    }
  }, [role]);

  /**
   * Vérifie une permission spécifique avec audit logging
   * Logger seulement les REFUS pour réduire volume logs
   */
  const checkPermission = (permission: Permission, context?: string): boolean => {
    try {
      const granted = hasPermission(role, permission);
      
      // Logger seulement les REFUS (réduire volume logs)
      if (!granted) {
        logPermissionCheck(role, permission, granted, context);
      }
      
      return granted;
    } catch (error) {
      logger.error('checkPermission: erreur vérification', { permission, context, error });
      // Par défaut REFUSER accès (fail-safe)
      return false;
    }
  };

  /**
   * Vérifie permission et retourne boolean
   * Utiliser plutôt que throw Error (meilleure UX)
   * 
   * @param permission - Permission à vérifier
   * @param context - Contexte (sanitizé automatiquement)
   * @returns true si accordé, false sinon
   */
  const requirePermission = (permission: Permission, context?: string): boolean => {
    // SÉCURITÉ : Sanitizer context avant utilisation (anti-XSS)
    const safeContext = context 
      ? DOMPurify.sanitize(context, { ALLOWED_TAGS: [], KEEP_CONTENT: true })
      : 'unknown context';
    
    const granted = checkPermission(permission, safeContext);
    
    if (!granted) {
      // Logger en debug seulement (volume production)
      logger.debug('requirePermission: accès refusé', { permission, context: safeContext });
    }
    
    return granted;
  };

  return {
    ...permissions,
    checkPermission,
    requirePermission,
    role,
  };
};
