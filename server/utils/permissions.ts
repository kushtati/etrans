/**
 * PERMISSIONS SYSTEM - Gestion centralisée des autorisations
 * 
 * Sécurité multi-couches :
 * ✅ Client-side (UX - cacher éléments)
 * ✅ Server-side (Sécurité - vérifier accès API)
 * ✅ Type-safe (TypeScript)
 * ✅ Centralisé (Single Source of Truth)
 */

import { Role, ShipmentStatus } from '../types';
import { logger } from '../services/logger';

// ============================================
// PERMISSIONS DEFINITIONS
// ============================================

export enum Permission {
  // Vue des données
  VIEW_FINANCE = 'VIEW_FINANCE',
  VIEW_SHIPMENTS = 'VIEW_SHIPMENTS',
  VIEW_OWN_SHIPMENTS = 'VIEW_OWN_SHIPMENTS',
  
  // Édition
  EDIT_SHIPMENTS = 'EDIT_SHIPMENTS',
  EDIT_OPERATIONS = 'EDIT_OPERATIONS',
  
  // Finance
  MAKE_PAYMENTS = 'MAKE_PAYMENTS',
  ADD_EXPENSES = 'ADD_EXPENSES',
  APPROVE_EXPENSES = 'APPROVE_EXPENSES',
  
  // Documents
  UPLOAD_DOCUMENTS = 'UPLOAD_DOCUMENTS',
  DELETE_DOCUMENTS = 'DELETE_DOCUMENTS',
  
  // Administration
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',
  EXPORT_DATA = 'EXPORT_DATA',
}

// ============================================
// ROLE PERMISSIONS MATRIX
// ============================================

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.CLIENT]: [
    Permission.VIEW_OWN_SHIPMENTS,
  ],
  
  [Role.AGENT]: [
    Permission.VIEW_SHIPMENTS,
    Permission.EDIT_SHIPMENTS,
    Permission.EDIT_OPERATIONS,
    Permission.UPLOAD_DOCUMENTS,
  ],
  
  [Role.ACCOUNTANT]: [
    Permission.VIEW_SHIPMENTS,
    Permission.VIEW_FINANCE,
    Permission.MAKE_PAYMENTS,
    Permission.ADD_EXPENSES,
    Permission.UPLOAD_DOCUMENTS,
  ],
  
  [Role.DIRECTOR]: [
    // Director a tous les droits
    ...Object.values(Permission),
  ],
};

// ============================================
// PERMISSION CHECKER
// ============================================

/**
 * Vérifie si un rôle a une permission spécifique
 * @param role - Rôle de l'utilisateur
 * @param permission - Permission à vérifier
 * @returns true si autorisé
 */
export const hasPermission = (role: Role, permission: Permission): boolean => {
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  return rolePermissions.includes(permission);
};

/**
 * Vérifie si un rôle a au moins une des permissions
 * @param role - Rôle de l'utilisateur
 * @param permissions - Liste de permissions (OR logic)
 * @returns true si au moins une permission est présente
 */
export const hasAnyPermission = (role: Role, permissions: Permission[]): boolean => {
  return permissions.some((permission) => hasPermission(role, permission));
};

/**
 * Vérifie si un rôle a toutes les permissions
 * @param role - Rôle de l'utilisateur
 * @param permissions - Liste de permissions (AND logic)
 * @returns true si toutes les permissions sont présentes
 */
export const hasAllPermissions = (role: Role, permissions: Permission[]): boolean => {
  return permissions.every((permission) => hasPermission(role, permission));
};

/**
 * Récupère toutes les permissions d'un rôle
 * @param role - Rôle de l'utilisateur
 * @returns Liste des permissions
 */
export const getRolePermissions = (role: Role): Permission[] => {
  return ROLE_PERMISSIONS[role] || [];
};

// ============================================
// PERMISSION GUARDS (pour composants React)
// ============================================

/**
 * Vérifie les permissions et lance une erreur si non autorisé
 * Utilisé dans les composants pour bloquer l'accès
 */
export const requirePermission = (role: Role, permission: Permission): void => {
  if (!hasPermission(role, permission)) {
    throw new Error(
      `Permission denied: ${permission} required for role ${role}`
    );
  }
};

/**
 * Vérifie les permissions et retourne un booléen
 * Utilisé pour afficher/cacher des éléments UI
 */
export const canViewFinance = (role: Role): boolean => {
  return hasPermission(role, Permission.VIEW_FINANCE);
};

export const canMakePayments = (role: Role): boolean => {
  return hasPermission(role, Permission.MAKE_PAYMENTS);
};

export const canEditOperations = (role: Role): boolean => {
  return hasAnyPermission(role, [
    Permission.EDIT_OPERATIONS,
    Permission.EDIT_SHIPMENTS,
  ]);
};

export const canUploadDocuments = (role: Role): boolean => {
  return hasPermission(role, Permission.UPLOAD_DOCUMENTS);
};

export const canManageUsers = (role: Role): boolean => {
  return hasPermission(role, Permission.MANAGE_USERS);
};

