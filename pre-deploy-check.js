#!/usr/bin/env node

/**
 * Script de vérification avant déploiement
 * Usage: node pre-deploy-check.js
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let hasErrors = false;
let hasWarnings = false;

const log = {
  error: (msg) => { console.error('❌', msg); hasErrors = true; },
  warn: (msg) => { console.warn('⚠️ ', msg); hasWarnings = true; },
  success: (msg) => console.log('✅', msg),
  info: (msg) => console.log('ℹ️ ', msg)
};

log.info('🔍 Vérification avant déploiement...\n');

// ============================================
// 1. FICHIERS REQUIS
// ============================================
log.info('📁 Vérification des fichiers requis...');

const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'tsconfig.server.json',
  'vite.config.ts',
  'server/index.ts',
  'prisma/schema.prisma',
  '.gitignore',
  'railway.toml',
  'Procfile',
  'DEPLOYMENT_GUIDE_PROD.md'
];

requiredFiles.forEach(file => {
  if (existsSync(join(__dirname, file))) {
    log.success(`${file}`);
  } else {
    log.error(`Fichier manquant: ${file}`);
  }
});

// ============================================
// 2. PACKAGE.JSON
// ============================================
log.info('\n📦 Vérification package.json...');

try {
  const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
  
  const requiredScripts = ['build', 'build:server', 'build:all', 'start:prod'];
  requiredScripts.forEach(script => {
    if (pkg.scripts[script]) {
      log.success(`Script "${script}" présent`);
    } else {
      log.error(`Script manquant: "${script}"`);
    }
  });
  
  // Vérifier dépendances critiques
  const criticalDeps = ['express', 'prisma', '@prisma/client', 'ioredis'];
  criticalDeps.forEach(dep => {
    if (pkg.dependencies[dep] || pkg.devDependencies[dep]) {
      log.success(`Dépendance "${dep}" présente`);
    } else {
      log.error(`Dépendance manquante: "${dep}"`);
    }
  });
  
} catch (error) {
  log.error('Impossible de lire package.json');
}

// ============================================
// 3. CONFIGURATION SERVEUR
// ============================================
log.info('\n🔧 Vérification configuration serveur...');

try {
  const serverCode = readFileSync(join(__dirname, 'server/index.ts'), 'utf8');
  
  // Vérifier HOST = 0.0.0.0 en production
  if (serverCode.includes("NODE_ENV === 'production'") && serverCode.includes("'0.0.0.0'")) {
    log.success('HOST configuré pour production (0.0.0.0)');
  } else {
    log.warn('HOST devrait être 0.0.0.0 en production');
  }
  
  // Vérifier CORS
  if (serverCode.includes('allowedOrigins') && serverCode.includes('.up.railway.app')) {
    log.success('CORS configuré avec Railway domains');
  } else {
    log.warn('Vérifier configuration CORS pour Railway/Vercel');
  }
  
  // Vérifier Prisma
  if (serverCode.includes('prisma')) {
    log.success('Prisma importé');
  } else {
    log.warn('Prisma non détecté dans server/index.ts');
  }
  
} catch (error) {
  log.error('Impossible de lire server/index.ts');
}

// ============================================
// 4. ENVIRONNEMENT
// ============================================
log.info('\n🔐 Vérification environnement...');

if (existsSync(join(__dirname, '.env.example'))) {
  log.success('.env.example présent (template)');
} else {
  log.warn('.env.example manquant (recommandé pour documentation)');
}

if (existsSync(join(__dirname, '.env.server'))) {
  log.warn('.env.server détecté (ne pas committer en production)');
  
  // Vérifier qu'il est dans .gitignore
  const gitignore = readFileSync(join(__dirname, '.gitignore'), 'utf8');
  if (gitignore.includes('.env.server')) {
    log.success('.env.server dans .gitignore');
  } else {
    log.error('.env.server DOIT être dans .gitignore !');
  }
}

// ============================================
// 5. BASE DE DONNÉES
// ============================================
log.info('\n💾 Vérification base de données...');

try {
  const schema = readFileSync(join(__dirname, 'prisma/schema.prisma'), 'utf8');
  
  if (schema.includes('provider = "postgresql"')) {
    log.success('PostgreSQL configuré');
  } else {
    log.warn('Base de données non PostgreSQL (vérifier compatibilité)');
  }
  
  if (schema.includes('model User') && schema.includes('model Shipment')) {
    log.success('Modèles principaux présents (User, Shipment)');
  } else {
    log.warn('Vérifier les modèles Prisma');
  }
  
} catch (error) {
  log.error('Impossible de lire prisma/schema.prisma');
}

// ============================================
// 6. BUILD TEST
// ============================================
log.info('\n🏗️  Suggestion: Tester le build avant déploiement');
log.info('   Commande: npm run build:all');
log.info('   Vérifier que dist/server/index.js est créé');

// ============================================
// 7. SÉCURITÉ
// ============================================
log.info('\n🛡️  Checklist sécurité production:');

const securityChecklist = [
  'JWT_SECRET différent du développement (64+ caractères)',
  'NODE_ENV=production dans Railway/Render',
  'CORS configuré avec origines exactes',
  'Rate limiting activé (express-rate-limit)',
  'Helmet activé (headers sécurité)',
  'Cookies httpOnly + secure en production',
  '.env* dans .gitignore'
];

securityChecklist.forEach(item => {
  log.info(`   □ ${item}`);
});

// ============================================
// RÉSUMÉ
// ============================================
console.log('\n' + '='.repeat(60));

if (hasErrors) {
  console.log('❌ ERREURS DÉTECTÉES - Corriger avant déploiement');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  AVERTISSEMENTS - Vérifier avant déploiement');
  console.log('✅ Aucune erreur bloquante');
} else {
  console.log('✅ PRÊT POUR LE DÉPLOIEMENT !');
  console.log('\n📚 Lire: DEPLOYMENT_GUIDE_PROD.md');
  console.log('🚀 Déployer sur: Railway.app ou Render.com');
}

console.log('='.repeat(60) + '\n');
