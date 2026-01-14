/**
 * 🔧 ROUTES ADMIN - Gestion Logs
 * 
 * Endpoints :
 * - GET /api/admin/logs/stats : Statistiques logs
 * - POST /api/admin/logs/cleanup : Nettoyage manuel
 * - GET /api/admin/logs/audit : Audit trail récent
 */

import { Router, Request, Response } from 'express';
import validator from 'validator';
import { authenticateJWT } from '../middleware/auth';
import { logError } from '../config/logger';
import { 
  getGlobalStats, 
  cleanOldLogs, 
  getRecentAuditLogs 
} from '../services/auditService';
import { runManualCleanup } from '../services/cleanupJobs';

const router = Router();

/**
 * Middleware : Vérifier role ADMIN
 */
const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ 
      error: 'Accès refusé. Admin uniquement.' 
    });
  }
  next();
};

/**
 * GET /api/admin/logs/stats
 * Statistiques logs AI (derniers 7 jours)
 */
router.get('/stats', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    let days = parseInt(req.query.days as string) || 7;
    
    // ✅ Validation days (max 90)
    if (!validator.isInt(String(days), { min: 1, max: 90 })) {
      days = 7;
    }
    
    const stats = await getGlobalStats(days);
    
    res.json({
      success: true,
      period: `${days} days`,
      stats
    });
    
  } catch (error) {
    logError('Admin stats error', error as Error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * POST /api/admin/logs/cleanup
 * Nettoyage manuel logs anciens
 */
router.post('/cleanup', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { daysToKeep } = req.body;
    
    const result = await runManualCleanup();
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      deleted: result
    });
    
  } catch (error) {
    logError('Admin cleanup error', error as Error, { userId: req.user?.id });
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

/**
 * GET /api/admin/logs/audit
 * Audit trail récent (100 dernières actions)
 */
router.get('/audit', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    let limit = parseInt(req.query.limit as string) || 100;
    
    // ✅ Validation limit (max 1000)
    if (!validator.isInt(String(limit), { min: 1, max: 1000 })) {
      limit = 100;
    }
    
    const logs = await getRecentAuditLogs(limit);
    
    res.json({
      success: true,
      count: logs.length,
      logs
    });
    
  } catch (error) {
    logError('Admin audit logs error', error as Error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

/**
 * GET /api/admin/logs/health
 * Health check endpoint logs système
 */
router.get('/health', authenticateJWT, requireAdmin, (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    service: 'logs-admin',
    timestamp: new Date().toISOString(),
    features: {
      winston: true,
      rotation: true,
      cleanup: true,
      auditDB: true
    }
  });
});

export default router;
