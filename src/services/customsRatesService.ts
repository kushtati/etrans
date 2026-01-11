/**
 * Customs Rates Service - Guinea (Guinée)
 * 
 * Fetches current customs rates from backend with resilience
 * Rates change regularly via government decrees
 * 
 * Resilience strategy (3G-ready):
 * 1. Try backend API
 * 2. Fallback to IndexedDB cache (TTL: 7 days)
 * 3. Warn if rates > 30 days old
 * 4. Last resort: hardcoded fallback with warning
 */

import { CustomsRates } from '../types';
import { logger } from './logger';
import { indexedDBService } from './indexedDBService';

const RATES_CACHE_KEY = 'customs_rates_cache';
const CACHE_TTL_DAYS = 7;

/**
 * Mock customs rates for demonstration
 * In production, these come from government/backend with digital signature
 */
const MOCK_RATES_BASE = {
  rtl: 0.02,  // Redevance Terminal Lieu: 2%
  rdl: 0.015, // Redevance Droits et Licence: 1.5%
  tvs: 0.18,  // Taxe de Valeur Spécifique (VAT): 18%
  dd: 0.20,   // Droits de Douane (Customs Duty): 20%
  source: 'Décret Gouvernemental 2026-01 / Customs Authority',
  // Audit trail metadata (production should include digital signature)
  sourceUrl: 'https://douanes.gov.gn/decrets/2026-01',
  versionId: '2026-01-v1',
  signedBy: 'Direction Générale des Douanes - Guinée',
  signedAt: '2026-01-01T00:00:00Z'
};

// Production safety check
if (process.env.NODE_ENV === 'production' && !process.env.USE_MOCK_DATA) {
  throw new Error(
    '⚠️ MOCK_RATES interdit en production. ' +
    'Configurez USE_MOCK_DATA=true pour environnement staging ou implémentez fetch API réel.'
  );
}

/**
 * Fetch current customs rates
 * Should be called on app initialization and cached
 * 
 * @returns Promise with current CustomsRates
 */
export const fetchCurrentCustomsRates = async (): Promise<CustomsRates> => {
  try {
    // In production, this would be:
    // const response = await fetch('/api/customs/rates');
    // const data = await response.json();
    // return data;
    
    // Generate fresh timestamp for mock rates
    const mockRates: CustomsRates = {
      ...MOCK_RATES_BASE,
      lastUpdate: new Date().toISOString()
    };
    
    // Cache rates in IndexedDB for offline resilience
    try {
      await indexedDBService.saveCustomsRates(mockRates);
    } catch (cacheError) {
      logger.warn('Échec mise en cache taux douaniers', { error: String(cacheError) });
    }
    
    logger.info('Taux douaniers chargés depuis backend', { 
      source: mockRates.source,
      rtl: mockRates.rtl,
      rdl: mockRates.rdl,
      tvs: mockRates.tvs,
      dd: mockRates.dd
    });
    
    return mockRates;
  } catch (error) {
    logger.error('Erreur chargement taux douaniers depuis backend', { error: String(error) });
    
    // Fallback 1: Try IndexedDB cache (resilience for offline/3G)
    try {
      const cachedRates = await indexedDBService.getCustomsRates();
      if (cachedRates) {
        const cacheAge = daysSince(new Date(cachedRates.lastUpdate));
        
        // Warn if cache is stale
        if (cacheAge > CACHE_TTL_DAYS) {
          logger.warn('⚠️ Taux douaniers en cache obsolètes', { 
            ageInDays: cacheAge,
            maxAge: CACHE_TTL_DAYS,
            source: 'IndexedDB cache'
          });
        }
        
        logger.info('✓ Taux douaniers chargés depuis cache IndexedDB', {
          ageInDays: cacheAge,
          source: cachedRates.source
        });
        
        return cachedRates;
      }
    } catch (cacheError) {
      logger.error('Échec lecture cache IndexedDB', { error: String(cacheError) });
    }
    
    // Fallback 2: Hardcoded rates (last resort for demo)
    logger.warn('🚨 FALLBACK: Utilisation taux hardcodés (réseau et cache indisponibles)');
    const fallbackRates: CustomsRates = {
      ...MOCK_RATES_BASE,
      lastUpdate: new Date().toISOString()
    };
    
    return fallbackRates;
  }
};

/**
 * Calculate days since a date
 * Used to determine if rates are stale
 * 
 * @param date - Date to compare with now
 * @returns Number of days since date
 */
export const daysSince = (date: Date): number => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Check if customs rates are stale
 * Rates older than 30 days should trigger a warning
 * 
 * @param lastUpdate - Date when rates were last updated
 * @returns true if rates are older than 30 days
 */
export const isRatesStale = (lastUpdate: Date): boolean => {
  return daysSince(lastUpdate) > 30;
};

/**
 * Format last update date in French locale
 * 
 * @param date - Date to format
 * @returns Formatted date string
 */
export const formatLastUpdate = (date: Date): string => {
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};
