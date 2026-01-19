/**
 * 🌐 CLIENT API CENTRALISÉ
 * Corrige l'erreur d'URL relative (Vercel ≠ Railway)
 */
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// ============================================
// CONFIGURATION
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const API_TIMEOUT = 30000; // 30s

console.log(`[API] Base URL configured: ${API_BASE_URL}`);

// ============================================
// INSTANCE AXIOS
// ============================================

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  withCredentials: true, // ✅ Cookies autorisés (JWT)
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================
// INTERCEPTEURS
// ============================================

// Request Interceptor : Ajouter CSRF token si disponible
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Récupérer CSRF token depuis cookie
    const csrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];

    if (csrfToken && config.headers) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }

    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response Interceptor : Gestion erreurs globales
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (!error.response) {
      // Erreur réseau (serveur injoignable)
      console.error('[API] Network error - server unreachable');
      return Promise.reject({
        message: 'Impossible de contacter le serveur',
        code: 'NETWORK_ERROR',
        originalError: error,
      });
    }

    const { status, data } = error.response;

    // Gestion des codes d'erreur communs
    switch (status) {
      case 401:
        // Non authentifié (normal si non connecté)
        console.warn('[API] 401 Unauthorized');
        break;

      case 403:
        // Interdit (permissions insuffisantes ou CSRF invalide)
        console.error('[API] 403 Forbidden');
        break;

      case 429:
        // Rate limit atteint
        console.warn('[API] 429 Too Many Requests - Rate limit exceeded');
        break;

      case 500:
      case 502:
      case 503:
        // Erreurs serveur
        console.error(`[API] ${status} Server Error`);
        break;

      default:
        console.error(`[API] ${status} Error:`, data);
    }

    return Promise.reject(error);
  }
);

// ============================================
// HELPERS TYPÉS
// ============================================

/**
 * GET request avec typage
 */
export const apiGet = async <T = any>(url: string, config = {}): Promise<T> => {
  const response = await api.get<T>(url, config);
  return response.data;
};

/**
 * POST request avec typage
 */
export const apiPost = async <T = any>(url: string, data?: any, config = {}): Promise<T> => {
  const response = await api.post<T>(url, data, config);
  return response.data;
};

/**
 * PUT request avec typage
 */
export const apiPut = async <T = any>(url: string, data?: any, config = {}): Promise<T> => {
  const response = await api.put<T>(url, data, config);
  return response.data;
};

/**
 * PATCH request avec typage
 */
export const apiPatch = async <T = any>(url: string, data?: any, config = {}): Promise<T> => {
  const response = await api.patch<T>(url, data, config);
  return response.data;
};

/**
 * DELETE request avec typage
 */
export const apiDelete = async <T = any>(url: string, config = {}): Promise<T> => {
  const response = await api.delete<T>(url, config);
  return response.data;
};

// ============================================
// EXPORT INSTANCE PAR DÉFAUT
// ============================================

export default api;

// ============================================
// TYPES UTILES
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: any;
}
