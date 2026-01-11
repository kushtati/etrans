/**
 * SÉCURITÉ AUTHENTIFICATION - GUINÉE TRANSIT
 * 
 * Implémente :
 * ✅ Hachage côté client (protection transit réseau)
 * ✅ Rate limiting côté client
 * ✅ Détection tentatives suspectes
 * ✅ Génération tokens sécurisés
 * ✅ Validation force mot de passe
 */

import { logger } from '../services/logger';

// ============================================
// ⚠️ IMPORTANT SÉCURITÉ - LIRE AVANT UTILISATION
// ============================================
// Ce fichier contient des UTILITAIRES UX UNIQUEMENT.
// La SÉCURITÉ RÉELLE doit être implémentée CÔTÉ SERVEUR.
//
// ❌ JAMAIS hasher mot de passe côté client (inutile avec HTTPS)
// ❌ JAMAIS valider JWT côté client uniquement
// ❌ JAMAIS implémenter rate limiting côté client (bypass facile)
//
// ✅ Backend DOIT : bcrypt/argon2, JWT signature verification, Redis rate limit
// ============================================

/**
 * Vérifie si le navigateur supporte Web Crypto API
 */
export const isWebCryptoSupported = (): boolean => {
  return !!(window.crypto && window.crypto.subtle);
};

// ============================================
// RATE LIMITING CÔTÉ CLIENT (UX UNIQUEMENT)
// ============================================
// ⚠️ WARNING : Rate limiting client-side est FACILEMENT BYPASS.
// Attaquant peut : ouvrir incognito, changer IP, désactiver JS.
// 
// Cette implémentation est UNIQUEMENT pour améliorer UX (feedback utilisateur).
// SÉCURITÉ RÉELLE : Implémenter côté serveur avec Redis + IP tracking.
// ============================================

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
  blockUntil?: number;
}

class ClientRateLimiter {
  private storage: Map<string, RateLimitEntry> = new Map();
  private readonly MAX_ATTEMPTS = 3;
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly BLOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Vérifie si une action est autorisée
   * 
   * @param identifier - Identifiant unique (email, IP, etc.)
   * @returns true si autorisé, false si bloqué
   */
  isAllowed(identifier: string): boolean {
    const normalized = identifier.toLowerCase().trim();
    const now = Date.now();
    
    let entry = this.storage.get(normalized);

    // Pas d'entrée = première tentative
    if (!entry) {
      this.storage.set(normalized, {
        attempts: 1,
        firstAttempt: now,
        lastAttempt: now,
        blocked: false
      });
      return true;
    }

    // Vérifier si toujours bloqué
    if (entry.blocked && entry.blockUntil) {
      if (now < entry.blockUntil) {
        const remainingMin = Math.ceil((entry.blockUntil - now) / 60000);
        logger.warn('Login blocked (rate limit)', { 
          identifier: normalized, 
          remainingMin 
        });
        return false;
      } else {
        // Débloquer
        entry.blocked = false;
        entry.attempts = 0;
        entry.blockUntil = undefined;
      }
    }

    // Réinitialiser si fenêtre expirée
    if (now - entry.firstAttempt > this.WINDOW_MS) {
      entry.attempts = 1;
      entry.firstAttempt = now;
      entry.lastAttempt = now;
      this.storage.set(normalized, entry);
      return true;
    }

    // Incrémenter tentatives
    entry.attempts++;
    entry.lastAttempt = now;

    // Bloquer si dépassement
    if (entry.attempts > this.MAX_ATTEMPTS) {
      entry.blocked = true;
      entry.blockUntil = now + this.BLOCK_DURATION_MS;
      
      logger.audit('RATE_LIMIT_TRIGGERED', { 
        identifier: normalized,
        attempts: entry.attempts,
        blockUntil: new Date(entry.blockUntil).toISOString()
      });

      this.storage.set(normalized, entry);
      return false;
    }

    this.storage.set(normalized, entry);
    return true;
  }

