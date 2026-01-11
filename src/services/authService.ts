import { Role } from '../types';

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

export interface RateLimitInfo {
  attempts: number;
  lockoutUntil: number | null;
  requiresCaptcha: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Rate limiting storage key generator
 */
const getRateLimitKey = (email: string) => `auth_attempts_${email.toLowerCase()}`;

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
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email.trim().toLowerCase(),
          password: credentials.password, // HTTPS protège le transit, backend bcrypt valide
          captchaToken: credentials.captchaToken,
          tfaCode: credentials.tfaCode,
        }),
        credentials: 'include', // Send cookies (httpOnly token)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Identifiants invalides');
      }

      const data: AuthResponse = await response.json();

      // If 2FA is required, return early
      if (data.requiresTFA) {
        return data;
      }

      return data;
    } catch (err) {
      // Re-throw for handling in component
      throw err;
    }
  },

  /**
   * Verify 2FA code
   */
  async verify2FA(code: string, tempToken: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/verify-2fa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tempToken}`,
      },
      body: JSON.stringify({ code }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Code 2FA invalide');
    }

    return response.json();
  },

  /**
   * Request 2FA code resend
   */
  async resend2FACode(tempToken: string): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/resend-2fa`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tempToken}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Erreur lors de l\'envoi du code');
    }
  },

  /**
   * Logout and clear token
   */
  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    // ✅ Cookie httpOnly supprimé côté serveur
  },

  /**
   * Verify token validity
   */
  async verifyToken(): Promise<AuthResponse['user']> {
    const response = await fetch(`${API_BASE}/auth/verify`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Token invalide');
    }

    return response.json();
  },

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error('Erreur lors de la demande');
    }
  },

  /**
   * Check if user role requires 2FA
   */
  requiresTFA(role: Role): boolean {
    const sensitiveRoles = [Role.DIRECTOR, Role.ACCOUNTANT];
    return sensitiveRoles.includes(role);
  },
};
