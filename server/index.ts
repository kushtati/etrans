/**
 * SERVEUR EXPRESS - TRANSIT GUINÉE
 * 
 * Configuration sécurisée avec :
 * ✅ Validation environnement stricte (crash si invalide)
 * ✅ HTTPS
 * ✅ Helmet (headers sécurité)
 * ✅ CORS
 * ✅ Rate limiting global
 * ✅ Compression
 * ✅ Body parsing sécurisé
 * ✅ Variables environnement (.env.server)
 */

// ============================================
// GESTIONNAIRES D'ERREURS GLOBAUX (EN PREMIER)
// ============================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('═══════════════════════════════════════════════════');
  console.error('[CRITICAL] Unhandled Rejection at:', promise);
  console.error('[CRITICAL] Reason:', reason);
  console.error('═══════════════════════════════════════════════════');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('═══════════════════════════════════════════════════');
  console.error('[CRITICAL] Uncaught Exception:', err);
  console.error('[CRITICAL] Stack:', err.stack);
  console.error('═══════════════════════════════════════════════════');
  process.exit(1);
});

console.log('='.repeat(60));
console.log('[RAILWAY] SERVER STARTING - STEP 1: Loading environment');
console.log('='.repeat(60));

// 🔐 CRITIQUE : Charger env AVANT tout import
import './config/env';

console.log('[RAILWAY] STEP 2: Environment loaded, starting validation');

// 🔒 CRITIQUE : Valider environnement AVANT démarrage
import { validateEnvironment } from './config/validateEnv';
validateEnvironment(); // ⛔ CRASH si configuration invalide

console.log('[RAILWAY] STEP 3: Validation complete, loading dependencies');

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

// Routes (importées après chargement env)
import authRoutes from './routes/auth';
import webauthnRoutes from './routes/webauthn';
import aiRoutes from './routes/ai';
import financeRoutes from './routes/finance';
import shipmentsRoutes from './routes/shipments';
import logsRoutes from './routes/logs';
import adminLogsRoutes from './routes/adminLogs';

// Services
import { initAuditDB } from './services/auditService';
import { initRedis, redis } from './config/redis';
import { logger, logHttp, logSecurity, logError, logServerStart, logShutdown } from './config/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// VERSION & BUILD INFO
// ============================================
const SERVER_VERSION = '2.2.0';
const BUILD_DATE = '2026-01-15';
const COMMIT_MARKER = 'force-redeploy-railway-debug';

