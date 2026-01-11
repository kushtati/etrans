/**
 * 📊 Service Logger Backend
 * 
 * Version serveur du logger (Node.js)
 * - Winston avec rotation quotidienne
 * - Fichiers logs avec rétention configurable
 * - Différentiation dev/prod
 */

import { logger as winstonLogger, auditLog as winstonAuditLog } from './logService';

type LogLevel = 'info' | 'warn' | 'error' | 'audit';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: any;
}

class ServerLogger {
  private log(level: LogLevel, message: string, context?: any) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message,
      context
    };

    // Utiliser Winston avec rotation
    switch (level) {
      case 'error':
        winstonLogger.error(message, context);
        break;
      case 'warn':
        winstonLogger.warn(message, context);
        break;
      case 'info':
        winstonLogger.info(message, context);
        break;
      case 'audit':
        // Audit via logger dédié
        winstonAuditLog(message, context);
        break;
      default:
        winstonLogger.info(message, context);
    }
  }

  info(message: string, context?: any) {
    this.log('info', message, context);
  }

  warn(message: string, context?: any) {
    this.log('warn', message, context);
  }

  error(message: string, context?: any) {
    this.log('error', message, context);
  }

  audit(action: string, details: any) {
    this.log('audit', `AUDIT: ${action}`, details);
  }
}

export const logger = new ServerLogger();
