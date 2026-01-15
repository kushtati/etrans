/**
 * 🌐 CLIENT API CENTRALISÉ
 * 
 * Instance Axios unique pour tous les appels API avec :
 * - Configuration automatique credentials (cookies cross-domain)
 * - Intercepteur CSRF automatique (lecture cookie XSRF-TOKEN)
 * - Retry logic pour réseau instable
 * - Gestion erreurs centralisée
 */

import axios, { AxiosError } from 'axios';
import { logger } from '../services/logger';
import { API_BASE_URL } from '../config/environment';

/**
 * Instance Axios préconfigurée pour Railway backend
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // CRITIQUE : Envoi cookies cross-origin (CSRF + JWT)
  timeout: 30000, // 30s timeout
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Intercepteur Request : Ajouter token CSRF automatiquement
 * Lit le cookie XSRF-TOKEN et l'envoie dans header x-csrf-token
 */
apiClient.interceptors.request.use(
  (config) => {
    // Lire cookie XSRF-TOKEN (créé par /api/auth/csrf-token)
    const csrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];
    
    if (csrfToken) {
      // Décoder URL encoding + ajouter header
      config.headers['x-csrf-token'] = decodeURIComponent(csrfToken);
    }
    
    return config;
  },
  (error) => {
    logger.error('Request interceptor error', { error: error.message });
    return Promise.reject(error);
  }
);

/**
 * Intercepteur Response : Gestion erreurs centralisée
 * - 401 : Session expirée → Rediriger login
 * - 403 : CSRF invalide → Recharger token
 * - 5xx : Retry automatique
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const { config, response } = error;
    
    if (!response) {
      logger.error('Network error', { error: error.message });
      return Promise.reject(error);
    }
    
    const status = response.status;
    
    // 401 Unauthorized : Session expirée
    if (status === 401 && config?.url !== '/auth/csrf-token') {
      logger.warn('Session expired (401)', { url: config?.url });
      // Éviter boucle infinie sur /auth/login
      if (config?.url !== '/auth/login') {
        // Rediriger vers login (géré par App.tsx)
        window.location.reload();
      }
    }
    
    // 403 Forbidden : Token CSRF invalide
    if (status === 403 && config?.url?.includes('/auth/')) {
      logger.warn('CSRF validation failed (403)', { url: config?.url });
      // Recharger token CSRF (optionnel, frontend peut gérer)
    }
    
    // 5xx Server Error : Retry (1 fois max)
    if (status >= 500 && config && !config.headers['X-Retry-Attempt']) {
      logger.warn('Server error, retrying', { status, url: config.url });
      config.headers['X-Retry-Attempt'] = '1';
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
      return apiClient.request(config);
    }
    
    logger.error('API error', {
      status,
      url: config?.url,
      message: (response.data as any)?.message || error.message
    });
    
    return Promise.reject(error);
  }
);

/**
 * Helper : Extraire message d'erreur API
 */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as any)?.message || error.message;
  }
  return error instanceof Error ? error.message : 'Erreur inconnue';
};

export default apiClient;