console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 TRANSIT GUINÉE SERVER - v${SERVER_VERSION}                   ║
║  📅 Build: ${BUILD_DATE}                                   ║
║  🔖 Commit: ${COMMIT_MARKER}                    ║
╚═══════════════════════════════════════════════════════════╝
`);

// ============================================
// CONFIGURATION
// ============================================

const PORT = parseInt(process.env.PORT || '3001', 10);
// Production: TOUJOURS écouter sur 0.0.0.0 pour Railway/Render
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Constantes de sécurité
const SECURITY_CONFIG = {
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    GLOBAL_MAX: 200, // Requêtes globales
    AUTH_MAX: 5, // Tentatives authentification
  },
  BODY: {
    DEFAULT_LIMIT: '100kb',
    UPLOAD_LIMIT: '5mb',
  },
  TIMEOUTS: {
    HTTP_REQUEST: 30000,
    KEEP_ALIVE: 65000,
    HEADERS: 66000,
    SHUTDOWN: 10000,
  },
} as const;

// ============================================
// INITIALISATION EXPRESS
// ============================================

const app: Application = express();

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
  windowMs: SECURITY_CONFIG.RATE_LIMIT.WINDOW_MS,
  max: SECURITY_CONFIG.RATE_LIMIT.GLOBAL_MAX,
  message: 'Trop de requêtes depuis cette IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// Rate limiting STRICT pour authentification
const authLimiter = rateLimit({
  windowMs: SECURITY_CONFIG.RATE_LIMIT.WINDOW_MS,
  max: SECURITY_CONFIG.RATE_LIMIT.AUTH_MAX,
  skipSuccessfulRequests: true, // Ne compter que les échecs
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. Protection NoSQL injection manuelle
const sanitizeInput = (obj: any): any => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized: any = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    // Interdire clés commençant par $ ou contenant des points
    if (key.startsWith('$') || key.includes('.')) {
      throw new Error('Invalid input: NoSQL operators not allowed');
    }
    sanitized[key] = sanitizeInput(obj[key]);
  }
  return sanitized;
};

// Body parsing sécurisé avec validation NoSQL
app.use(express.json({ 
  limit: SECURITY_CONFIG.BODY.DEFAULT_LIMIT,
  verify: (req, res, buf) => {
    try {
      const body = JSON.parse(buf.toString());
      sanitizeInput(body);
    } catch (err) {
      if (err instanceof Error && err.message.includes('NoSQL')) {
        throw err; // Rejeter si opérateurs NoSQL détectés
      }
      // Laisser Express gérer les autres erreurs JSON
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: SECURITY_CONFIG.BODY.DEFAULT_LIMIT 
}));

// 5. Cookie parser
app.use(cookieParser());

// 6. Protection NoSQL injection (Validée manuellement ci-dessus)
// mongoSanitize désactivé (incompatible Express 5)

// 7. Protection HTTP Parameter Pollution
app.use(hpp());

// 8. Compression
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
    version: SERVER_VERSION,
    build: BUILD_DATE,
    commit: COMMIT_MARKER,
    timestamp: new Date().toISOString()
  });
});

// Health check détaillé
app.get('/api/health', async (req: Request, res: Response) => {
  const health: any = {
    status: 'OK',
    version: SERVER_VERSION,
    build: BUILD_DATE,
    commit: COMMIT_MARKER,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    checks: {
      redis: 'unknown' as 'ok' | 'error' | 'unknown',
      database: 'unknown' as 'ok' | 'error' | 'unknown',
    },
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
    },
  };

  // Vérifier Redis
  try {
    if (redis.isAvailable()) {
      await redis.set('health:check', 'ok', 10);
      const test = await redis.get('health:check');
      health.checks.redis = test === 'ok' ? 'ok' : 'error';
    } else {
      health.checks.redis = 'error';
    }
  } catch (error) {
    health.checks.redis = 'error';
    health.status = 'DEGRADED';
  }

  // Vérifier Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
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
app.use('/api/auth', noCacheMiddleware);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);

// WebAuthn routes (biométrie - anti-cache)
app.use('/api/webauthn', noCacheMiddleware);
app.use('/api/webauthn', webauthnRoutes);

// 🤖 AI routes (protected - Gemini API sécurisée)
app.use('/api/ai', aiRoutes);

// Finance routes (protected by permissions - anti-cache)
app.use('/api/finance', noCacheMiddleware);
app.use('/api/finance', financeRoutes);

// Shipments routes (protected by permissions)
app.use('/api/shipments', shipmentsRoutes);

// 📊 Logs routes (frontend logs collection)
app.use('/api/logs', logsRoutes);

// 🔧 Admin logs routes (stats, cleanup, audit)
app.use('/api/admin/logs', adminLogsRoutes);

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

const startServer = () => {
  // Railway gère HTTPS automatiquement via son proxy
  // On utilise toujours HTTP en interne
  if (NODE_ENV === 'production') {
    logger.info('Starting production server', { host: HOST, port: PORT });
    logger.info('Railway will handle HTTPS termination');
    
    const httpServer = http.createServer(app);
    server = httpServer; // Stocker pour shutdown
    
    // Configuration timeouts et limites
    httpServer.timeout = SECURITY_CONFIG.TIMEOUTS.HTTP_REQUEST;
    httpServer.keepAliveTimeout = SECURITY_CONFIG.TIMEOUTS.KEEP_ALIVE;
    httpServer.headersTimeout = SECURITY_CONFIG.TIMEOUTS.HEADERS;
    httpServer.maxConnections = 500; // Limite connexions simultanées
    httpServer.maxHeadersCount = 2000; // Limite headers
    
    httpServer.on('error', (error: any) => {
      logError('Server startup error', error);
      process.exit(1);
    });
    
    httpServer.listen(PORT, HOST, () => {
      logServerStart(HOST, PORT, NODE_ENV);
      logger.info('Health endpoint', { url: `http://${HOST}:${PORT}/health` });
    });
    
  } else {
    // HTTP en développement
    logger.info('Starting HTTP server', { host: HOST, port: PORT });
    const httpServer = http.createServer(app);
    server = httpServer; // CRITIQUE : Stocker pour shutdown
    
    // Configuration timeouts en dev aussi
    httpServer.timeout = SECURITY_CONFIG.TIMEOUTS.HTTP_REQUEST;
    httpServer.keepAliveTimeout = SECURITY_CONFIG.TIMEOUTS.KEEP_ALIVE;
    httpServer.headersTimeout = SECURITY_CONFIG.TIMEOUTS.HEADERS;
    
    httpServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
        
        // Commandes multi-plateformes
        const fixCommand = process.platform === 'win32'
          ? `netstat -ano | findstr :${PORT} && taskkill /PID <PID> /F`
          : process.platform === 'darwin'
          ? `lsof -ti:${PORT} | xargs kill -9`
          : `fuser -k ${PORT}/tcp`;
        
        logger.info('Fix command', { command: fixCommand });
        process.exit(1);
      } else if (error.code === 'EACCES') {
        logger.error(`Permission denied to bind to port ${PORT}`);
        process.exit(1);
      } else {
        logError('Server error', error);
        process.exit(1);
      }
    });
    
    httpServer.listen(PORT, HOST, () => {
      logServerStart(HOST, PORT, NODE_ENV);
    });
  }
};

