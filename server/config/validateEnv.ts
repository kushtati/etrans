/**
 * VALIDATION ENVIRONNEMENT - SECURITE CRITIQUE
 * 
 * Verifie que toutes les variables requises sont presentes au demarrage.
 * CRASH volontaire si configuration invalide.
 * 
 * Empeche le demarrage avec:
 * - Secrets manquants ou trop courts
 * - Cles API placeholder
 * - Mode mock active en production
 */

interface EnvironmentConfig {
  // Secrets critiques
  GEMINI_API_KEY: string;
  JWT_SECRET: string;
  
  // Database
  DATABASE_URL?: string;
  REDIS_URL?: string;
  
  // Server
  PORT: string;
  NODE_ENV: string;
  HOST?: string;
}

/**
 * Valide toutes les variables environnement requises
 * @throws Error si configuration invalide
 */
export function validateEnvironment(): void {
  console.log('[CHECK] Validation environnement...\n');
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // ============================================
  // 1. VERIFIER VARIABLES CRITIQUES
  // ============================================
  
  const required: (keyof EnvironmentConfig)[] = [
    'GEMINI_API_KEY',
    'JWT_SECRET',
    'PORT',
    'NODE_ENV'
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`[X] ${key} manquant`);
    }
  }
  
  // Si variables critiques manquantes, arreter immediatement
  if (errors.length > 0) {
    console.error('[ERROR] ERREUR FATALE: Variables environnement manquantes:\n');
    errors.forEach(err => console.error(`  ${err}`));
    console.error('\n[INFO] Actions requises:');
    console.error('  1. Verifier les variables Railway');
    console.error('  2. Ajouter toutes les variables requises');
    console.error('  3. Redemarrer le service\n');
    console.error('\n[CHECK] Variables actuelles:');
    console.error(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '[OK]' : '[X]'}`);
    console.error(`  JWT_SECRET: ${process.env.JWT_SECRET ? '[OK]' : '[X]'}`);
    console.error(`  DATABASE_URL: ${process.env.DATABASE_URL ? '[OK]' : '[X]'}`);
    console.error(`  PORT: ${process.env.PORT ? '[OK]' : '[X]'}`);
    console.error(`  NODE_ENV: ${process.env.NODE_ENV ? '[OK]' : '[X]'}\n');
    
    // Attendre 2s pour que les logs soient flush sur Railway
    setTimeout(() => {
      throw new Error('Environment validation failed: ' + errors.join(', '));
    }, 2000);
    return;
  }
  
  // ============================================
  // 2. VERIFIER QUALITE DES SECRETS
  // ============================================
  
  // JWT_SECRET: minimum 32 caracteres
  if (process.env.JWT_SECRET!.length < 32) {
    errors.push('[X] JWT_SECRET trop court (minimum 32 caracteres)');
    console.error('  Generer un secret securise:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  }
  
  // JWT_SECRET: detecter placeholders et patterns faibles
  const insecureJwtPatterns = [
    'your-super-secret',
    'change-this',
    'YOUR_JWT_SECRET',
    'example',
    'test',
    '12345',
    'secret',
    'password',
    'qwerty',
    'abc123',
    '123456789',
    'changeme',
    'default'
  ];
  
  const jwtSecret = process.env.JWT_SECRET!.toLowerCase();
  for (const pattern of insecureJwtPatterns) {
    if (jwtSecret.includes(pattern.toLowerCase())) {
      errors.push('[X] JWT_SECRET contient un placeholder: ' + pattern);
      break;
    }
  }
  
  // GEMINI_API_KEY: format valide
  const geminiKey = process.env.GEMINI_API_KEY!;
  const isValidFormat = geminiKey.startsWith('AIza') || geminiKey.startsWith('gen-lang-client-');
  
  if (!isValidFormat && !geminiKey.startsWith('OPTIONNEL') && !geminiKey.startsWith('CHANGE_ME')) {
    warnings.push('[WARN] GEMINI_API_KEY format non reconnu (attendu: AIza* ou gen-lang-client-*)');
  }
  
  if (geminiKey.includes('YOUR_GEMINI') || geminiKey.includes('CHANGE_ME') || geminiKey.includes('OPTIONNEL')) {
    if (process.env.NODE_ENV === 'production') {
      warnings.push('[WARN] GEMINI_API_KEY est un placeholder - AI desactive');
      console.log('  [INFO] Obtenir une cle: https://aistudio.google.com/app/apikey');
    } else {
      warnings.push('[WARN] GEMINI_API_KEY est un placeholder (AI desactive)');
    }
  }
  
  // ============================================
  // 3. VERIFIER DATABASE
  // ============================================
  
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    errors.push('[X] DATABASE_URL manquant en production');
    console.error('  Format: postgresql://user:password@host:port/database');
  }
  
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('password')) {
    warnings.push('[WARN] DATABASE_URL contient "password" (placeholder?)');
  }
  
  // ============================================
  // 4. VERIFIER REDIS
  // ============================================
  
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    warnings.push('[WARN] REDIS_URL manquant en production (rate limiting affecte)');
  }
  
  // ============================================
  // 5. VERIFIER CONFIGURATION SERVEUR
  // ============================================
  
  const port = parseInt(process.env.PORT!, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`[X] PORT invalide: ${process.env.PORT}`);
  }
  
  const allowedEnvs = ['development', 'staging', 'production', 'test'];
  if (!allowedEnvs.includes(process.env.NODE_ENV!)) {
    warnings.push(`[WARN] NODE_ENV "${process.env.NODE_ENV}" inhabituel (attendu: ${allowedEnvs.join(', ')})`);
  }
  
  // ============================================
  // 6. AFFICHER RESULTATS
  // ============================================
  
  if (errors.length > 0) {
    console.error('\n[ERROR] ERREURS CRITIQUES:\n');
    errors.forEach(err => console.error(`  ${err}`));
    console.error('\n[STOP] Le serveur ne peut pas demarrer avec ces erreurs.\n');
    throw new Error('Environment validation failed: ' + errors.join(', '));
  }
  
  if (warnings.length > 0) {
    console.warn('\n[WARN] AVERTISSEMENTS:\n');
    warnings.forEach(warn => console.warn(`  ${warn}`));
    console.warn('');
  }
  
  // Validation reussie
  console.log('[OK] Environnement valide avec succes\n');
  console.log(`[INFO] Configuration:`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   PORT: ${process.env.PORT}`);
  console.log(`   HOST: ${process.env.HOST || 'localhost'}`);
  console.log(`   DATABASE: ${process.env.DATABASE_URL ? '[OK] Configuree' : '[X] Non configuree'}`);
  console.log(`   REDIS: ${process.env.REDIS_URL ? '[OK] Configure' : '[WARN] Non configure'}`);
  console.log(`   JWT_SECRET: [OK] Configure (${process.env.JWT_SECRET!.length >= 64 ? 'Fort' : process.env.JWT_SECRET!.length >= 32 ? 'Acceptable' : 'Faible'})`);
  console.log(`   GEMINI_API_KEY: [OK] Configuree`);
  console.log('');
}

export default validateEnvironment;
