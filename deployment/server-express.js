/**
 * Configuration Express.js avec headers de sécurité
 * Alternative si backend Node.js sert aussi le frontend
 */

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// HELMET - Headers de sécurité automatiques
// ============================================
app.use(helmet({
  // Masquer X-Powered-By: Express
  hidePoweredBy: true,
  
  // Content Security Policy - PRODUCTION: Retirer unsafe
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.transitguinee.com"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  
  // HSTS - Force HTTPS 2 ans
  hsts: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny'
  },
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection
  xssFilter: true,
  
  // Permissions Policy
  permittedCrossDomainPolicies: {
    permittedPolicies: "none"
  }
}));

// Permissions Policy manuel (pas dans helmet)
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  next();
});

// ============================================
// COMPRESSION GZIP
// ============================================
app.use(compression({
  level: 6,
  threshold: 256, // Compresser si > 256 bytes
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// ============================================
// CORS (si API backend séparé)
// ============================================
const allowedOrigins = [
  'https://transitguinee.com',
  'https://www.transitguinee.com',
  'https://staging.transitguinee.com',
  'https://dev.transitguinee.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser requêtes sans origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ============================================
// CACHE ASSETS STATIQUES
// ============================================
const distPath = path.join(__dirname, 'dist');

// Service Worker - PAS DE CACHE
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(distPath, 'sw.js'));
});

// Manifest - Cache 1 jour
app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(distPath, 'manifest.json'));
});

app.get('/manifest.webmanifest', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(distPath, 'manifest.webmanifest'));
});

// Assets avec hash - Cache immutable 1 an
app.use('/assets', express.static(path.join(distPath, 'assets'), {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, filePath) => {
    if (filePath.match(/\.(js|css|woff2)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Images et fonts - Cache 6 mois
app.use(express.static(distPath, {
  maxAge: '6M',
  setHeaders: (res, filePath) => {
    if (filePath.match(/\.(png|jpg|jpeg|gif|ico|svg|webp|woff|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=15552000');
    }
  }
}));

// ============================================
// API ROUTES (si backend intégré)
// ============================================
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Rate limiting API
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requêtes par IP (3.3/min)
  message: 'Trop de requêtes, réessayez plus tard.',
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 tentatives login par 15 min
  message: 'Trop de tentatives de connexion.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// Routes API
app.use('/api', (req, res, next) => {
  // Pas de cache pour API
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Import vos routes API
// import apiRoutes from './routes/api.js';
// app.use('/api', apiRoutes);

// ============================================
// SPA ROUTING - Toujours retourner index.html
// ============================================
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  res.sendFile(path.join(distPath, 'index.html'));
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  // Logger centralisé au lieu de console.error
  if (process.env.NODE_ENV === 'production') {
    // En production, logger sans stack trace
    console.error('Error:', err.message);
  } else {
    console.error('Error:', err.stack);
  }
  
  res.status(err.status || 500).json({
    error: 'Erreur serveur',
    message: process.env.NODE_ENV === 'production' ? 'Une erreur est survenue' : err.message
  });
});

// ============================================
// DÉMARRAGE SERVEUR
// ============================================
const server = app.listen(PORT, () => {
  console.log(`✅ Serveur TransitGuinée actif sur port ${PORT}`);
  console.log(`🔒 Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Fichiers statiques: ${distPath}`);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} reçu, fermeture propre...`);
  
  server.close(() => {
    console.log('✅ Serveur fermé proprement');
    process.exit(0);
  });
  
  // Forcer fermeture après 10s si pas terminé
  setTimeout(() => {
    console.error('⚠️ Timeout, fermeture forcée');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
