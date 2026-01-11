/**
 * 🔧 ROUTES ADMIN - Gestion Logs
 * 
 * Endpoints :
 * - GET /api/admin/logs/stats : Statistiques logs
 * - POST /api/admin/logs/cleanup : Nettoyage manuel
 * - GET /api/admin/logs/audit : Audit trail récent
 */

import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
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
    const days = parseInt(req.query.days as string) || 7;
    
    const stats = await getGlobalStats(days);
    
    res.json({
      success: true,
      period: `${days} days`,
      stats
    });
    
  } catch (error) {
    console.error('[ADMIN] Stats error:', error);
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
    console.error('[ADMIN] Cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

/**
 * GET /api/admin/logs/audit
 * Audit trail récent (100 dernières actions)
 */
router.get('/audit', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    
    const logs = await getRecentAuditLogs(limit);
    
    res.json({
      success: true,
      count: logs.length,
      logs
    });
    
  } catch (error) {
    console.error('[ADMIN] Audit logs error:', error);
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
