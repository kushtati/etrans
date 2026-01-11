#!/usr/bin/env node

/**
 * 🔍 SCRIPT DE VÉRIFICATION SÉCURITÉ
 * 
 * Vérifie qu'aucune donnée sensible n'est stockée dans sessionStorage/localStorage
 */

const fs = require('fs');
const path = require('path');

const SECURITY_VIOLATIONS = {
  // ❌ Patterns interdits
  FORBIDDEN: [
    /sessionStorage\.setItem\(['"](?:currentUserRole|auth_token|authToken)/gi,
    /localStorage\.setItem\(['"](?:currentUserRole|auth_token|authToken)/gi,
    /sessionStorage\.getItem\(['"]currentUserRole['"]/gi,
    /localStorage\.getItem\(['"]currentUserRole['"]/gi,
  ],
  
  // ⚠️ Patterns suspects
  SUSPICIOUS: [
    /setRole\([^)]*\)/gi, // Modification directe du rôle
    /role\s*=\s*['"](?:DG|Admin|Comptable)/gi, // Rôle hardcodé
  ]
};

const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', '.git', 'docs'];
const INCLUDE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

let violations = [];
let warnings = [];

/**
 * Scan récursif des fichiers
 */
function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Ignorer dossiers exclus
      if (!EXCLUDE_DIRS.includes(file)) {
        scanDirectory(fullPath);
      }
    } else {
      // Vérifier extensions
      const ext = path.extname(file);
      if (INCLUDE_EXTENSIONS.includes(ext)) {
        scanFile(fullPath);
      }
    }
  }
}

/**
 * Scan fichier individuel
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    // Ignorer commentaires
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      return;
    }
    
    // Vérifier violations critiques
    SECURITY_VIOLATIONS.FORBIDDEN.forEach((pattern) => {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: lineNumber,
          code: line.trim(),
          type: 'CRITICAL'
        });
      }
    });
    
    // Vérifier patterns suspects
    SECURITY_VIOLATIONS.SUSPICIOUS.forEach((pattern) => {
      if (pattern.test(line)) {
        warnings.push({
          file: filePath,
          line: lineNumber,
          code: line.trim(),
          type: 'WARNING'
        });
      }
    });
  });
}

/**
 * Affichage résultats
 */
function displayResults() {
  console.log('\n🔍 AUDIT SÉCURITÉ - GESTION DES RÔLES\n');
  console.log('='.repeat(80));
  
  if (violations.length === 0 && warnings.length === 0) {
    console.log('✅ Aucune violation détectée');
    console.log('✅ Le système est sécurisé');
    console.log('\n📋 Vérifications effectuées:');
    console.log('  - sessionStorage.setItem() pour tokens/rôles: ❌ Non trouvé');
    console.log('  - localStorage.setItem() pour tokens/rôles: ❌ Non trouvé');
    console.log('  - sessionStorage.getItem("currentUserRole"): ❌ Non trouvé');
    console.log('  - Rôles hardcodés: ✅ Pas de violations critiques');
    return true;
  }
  
  // Violations critiques
  if (violations.length > 0) {
    console.log(`\n🚨 ${violations.length} VIOLATION(S) CRITIQUE(S) DÉTECTÉE(S)\n`);
    
    violations.forEach((v, i) => {
      console.log(`❌ Violation ${i + 1}:`);
      console.log(`   Fichier: ${v.file}`);
      console.log(`   Ligne ${v.line}: ${v.code}`);
      console.log('   → Risque: Manipulation client-side du rôle/token');
      console.log('');
    });
  }
  
  // Warnings
  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} AVERTISSEMENT(S)\n`);
    
    warnings.forEach((w, i) => {
      console.log(`⚠️  Warning ${i + 1}:`);
      console.log(`   Fichier: ${w.file}`);
      console.log(`   Ligne ${w.line}: ${w.code}`);
      console.log('   → À vérifier: Pattern suspect détecté');
      console.log('');
    });
  }
  
  console.log('='.repeat(80));
  
  return violations.length === 0;
}

/**
 * Vérifications supplémentaires
 */
function checkBackendEndpoints() {
  console.log('\n🔍 Vérification endpoints backend...\n');
  
  const authRoutePath = path.join(__dirname, '..', 'server', 'routes', 'auth.ts');
  
  if (!fs.existsSync(authRoutePath)) {
    console.log('⚠️  Fichier server/routes/auth.ts non trouvé');
    return false;
  }
  
  const content = fs.readFileSync(authRoutePath, 'utf-8');
  
  const checks = [
    {
      name: 'Endpoint /api/auth/me',
      pattern: /router\.get\(['"]\/me['"]/,
      required: true
    },
    {
      name: 'Middleware authenticateJWT',
      pattern: /function authenticateJWT/,
      required: true
    },
    {
      name: 'Cookie httpOnly',
      pattern: /httpOnly:\s*true/,
      required: true
    },
    {
      name: 'JWT.verify()',
      pattern: /jwt\.verify\(/,
      required: true
    }
  ];
  
  let allPassed = true;
  
  checks.forEach((check) => {
    const passed = check.pattern.test(content);
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${check.name}: ${passed ? 'OK' : 'MANQUANT'}`);
    
    if (check.required && !passed) {
      allPassed = false;
    }
  });
  
  return allPassed;
}

/**
 * Main
 */
function main() {
  console.log('🚀 Démarrage audit sécurité...\n');
  
  // Remonter d'un niveau depuis scripts/
  const rootDir = path.join(__dirname, '..');
  
  console.log(`📁 Scan du répertoire: ${rootDir}`);
  console.log(`📄 Extensions: ${INCLUDE_EXTENSIONS.join(', ')}`);
  console.log(`🚫 Exclusions: ${EXCLUDE_DIRS.join(', ')}\n`);
  
  scanDirectory(rootDir);
  
  const codeSecure = displayResults();
  const backendSecure = checkBackendEndpoints();
  
  if (codeSecure && backendSecure) {
    console.log('\n✅ AUDIT RÉUSSI - Système sécurisé\n');
    process.exit(0);
  } else {
    console.log('\n❌ AUDIT ÉCHOUÉ - Corrections nécessaires\n');
    process.exit(1);
  }
}

main();