// ============================================
// GRACEFUL SHUTDOWN : Fermeture propre HTTP + Redis
// ============================================

const gracefulShutdown = async (signal: string) => {
  logShutdown(signal);
  
  try {
    // 1. Arrêter d'accepter nouvelles connexions
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => {
          if (err) {
            logError('Error closing HTTP server', err);
            reject(err);
          } else {
            logger.info('HTTP Server closed');
            resolve();
          }
        });
      });
    } else {
      logger.warn('Server not started yet, nothing to close');
    }

    // 2. Fermer connexion Redis proprement
    try {
      await redis.disconnect();
      logger.info('Redis disconnected');
    } catch (redisError) {
      logger.warn('Redis disconnect failed (may already be closed)', { error: redisError });
    }
    
    // 3. Fermer Prisma
    try {
      await prisma.$disconnect();
      logger.info('Prisma disconnected');
    } catch (prismaError) {
      logger.warn('Prisma disconnect failed', { error: prismaError });
    }
    
    logger.info('All connections closed. Exiting...');
    process.exit(0);
    
  } catch (error) {
    logError('Error during shutdown', error as Error);
    // Force exit après timeout configuré
    setTimeout(() => {
      logger.error('Forced exit after timeout');
      process.exit(1);
    }, SECURITY_CONFIG.TIMEOUTS.SHUTDOWN);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Erreurs non capturées (loggées automatiquement par logger.ts)
process.on('uncaughtException', (error) => {
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  gracefulShutdown('UNHANDLED_REJECTION');
});

// ============================================
// START SERVER
// ============================================

const initializeServer = async () => {
  try {
    logger.info('Initializing server...', { version: 'v2.2.0 - Production Ready' });
    
    // 1. Audit DB (non-critique)
    try {
      logger.info('Initializing Audit DB...');
      await initAuditDB();
      logger.info('Audit DB ready');
    } catch (error) {
      logger.warn('Audit DB failed (non-critical)', { 
        error: error instanceof Error ? error.message : error 
      });
    }
    
    // 2. Redis (CRITIQUE - rate limiting et token blacklist)
    logger.info('Initializing Redis...');
    try {
      await initRedis();
      
      // Test connexion Redis
      if (!redis.isAvailable()) {
        throw new Error('Redis not available');
      }
      
      // Test opération
      await redis.set('healthcheck', 'ok', 10);
      const testValue = await redis.get('healthcheck');
      if (testValue !== 'ok') {
        throw new Error('Redis read/write test failed');
      }
      
      logger.info('Redis connected and ready');
    } catch (error) {
      logger.error('REDIS CRITICAL FAILURE', { 
        error: error instanceof Error ? error.message : error 
      });
      
      if (NODE_ENV === 'production') {
        logger.warn('Production mode: Starting without Redis (DEGRADED MODE)');
        logger.warn('Rate limiting and token blacklist will use memory fallback');
        logger.warn('⚠️ NOT RECOMMENDED FOR PRODUCTION - Configure Redis ASAP');
      } else {
        logger.error('Cannot start without Redis (rate limiting and security required)');
        process.exit(1);
      }
    }
    
    // 3. Démarrer serveur HTTP
    logger.info('Starting HTTP server...');
    startServer();
    
  } catch (error) {
    logger.error('FATAL ERROR during initialization', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error
    });
    
    // En production : tenter de démarrer quand même (mode dégradé)
    if (NODE_ENV === 'production') {
      logger.error('Starting in DEGRADED MODE...');
      try {
        startServer();
      } catch (startError) {
        logger.error('Failed to start even in degraded mode', { error: startError });
        process.exit(1);
      }
    } else {
      logger.error('Exiting due to initialization failure');
      process.exit(1);
    }
  }
};

// Appeler la fonction d'initialisation
initializeServer();

export default app;
