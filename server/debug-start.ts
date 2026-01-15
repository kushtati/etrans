/**
 * 🔍 SCRIPT DE DÉMARRAGE AVEC LOGGING EXHAUSTIF
 * 
 * Ce fichier remplace temporairement server/index.ts pour capturer
 * TOUTES les erreurs qui empêchent le serveur de démarrer.
 */

import fs from 'fs';
import path from 'path';

// ============================================
// SYSTÈME DE LOGGING FICHIER + CONSOLE
// ============================================

const LOG_FILE = path.join(process.cwd(), 'startup-debug.log');

function log(message: string, error?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  // Console
  console.log(logMessage);
  
  // Fichier (append)
  try {
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
    if (error) {
      const errorDetails = error instanceof Error 
        ? `${error.message}\n${error.stack}`
        : JSON.stringify(error, null, 2);
      fs.appendFileSync(LOG_FILE, `ERROR DETAILS:\n${errorDetails}\n\n`);
    }
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}

// ============================================
// ÉTAPE 1 : VÉRIFIER ENVIRONNEMENT
// ============================================

log('========================================');
log('🚀 DÉMARRAGE DEBUG - Railway Deploy');
log('========================================');
log(`Node version: ${process.version}`);
log(`Platform: ${process.platform}`);
log(`Architecture: ${process.arch}`);
log(`CWD: ${process.cwd()}`);
log(`NODE_ENV: ${process.env.NODE_ENV}`);
log(`PORT: ${process.env.PORT}`);

// ============================================
// ÉTAPE 2 : VÉRIFIER FICHIERS REQUIS
// ============================================

log('\n📂 Vérification fichiers...');

const requiredFiles = [
  'server/config/env.ts',
  'server/config/validateEnv.ts',
  'server/config/redis.ts',
  'server/services/auditService.ts',
  'server/routes/auth.ts',
  'prisma/schema.prisma'
];

for (const file of requiredFiles) {
  const exists = fs.existsSync(file);
  log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) {
    log(`⚠️ FICHIER MANQUANT: ${file}`, new Error('File not found'));
  }
}

// ============================================
// FONCTION PRINCIPALE ASYNC
// ============================================

