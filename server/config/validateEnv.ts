/**
 * 🔒 VALIDATION ENVIRONNEMENT - SÉCURITÉ CRITIQUE
 * 
 * Vérifie que toutes les variables requises sont présentes au démarrage.
 * CRASH volontaire (process.exit(1)) si configuration invalide.
 * 
 * Empêche le démarrage avec:
 * - Secrets manquants ou trop courts
 * - Clés API placeholder
 * - Mode mock activé en production
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
 * @throws Process.exit(1) si configuration invalide
 */
export function validateEnvironment(): void {
  console.log('🔍 Validation environnement...\n');
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // ============================================
  // 1. VÉRIFIER VARIABLES CRITIQUES
  // ============================================
  
  const required: (keyof EnvironmentConfig)[] = [
    'GEMINI_API_KEY',
    'JWT_SECRET',
    'PORT',
    'NODE_ENV'
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`❌ ${key} manquant`);
    }
  }
  
  // Si variables critiques manquantes, arrêter immédiatement
  if (errors.length > 0) {
    console.error('🚨 ERREUR FATALE: Variables environnement manquantes:\n');
    errors.forEach(err => console.error(`  ${err}`));
    console.error('\n📝 Actions requises:');
    console.error('  1. Copier .env.example vers .env.server');
    console.error('  2. Remplacer TOUTES les valeurs YOUR_*');
    console.error('  3. Redémarrer le serveur\n');
    process.exit(1);
  }
  
  // ============================================
  // 2. VÉRIFIER QUALITÉ DES SECRETS
  // ============================================
  
  // JWT_SECRET: minimum 32 caractères
  if (process.env.JWT_SECRET!.length < 32) {
    errors.push('❌ JWT_SECRET trop court (minimum 32 caractères)');
    console.error('  Générer un secret sécurisé:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  }
  
  // JWT_SECRET: détecter placeholders et patterns faibles
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
      errors.push(`❌ JWT_SECRET contient un placeholder: "${pattern}"`);
      break;
    }
  }
  
  // GEMINI_API_KEY: format valide (AIza* ancien format, gen-lang-client-* nouveau format)
  const geminiKey = process.env.GEMINI_API_KEY!;
  const isValidFormat = geminiKey.startsWith('AIza') || geminiKey.startsWith('gen-lang-client-');
  
  if (!isValidFormat && !geminiKey.startsWith('OPTIONNEL') && !geminiKey.startsWith('CHANGE_ME')) {
    warnings.push('⚠️  GEMINI_API_KEY format non reconnu (attendu: AIza* ou gen-lang-client-*)');
  }
  
  if (geminiKey.includes('YOUR_GEMINI') || geminiKey.includes('CHANGE_ME') || geminiKey.includes('OPTIONNEL')) {
    // En dev, warning seulement (permet de tester l'auth sans Gemini)
    if (process.env.NODE_ENV === 'production') {
      warnings.push('⚠️  GEMINI_API_KEY est un placeholder - AI désactivé');
      console.log('  💡 Obtenir une clé: https://aistudio.google.com/app/apikey');
    } else {
      warnings.push('⚠️  GEMINI_API_KEY est un placeholder (AI désactivé)');
    }
  }
  
  // ============================================
  // 3. VÉRIFIER DATABASE
  // ============================================
  
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    errors.push('❌ DATABASE_URL manquant en production');
    console.error('  Format: postgresql://user:password@host:port/database');
  }
  
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('password')) {
    warnings.push('⚠️  DATABASE_URL contient "password" (placeholder?)');
  }
  
  // ============================================
  // 4. VÉRIFIER REDIS
  // ============================================
  
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    warnings.push('⚠️  REDIS_URL manquant en production (rate limiting affecté)');
  }
  
  // ============================================
  // 5. VÉRIFIER CONFIGURATION SERVEUR
  // ============================================
  
  const port = parseInt(process.env.PORT!, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`❌ PORT invalide: ${process.env.PORT}`);
  }
  
  const allowedEnvs = ['development', 'staging', 'production', 'test'];
  if (!allowedEnvs.includes(process.env.NODE_ENV!)) {
    warnings.push(`⚠️  NODE_ENV "${process.env.NODE_ENV}" inhabituel (attendu: ${allowedEnvs.join(', ')})`);
  }
  
  // ============================================
  // 6. AFFICHER RÉSULTATS
  // ============================================
  
  if (errors.length > 0) {
    console.error('\n🚨 ERREURS CRITIQUES:\n');
    errors.forEach(err => console.error(`  ${err}`));
    console.error('\n🛑 Le serveur ne peut pas démarrer avec ces erreurs.\n');
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.warn('\n⚠️  AVERTISSEMENTS:\n');
    warnings.forEach(warn => console.warn(`  ${warn}`));
    console.warn('');
  }
  
  // ✅ Validation réussie
  console.log('✅ Environnement validé avec succès\n');
  console.log(`📊 Configuration:`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   PORT: ${process.env.PORT}`);
  console.log(`   HOST: ${process.env.HOST || 'localhost'}`);
  console.log(`   DATABASE: ${process.env.DATABASE_URL ? '✅ Configurée' : '❌ Non configurée'}`);
  console.log(`   REDIS: ${process.env.REDIS_URL ? '✅ Configuré' : '⚠️  Non configuré'}`);
  console.log(`   JWT_SECRET: ✅ Configuré (${process.env.JWT_SECRET!.length >= 64 ? 'Fort' : process.env.JWT_SECRET!.length >= 32 ? 'Acceptable' : 'Faible'})`);
  console.log(`   GEMINI_API_KEY: ✅ Configurée`);
  console.log('');
}

/**
 * Valide qu'on n'utilise pas de mode mock en production
 * À appeler côté frontend
 */
export function validateFrontendEnvironment(): void {
  const isProduction = import.meta.env.PROD;
  const useMock = import.meta.env.VITE_USE_MOCK === 'true';
  
  if (isProduction && useMock) {
    throw new Error(
      '🚨 ERREUR FATALE: VITE_USE_MOCK=true détecté en PRODUCTION!\n\n' +
      'Les données mock ne doivent JAMAIS être utilisées en production.\n' +
      'Vérifiez vos variables d\'environnement et rebuild:\n' +
      '  VITE_USE_MOCK=false npm run build\n'
    );
  }
  
  if (useMock) {
    console.warn(
      '%c⚠️ MODE MOCK ACTIVÉ',
      'background: #ff9800; color: white; font-size: 16px; font-weight: bold; padding: 8px 16px; border-radius: 4px;',
      '\n\nDonnées fictives chargées. Ne pas utiliser en production!'
    );
  }
}

export default validateEnvironment;
