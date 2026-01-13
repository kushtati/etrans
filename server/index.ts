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

// 🔐 CRITIQUE : Charger env AVANT tout import
import './config/env';

// 🔒 CRITIQUE : Valider environnement AVANT démarrage
import { validateEnvironment } from './config/validateEnv';
validateEnvironment(); // ⛔ CRASH si configuration invalide

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

// Services
import { initAuditDB } from './services/auditService';
import { initRedis, redis } from './config/redis';

// ============================================
// CONFIGURATION
// ============================================

const PORT = parseInt(process.env.PORT || '3001', 10);
// Production: TOUJOURS écouter sur 0.0.0.0 pour Railway/Render
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
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
    // Autoriser requêtes sans origin (mobile apps, Postman) ou en développement
    if (!origin || NODE_ENV === 'development') {
      return callback(null, true);
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
  max: 1000, // 1000 requêtes par IP
  message: 'Trop de requêtes depuis cette IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// 4. Body parsing sécurisé
app.use(express.json({ 
  limit: '10mb', // Limite taille requêtes
  verify: (req, res, buf) => {
    // Vérifier que le body n'est pas corrompu (sauf si vide)
    if (buf.length === 0) return; // Accepter body vide
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Cookie parser
app.use(cookieParser());

// 6. Protection NoSQL injection (Désactivé - incompatible Express 5)
// app.use(mongoSanitize());

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
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
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
    version: '1.1.0',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV
  });
});

// ============================================
// MIDDLEWARE ANTI-CACHE AUTH (FIX 304)
// ============================================

/**
 * 🔥 CRITIQUE : Désactiver cache pour routes authentification
 * 
 * Problème : Le navigateur retourne 304 Not Modified sur /me,
 * ce qui fait que l'utilisateur garde l'identité de la session précédente.
 * 
 * Solution : Interdire complètement le cache des routes /api/auth/*
 */
app.use('/api/auth', (req: Request, res: Response, next: NextFunction) => {
  // Headers HTTP/1.1
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  // Headers HTTP/1.0 (compatibilité anciens proxies)
  res.setHeader('Pragma', 'no-cache');
  // Expiration immédiate
  res.setHeader('Expires', '0');
  // ETag : interdire validation conditionnelle (pas de 304)
  res.removeHeader('ETag');
  res.setHeader('Surrogate-Control', 'no-store');
  
  next();
});

// Auth routes
app.use('/api/auth', authRoutes);

// WebAuthn routes (biométrie)
import webauthnRoutes from './routes/webauthn';
app.use('/api/webauthn', webauthnRoutes);

// 🤖 AI routes (protected - Gemini API sécurisée)
import aiRoutes from './routes/ai';
app.use('/api/ai', aiRoutes);

// Finance routes (protected by permissions)
import financeRoutes from './routes/finance';
app.use('/api/finance', financeRoutes);

// Shipments routes (protected by permissions)
import shipmentsRoutes from './routes/shipments';
app.use('/api/shipments', shipmentsRoutes);

// 📊 Logs routes (frontend logs collection)
import logsRoutes from './routes/logs';
app.use('/api/logs', logsRoutes);

// 🔧 Admin logs routes (stats, cleanup, audit)
import adminLogsRoutes from './routes/adminLogs';
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
  console.error('Error:', err);
  
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
let server: http.Server | https.Server;

const startServer = () => {
  if (NODE_ENV === 'production') {
    // HTTPS en production
    try {
      const privateKey = fs.readFileSync('/etc/ssl/private/server.key', 'utf8');
      const certificate = fs.readFileSync('/etc/ssl/certs/server.crt', 'utf8');
      const ca = fs.readFileSync('/etc/ssl/certs/ca.crt', 'utf8');

      const credentials = {
        key: privateKey,
        cert: certificate,
        ca: ca
      };

      const httpsServer = https.createServer(credentials, app);
      server = httpsServer; // Stocker pour shutdown

      httpsServer.listen(443, HOST, () => {
        console.log(`✅ HTTPS Server running on https://${HOST}:443`);
      });

      // Redirection HTTP → HTTPS
      const httpApp = express();
      httpApp.use((req, res) => {
        res.redirect(301, `https://${req.headers.host}${req.url}`);
      });

      httpApp.listen(80, HOST, () => {
        console.log('✅ HTTP → HTTPS redirect on port 80');
      });

    } catch (error) {
      console.error('❌ HTTPS setup failed:', error);
      console.log('⚠️ Falling back to HTTP (INSECURE)');
      
      const httpServer = http.createServer(app);
      server = httpServer; // Stocker pour shutdown
      
      httpServer.listen(PORT, HOST, () => {
        console.log(`⚠️ HTTP Server running on http://${HOST}:${PORT}`);
      });
    }
    
  } else {
    // HTTP en développement
    console.log(`📡 Starting HTTP server on ${HOST}:${PORT}...`);
    const httpServer = http.createServer(app);
    server = httpServer; // CRITIQUE : Stocker pour shutdown
    
    httpServer.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        console.error(`💡 Fix: Run "netstat -ano | findstr :${PORT}" then "taskkill /PID <PID> /F"`);
        process.exit(1);
      } else if (error.code === 'EACCES') {
        console.error(`❌ Permission denied to bind to port ${PORT}`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
        process.exit(1);
      }
    });
    
    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Server started successfully`);
      console.log(`📡 Listening on ${HOST}:${PORT}`);
      console.log(`🌍 Environment: ${NODE_ENV}`);
      console.log(`✅ Ready to accept connections`);
      
      // Railway healthcheck
      if (NODE_ENV === 'production') {
        console.log(`🏥 Health endpoint: http://${HOST}:${PORT}/health`);
      }
    });
  }
};

// ============================================
// GRACEFUL SHUTDOWN : Fermeture propre HTTP + Redis
// ============================================

const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  try {
    // 1. Arrêter d'accepter nouvelles connexions
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            console.error('❌ Error closing HTTP server:', err);
            reject(err);
          } else {
            console.log('✅ HTTP Server closed');
            resolve();
          }
        });
      });
    }

    // 2. Fermer connexion Redis proprement
    await redis.disconnect();
    console.log('✅ Redis disconnected');
    
    console.log('✅ All connections closed. Exiting...');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    // Force exit après 10s si erreur
    setTimeout(() => {
      console.error('⚠️ Forced exit after timeout');
      process.exit(1);
    }, 10000);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gérer erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// ============================================
// START SERVER
// ============================================

// Initialiser DB audit avant démarrage
initAuditDB()
  .then(async () => {
    console.log('✅ Audit DB ready');
    
    // Initialiser Redis pour rate limiting et token blacklist
    await initRedis();
    
    // TODO: Démarrer jobs de nettoyage (désactivé temporairement)
    // import('./services/cleanupJobs')
    //   .then(({ startAllJobs }) => {
    //     startAllJobs();
    //     console.log('✅ Cleanup jobs started');
    //   })
    //   .catch((error) => {
    //     console.warn('⚠️ Cleanup jobs failed to start (non-critical):', error.message);
    //   });
    
    startServer();
  })
  .catch((error) => {
    console.error('⚠️ Audit DB initialization failed:', error);
    console.log('⚠️ Starting server without audit logs...');
    startServer();
  });

export default app;
