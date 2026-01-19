/**
 * SERVEUR EXPRESS - TRANSIT GUINÉE
 * VERSION CORRIGÉE - Tous les problèmes critiques résolus
 */

// 🔐 CRITIQUE : Charger env AVANT tout import
import './config/env';

// 🔒 CRITIQUE : Valider environnement AVANT démarrage
import { validateEnvironment } from './config/validateEnv';
validateEnvironment();

import fs from 'fs';
import path from 'path';
import express, { Application, Request, Response, NextFunction } from 'express';
import https from 'https';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';

// Services
import { initAuditDB } from './services/auditService';
import { initRedis, redis } from './config/redis';
import { logger, logHttp, logSecurity, logError, logServerStart, logShutdown } from './config/logger';
import { prisma } from './config/prisma';

// ============================================
// CONFIGURATION
// ============================================

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// INITIALISATION EXPRESS
// ============================================

const app: Application = express();

// ============================================
// TRUST PROXY (RAILWAY/NGINX)
// ============================================

// 🔧 FIX : Trust proxy pour Railway/Render/Vercel
// CRITIQUE : Doit être AVANT tous les middleware (surtout rate-limit)
if (NODE_ENV === 'production') {
  // Railway/Render/Vercel sont derrière 1 proxy
  app.set('trust proxy', 1);
  console.log('✅ Trust proxy enabled (production)');
} else {
  // En développement, pas de proxy
  app.set('trust proxy', false);
  console.log('⚪ Trust proxy disabled (development)');
}

// ============================================
// MIDDLEWARE DE SÉCURITÉ
// ============================================

// 1. Helmet - Headers de sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 an
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' }, // Pas d'iframe
  noSniff: true,
  xssFilter: true
}));

// 2. CORS - Origines autorisées
const allowedOrigins = [
  'https://transit.guinee.gn',
  'https://www.transit.guinee.gn',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Railway.app backend
  'https://web-production-9e58c.up.railway.app',
  /\.up\.railway\.app$/,
  // Vercel domains
  /\.vercel\.app$/,
  // Render.com domains
  /\.onrender\.com$/
];

app.use(cors({
  origin: (origin, callback) => {
    // En développement : autoriser tout
    if (NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // En production : REJETER requêtes sans origin
    if (!origin) {
      logSecurity('CORS_NO_ORIGIN', { environment: NODE_ENV });
      return callback(new Error('Origin header required in production'));
    }
    
    // Vérifier origine contre liste (strings et regex)
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logSecurity('CORS_BLOCKED', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // ✅ CRITIQUE: Autoriser cookies cross-origin
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'], // ✅ CSRF token
  exposedHeaders: ['Set-Cookie'] // ✅ Exposer cookie au frontend
}));

// 3. Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requêtes max (20/min)
  message: 'Trop de requêtes depuis cette IP',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // ✅ Désactiver validation proxy stricte
  skip: (req) => NODE_ENV === 'development' // Skip en développement
});

app.use(globalLimiter);

// Rate limiting STRICT pour authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // ✅ Désactiver validation proxy stricte
});

// 4. Body parsing sécurisé
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Cookie parser
app.use(cookieParser());

// 6. Protection HTTP Parameter Pollution
app.use(hpp());

// 7. Compression
app.use(compression());

// ============================================
// LOGGING MIDDLEWARE
// ============================================

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logHttp(req.method, req.path, res.statusCode, duration, req.ip);
  });
  
  next();
});

// ============================================
// ROUTES
// ============================================

// Root health check (Railway detection)
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Transit Guinée API',
    status: 'running',
    version: '2.2.0',
    timestamp: new Date().toISOString()
  });
});

// Health check détaillé
app.get('/api/health', async (req: Request, res: Response) => {
  const health: any = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    services: {
      http: 'UP',
      redis: 'UNKNOWN',
      database: 'UNKNOWN'
    }
  };

  // Test Redis
  try {
    await redis.ping();
    health.services.redis = 'UP';
  } catch (error) {
    health.services.redis = 'DOWN';
    health.status = 'DEGRADED';
  }

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

// ============================================
// MIDDLEWARE ANTI-CACHE (FIX 304)
// ============================================

/**
 * Middleware réutilisable : Désactiver cache pour routes sensibles
 */
const noCacheMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.removeHeader('ETag');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};

// Auth routes (avec anti-cache + rate limiting strict)
// ⚠️ Routes montées dynamiquement dans initializeServer()
// (code déplacé pour éviter les imports top-level)

// ============================================
// DEBUG ENDPOINTS (Development only)
// ============================================

if (NODE_ENV === 'development') {
  // Test Trust Proxy - Vérifier détection IP réelle
  app.get('/debug-env', (req: Request, res: Response) => {
    res.json({
      ip: req.ip,
      ips: req.ips,
      forwarded: req.headers['x-forwarded-for'],
      realIp: req.headers['x-real-ip'],
      environment: NODE_ENV,
      trustProxy: app.get('trust proxy'),
      headers: {
        host: req.headers.host,
        origin: req.headers.origin,
        referer: req.headers.referer,
      }
    });
  });
}

