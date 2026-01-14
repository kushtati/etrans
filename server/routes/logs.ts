/**
 * 📊 ROUTE LOGS FRONTEND
 * 
 * Collecte logs frontend pour monitoring/debugging
 * - Fire-and-forget (navigator.sendBeacon)
 * - Pas d'authentification (public endpoint)
 * - Rate limiting strict
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import { logger as serverLogger, logError } from '../config/logger';

const router = Router();

/**
 * Rate limiting strict (prevent spam)
 */
const logsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // 50 logs max par minute par IP
  message: 'Trop de logs envoyés',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

/**
 * Interface log frontend
 */
interface FrontendLogEntry {
  level: 'info' | 'warn' | 'error' | 'audit';
  timestamp: string;
  message: string;
  context?: any;
  user: string;
  role: string;
  sessionId: string;
}

/**
 * POST /api/logs
 * Réception logs frontend
 */
router.post('/', logsLimiter, async (req: Request, res: Response) => {
  try {
    const logEntry: FrontendLogEntry = req.body;

    // Validation basique
    if (!logEntry.level || !logEntry.message) {
      return res.status(400).json({ error: 'Invalid log entry' });
    }

    // Log côté serveur avec préfixe [FRONTEND]
    const logMessage = `[FRONTEND] ${logEntry.message}`;
    const logContext = {
      ...logEntry.context,
      user: logEntry.user,
      role: logEntry.role,
      sessionId: logEntry.sessionId,
      timestamp: logEntry.timestamp,
      ip: req.ip,
      userAgent: req.get('user-agent')
    };

    // Dispatcher selon level
    switch (logEntry.level) {
      case 'error':
        serverLogger.error(logMessage, logContext);
        break;
      case 'warn':
        serverLogger.warn(logMessage, logContext);
        break;
      case 'audit':
        serverLogger.audit(logMessage, logContext);
        break;
      case 'info':
      default:
        serverLogger.info(logMessage, logContext);
        break;
    }

    // Réponse immédiate (fire-and-forget)
    res.status(204).send(); // No Content (success sans body)

  } catch (error) {
    // Fail silently (ne pas casser le frontend si logging échoue)
    logError('Frontend log processing error', error as Error, { ip: req.ip });
    res.status(500).json({ error: 'Log processing failed' });
  }
});

/**
 * POST /api/logs/batch
 * Réception batch logs (optimisation)
 */
router.post('/batch', logsLimiter, async (req: Request, res: Response) => {
  try {
    const { logs } = req.body;

    if (!Array.isArray(logs) || logs.length === 0) {
      return res.status(400).json({ error: 'Invalid batch format' });
    }
    
    // ✅ Protection DoS : max 100 logs par batch
    if (logs.length > 100) {
      return res.status(413).json({ 
        error: 'Batch trop volumineux (max 100 logs)',
        received: logs.length
      });
    }

    // Traiter chaque log du batch
    for (const logEntry of logs) {
      if (!logEntry.level || !logEntry.message) continue;

      const logMessage = `[FRONTEND:BATCH] ${logEntry.message}`;
      const logContext = {
        ...logEntry.context,
        user: logEntry.user,
        role: logEntry.role,
        sessionId: logEntry.sessionId,
        timestamp: logEntry.timestamp,
        ip: req.ip,
        userAgent: req.get('user-agent')
      };

      switch (logEntry.level) {
        case 'error':
          serverLogger.error(logMessage, logContext);
          break;
        case 'warn':
          serverLogger.warn(logMessage, logContext);
          break;
        case 'audit':
          serverLogger.audit(logMessage, logContext);
          break;
        default:
          serverLogger.info(logMessage, logContext);
      }
    }

    serverLogger.info(`[LOGS] Batch processed: ${logs.length} logs`);

    res.status(204).send();

  } catch (error) {
    logError('Frontend batch processing error', error as Error, { ip: req.ip });
    res.status(500).json({ error: 'Batch processing failed' });
  }
});

/**
 * GET /api/logs/health
 * Health check endpoint logs
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    service: 'frontend-logs',
    timestamp: new Date().toISOString()
  });
});

export default router;