async function main() {

// ============================================
// ÉTAPE 3 : CHARGER CONFIGURATION ENV
// ============================================

log('\n🔐 Chargement configuration...');

try {
  log('  Importing ./config/env...');
  await import('./config/env');
  log('  ✅ config/env chargé');
} catch (error) {
  log('  ❌ Erreur chargement config/env', error);
  process.exit(1);
}

// ============================================
// ÉTAPE 4 : VALIDER ENVIRONNEMENT
// ============================================

log('\n🔍 Validation environnement...');

try {
  log('  Importing validateEnvironment...');
  const { validateEnvironment } = await import('./config/validateEnv');
  
  log('  Calling validateEnvironment()...');
  validateEnvironment();
  
  log('  ✅ Environnement validé');
} catch (error) {
  log('  ❌ Erreur validation environnement', error);
  process.exit(1);
}

// ============================================
// ÉTAPE 5 : IMPORTER DÉPENDANCES EXPRESS
// ============================================

log('\n📦 Import dépendances Express...');

try {
  log('  Importing express...');
  const express = await import('express');
  log('  ✅ express importé');
  
  log('  Importing helmet...');
  await import('helmet');
  log('  ✅ helmet importé');
  
  log('  Importing cors...');
  await import('cors');
  log('  ✅ cors importé');
  
  log('  Importing compression...');
  await import('compression');
  log('  ✅ compression importé');
  
  log('  Importing cookie-parser...');
  await import('cookie-parser');
  log('  ✅ cookie-parser importé');
  
  log('  Importing express-rate-limit...');
  await import('express-rate-limit');
  log('  ✅ express-rate-limit importé');
  
} catch (error) {
  log('  ❌ Erreur import dépendances Express', error);
  process.exit(1);
}

// ============================================
// ÉTAPE 6 : VÉRIFIER PRISMA CLIENT
// ============================================

log('\n🔍 Vérification Prisma Client...');

try {
  log('  Importing @prisma/client...');
  const { PrismaClient } = await import('@prisma/client');
  
  log('  Creating Prisma instance...');
  const testPrisma = new PrismaClient();
  
  log('  Testing database connection...');
  await testPrisma.$queryRaw`SELECT 1`;
  
  log('  ✅ Prisma Client opérationnel');
  await testPrisma.$disconnect();
} catch (error: any) {
  log('  ❌ PRISMA CLIENT FAILED:', error.message);
  log('  Stack:', error.stack);
  
  if (error.message.includes('prisma generate')) {
    log('  [DIAGNOSTIC] Prisma Client pas généré ! Exécutez: npx prisma generate');
  } else if (error.message.includes('DATABASE_URL')) {
    log('  [DIAGNOSTIC] DATABASE_URL invalide ou inaccessible');
  }
  
  // Ne pas crash, continuer pour voir si routes peuvent loader sans DB
}

// ============================================
// ÉTAPE 7 : IMPORTER ET MONTER ROUTES (UN PAR UN)
// ============================================

log('\n🛣️  Import et montage routes (diagnostic mode)...');

// Stocker les routes importées avec succès
const loadedRoutes: { name: string; router: any }[] = [];

const routesToTest = [
  'auth',
  'webauthn',
  'ai',
  'finance',
  'shipments',
  'logs',
  'adminLogs'
];

for (const routeName of routesToTest) {
  try {
    log(`  [IMPORT] Tentative import routes/${routeName}...`);
    
    // Import dynamique avec détails d'erreur
    const routeModule = await import(`./routes/${routeName}`);
    
    log(`  [SUCCESS] routes/${routeName} importé`);
    
    // Vérifier que le module exporte un router
    if (routeModule.default) {
      loadedRoutes.push({ name: routeName, router: routeModule.default });
      log(`  [ROUTER] routes/${routeName} a un export default`);
    } else {
      log(`  [WARNING] routes/${routeName} n'a pas d'export default`, Object.keys(routeModule));
    }
    
  } catch (error: any) {
    log(`  [CRASH] ❌ routes/${routeName} a crashé lors de l'import`);
    log(`  [ERROR] Message: ${error.message}`);
    log(`  [ERROR] Stack:`, error.stack);
    log(`  [ERROR] Code: ${error.code || 'N/A'}`);
    
    // Détails supplémentaires pour diagnostiquer
    if (error.message.includes('Cannot find module')) {
      log(`  [DIAGNOSTIC] Problème de casse ou module manquant`);
    } else if (error.message.includes('circular')) {
      log(`  [DIAGNOSTIC] Dépendance circulaire détectée`);
    } else if (error.message.includes('Prisma')) {
      log(`  [DIAGNOSTIC] Problème avec Prisma Client`);
    } else if (error.message.includes('await')) {
      log(`  [DIAGNOSTIC] Problème avec top-level await`);
    }
  }
}

log(`\n📊 Résumé: ${loadedRoutes.length}/${routesToTest.length} routes chargées avec succès`);

// ============================================
// ÉTAPE 8 : INITIALISER AUDIT DB
// ============================================

log('\n🗄️  Initialisation Audit DB...');

try {
  log('  Importing auditService...');
  const { initAuditDB } = await import('./services/auditService');
  
  log('  Calling initAuditDB()...');
  await initAuditDB();
  
  log('  ✅ Audit DB initialisée');
} catch (error) {
  log('  ⚠️ Audit DB failed (non-critique)', error);
  // Ne pas crash, c'est non-critique
}

// ============================================
// ÉTAPE 9 : INITIALISER REDIS
// ============================================

log('\n🔴 Initialisation Redis...');

try {
  log('  Importing redis config...');
  const { initRedis, redis } = await import('./config/redis');
  
  log('  Calling initRedis()...');
  await initRedis();
  
  log('  Testing Redis connection...');
  const pingResult = await redis.ping();
  log(`  Redis PING result: ${pingResult}`);
  
  log('  ✅ Redis initialisé et fonctionnel');
} catch (error) {
  log('  ❌ REDIS INITIALIZATION FAILED', error);
  
  // Détails supplémentaires
  log('  Redis connection details:');
  log(`    REDIS_URL: ${process.env.REDIS_URL ? 'SET' : 'NOT SET'}`);
  log(`    REDIS_HOST: ${process.env.REDIS_HOST || 'undefined'}`);
  log(`    REDIS_PORT: ${process.env.REDIS_PORT || 'undefined'}`);
  
  if (process.env.NODE_ENV === 'production') {
    log('  ⚠️ Continuing in DEGRADED MODE (no Redis)');
  } else {
    log('  🛑 Exiting due to Redis failure in development');
    process.exit(1);
  }
}

// ============================================
// ÉTAPE 10 : CRÉER SERVEUR HTTP
// ============================================

log('\n🌐 Création serveur HTTP...');

try {
  const express = (await import('express')).default;
  const http = await import('http');
  
  const PORT = parseInt(process.env.PORT || '8080', 10);
  const HOST = process.env.HOST || '0.0.0.0';
  
  log(`  Creating Express app...`);
  const app = express();
  
  log(`  Configuring basic middleware...`);
  app.use(express.json());
  
  // ============================================
  // MONTER LES ROUTES IMPORTÉES AVEC SUCCÈS
  // ============================================
  
  log(`\n🔗 Montage des ${loadedRoutes.length} routes chargées...`);
  
  for (const { name, router } of loadedRoutes) {
    try {
      const routePath = `/api/${name}`;
      app.use(routePath, router);
      log(`  ✅ Monté: ${routePath}`);
    } catch (error) {
      log(`  ❌ Échec montage route ${name}:`, error);
    }
  }
  
  log(`  Adding health endpoint...`);
  app.get('/health', (req: any, res: any) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      message: 'Server is running'
    });
  });
  
  app.get('/', (req: any, res: any) => {
    res.json({
      service: 'Transit Guinée API',
      status: 'running',
      version: '2.2.0',
      timestamp: new Date().toISOString()
    });
  });
  
  // API health endpoint
  app.get('/api/health', (req: any, res: any) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      message: 'API is running'
    });
  });
  
  // Route pour visualiser les logs de debug (HTML)
  app.get('/debug-logs', (req: any, res: any) => {
    try {
      const logContent = fs.readFileSync(LOG_FILE, 'utf8');
      
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Debug Logs - Transit Guinée</title>
  <style>
    body { font-family: 'Courier New', monospace; background: #1e1e1e; color: #d4d4d4; margin: 0; padding: 20px; line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; background: #252526; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    h1 { color: #4ec9b0; margin-top: 0; border-bottom: 2px solid #4ec9b0; padding-bottom: 10px; }
    .info { background: #264f78; padding: 15px; border-radius: 4px; margin-bottom: 20px; border-left: 4px solid #4ec9b0; }
    pre { background: #1e1e1e; padding: 15px; border-radius: 4px; overflow-x: auto; border: 1px solid #3e3e42; white-space: pre-wrap; word-wrap: break-word; }
    .success { color: #4ec9b0; }
    .error { color: #f48771; font-weight: bold; }
    .warning { color: #dcdcaa; }
    .refresh-btn { background: #0e639c; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; margin-bottom: 20px; }
    .refresh-btn:hover { background: #1177bb; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Debug Logs - Transit Guinée</h1>
    <div class="info">
      <strong>Fichier:</strong> ${LOG_FILE}<br>
      <strong>Généré:</strong> ${new Date().toISOString()}<br>
      <strong>Taille:</strong> ${(logContent.length / 1024).toFixed(2)} KB<br>
      <strong>Lignes:</strong> ${logContent.split('\n').length}
    </div>
    <button class="refresh-btn" onclick="location.reload()">Actualiser</button>
    <pre>${logContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  </div>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to read log file',
        message: error instanceof Error ? error.message : String(error),
        logPath: LOG_FILE
      });
    }
  });
  
  // Route pour raw logs (texte brut)
  app.get('/debug-logs/raw', (req: any, res: any) => {
    try {
      const logContent = fs.readFileSync(LOG_FILE, 'utf8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(logContent);
    } catch (error) {
      res.status(500).send('Log file not found or unreadable');
    }
  });
  
  // Route pour télécharger les logs
  app.get('/debug-logs/download', (req: any, res: any) => {
    try {
      res.download(LOG_FILE, 'startup-debug.log');
    } catch (error) {
      res.status(500).send('Log file not found');
    }
  });
  
  log(`  Creating HTTP server...`);
  const server = http.createServer(app);
  
  log(`  Listening on ${HOST}:${PORT}...`);
  
  server.on('error', (error: any) => {
    log(`  ❌ Server error on startup`, error);
    
    if (error.code === 'EADDRINUSE') {
      log(`  Port ${PORT} already in use`);
    } else if (error.code === 'EACCES') {
      log(`  Permission denied for port ${PORT}`);
    }
    
    process.exit(1);
  });
  
  server.listen(PORT, HOST, () => {
    log('\n========================================');
    log('✅ SERVER STARTED SUCCESSFULLY');
    log('========================================');
    log(`🌍 Environment: ${process.env.NODE_ENV}`);
    log(`📡 Listening on: ${HOST}:${PORT}`);
    log(`🏥 Health check: http://${HOST}:${PORT}/health`);
    log(`📝 Logs saved to: ${LOG_FILE}`);
    log('========================================\n');
  });
  
} catch (error) {
  log('\n❌ FATAL ERROR creating HTTP server', error);
  process.exit(1);
}

} // Fin de la fonction main()

// ============================================
// HANDLERS ERREURS GLOBALES
// ============================================

process.on('uncaughtException', (error) => {
  log('❌ UNCAUGHT EXCEPTION', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('❌ UNHANDLED REJECTION', { reason, promise });
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('🛑 SIGTERM received - shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('🛑 SIGINT received - shutting down gracefully');
  process.exit(0);
});

// ============================================
// LANCEMENT
// ============================================

log('\n✅ Debug startup script loaded successfully');
log('Starting initialization...\n');

main().catch((error) => {
  log('❌ FATAL ERROR in main()', error);
  process.exit(1);
});
