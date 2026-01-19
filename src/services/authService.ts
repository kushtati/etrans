import { Role } from '../types';
import { apiPost, apiGet } from '../lib/api';

export interface LoginCredentials {
  email: string;
  password: string;
  captchaToken?: string;
  tfaCode?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: Role;
    name: string;
  };
  requiresTFA?: boolean;
  tfaMethod?: 'sms' | 'email' | 'app';
}

/**
 * Hash password using SHA-256 (client-side pre-hashing)
 * Note: Server still does bcrypt hashing
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check and enforce HTTPS in production
 */
function enforceHTTPS(): void {
  if (import.meta.env.PROD && window.location.protocol !== 'https:') {
    window.location.href = window.location.href.replace('http:', 'https:');
    throw new Error('Redirection vers HTTPS...');
  }
}

export const authService = {
  /**
   * Login with email and password
   * 
   * ✅ SÉCURITÉ:
   * - HTTPS enforce en production (password transite chiffré TLS)
   * - Rate limiting côté SERVEUR (express-rate-limit avec Redis)
   * - Cookies httpOnly pour tokens
   * - Backend valide TOUT avec bcrypt
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // SECURITY: Enforce HTTPS in production
    enforceHTTPS();

    try {
      const data = await apiPost<AuthResponse>('/auth/login', {
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password, // HTTPS protège le transit, backend bcrypt valide
        captchaToken: credentials.captchaToken,
        tfaCode: credentials.tfaCode,
      });

      // If 2FA is required, return early
      if (data.requiresTFA) {
        return data;
      }

      return data;
    } catch (err: any) {
      // Re-throw for handling in component
      const errorWithStatus: any = new Error(
        err.response?.data?.message || 
        err.message || 
        (err.response?.status === 429 ? 'Trop de tentatives. Réessayez plus tard.' : 'Identifiants invalides')
      );
      errorWithStatus.status = err.response?.status;
      throw errorWithStatus;
    }
  },

  /**
   * Verify 2FA code
   */
  async verify2FA(code: string, tempToken: string): Promise<AuthResponse> {
    try {
      return await apiPost<AuthResponse>('/auth/verify-2fa', { code }, {
        headers: { 'Authorization': `Bearer ${tempToken}` }
      });
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Code 2FA invalide');
    }
  },

  /**
   * Request 2FA code resend
   */
  async resend2FACode(tempToken: string): Promise<void> {
    try {
      await apiPost('/auth/resend-2fa', {}, {
        headers: { 'Authorization': `Bearer ${tempToken}` }
      });
    } catch (err) {
      throw new Error('Erreur lors de l\'envoi du code');
    }
  },

  /**
   * Logout and clear token
   */
  async logout(): Promise<void> {
    await apiPost('/auth/logout', {});
    // ✅ Cookie httpOnly supprimé côté serveur
  },

  /**
   * Verify token validity
   */
  async verifyToken(): Promise<AuthResponse['user']> {
    return await apiGet<AuthResponse['user']>('/auth/verify');
  },

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    await apiPost('/auth/password-reset', { email });
  },

  /**
   * Check if user role requires 2FA
   */
  requiresTFA(role: Role): boolean {
    const sensitiveRoles = [Role.DIRECTOR, Role.ACCOUNTANT];
    return sensitiveRoles.includes(role);
  },
};
