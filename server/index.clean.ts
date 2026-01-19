/**
 * 🚀 SERVEUR EXPRESS - TRANSIT GUINÉE
 * Version Clean - Fondations Solides
 * 
 * Ordre d'exécution critique :
 * 1. Trust proxy (Railway/Vercel)
 * 2. CORS + credentials
 * 3. Cookie parser
 * 4. Body parser
 * 5. Sécurité (helmet, rate-limit)
 * 6. Routes API
 */

// ============================================
// 1. ENVIRONNEMENT (AVANT TOUT)
// ============================================
import './config/env';
import { validateEnvironment } from './config/validateEnv';

// ⛔ CRASH si config invalide (volontaire)
validateEnvironment();

// ============================================
// 2. IMPORTS
// ============================================
import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

// Infrastructure
import { prisma } from './config/prisma';
import { initRedis, redis } from './config/redis';
import { logger } from './config/logger';

// ============================================
// 3. CONFIGURATION
// ============================================
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// 4. APPLICATION EXPRESS
// ============================================
const app: Application = express();
let server: http.Server | null = null;

// ============================================
// 🔧 MIDDLEWARE #1 : TRUST PROXY
// CRITIQUE : Doit être AVANT tout
// ============================================
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Railway = 1 proxy
  console.log('✅ Trust proxy enabled (production)');
} else {
  app.set('trust proxy', false);
  console.log('⚪ Trust proxy disabled (development)');
}

// ============================================
// 🔧 MIDDLEWARE #2 : CORS
// ============================================
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  /\.vercel\.app$/,
  /\.up\.railway\.app$/,
];

app.use(cors({
  origin: (origin, callback) => {
    // Dev : tout autoriser
    if (NODE_ENV === 'development' || !origin) {
      return callback(null, true);
    }
    
    // Prod : vérifier whitelist
    const isAllowed = allowedOrigins.some(allowed => 
      typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
    );
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Origine bloquée: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // ✅ Cookies autorisés
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['Set-Cookie']
}));

// ============================================
// 🔧 MIDDLEWARE #3 : PARSERS
// ============================================
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// 🔧 MIDDLEWARE #4 : SÉCURITÉ
// ============================================

// Helmet (headers HTTP sécurisés)
app.use(helmet({
  contentSecurityPolicy: false, // Simplifier pour commencer
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15min
  max: 300, // 300 req/15min
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // ✅ Pas de validation proxy stricte
  skip: (req) => NODE_ENV === 'development'
});

app.use(globalLimiter);

// Compression
app.use(compression());

// ============================================
// 🔧 MIDDLEWARE #5 : LOGGING
// ============================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ============================================
// 🏥 ROUTES HEALTH CHECK
// ============================================

// Root endpoint (Railway detection)
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Transit Guinée API',
    status: 'running',
    version: '3.0.0-clean',
    timestamp: new Date().toISOString()
  });
});

// Health check détaillé
app.get('/health', async (req: Request, res: Response) => {
  const health: any = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    checks: {
      http: 'UP',
      redis: 'UNKNOWN',
      database: 'UNKNOWN'
    }
  };

  // Test Redis
  try {
    await redis.ping();
    health.checks.redis = 'UP';
  } catch (error) {
    health.checks.redis = 'DOWN';
    health.status = 'DEGRADED';
  }

  // Test Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = 'UP';
  } catch (error) {
    health.checks.database = 'DOWN';
    health.status = 'DEGRADED';
  }

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

// ============================================
// 🛣️ ROUTES API (À AJOUTER PLUS TARD)
// ============================================
// app.use('/api/auth', authRoutes);
// app.use('/api/shipments', shipmentsRoutes);
// ...

// ============================================
// ❌ ERROR HANDLERS
// ============================================

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée',
    path: req.path
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', err);
  
  const statusCode = err.status || 500;
  const message = NODE_ENV === 'production' 
    ? 'Erreur serveur interne' 
    : err.message;
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// 🚀 SERVER STARTUP
// ============================================

const startServer = async () => {
  try {
    console.log('\n========================================');
    console.log('🚀 TRANSIT GUINÉE - SERVER STARTUP');
    console.log('========================================');
    
    // 1. Test Redis
    console.log('\n[1/3] 🔴 Testing Redis connection...');
    try {
      await initRedis();
      await redis.ping();
      console.log('      ✅ Redis connected');
    } catch (error) {
      console.error('      ❌ Redis failed:', error instanceof Error ? error.message : error);
      if (NODE_ENV === 'production') {
        console.warn('      ⚠️ Continuing in DEGRADED MODE');
      } else {
        throw error;
      }
    }
    
    // 2. Test Database
    console.log('\n[2/3] 🗄️  Testing Database connection...');
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('      ✅ Database connected');
    } catch (error) {
      console.error('      ❌ Database failed:', error instanceof Error ? error.message : error);
      throw error; // Database est critique
    }
    
    // 3. Start HTTP Server
    console.log('\n[3/3] 🌐 Starting HTTP server...');
    const httpServer = http.createServer(app);
    server = httpServer;
    
    httpServer.on('error', (error: any) => {
      console.error('\n❌ Server startup error:', error.message);
      if (error.code === 'EADDRINUSE') {
        console.error(`   Port ${PORT} already in use`);
      }
      process.exit(1);
    });
    
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, HOST, () => {
        console.log('\n========================================');
        console.log('✅ SERVER STARTED SUCCESSFULLY');
        console.log('========================================');
        console.log(`📡 Listening: ${HOST}:${PORT}`);
        console.log(`🌍 Environment: ${NODE_ENV}`);
        console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
        console.log('========================================\n');
        resolve();
      });
    });
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR during startup:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
};

// ============================================
// 🛑 GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = async (signal: string) => {
  console.log(`\n[SHUTDOWN] ${signal} received`);
  
  const timeout = setTimeout(() => {
    console.error('[SHUTDOWN] Timeout - forcing exit');
    process.exit(1);
  }, 10000);
  
  try {
    // 1. Arrêter d'accepter nouvelles connexions
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => err ? reject(err) : resolve());
      });
      console.log('[SHUTDOWN] ✅ HTTP server closed');
    }
    
    // 2. Déconnecter Prisma
    await prisma.$disconnect();
    console.log('[SHUTDOWN] ✅ Database disconnected');
    
    // 3. Déconnecter Redis
    await redis.quit();
    console.log('[SHUTDOWN] ✅ Redis disconnected');
    
    clearTimeout(timeout);
    console.log('[SHUTDOWN] ✅ Graceful shutdown complete\n');
    process.exit(0);
    
  } catch (error) {
    clearTimeout(timeout);
    console.error('[SHUTDOWN] ❌ Error:', error);
    process.exit(1);
  }
};

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// ============================================
// 🎬 START
// ============================================
startServer();

export default app;
