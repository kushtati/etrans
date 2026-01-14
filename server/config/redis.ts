/**
 * CONFIGURATION REDIS - CORRIGÉE
 * 
 * Fix : Gestion complète des erreurs Redis pour éviter crash serveur
 */

import Redis from 'ioredis';

// ============================================
// IN-MEMORY FALLBACK
// ============================================

class InMemoryStore {
  private store: Map<string, { value: string; expiry?: number }> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Nettoyage automatique toutes les minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, data] of this.store.entries()) {
      if (data.expiry && now > data.expiry) {
        this.store.delete(key);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const data = this.store.get(key);
    if (!data) return null;
    
    // Vérifier expiration
    if (data.expiry && Date.now() > data.expiry) {
      this.store.delete(key);
      return null;
    }
    
    return data.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const expiry = ttl ? Date.now() + (ttl * 1000) : undefined;
    this.store.set(key, { value, expiry });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (parseInt(current || '0') + 1).toString();
    await this.set(key, newValue);
    return parseInt(newValue);
  }

  async expire(key: string, seconds: number): Promise<void> {
    const data = this.store.get(key);
    if (data) {
      data.expiry = Date.now() + (seconds * 1000);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// ============================================
// REDIS CLIENT AVEC GESTION ERREURS COMPLÈTE
// ============================================

let redisClient: Redis | null = null;
let memoryFallback: InMemoryStore | null = null;
let isUsingFallback = false;
let connectionAttempted = false;

export async function initRedis(): Promise<void> {
  // Éviter tentatives multiples
  if (connectionAttempted) {
    console.log('[REDIS] Already initialized');
    return;
  }
  
  connectionAttempted = true;

  // Parse REDIS_URL si fournie (Railway format)
  let redisConfig: any = {};
  
  if (process.env.REDIS_URL) {
    // Railway fournit redis://default:password@host:port
    try {
      const url = new URL(process.env.REDIS_URL);
      redisConfig = {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
      };
      console.log(`[REDIS] Using REDIS_URL: ${url.hostname}:${url.port}`);
    } catch (e) {
      console.error('[REDIS] Invalid REDIS_URL format:', e);
    }
  } else {
    // Fallback aux variables séparées
    redisConfig = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };
  }

  // En développement, sauter Redis si pas disponible
  if (process.env.NODE_ENV === 'development') {
    console.log('[REDIS] 🔧 Development mode - Trying Redis...');
    
    try {
      const testClient = new Redis({
        ...redisConfig,
        maxRetriesPerRequest: 1, // ✅ 1 seul essai
        retryStrategy: () => null, // ✅ Pas de retry automatique
        connectTimeout: 5000, // ✅ Timeout 5s (évite faux positifs)
        lazyConnect: true, // ✅ Connexion manuelle
        enableOfflineQueue: false, // ✅ Pas de queue si offline
      });

      // ✅ CRITIQUE : Capturer TOUTES les erreurs
      testClient.on('error', (err) => {
        // Ne rien faire - on gère en dessous
      });

      // Essayer de se connecter
      await testClient.connect();
      
      // Si on arrive ici, Redis fonctionne
      redisClient = testClient;
      console.log('[REDIS] ✅ Connected successfully');
      return;
      
    } catch (error: any) {
      // Redis non disponible - fallback silencieux
      console.log('[REDIS] ⚠️  Redis not available, using memory fallback');
      redisClient = null;
      isUsingFallback = true;
      memoryFallback = new InMemoryStore();
      return;
    }
  }

  // En production, Redis OBLIGATOIRE
  if (process.env.NODE_ENV === 'production') {
    console.log('[REDIS] 🚀 Production mode - Redis REQUIRED');
    
    const client = new Redis({
      ...redisConfig,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 10) {
          console.error('[REDIS] ❌ Max retries exceeded - CRITICAL');
          process.exit(1); // Arrêt forcé en prod si Redis down
        }
        return Math.min(times * 100, 3000);
      },
      enableOfflineQueue: false,
    });

    // Gestion erreurs production
    client.on('error', (err) => {
      console.error('[REDIS] ❌ Production error:', err.message);
    });

    client.on('ready', () => {
      console.log('[REDIS] ✅ Production ready');
    });

    try {
      await client.connect();
      redisClient = client;
    } catch (error: any) {
      console.error('[REDIS] ❌ CRITICAL: Cannot connect in production');
      throw new Error('Redis connection required in production');
    }
  }
}

// ============================================
// API UNIFIÉE
// ============================================

export const redis = {
  async get(key: string): Promise<string | null> {
    if (isUsingFallback && memoryFallback) {
      return memoryFallback.get(key);
    }
    
    if (!redisClient) {
      console.warn('[REDIS] Client not initialized');
      return null;
    }
    
    try {
      return await redisClient.get(key);
    } catch (error: any) {
      console.error('[REDIS] Get error:', error.message);
      return null;
    }
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (isUsingFallback && memoryFallback) {
      return memoryFallback.set(key, value, ttl);
    }
    
    if (!redisClient) {
      console.warn('[REDIS] Client not initialized');
      return;
    }
    
    try {
      if (ttl) {
        await redisClient.setex(key, ttl, value);
      } else {
        await redisClient.set(key, value);
      }
    } catch (error: any) {
      console.error('[REDIS] Set error:', error.message);
    }
  },

  async del(key: string): Promise<void> {
    if (isUsingFallback && memoryFallback) {
      return memoryFallback.del(key);
    }
    
    if (!redisClient) return;
    
    try {
      await redisClient.del(key);
    } catch (error: any) {
      console.error('[REDIS] Del error:', error.message);
    }
  },

  async incr(key: string): Promise<number> {
    if (isUsingFallback && memoryFallback) {
      return memoryFallback.incr(key);
    }
    
    if (!redisClient) return 0;
    
    try {
      return await redisClient.incr(key);
    } catch (error: any) {
      console.error('[REDIS] Incr error:', error.message);
      return 0;
    }
  },

  async expire(key: string, seconds: number): Promise<void> {
    if (isUsingFallback && memoryFallback) {
      return memoryFallback.expire(key, seconds);
    }
    
    if (!redisClient) return;
    
    try {
      await redisClient.expire(key, seconds);
    } catch (error: any) {
      console.error('[REDIS] Expire error:', error.message);
    }
  },

  isAvailable(): boolean {
    return !isUsingFallback && redisClient !== null;
  },

  async disconnect(): Promise<void> {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }
    
    if (memoryFallback) {
      memoryFallback.destroy();
      memoryFallback = null;
    }
  }
};

// ✅ Cleanup à l'arrêt
process.on('SIGTERM', async () => {
  console.log('[REDIS] Graceful shutdown...');
  await redis.disconnect();
});

process.on('SIGINT', async () => {
  console.log('[REDIS] Graceful shutdown...');
  await redis.disconnect();
});