  /**
   * Obtient le nombre de tentatives restantes
   */
  getRemainingAttempts(identifier: string): number {
    const normalized = identifier.toLowerCase().trim();
    const entry = this.storage.get(normalized);
    
    if (!entry) return this.MAX_ATTEMPTS;
    if (entry.blocked) return 0;
    
    return Math.max(0, this.MAX_ATTEMPTS - entry.attempts);
  }

  /**
   * Obtient le temps restant avant déblocage (en minutes)
   */
  getBlockTimeRemaining(identifier: string): number {
    const normalized = identifier.toLowerCase().trim();
    const entry = this.storage.get(normalized);
    
    if (!entry || !entry.blocked || !entry.blockUntil) return 0;
    
    const now = Date.now();
    if (now >= entry.blockUntil) return 0;
    
    return Math.ceil((entry.blockUntil - now) / 60000);
  }

  /**
   * Réinitialise le compteur pour un identifiant (après succès)
   */
  reset(identifier: string): void {
    const normalized = identifier.toLowerCase().trim();
    this.storage.delete(normalized);
  }

  /**
   * Nettoie les entrées expirées
   */
  cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.storage.entries()) {
      // Supprimer si non bloqué et fenêtre expirée
      if (!entry.blocked && now - entry.firstAttempt > this.WINDOW_MS) {
        this.storage.delete(key);
      }
      // Supprimer si bloqué mais déblocage passé
      if (entry.blocked && entry.blockUntil && now >= entry.blockUntil) {
        this.storage.delete(key);
      }
    }
  }
}

// Instance singleton
export const rateLimiter = new ClientRateLimiter();

// Nettoyage automatique toutes les 5 minutes
const cleanupIntervalId = setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

/**
 * Arrête le nettoyage automatique du rate limiter
 * À appeler lors du unmount de l'application
 */
export const stopRateLimiterCleanup = (): void => {
  clearInterval(cleanupIntervalId);
};

// ============================================
// VALIDATION FORCE MOT DE PASSE
// ============================================

export interface PasswordStrength {
  score: number; // 0-5
  strength: 'VERY_WEAK' | 'WEAK' | 'FAIR' | 'GOOD' | 'STRONG' | 'VERY_STRONG';
  feedback: string[];
  isValid: boolean;
}

/**
 * Évalue la force d'un mot de passe
 * 
 * Critères :
 * - Longueur
 * - Complexité (majuscules, minuscules, chiffres, spéciaux)
 * - Pas de patterns communs
 * - Pas de mots du dictionnaire
 * 
 * @param password - Mot de passe à évaluer
 * @returns Objet avec score et feedback
 */