// Static files (frontend build)
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// ============================================
// ERROR HANDLING
// ============================================

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée'
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logError('Express Error Handler', err, {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  
  // Ne pas exposer détails erreur en production
  const message = NODE_ENV === 'production' 
    ? 'Erreur serveur interne' 
    : err.message;
  
  res.status(err.status || 500).json({
    success: false,
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// HTTPS CONFIGURATION
// ============================================

// CRITIQUE : Stocker référence serveur pour graceful shutdown
let server: http.Server | https.Server | null = null;

const startServer = async () => {
  console.log(`[SERVER] 🚀 Starting production server on ${HOST}:${PORT}`);
  
  // ============================================
  // IMPORTER ET MONTER LES ROUTES DYNAMIQUEMENT
  // ============================================
  
  logger.info('Loading routes dynamically...');
  try {
    const authRoutes = (await import('./routes/auth')).default;
    const webauthnRoutes = (await import('./routes/webauthn')).default;
    const aiRoutes = (await import('./routes/ai')).default;
    const financeRoutes = (await import('./routes/finance')).default;
    const shipmentsRoutes = (await import('./routes/shipments')).default;
    const logsRoutes = (await import('./routes/logs')).default;
    const adminLogsRoutes = (await import('./routes/adminLogs')).default;
    
    // Monter les routes avec middlewares
    app.use('/api/auth', noCacheMiddleware);
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
    app.use('/api/auth', authRoutes);
    
    app.use('/api/webauthn', noCacheMiddleware);
    app.use('/api/webauthn', webauthnRoutes);
    
    app.use('/api/ai', aiRoutes);
    
    app.use('/api/finance', noCacheMiddleware);
    app.use('/api/finance', financeRoutes);
    
    app.use('/api/shipments', shipmentsRoutes);
    
    app.use('/api/logs', logsRoutes);
    
    app.use('/api/admin/logs', adminLogsRoutes);
    
    logger.info('All routes mounted successfully');
  } catch (error) {
    logger.error('Failed to load routes', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
  
  // ============================================
  // DÉMARRER SERVEUR HTTP
  // ============================================
  
  const httpServer = http.createServer(app);
  server = httpServer;
  
  httpServer.on('error', (error: any) => {
    console.error('[SERVER] ❌ Startup error:', error);
    
    if (error.code === 'EADDRINUSE') {
      console.error(`[SERVER] Port ${PORT} already in use`);
    } else if (error.code === 'EACCES') {
      console.error(`[SERVER] Permission denied for port ${PORT}`);
    }
    
    process.exit(1);
  });
  
  httpServer.listen(PORT, HOST, () => {
    console.log('[SERVER] ========================================');
    console.log('[SERVER] ✅ SERVER STARTED SUCCESSFULLY');
    console.log('[SERVER] ========================================');
    console.log(`[SERVER] 📡 Listening on ${HOST}:${PORT}`);
    console.log(`[SERVER] 🌍 Environment: ${NODE_ENV}`);
    console.log(`[SERVER] 🏥 Health: http://${HOST}:${PORT}/api/health`);
    console.log('[SERVER] ========================================');
  });
};

// ============================================
// GRACEFUL SHUTDOWN : Fermeture propre HTTP + Redis
// ============================================

const gracefulShutdown = async (signal: string) => {
  console.log(`\n[SERVER] ${signal} received - shutting down gracefully...`);
  
  const timeout = setTimeout(() => {
    console.error('[SERVER] ⚠️ Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 10000);
  
  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => err ? reject(err) : resolve());
      });
      console.log('[SERVER] ✅ HTTP server closed');
    }

    // Déconnecter Prisma proprement
    await prisma.$disconnect();
    console.log('[SERVER] ✅ Prisma disconnected');

    await redis.quit();
    console.log('[SERVER] ✅ Redis disconnected');
    
    clearTimeout(timeout);
    console.log('[SERVER] ✅ Graceful shutdown complete');
    process.exit(0);
    
  } catch (error) {
    clearTimeout(timeout);
    console.error('[SERVER] ❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('[SERVER] ❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] ❌ Unhandled Rejection:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// ============================================
// INITIALIZATION
// ============================================

console.log('[SERVER] 🚀 Initializing server...');

const initializeServer = async () => {
  try {
    // 1. Audit DB (non-critique)
    try {
      console.log('[SERVER] 🔄 Initializing Audit DB...');
      await initAuditDB();
      console.log('[SERVER] ✅ Audit DB ready');
    } catch (error) {
      console.warn('[SERVER] ⚠️ Audit DB failed (non-critical):', error instanceof Error ? error.message : String(error));
    }
    
    // 2. Redis (critique)
    try {
      console.log('[SERVER] 🔄 Initializing Redis...');
      await initRedis();
      await redis.ping();
      console.log('[SERVER] ✅ Redis ready');
    } catch (error) {
      console.error('[SERVER] ❌ Redis initialization failed:', error);
      
      if (NODE_ENV === 'production') {
        console.warn('[SERVER] ⚠️ Starting in DEGRADED MODE (no Redis)');
        console.warn('[SERVER] ⚠️ Rate limiting and token blacklist DISABLED');
      } else {
        throw error;
      }
    }
    
    // 3. Démarrer serveur HTTP
    console.log('[SERVER] 🔄 Starting HTTP server...');
    await startServer();
    
  } catch (error) {
    console.error('[SERVER] ❌ FATAL ERROR during initialization:', error);
    console.error('[SERVER] Stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    if (NODE_ENV === 'production') {
      console.error('[SERVER] ⚠️ Attempting to start in degraded mode...');
      await startServer();
    } else {
      console.error('[SERVER] 🛑 Exiting due to initialization failure');
      process.exit(1);
    }
  }
};

initializeServer();

export default app;
