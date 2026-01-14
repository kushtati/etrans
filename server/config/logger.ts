/**
 * LOGGER WINSTON - Configuration centralisée
 * 
 * Features:
 * ✅ Logs structurés (JSON en production)
 * ✅ Rotation automatique des fichiers
 * ✅ Niveaux de log configurables
 * ✅ Timestamping automatique
 * ✅ Pas de logs console en production
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');

// ============================================
// FORMATS
// ============================================

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(meta).length > 0 && meta.stack) {
      msg += `\n${meta.stack}`;
    }
    return msg;
  })
);

// ============================================
// TRANSPORTS
// ============================================

const transports: winston.transport[] = [];

// Console (développement uniquement)
if (NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Fichiers avec rotation (tous environnements)
const logsDir = path.join(process.cwd(), 'logs');

// Logs erreurs (conservés 14 jours)
transports.push(
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true,
  })
);

// Logs combinés (conservés 7 jours)
transports.push(
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: true,
  })
);

// Logs HTTP (séparés pour analyse, conservés 3 jours)
transports.push(
  new DailyRotateFile({
    filename: path.join(logsDir, 'http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'http',
    format: logFormat,
    maxSize: '50m',
    maxFiles: '3d',
    zippedArchive: true,
  })
);

// ============================================
// LOGGER PRINCIPAL
// ============================================

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  levels: winston.config.npm.levels,
  format: logFormat,
  transports,
  exitOnError: false,
});

// ============================================
// HELPERS
// ============================================

/**
 * Logger HTTP avec formatage standardisé
 */
export const logHttp = (method: string, path: string, statusCode: number, duration: number, ip?: string) => {
  logger.http('HTTP Request', {
    method,
    path,
    statusCode,
    duration,
    ip,
  });
};

/**
 * Logger sécurité (tentatives connexion, CORS, etc.)
 */
export const logSecurity = (event: string, details: Record<string, any>) => {
  logger.warn('Security Event', {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Logger erreurs avec contexte
 */
export const logError = (message: string, error: Error, context?: Record<string, any>) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
};

/**
 * Logger démarrage serveur
 */
export const logServerStart = (host: string, port: number, environment: string) => {
  logger.info('Server Started', {
    host,
    port,
    environment,
    nodeVersion: process.version,
    platform: process.platform,
  });
};

/**
 * Logger shutdown
 */
export const logShutdown = (signal: string, reason?: string) => {
  logger.info('Server Shutdown', {
    signal,
    reason,
    uptime: process.uptime(),
  });
};

// ============================================
// GESTION ERREURS NON CAPTURÉES
// ============================================

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });
});

export default logger;