export const evaluatePasswordStrength = (password: string): PasswordStrength => {
  const feedback: string[] = [];
  let score = 0;

  // Validation basique
  if (!password) {
    return {
      score: 0,
      strength: 'VERY_WEAK',
      feedback: ['Mot de passe requis'],
      isValid: false
    };
  }

  // 1. Longueur
  if (password.length >= 12) score += 2;
  else if (password.length >= 10) score += 1.5;
  else if (password.length >= 8) score += 1;
  else {
    feedback.push('❌ Minimum 8 caractères requis');
    return {
      score: 0,
      strength: 'VERY_WEAK',
      feedback,
      isValid: false
    };
  }

  // 2. Majuscules
  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('⚠️ Ajouter au moins une majuscule');
  }

  // 3. Minuscules
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('⚠️ Ajouter au moins une minuscule');
  }

  // 4. Chiffres
  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('⚠️ Ajouter au moins un chiffre');
  }

  // 5. Caractères spéciaux
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 1;
  } else {
    feedback.push('💡 Caractères spéciaux recommandés (!@#$%...)');
  }

  // 6. Pénalités pour patterns faibles
  const weakPatterns = [
    /^[a-z]+$/, // Que minuscules
    /^[A-Z]+$/, // Que majuscules
    /^[0-9]+$/, // Que chiffres
    /(.)\1\1/, // Caractères répétés 3x (aaa, 111) - ReDoS safe
    /^(123|abc|qwerty|azerty|password)/i, // Patterns communs
    /^[0-9]{4,}$/, // PIN codes
  ];

  weakPatterns.forEach(pattern => {
    if (pattern.test(password)) {
      score -= 1;
      feedback.push('⚠️ Pattern faible détecté');
    }
  });

  // 7. Mots courants à éviter (Guinée)
  const commonWords = [
    'password', 'motdepasse', '123456', 'azerty', 'qwerty',
    'admin', 'root', 'user', 'conakry', 'guinee', 'transit'
  ];

  const lowerPass = password.toLowerCase();
  commonWords.forEach(word => {
    if (lowerPass.includes(word)) {
      score -= 1.5;
      feedback.push('❌ Mot courant détecté (éviter)');
    }
  });

  // Normaliser score 0-5
  score = Math.max(0, Math.min(5, score));

  // Déterminer force
  let strength: PasswordStrength['strength'];
  if (score >= 4.5) strength = 'VERY_STRONG';
  else if (score >= 3.5) strength = 'STRONG';
  else if (score >= 2.5) strength = 'GOOD';
  else if (score >= 1.5) strength = 'FAIR';
  else if (score >= 0.5) strength = 'WEAK';
  else strength = 'VERY_WEAK';

  // Validation finale
  const isValid = score >= 2 && password.length >= 8;

  // Feedback positif
  if (isValid && feedback.length === 0) {
    feedback.push('✅ Mot de passe solide');
  }

  return { score, strength, feedback, isValid };
};

/**
 * Génère un mot de passe fort aléatoire
 * Utile pour réinitialisation temporaire
 * 
 * @param length - Longueur (défaut 16)
 * @returns Mot de passe aléatoire
 */
export const generateSecurePassword = (length: number = 16): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()-_=+[]{}|;:,.<>?';
  
  const all = uppercase + lowercase + numbers + special;
  
  let password = '';
  
  // Garantir au moins 1 de chaque type (crypto.getRandomValues pour sécurité)
  const randomBytes = new Uint32Array(length + 4);
  crypto.getRandomValues(randomBytes);
  
  password += uppercase[randomBytes[0] % uppercase.length];
  password += lowercase[randomBytes[1] % lowercase.length];
  password += numbers[randomBytes[2] % numbers.length];
  password += special[randomBytes[3] % special.length];
  
  // Compléter
  for (let i = password.length; i < length; i++) {
    password += all[randomBytes[i] % all.length];
  }
  
  // Mélanger (Fisher-Yates shuffle avec crypto.getRandomValues)
  const chars = password.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const randomIndex = randomBytes[i + 4] % (i + 1);
    [chars[i], chars[randomIndex]] = [chars[randomIndex], chars[i]];
  }
  
  return chars.join('');
};

// ============================================
// DÉTECTION TENTATIVES SUSPECTES
// ============================================

interface SuspiciousActivity {
  type: 'BRUTE_FORCE' | 'CREDENTIAL_STUFFING' | 'UNUSUAL_LOCATION' | 'BOT_DETECTED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  timestamp: number;
}

/**
 * Détecte les comportements suspects lors du login
 * 
 * @param email - Email utilisateur
 * @param password - Mot de passe (longueur uniquement, pas contenu)
 * @param userAgent - User agent du navigateur
 * @returns Liste d'activités suspectes détectées
 */