// ============================================
// HELPERS POUR BACKEND
// ============================================

/**
 * Génère un token de permissions encodé (pour JWT claims)
 * @param role - Rôle de l'utilisateur
 * @returns String encodé des permissions
 */
export const encodePermissions = (role: Role): string => {
  const permissions = getRolePermissions(role);
  return permissions.join(',');
};

/**
 * Décode un token de permissions
 * @param encoded - String encodé des permissions
 * @returns Array de permissions
 */
export const decodePermissions = (encoded: string): Permission[] => {
  if (!encoded) return [];
  return encoded.split(',') as Permission[];
};

/**
 * Vérifie si un token contient une permission
 * @param encoded - String encodé des permissions (depuis JWT)
 * @param permission - Permission à vérifier
 * @returns true si autorisé
 */
export const hasPermissionFromToken = (
  encoded: string,
  permission: Permission
): boolean => {
  const permissions = decodePermissions(encoded);
  return permissions.includes(permission);
};

// ============================================
// AUDIT LOGGING
// ============================================

export interface PermissionCheck {
  timestamp: Date;
  role: Role;
  permission: Permission;
  granted: boolean;
  context?: string;
}

const permissionChecks: PermissionCheck[] = [];
const MAX_AUDIT_LOGS = 1000; // Limite pour éviter memory leak

/**
 * Log une vérification de permission (pour audit)
 * 
 * ⚠️ IMPORTANT : Logs stockés en mémoire (perte au restart).
 * Production : Envoyer vers backend /api/audit-logs via logger.
 * 
 * @param role - Rôle vérifié
 * @param permission - Permission vérifiée
 * @param granted - Résultat
 * @param context - Contexte optionnel
 */
export const logPermissionCheck = (
  role: Role,
  permission: Permission,
  granted: boolean,
  context?: string
): void => {
  const check: PermissionCheck = {
    timestamp: new Date(),
    role,
    permission,
    granted,
    context,
  };
  
  permissionChecks.push(check);
  
  // Rotation FIFO si dépassement limite
  if (permissionChecks.length > MAX_AUDIT_LOGS) {
    permissionChecks.shift(); // Supprimer le plus ancien
  }
  
  // En production: envoyer vers service de logging backend
  if (!granted) {
    logger.warn('PERMISSION_DENIED', {
      role,
      permission,
      context,
      timestamp: check.timestamp.toISOString()
    });
  }
};

/**
 * Récupère l'historique des vérifications de permissions
 * @param limit - Nombre max de résultats
 * @returns Liste des vérifications
 */
export const getPermissionAuditLog = (limit: number = 100): PermissionCheck[] => {
  return permissionChecks.slice(-limit);
};

// ============================================
// STATUS CHANGE PERMISSIONS
// ============================================

/**
 * Matrice des permissions de changement de statut par rôle
 * 
 * Définit quels statuts chaque rôle peut attribuer
 */
export const STATUS_PERMISSIONS: Record<Role, ShipmentStatus[]> = {
  [Role.CLIENT]: [
    // Client: Aucune modification de statut
  ],
  
  [Role.AGENT]: [
    // Agent: Tous les statuts opérationnels
    ShipmentStatus.OPENED,           // Créer dossier
    ShipmentStatus.PRE_CLEARANCE,    // Pré-dédouanement
    ShipmentStatus.BAE_GRANTED,      // BAE accordé
    ShipmentStatus.PORT_EXIT,        // Sortie port
    ShipmentStatus.DELIVERED         // Livraison effectuée
  ],
  
  [Role.ACCOUNTANT]: [
    ShipmentStatus.LIQUIDATION_PAID, // Liquidation payée
    ShipmentStatus.DELIVERED         // Confirmation livraison (facturation)
  ],
  
  [Role.DIRECTOR]: [
    // Directeur: Tous les statuts (gestion complète)
    ...Object.values(ShipmentStatus)
  ]
};

/**
 * Vérifie si un rôle peut attribuer un statut spécifique
 * 
 * @param role - Rôle de l'utilisateur
 * @param currentStatus - Statut actuel du dossier
 * @param newStatus - Nouveau statut demandé
 * @returns true si autorisé, false sinon
 * 
 * @example
 * canUpdateStatus(Role.AGENT, ShipmentStatus.OPENED, ShipmentStatus.PRE_CLEARANCE)
 * // true - Agent peut passer en pré-dédouanement
 * 
 * canUpdateStatus(Role.CLIENT, ShipmentStatus.OPENED, ShipmentStatus.DELIVERED)
 * // false - Client ne peut rien modifier
 */
export const canUpdateStatus = (
  role: Role,
  currentStatus: ShipmentStatus,
  newStatus: ShipmentStatus
): boolean => {
  const allowedStatuses = STATUS_PERMISSIONS[role];
  
  // Vérifier si le rôle peut attribuer ce statut
  const hasPermission = allowedStatuses.includes(newStatus);
  
  if (!hasPermission) {
    logger.warn('Status change denied - role lacks permission', {
      role,
      currentStatus,
      newStatus,
      allowedStatuses
    });
  }
  
  return hasPermission;
};

