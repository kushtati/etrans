/**
 * CONFIGURATION ENVIRONNEMENT
 * 
 * Gère les variables d'environnement et détecte le mode de fonctionnement
 * ⚠️ CRITIQUE: Empêche l'utilisation accidentelle de mocks en production
 */

/// <reference types="vite/client" />

// Détection environnement
export const NODE_ENV = import.meta.env.MODE || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';

// Mode mock (UNIQUEMENT en développement)
export const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK === 'true' && IS_DEVELOPMENT;

// Backend API
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Logging
export const DEBUG_MODE = import.meta.env.VITE_DEBUG === 'true';

/**
 * Vérifie que l'application n'utilise pas de mocks en production
 * Lance une erreur fatale si détection
 */
export const validateEnvironment = () => {
  if (IS_PRODUCTION && import.meta.env.VITE_USE_MOCK === 'true') {
    throw new Error(
      '🚨 ERREUR FATALE: VITE_USE_MOCK=true détecté en PRODUCTION!\n' +
      'Les données mock ne doivent JAMAIS être utilisées en production.\n' +
      'Vérifiez vos variables d\'environnement.'
    );
  }

  // HTTPS obligatoire en production
  if (IS_PRODUCTION && API_BASE_URL && !API_BASE_URL.startsWith('https://') && !API_BASE_URL.startsWith('/')) {
    throw new Error(
      '🚨 ERREUR FATALE: API_BASE_URL doit utiliser HTTPS en production!\n' +
      `URL actuelle: ${API_BASE_URL}\n` +
      'La sécurité des données nécessite une connexion chiffrée.'
    );
  }

  // Validation format URL
  if (API_BASE_URL && !API_BASE_URL.match(/^(https?:\/\/[\w.-]+(:[0-9]+)?|\/)/)) {
    throw new Error(
      `🚨 ERREUR FATALE: API_BASE_URL invalide: ${API_BASE_URL}\n` +
      'Format attendu: https://domain.com ou /api'
    );
  }

  if (IS_MOCK_MODE) {
    console.warn(
      '%c⚠️ MODE MOCK ACTIVÉ',
      'background: #ff9800; color: white; font-size: 14px; font-weight: bold; padding: 4px 8px; border-radius: 4px;',
      '\nDonnées fictives chargées. Ne pas utiliser en production!'
    );
  }
};

/**
 * Obtenir l'URL complète d'un endpoint
 */
export const getApiUrl = (endpoint: string): string => {
  return `${API_BASE_URL}${endpoint}`;
};

/**
 * Configuration pour le logger centralisé
 */
export const LOGGER_CONFIG = {
  debugMode: DEBUG_MODE,
  logLevel: IS_PRODUCTION ? 'error' : IS_DEVELOPMENT ? 'debug' : 'info',
  enableConsole: IS_DEVELOPMENT || DEBUG_MODE,
  enableRemote: IS_PRODUCTION,
} as const;