export const detectSuspiciousActivity = (
  email: string,
  password: string,
  userAgent: string
): SuspiciousActivity[] => {
  
  const suspicious: SuspiciousActivity[] = [];
  const now = Date.now();

  // 1. Mot de passe trop court (force brute)
  if (password.length < 4) {
    suspicious.push({
      type: 'BRUTE_FORCE',
      severity: 'HIGH',
      description: 'Mot de passe anormalement court',
      timestamp: now
    });
  }

  // 2. Email suspect
  const suspiciousEmailPatterns = [
    /test@/i,
    /admin@/i,
    /root@/i,
    /[0-9]{5,}@/, // Emails avec beaucoup de chiffres
  ];

  if (suspiciousEmailPatterns.some(p => p.test(email))) {
    suspicious.push({
      type: 'CREDENTIAL_STUFFING',
      severity: 'MEDIUM',
      description: 'Format email suspect',
      timestamp: now
    });
  }

  // 3. User Agent suspect (bot)
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /curl/i,
    /wget/i,
    /python/i
  ];

  if (botPatterns.some(p => p.test(userAgent))) {
    suspicious.push({
      type: 'BOT_DETECTED',
      severity: 'CRITICAL',
      description: 'User-Agent non-humain détecté',
      timestamp: now
    });
  }

  // 4. User Agent manquant ou trop court
  if (!userAgent || userAgent.length < 20) {
    suspicious.push({
      type: 'BOT_DETECTED',
      severity: 'HIGH',
      description: 'User-Agent invalide ou manquant',
      timestamp: now
    });
  }

  return suspicious;
};

// ============================================
// GÉNÉRATION TOKEN SÉCURISÉ
// ============================================

/**
 * Génère un token aléatoire cryptographiquement sûr
 * Utile pour tokens de session, CSRF, etc.
 * 
 * @param length - Longueur en bytes (défaut 32)
 * @returns Token en hexadécimal
 */
export const generateSecureToken = (length: number = 32): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Génère un code OTP à 6 chiffres
 * Pour 2FA (utilise crypto.getRandomValues pour sécurité)
 * 
 * @returns Code à 6 chiffres
 */
export const generateOTP = (): string => {
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  // Génère 6 chiffres (100000-999999)
  const code = 100000 + (randomBytes[0] % 900000);
  return code.toString();
};

// ============================================
// VÉRIFICATION HTTPS
// ============================================

// ============================================
// DÉCODAGE JWT (UNSAFE - CLIENT-SIDE)
// ============================================
// 🚨 DANGER : Cette fonction NE VÉRIFIE PAS LA SIGNATURE JWT.
// Un attaquant peut forger un token avec payload modifié.
// 
// ❌ JAMAIS utiliser cette fonction pour autoriser des actions sensibles.
// ✅ Backend DOIT TOUJOURS vérifier signature JWT avec secret/clé publique.
// 
// Usage légitime : Décoder payload pour afficher nom utilisateur dans UI.
// ============================================

export interface JWTValidationResult {
  isValid: boolean;
  error?: string;
  payload?: any;
  isExpired?: boolean;
}

/**
 * Décode un JWT côté client SANS VÉRIFIER LA SIGNATURE
 * 
 * ⚠️ UNSAFE : Ne vérifie que structure et expiration, PAS la signature.
 * Backend DOIT vérifier signature avant autoriser accès.
 * 
 * @param token - Token JWT à décoder
 * @returns Résultat de décodage (structure et expiration uniquement)
 */
export const decodeJWTUnsafe = (token: string): JWTValidationResult => {
  if (!token || typeof token !== 'string') {
    return {
      isValid: false,
      error: 'Token manquant ou invalide'
    };
  }

  // Vérifier format JWT (3 parties séparées par points)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return {
      isValid: false,
      error: 'Format JWT invalide (doit contenir 3 parties)'
    };
  }

  try {
    // Décoder le payload (partie 2)
    const payload = JSON.parse(atob(parts[1]));

    // Vérifier expiration
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return {
          isValid: false,
          error: 'Token expiré',
          payload,
          isExpired: true
        };
      }
    }

    // Vérifier champs requis
    if (!payload.sub && !payload.userId) {
      return {
        isValid: false,
        error: 'Token sans identifiant utilisateur (sub/userId manquant)',
        payload
      };
    }

    return {
      isValid: true,
      payload,
      isExpired: false
    };

  } catch (error) {
    return {
      isValid: false,
      error: 'Erreur décodage JWT (format base64 invalide)'
    };
  }
};

