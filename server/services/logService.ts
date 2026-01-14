/**
 * 📊 Service Logging Backend avec Winston
 * 
 * Fonctionnalités :
 * - Logs console (dev)
 * - Rotation quotidienne fichiers logs
 * - Rétention configurable (30j app, 90j erreurs)
 * - Audit trail base de données
 * - Niveaux configurables
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { logAuditAction } from './auditService';

/**
 * Créer dossier logs si n'existe pas
 */
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Format custom pour logs
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * Format console avec couleurs
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} ${level}: ${message} ${metaStr}`;
  })
);

/**
 * Transport : Console
 */
const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
  level: process.env.LOG_LEVEL || 'info'
});

/**
 * Transport : Fichiers avec rotation quotidienne (logs généraux)
 */
const dailyRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',        // Rotation si fichier > 20 MB
  maxFiles: '30d',       // Garder 30 jours
  format: customFormat,
  level: 'info',
  zippedArchive: true    // Compresser anciens logs
});

/**
 * Transport : Erreurs séparées avec rétention longue
 */
const errorRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '90d',       // Garder 90 jours (erreurs = critique)
  format: customFormat,
  level: 'error',
  zippedArchive: true
});

/**
 * Transport : Audit trail (actions critiques)
 */
const auditRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'audit-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',        // Audit peut être volumineux
  maxFiles: '365d',      // Garder 1 an (compliance)
  format: customFormat,
  level: 'info',
  zippedArchive: true
});

/**
 * Logger Winston principal
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: { service: 'transit-app' },
  transports: [
    consoleTransport,
    dailyRotateTransport,
    errorRotateTransport
  ],
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log') 
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log') 
    })
  ]
});

/**
 * Logger dédié audit trail
 */
export const auditLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: { type: 'audit' },
  transports: [
    consoleTransport,
    auditRotateTransport
  ]
});

/**
 * Events rotation fichiers
 */
dailyRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Log rotation', { oldFilename, newFilename });
});

errorRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Error log rotation', { oldFilename, newFilename });
});

auditRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Audit log rotation', { oldFilename, newFilename });
});

/**
 * Fonction audit trail (fichier + base de données)
 */
export const auditLog = async (action: string, details: any): Promise<void> => {
  try {
    // 1. Log fichier via Winston
    auditLogger.info(action, {
      ...details,
      timestamp: new Date().toISOString()
    });

    // 2. Log base de données avec Prisma
    await logAuditAction({
      action,
      userId: details.userId || details.user || 'SYSTEM',
      details: details,
      ipAddress: details.ip || details.ipAddress,
      userAgent: details.userAgent
    });

  } catch (error) {
    logger.error('Audit log failed', { action, error });
  }
};

/**
 * Wrapper methods pour compatibilité
 */
export const logService = {
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  audit: (action: string, details: any) => auditLog(action, details)
};

/**
 * Cleanup logs anciens manuellement (si besoin)
 */
export const cleanupOldLogs = async (daysToKeep: number = 30): Promise<number> => {
  try {
    const files = fs.readdirSync(logsDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        deletedCount++;
        logger.info('Old log deleted', { file, age: daysToKeep });
      }
    }

    return deletedCount;
  } catch (error) {
    logger.error('Cleanup logs failed', { error });
    return 0;
  }
};

export default logger;
