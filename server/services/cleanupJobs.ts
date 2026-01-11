/**
 * 🧹 Jobs de Nettoyage Automatique
 * 
 * Tâches planifiées :
 * - Rotation logs Winston (automatique)
 * - Nettoyage logs anciens (base de données)
 * - Compression archives
 */

import cron from 'node-cron';
import { cleanOldLogs as cleanDBLogs } from './auditService';
import { cleanupOldLogs as cleanFileLogs } from './logService';
import { logger } from './logService';

/**
 * Job 1 : Nettoyage logs DB (quotidien à 3h du matin)
 */
export const startDatabaseCleanupJob = () => {
  // Schedule configurable via env (défaut: 3h du matin)
  const schedule = process.env.DB_CLEANUP_CRON || '0 3 * * *';
  
  cron.schedule(schedule, async () => {
    logger.info('[CRON] Database cleanup started');
    
    try {
      // Nettoyer logs AI + audit > 90 jours
      const deletedCount = await cleanDBLogs(90);
      
      logger.info('[CRON] Database cleanup completed', { 
        deletedLogs: deletedCount 
      });
      
    } catch (error) {
      logger.error('[CRON] Database cleanup failed', { error });
    }
  });

  logger.info('[CRON] Database cleanup job scheduled', { schedule });
};

/**
 * Job 2 : Nettoyage fichiers logs anciens (hebdomadaire dimanche 4h)
 */
export const startFileCleanupJob = () => {
  // Schedule configurable via env (défaut: dimanche 4h)
  const schedule = process.env.FILE_CLEANUP_CRON || '0 4 * * 0';
  
  cron.schedule(schedule, async () => {
    logger.info('[CRON] File cleanup started');
    
    try {
      // Nettoyer fichiers logs > 30 jours (Winston rotation gère déjà mais double sécurité)
      const deletedCount = await cleanFileLogs(30);
      
      logger.info('[CRON] File cleanup completed', { 
        deletedFiles: deletedCount 
      });
      
    } catch (error) {
      logger.error('[CRON] File cleanup failed', { error });
    }
  });

  logger.info('[CRON] File cleanup job scheduled', { schedule });
};

/**
 * Job 3 : Health check logs (quotidien à midi)
 */
export const startHealthCheckJob = () => {
  // Schedule configurable via env (défaut: midi)
  const schedule = process.env.HEALTH_CHECK_CRON || '0 12 * * *';
  
  cron.schedule(schedule, async () => {
    try {
      const { getGlobalStats } = await import('./auditService');
      
      // Stats dernières 24h
      const stats = await getGlobalStats(1);
      
      logger.info('[CRON] Health check', {
        totalRequests: stats.totalRequests,
        uniqueUsers: stats.uniqueUsers,
        successRate: stats.successRate,
        avgDuration: stats.avgDuration
      });
      
      // Alerte si taux succès < 90%
      if (stats.successRate < 90) {
        logger.warn('[CRON] Low success rate detected', { 
          successRate: stats.successRate 
        });
      }
      
      // Alerte si durée moyenne > 5s
      if (stats.avgDuration > 5000) {
        logger.warn('[CRON] High average duration detected', { 
          avgDuration: stats.avgDuration 
        });
      }
      
    } catch (error) {
      logger.error('[CRON] Health check failed', { error });
    }
  });

  logger.info('[CRON] Health check job scheduled', { schedule });
};

/**
 * Démarrer tous les jobs
 */
export const startAllJobs = () => {
  startDatabaseCleanupJob();
  startFileCleanupJob();
  startHealthCheckJob();
  
  logger.info('[CRON] All cleanup jobs started');
};

/**
 * Job manuel : Nettoyage immédiat (pour tests)
 */
export const runManualCleanup = async () => {
  logger.info('[MANUAL] Cleanup started');
  
  try {
    const [dbDeleted, fileDeleted] = await Promise.all([
      cleanDBLogs(90),
      cleanFileLogs(30)
    ]);
    
    logger.info('[MANUAL] Cleanup completed', { 
      dbDeleted, 
      fileDeleted 
    });
    
    return { dbDeleted, fileDeleted };
    
  } catch (error) {
    logger.error('[MANUAL] Cleanup failed', { error });
    throw error;
  }
};