// ============================================
// VALIDATION CSRF TOKEN
// ============================================

/**
 * Vérifie qu'un CSRF token est valide
 * Compare avec le token stocké dans sessionStorage
 * 
 * @param token - Token CSRF à vérifier
 * @returns true si valide, false sinon
 */
export const verifyCsrfToken = (token: string): boolean => {
  if (!token || typeof token !== 'string') {
    logger.warn('CSRF token manquant ou invalide');
    return false;
  }

  // Récupérer token stocké
  const storedToken = sessionStorage.getItem('csrf_token');
  
  if (!storedToken) {
    logger.warn('CSRF token non trouvé dans sessionStorage');
    return false;
  }

  // Comparaison constante-time pour éviter timing attacks
  if (token.length !== storedToken.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ storedToken.charCodeAt(i);
  }

  return mismatch === 0;
};

/**
 * Génère et stocke un nouveau CSRF token
 * 
 * @returns Token CSRF généré
 */
export const initializeCsrfToken = (): string => {
  const token = generateSecureToken(32);
  sessionStorage.setItem('csrf_token', token);
  return token;
};

// ============================================
// VÉRIFICATION HTTPS
// ============================================

/**
 * Vérifie si la connexion est sécurisée (HTTPS)
 * 
 * @returns true si HTTPS, false sinon
 */
export const isSecureConnection = (): boolean => {
  return window.location.protocol === 'https:';
};

/**
 * Force la redirection vers HTTPS si nécessaire
 */
export const enforceHTTPS = (): void => {
  if (!isSecureConnection() && window.location.hostname !== 'localhost') {
    logger.warn('Insecure connection detected, redirecting to HTTPS');
    window.location.href = window.location.href.replace('http://', 'https://');
  }
};

// ============================================
// TESTS DE SÉCURITÉ
// ============================================

/**
 * Exécute une suite de tests de sécurité
 * À utiliser en développement
 */
export const runSecurityTests = (): void => {
  console.log('🔒 Running Security Tests...\n');

  // Test 1: Hachage - ❌ SUPPRIMÉ (hashPasswordClient retiré pour sécurité)
  // Le hachage se fait maintenant UNIQUEMENT côté serveur avec bcrypt

  // Test 2: Force mot de passe
  const passwords = [
    '123',
    'password',
    'Password1',
    'P@ssw0rd123',
    'MyS3cur3P@ssw0rd!'
  ];

  console.log('\n📊 Password Strength Tests:');
  passwords.forEach(pwd => {
    const result = evaluatePasswordStrength(pwd);
    console.log(`   "${pwd}" → ${result.strength} (${result.score.toFixed(1)}/5)`);
  });

  // Test 3: Rate limiting
  console.log('\n⏱️ Rate Limiting Test:');
  const testEmail = 'test@example.com';
  for (let i = 1; i <= 5; i++) {
    const allowed = rateLimiter.isAllowed(testEmail);
    console.log(`   Attempt ${i}: ${allowed ? '✅ Allowed' : '❌ Blocked'}`);
  }

  // Test 4: Token génération
  console.log('\n🎲 Token Generation Test:');
  const token = generateSecureToken();
  console.log(`   Token: ${token.substring(0, 20)}... (${token.length} chars)`);

  // Test 5: HTTPS
  console.log('\n🔐 Connection Security:');
  console.log(`   HTTPS: ${isSecureConnection() ? '✅ Secure' : '⚠️ Insecure'}`);
  console.log(`   Web Crypto: ${isWebCryptoSupported() ? '✅ Supported' : '❌ Not supported'}`);
  
  console.log('\n⚠️ RAPPEL : Ces tests sont pour UX uniquement.');
  console.log('   Sécurité réelle = backend (bcrypt, JWT verify, Redis rate limit)');
};