/**
 * Valide les transitions de statut selon workflow métier
 * 
 * Certaines transitions sont interdites même avec permissions
 * Ex: Ne peut pas passer de DELIVERED à OPENED
 * 
 * @param currentStatus - Statut actuel
 * @param newStatus - Nouveau statut demandé
 * @returns true si transition valide, false sinon
 */
export const isValidStatusTransition = (
  currentStatus: ShipmentStatus,
  newStatus: ShipmentStatus
): boolean => {
  // Si même statut, pas de transition
  if (currentStatus === newStatus) {
    return false;
  }

  // Workflow normal: OPENED → PRE_CLEARANCE → BAE_GRANTED → 
  //                  CUSTOMS_LIQUIDATION → LIQUIDATION_PAID → PORT_EXIT → DELIVERED
  
  const validTransitions: Record<ShipmentStatus, ShipmentStatus[]> = {
    [ShipmentStatus.OPENED]: [
      ShipmentStatus.PRE_CLEARANCE
    ],
    [ShipmentStatus.PRE_CLEARANCE]: [
      ShipmentStatus.BAE_GRANTED,
      ShipmentStatus.CUSTOMS_LIQUIDATION // Peut sauter BAE_GRANTED dans certains cas
    ],
    [ShipmentStatus.BAE_GRANTED]: [
      ShipmentStatus.CUSTOMS_LIQUIDATION
    ],
    [ShipmentStatus.CUSTOMS_LIQUIDATION]: [
      ShipmentStatus.LIQUIDATION_PAID
    ],
    [ShipmentStatus.LIQUIDATION_PAID]: [
      ShipmentStatus.PORT_EXIT
    ],
    [ShipmentStatus.PORT_EXIT]: [
      ShipmentStatus.DELIVERED
    ],
    [ShipmentStatus.DELIVERED]: [
      // État final - pas de transition
    ]
  };

  const allowedTransitions = validTransitions[currentStatus] || [];
  const isValid = allowedTransitions.includes(newStatus);
  
  if (!isValid) {
    logger.warn('Invalid status transition', {
      currentStatus,
      newStatus,
      allowedTransitions
    });
  }
  
  return isValid;
};

/**
 * Validation complète d'un changement de statut
 * 
 * Combine vérification permissions + workflow
 * 
 * @param role - Rôle utilisateur
 * @param currentStatus - Statut actuel
 * @param newStatus - Nouveau statut demandé
 * @returns { allowed: boolean, reason?: string }
 */
export const validateStatusChange = (
  role: Role,
  currentStatus: ShipmentStatus,
  newStatus: ShipmentStatus
): { allowed: boolean; reason?: string } => {
  // 1. Vérifier permissions rôle
  if (!canUpdateStatus(role, currentStatus, newStatus)) {
    return {
      allowed: false,
      reason: `Votre rôle (${role}) ne permet pas d'attribuer le statut ${newStatus}`
    };
  }

  // 2. Vérifier workflow métier
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    return {
      allowed: false,
      reason: `Transition invalide: ${currentStatus} → ${newStatus}`
    };
  }

  // ✅ Validé
  return { allowed: true };
};

/**
 * Obtient la liste des statuts disponibles pour un rôle et statut actuel
 * 
 * Utile pour afficher seulement les options valides dans UI
 * 
 * @param role - Rôle utilisateur
 * @param currentStatus - Statut actuel du dossier
 * @returns Liste des statuts disponibles
 * 
 * @example
 * getAvailableStatuses(Role.AGENT, ShipmentStatus.OPENED)
 * // [ShipmentStatus.PRE_CLEARANCE]
 */
export const getAvailableStatuses = (
  role: Role,
  currentStatus: ShipmentStatus
): ShipmentStatus[] => {
  const allowedByRole = STATUS_PERMISSIONS[role];
  
  // Filtrer selon workflow valide
  return allowedByRole.filter(status => 
    isValidStatusTransition(currentStatus, status)
  );
};

/**
 * Vérifie si un rôle peut créer un nouveau dossier
 * 
 * @param role - Rôle de l'utilisateur
 * @returns true si autorisé, false sinon
 */
export const canCreateShipment = (role: Role): boolean => {
  const allowedRoles = [
    Role.AGENT,
    Role.DIRECTOR
  ];
  
  const hasCreatePermission = allowedRoles.includes(role);
  
  if (!hasCreatePermission) {
    logger.warn('Shipment creation denied - role lacks permission', {
      role,
      allowedRoles
    });
  }
  
  return hasCreatePermission;
};

/**
 * Vérifie si un rôle peut supprimer un dossier
 * 
 * @param role - Rôle de l'utilisateur
 * @returns true si autorisé, false sinon
 */
export const canDeleteShipment = (role: Role): boolean => {
  // Seul le directeur peut supprimer
  const hasDeletePermission = role === Role.DIRECTOR;
  
  if (!hasDeletePermission) {
    logger.warn('Shipment deletion denied - only director allowed', { role });
  }
  
  return hasDeletePermission;
};
