/**
 * SCRIPT DE MIGRATION PERMISSIONS
 * 
 * Analyse le code et trouve tous les checks permissions inline à migrer
 * Usage : node scripts/find-inline-permissions.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Patterns à rechercher
const PATTERNS = [
  /role\s*===\s*Role\./g,
  /role\s*!==\s*Role\./g,
  /role\s*===\s*['"]ACCOUNTANT['"]/g,
  /role\s*===\s*['"]DIRECTOR['"]/g,
  /role\s*===\s*['"]CLIENT['"]/g,
  /role\s*!==\s*Role\.CLIENT/g,
];

const IGNORE_DIRS = ['node_modules', 'dist', 'build', '.git', 'server'];
const TARGET_EXTENSIONS = ['.tsx', '.ts'];

function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  if (!TARGET_EXTENSIONS.includes(ext)) return false;

  const parts = filePath.split(path.sep);
  return !parts.some(part => IGNORE_DIRS.includes(part));
}

function findInlinePermissions(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches = [];

  lines.forEach((line, index) => {
    PATTERNS.forEach(pattern => {
      if (pattern.test(line)) {
        matches.push({
          line: index + 1,
          content: line.trim(),
          filePath,
        });
      }
    });
  });

  return matches;
}

function scanDirectory(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !IGNORE_DIRS.includes(entry.name)) {
      results.push(...scanDirectory(fullPath));
    } else if (entry.isFile() && shouldProcessFile(fullPath)) {
      const matches = findInlinePermissions(fullPath);
      if (matches.length > 0) {
        results.push(...matches);
      }
    }
  }

  return results;
}

function generateReport(matches) {
  console.log(`\n${COLORS.cyan}╔════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║   🔍 RAPPORT MIGRATION PERMISSIONS                        ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);

  if (matches.length === 0) {
    console.log(`${COLORS.green}✅ Aucun check permission inline trouvé - Migration complète !${COLORS.reset}\n`);
    return;
  }

  console.log(`${COLORS.yellow}⚠️  Trouvé ${matches.length} check(s) permission inline à migrer${COLORS.reset}\n`);

  // Grouper par fichier
  const byFile = {};
  matches.forEach(match => {
    if (!byFile[match.filePath]) {
      byFile[match.filePath] = [];
    }
    byFile[match.filePath].push(match);
  });

  // Afficher par fichier
  Object.entries(byFile).forEach(([filePath, fileMatches]) => {
    const relativePath = path.relative(process.cwd(), filePath);
    console.log(`${COLORS.magenta}📄 ${relativePath}${COLORS.reset}`);
    
    fileMatches.forEach(match => {
      console.log(`   ${COLORS.blue}Ligne ${match.line}:${COLORS.reset} ${COLORS.yellow}${match.content}${COLORS.reset}`);
    });
    
    console.log('');
  });

  // Statistiques
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}📊 STATISTIQUES${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════${COLORS.reset}\n`);
  console.log(`   Total fichiers affectés : ${COLORS.yellow}${Object.keys(byFile).length}${COLORS.reset}`);
  console.log(`   Total lignes à migrer   : ${COLORS.yellow}${matches.length}${COLORS.reset}\n`);

  // Instructions
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}📝 PROCHAINES ÉTAPES${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════${COLORS.reset}\n`);
  
  console.log(`${COLORS.green}1. Importer le hook :${COLORS.reset}`);
  console.log(`   ${COLORS.blue}import { usePermissions } from '../hooks/usePermissions';${COLORS.reset}\n`);
  
  console.log(`${COLORS.green}2. Remplacer les checks inline :${COLORS.reset}`);
  console.log(`   ${COLORS.red}❌ const canViewFinance = role === Role.ACCOUNTANT || role === Role.DIRECTOR;${COLORS.reset}`);
  console.log(`   ${COLORS.green}✅ const { canViewFinance } = usePermissions();${COLORS.reset}\n`);
  
  console.log(`${COLORS.green}3. Consulter le guide :${COLORS.reset}`);
  console.log(`   ${COLORS.blue}docs/MIGRATION_PERMISSIONS.md${COLORS.reset}\n`);

  // Fichiers prioritaires
  const priorityFiles = Object.keys(byFile).filter(f => 
    f.includes('ShipmentDetailContainer') || 
    f.includes('Dashboard') || 
    f.includes('FinanceView')
  );

  if (priorityFiles.length > 0) {
    console.log(`${COLORS.red}⚠️  PRIORITÉ HAUTE (Sécurité critique) :${COLORS.reset}`);
    priorityFiles.forEach(file => {
      const relativePath = path.relative(process.cwd(), file);
      console.log(`   ${COLORS.red}•${COLORS.reset} ${relativePath}`);
    });
    console.log('');
  }
}

// Exécution
function main() {
  const componentsDir = path.join(process.cwd(), 'components');
  
  if (!fs.existsSync(componentsDir)) {
    console.error(`${COLORS.red}Erreur : Dossier components/ non trouvé${COLORS.reset}`);
    process.exit(1);
  }

  console.log(`${COLORS.cyan}🔍 Analyse du dossier components/...${COLORS.reset}`);
  
  const matches = scanDirectory(componentsDir);
  generateReport(matches);
}

main();
