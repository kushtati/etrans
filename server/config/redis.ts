/**
 * CONFIGURATION REDIS - CORRIGÉE
 * 
 * Fix : Gestion complète des erreurs Redis pour éviter crash serveur
 */

import Redis from 'ioredis';
import { logger, logError } from './logger';

// ============================================
// IN-MEMORY FALLBACK
// ============================================

class InMemoryStore {
  private store: Map<string, { value: string; expiry?: number }> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  private readonly MAX_KEYS = 10000; // Limite 10k clés

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
    // Nettoyer si limite atteinte
    if (this.store.size >= this.MAX_KEYS) {
      this.cleanup();
      
      // Si toujours trop grand, supprimer les plus vieux
      if (this.store.size >= this.MAX_KEYS) {
        const oldest = Array.from(this.store.keys())[0];
        this.store.delete(oldest);
        logger.warn('InMemoryStore: MAX_KEYS reached, removing oldest key', { size: this.store.size });
      }
    }
    
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
    logger.info('Redis already initialized');
    return;
  }
  
  connectionAttempted = true;

  // Parse REDIS_URL si fournie (Railway format)
  let redisConfig: any = {};
  
  if (process.env.REDIS_URL) {
    // Railway fournit redis://default:password@host:port
    try {
      const url = new URL(process.env.REDIS_URL);
      
      // Valider protocole
      if (!['redis:', 'rediss:'].includes(url.protocol)) {
        throw new Error(`Invalid Redis protocol: ${url.protocol}`);
      }
      
      redisConfig = {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        tls: url.protocol === 'rediss:' ? {} : undefined,
      };
      logger.info('Using REDIS_URL', { host: url.hostname, port: url.port, tls: url.protocol === 'rediss:' });
    } catch (e) {
      logError('Invalid REDIS_URL format', e as Error);
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
    logger.info('Development mode - Trying Redis...');
    
    try {
      const testClient = new Redis({
        ...redisConfig,
        maxRetriesPerRequest: 1, // 1 seul essai
        retryStrategy: () => null, // Pas de retry automatique
        connectTimeout: 10000, // Timeout 10s (plus réaliste)
        lazyConnect: true, // Connexion manuelle
        enableOfflineQueue: false, // Pas de queue si offline
      });

      // CRITIQUE : Capturer TOUTES les erreurs
      testClient.on('error', (err) => {
        // Ne rien faire - on gère en dessous
      });

      // Essayer de se connecter
      await testClient.connect();
      
      // Si on arrive ici, Redis fonctionne
      redisClient = testClient;
      logger.info('Redis connected successfully');
      return;
      
    } catch (error: any) {
      // Redis non disponible - fallback silencieux
      logger.warn('Redis not available, using memory fallback');
      redisClient = null;
      isUsingFallback = true;
      memoryFallback = new InMemoryStore();
      return;
    }
  }

  // En production, Redis OBLIGATOIRE
  if (process.env.NODE_ENV === 'production') {
    logger.info('Production mode - Redis REQUIRED');
    
    // Compteur erreurs pour monitoring
    let errorCount = 0;
    const MAX_ERRORS_BEFORE_ALERT = 10;
    
    const client = new Redis({
      ...redisConfig,
      tls: redisConfig.tls || {}, // TLS par défaut en production
      maxRetriesPerRequest: 10, // Plus tolérant
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 200, 5000); // Max 5s entre essais
        
        if (times > 20) {
          logger.error('Redis max retries exceeded - CRITICAL');
          process.exit(1); // Arrêt forcé en prod si Redis down
        }
        
        logger.warn('Redis retry attempt', { attempt: times, delay });
        return delay;
      },
      enableOfflineQueue: false,
    });

    // Gestion erreurs production avec monitoring
    client.on('error', (err) => {
      errorCount++;
      logError('Redis production error', err, { count: errorCount });
      
      if (errorCount >= MAX_ERRORS_BEFORE_ALERT) {
        // TODO: Envoyer alerte (email, Slack, PagerDuty)
        logger.error('ALERT: Redis error threshold exceeded', { count: errorCount });
      }
    });

    client.on('ready', () => {
      logger.info('Redis production ready');
      errorCount = 0; // Reset compteur si reconnexion
    });

    try {
      await client.connect();
      redisClient = client;
    } catch (error: any) {
      logError('CRITICAL: Cannot connect in production', error);
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
      logger.warn('Redis client not initialized');
      return null;
    }
    
    try {
      return await redisClient.get(key);
    } catch (error: any) {
      logError('Redis get error', error);
      return null;
    }
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (isUsingFallback && memoryFallback) {
      return memoryFallback.set(key, value, ttl);
    }
    
    if (!redisClient) {
      logger.warn('Redis client not initialized');
      return;
    }
    
    try {
      if (ttl) {
        await redisClient.setex(key, ttl, value);
      } else {
        await redisClient.set(key, value);
      }
    } catch (error: any) {
      logError('Redis set error', error);
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
      logError('Redis del error', error);
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
      logError('Redis incr error', error);
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
      logError('Redis expire error', error);
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

// Cleanup à l'arrêt
process.on('SIGTERM', async () => {
  logger.info('Redis graceful shutdown...');
  await redis.disconnect();
});

process.on('SIGINT', async () => {
  logger.info('Redis graceful shutdown...');
  await redis.disconnect();
});
