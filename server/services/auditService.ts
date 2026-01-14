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
import { logger, logError } from '../config/logger';

/**
 * Initialiser la base de données d'audit
 */
export const initAuditDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('Audit database initialized');
  } catch (error) {
    logError('Audit database initialization failed', error as Error);
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
  userId?: string;          // Optionnel (actions système sans user)
  details?: Record<string, unknown>; // Plus strict qu'any
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
      logger.debug('AI request logged', { endpoint: entry.endpoint, userId: entry.userId });
    }
    
  } catch (error) {
    logError('Failed to log AI request', error as Error);
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
  try {
    // Validation userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId');
    }
    
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
      take: 10000, // Limite 10k logs
    });
    
    if (logs.length === 10000) {
      logger.warn('getUserStats hit limit', { userId, days });
    }

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
    
  } catch (error) {
    logError('Failed to get user stats', error as Error, { userId });
    return { totalRequests: 0, successRate: 0, avgDuration: 0, totalInputChars: 0 };
  }
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
  try {
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
      take: 50000, // Limite 50k logs globaux
    });
    
    if (logs.length === 50000) {
      logger.warn('getGlobalStats hit limit', { days });
    }

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
    
  } catch (error) {
    logError('Failed to get global stats', error as Error);
    return { totalRequests: 0, uniqueUsers: 0, successRate: 0, avgDuration: 0, byEndpoint: [] };
  }
};

/**
 * Nettoyer anciens logs (RGPD - conservation 90 jours)
 */
export const cleanOldLogs = async (daysToKeep: number = 90): Promise<number> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // Transaction atomique pour cohérence
    const totalDeleted = await prisma.$transaction(async (tx) => {
      // Nettoyer AI logs
      const aiResult = await tx.aILog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      // Nettoyer audit logs généraux
      const auditResult = await tx.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      return aiResult.count + auditResult.count;
    });

    if (totalDeleted > 0) {
      logger.info('Cleaned old logs', { deleted: totalDeleted, daysToKeep });
    }

    return totalDeleted;
    
  } catch (error) {
    logError('Failed to clean old logs', error as Error);
    return 0;
  }
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
        details: entry.details as any,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
      },
    });
  } catch (error) {
    logError('Failed to log audit action', error as Error, { action: entry.action });
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
    details: (log.details as Record<string, unknown>) || {},
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
    details: (log.details as Record<string, unknown>) || {},
    createdAt: log.createdAt,
    ipAddress: log.ipAddress || undefined,
    userAgent: log.userAgent || undefined,
  }));
};

/**
 * Auto-cleanup désactivé (inefficace avec setInterval)
 * 
 * RECOMMANDÉ : Utiliser un cron job externe
 * - Railway.app : Configurer "Cron Jobs" dans dashboard
 * - Render.com : Ajouter un "Cron Job" service
 * - Docker : Ajouter service cron dans docker-compose.yml
 * - Kubernetes : CronJob resource
 * 
 * Commande : curl -X POST https://api.example.com/api/admin/logs/cleanup
 * Schedule : 0 3 * * * (tous les jours à 3h)
 * 
 * Alternative node-cron (si nécessaire) :
 * 
 * import cron from 'node-cron';
 * 
 * if (process.env.NODE_ENV === 'production') {
 *   cron.schedule('0 3 * * *', async () => {
 *     logger.info('Starting scheduled log cleanup...');
 *     try {
 *       const deleted = await cleanOldLogs(90);
 *       logger.info('Scheduled cleanup completed', { deleted });
 *     } catch (error) {
 *       logError('Scheduled cleanup failed', error as Error);
 *     }
 *   });
 * }
 */
