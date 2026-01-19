/**
 * 🔐 VALIDATION ENVIRONNEMENT AVEC ZOD
 * Standard moderne et type-safe
 */
import { z } from 'zod';

// ============================================
// SCHÉMA DE VALIDATION
// ============================================

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Server
  PORT: z.string().regex(/^\d+$/, 'PORT must be a number').transform(Number).default('8080'),
  HOST: z.string().default('0.0.0.0'),
  
  // Database (PostgreSQL)
  DATABASE_URL: z.string()
    .url('DATABASE_URL must be a valid URL')
    .startsWith('postgresql://', 'DATABASE_URL must start with postgresql://'),
  
  // JWT Secret
  JWT_SECRET: z.string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine(
      (val) => {
        // Vérifier entropie minimale
        const uniqueChars = new Set(val).size;
        return uniqueChars >= 10;
      },
      'JWT_SECRET has insufficient entropy (too repetitive)'
    ),
  
  // Redis
  REDIS_URL: z.string()
    .url('REDIS_URL must be a valid URL')
    .optional(),
  
  // Gemini AI (optionnel)
  GEMINI_API_KEY: z.string()
    .min(20, 'GEMINI_API_KEY too short')
    .optional(),
  
  // CORS Origins (séparés par virgule)
  ALLOWED_ORIGINS: z.string()
    .transform((val) => val.split(',').map(s => s.trim()))
    .optional(),
});

// ============================================
// TYPE INFÉRÉ DEPUIS ZOD
// ============================================
export type Env = z.infer<typeof envSchema>;

// ============================================
// VALIDATION FUNCTION
// ============================================

export function validateEnvironment(): Env {
  console.log('[ENV] Validating environment variables...');
  
  try {
    const parsed = envSchema.parse(process.env);
    
    console.log('[ENV] ✅ Validation successful');
    console.log(`[ENV]    - NODE_ENV: ${parsed.NODE_ENV}`);
    console.log(`[ENV]    - PORT: ${parsed.PORT}`);
    console.log(`[ENV]    - DATABASE_URL: ${parsed.DATABASE_URL.substring(0, 30)}...`);
    console.log(`[ENV]    - JWT_SECRET: ${parsed.JWT_SECRET.substring(0, 10)}... (${parsed.JWT_SECRET.length} chars)`);
    console.log(`[ENV]    - REDIS_URL: ${parsed.REDIS_URL ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`[ENV]    - GEMINI_API_KEY: ${parsed.GEMINI_API_KEY ? '✅ SET' : '⚪ NOT SET (optional)'}`);
    
    // Warnings pour patterns faibles
    const weakPatterns = ['test', 'dev', 'secret', 'password', '123', 'abc'];
    if (weakPatterns.some(p => parsed.JWT_SECRET.toLowerCase().includes(p))) {
      console.warn('[ENV] ⚠️  JWT_SECRET contains weak pattern - consider regenerating');
    }
    
    return parsed;
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('\n❌ ENVIRONMENT VALIDATION FAILED\n');
      
      error.errors.forEach((err) => {
        console.error(`   ${err.path.join('.')}: ${err.message}`);
      });
      
      console.error('\n💡 Fix instructions:');
      console.error('   1. Check your .env.server file');
      console.error('   2. Generate JWT_SECRET: openssl rand -base64 32');
      console.error('   3. Set DATABASE_URL to your PostgreSQL connection string');
      console.error('   4. Set REDIS_URL to your Redis connection string\n');
      
      process.exit(1);
    }
    
    throw error;
  }
}

// ============================================
// HELPER : Get Typed Env
// ============================================

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnvironment();
  }
  return cachedEnv;
}
