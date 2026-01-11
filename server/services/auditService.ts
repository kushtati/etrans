/**
 * 📊 Service d'Audit Logs pour requêtes AI + Actions Système
 * 
 * Enregistre :
 * - Requêtes Gemini API (monitoring, abus, facturation)
 * - Actions critiques système (login, delete, update)
 * - Conformité RGPD
 * 
 * Backend : PostgreSQL via Prisma (production-ready)
 * 
 * ✅ MIGRATION SQLite → Prisma complétée
 */

import { prisma } from '../config/prisma';

/**
 * Initialiser la base de données d'audit
 */
export const initAuditDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('[AuditDB] ✅ Base de données d\'audit initialisée');
  } catch (error) {
    console.error('[AuditDB] ❌ Erreur initialisation:', error);
    throw error;
  }
};

// Interface pour les logs AI
export interface AILogEntry {
  id?: string;
  userId: string;
  endpoint: string;
  model: string;
  inputLength: number;
  outputLength?: number;
  duration: number;
  success: boolean;
  error?: string;
  createdAt?: Date;
  ipAddress?: string;
  userAgent?: string;
}

// Interface pour les logs audit généraux
export interface AuditLogEntry {
  id?: string;
  action: string;           // LOGIN, DELETE_SHIPMENT, UPDATE_STATUS, etc.
  userId: string;
  details?: any;            // JSON object (Prisma Json type)
  createdAt?: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Enregistrer une requête AI
 */
export const logAIRequest = async (entry: Omit<AILogEntry, 'id' | 'createdAt'>): Promise<void> => {
  try {
    await prisma.aILog.create({
      data: {
        userId: entry.userId,
        endpoint: entry.endpoint,
        model: entry.model,
        inputLength: entry.inputLength,
        outputLength: entry.outputLength || null,
        duration: entry.duration,
        success: entry.success,
        error: entry.error || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
      },
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] Logged ${entry.endpoint} for user ${entry.userId}`);
    }
    
  } catch (error) {
    console.error('[AUDIT] Failed to log AI request:', error);
    // Ne pas bloquer la requête si logging échoue
  }
};

/**
 * Obtenir statistiques utilisateur
 */
export const getUserStats = async (userId: string, days: number = 30): Promise<{
  totalRequests: number;
  successRate: number;
  avgDuration: number;
  totalInputChars: number;
}> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const logs = await prisma.aILog.findMany({
    where: {
      userId,
      createdAt: {
        gte: cutoffDate,
      },
    },
    select: {
      success: true,
      duration: true,
      inputLength: true,
    },
  });

  const totalRequests = logs.length;
  const successCount = logs.filter(l => l.success).length;
  const successRate = totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 0;
  const avgDuration = totalRequests > 0 
    ? Math.round(logs.reduce((sum, l) => sum + l.duration, 0) / totalRequests) 
    : 0;
  const totalInputChars = logs.reduce((sum, l) => sum + l.inputLength, 0);

  return {
    totalRequests,
    successRate,
    avgDuration,
    totalInputChars,
  };
};

/**
 * Obtenir logs récents utilisateur
 */
export const getUserLogs = async (
  userId: string, 
  limit: number = 50
): Promise<AILogEntry[]> => {
  const logs = await prisma.aILog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return logs.map(log => ({
    id: log.id,
    userId: log.userId,
    endpoint: log.endpoint,
    model: log.model,
    inputLength: log.inputLength,
    outputLength: log.outputLength || undefined,
    duration: log.duration,
    success: log.success,
    error: log.error || undefined,
    createdAt: log.createdAt,
    ipAddress: log.ipAddress || undefined,
    userAgent: log.userAgent || undefined,
  }));
};

/**
 * Obtenir statistiques globales (admin)
 */
export const getGlobalStats = async (days: number = 7): Promise<{
  totalRequests: number;
  uniqueUsers: number;
  successRate: number;
  avgDuration: number;
  byEndpoint: { endpoint: string; count: number }[];
}> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const logs = await prisma.aILog.findMany({
    where: {
      createdAt: {
        gte: cutoffDate,
      },
    },
    select: {
      userId: true,
      success: true,
      duration: true,
      endpoint: true,
    },
  });

  const totalRequests = logs.length;
  const uniqueUsers = new Set(logs.map(l => l.userId)).size;
  const successCount = logs.filter(l => l.success).length;
  const successRate = totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 0;
  const avgDuration = totalRequests > 0 
    ? Math.round(logs.reduce((sum, l) => sum + l.duration, 0) / totalRequests) 
    : 0;

  // Grouper par endpoint
  const endpointCounts = logs.reduce((acc, log) => {
    acc[log.endpoint] = (acc[log.endpoint] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byEndpoint = Object.entries(endpointCounts)
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalRequests,
    uniqueUsers,
    successRate,
    avgDuration,
    byEndpoint,
  };
};

/**
 * Nettoyer anciens logs (RGPD - conservation 90 jours)
 */
export const cleanOldLogs = async (daysToKeep: number = 90): Promise<number> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  // Nettoyer AI logs
  const aiResult = await prisma.aILog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  // Nettoyer audit logs généraux
  const auditResult = await prisma.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  const totalDeleted = aiResult.count + auditResult.count;

  if (totalDeleted > 0) {
    console.log(`[AUDIT] Cleaned ${totalDeleted} logs older than ${daysToKeep} days`);
  }

  return totalDeleted;
};

/**
 * Enregistrer action audit dans base de données
 */
export const logAuditAction = async (entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        userId: entry.userId || null,
        details: entry.details || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
      },
    });
  } catch (error) {
    console.error('[AUDIT] Failed to log action:', error);
  }
};

/**
 * Récupérer audit logs pour un utilisateur
 */
export const getUserAuditLogs = async (
  userId: string, 
  limit: number = 50
): Promise<AuditLogEntry[]> => {
  const logs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return logs.map(log => ({
    id: log.id,
    action: log.action,
    userId: log.userId || '',
    details: log.details,
    createdAt: log.createdAt,
    ipAddress: log.ipAddress || undefined,
    userAgent: log.userAgent || undefined,
  }));
};

/**
 * Récupérer tous les audit logs récents (admin)
 */
export const getRecentAuditLogs = async (
  limit: number = 100
): Promise<AuditLogEntry[]> => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return logs.map(log => ({
    id: log.id,
    action: log.action,
    userId: log.userId || '',
    details: log.details,
    createdAt: log.createdAt,
    ipAddress: log.ipAddress || undefined,
    userAgent: log.userAgent || undefined,
  }));
};

// Auto-cleanup tous les jours à 3h du matin
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() === 0) {
      await cleanOldLogs(90);
    }
  }, 60 * 1000); // Vérifier chaque minute
}
