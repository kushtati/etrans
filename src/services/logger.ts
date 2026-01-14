
/**
 * 📊 Service de Logging Enterprise Grade
 * 
 * Fonctionnalités :
 * - Logs console (dev) + backend (prod)
 * - Tracking userId + sessionId + role
 * - Persistance logs critiques (error/audit)
 * - Fire-and-forget (navigator.sendBeacon)
 * - Niveaux configurables (filtrage)
 * - Buffer batch (optimisation réseau)
 */

import { LOG_CONFIG, LOG_LEVELS, type LogLevel, shouldLogLevel } from '../config/logger.config';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: any;
  user: string;       // userId unique
  role: string;       // Role utilisateur
  sessionId: string;  // Session ID conversation (si dispo)
}

/**
 * Récupère userId depuis sessionStorage
 * Fallback si sessionStorage indisponible (Safari private mode)
 * Validation UUID v4 pour éviter corruption logs
 */
const getCurrentUserId = (): string => {
  try {
    const userId = sessionStorage.getItem('userId');
    if (!userId) return 'ANONYMOUS';
    
    // Valider format UUID v4 (8-4-4-4-12)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return 'INVALID_FORMAT';
    }
    
    return userId;
  } catch (err) {
    return 'UNAVAILABLE';
  }
};

/**
 * Récupère rôle utilisateur depuis sessionStorage
 * Fallback si sessionStorage indisponible
 */
const getCurrentUserRole = (): string => {
  try {
    return sessionStorage.getItem('currentUserRole') || 'UNKNOWN';
  } catch (err) {
    return 'UNAVAILABLE';
  }
};

/**
 * Récupère sessionId conversation (si dispo)
 * Fallback si sessionStorage indisponible
 */
const getSessionId = (): string => {
  try {
    return sessionStorage.getItem('chatSessionId') || 'NO_SESSION';
  } catch (err) {
    return 'UNAVAILABLE';
  }
};

class Logger {
  private buffer: LogEntry[] = [];

  /**
   * Vérifier si un niveau doit être loggé
   */
  private shouldLog(level: LogLevel): boolean {
    return shouldLogLevel(level, LOG_CONFIG.minLevel);
  }

  /**
   * Envoie log vers backend (fire-and-forget)
   * Fallback fetch si sendBeacon échoue (offline/CORS)
   */
  private async sendToBackend(entry: LogEntry): Promise<void> {
    try {
      // navigator.sendBeacon = Fire-and-forget (ne bloque pas l'app)
      const blob = new Blob([JSON.stringify(entry)], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/logs', blob);
      
      // Fallback fetch si sendBeacon fail
      if (!sent) {
        await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
          keepalive: true
        }).catch(() => {});
      }
    } catch (err) {
      // Fail silently (ne pas casser l'app si logging échoue)
    }
  }

  /**
   * Ajouter log au buffer et flush si plein
   */
  private addToBuffer(entry: LogEntry): void {
    this.buffer.push(entry);

    // Flush si buffer plein
    if (this.buffer.length >= LOG_CONFIG.maxBufferSize) {
      this.flushBuffer();
    }
  }

  /**
   * Envoyer buffer complet vers backend (batch)
   * Chunker par 100 logs max pour éviter limite sendBeacon (64KB)
   */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    try {
      const logs = [...this.buffer];
      this.buffer = [];

      // Chunker par paquets de 100 logs
      const CHUNK_SIZE = 100;
      for (let i = 0; i < logs.length; i += CHUNK_SIZE) {
        const chunk = logs.slice(i, i + CHUNK_SIZE);
        const blob = new Blob([JSON.stringify({ logs: chunk })], { type: 'application/json' });
        navigator.sendBeacon('/api/logs/batch', blob);
      }
    } catch (err) {
      // Fail silently
    }
  }

  /**
   * Retourne style console selon level
   */
  private getStyle(level: LogLevel): string {
    const styles: Record<LogLevel, string> = {
      info: 'color: #0f172a;',
      warn: 'color: orange; font-weight: bold;',
      error: 'color: red; font-weight: bold;',
      audit: 'color: purple; font-weight: bold;'
    };
    return styles[level];
  }

  private log(level: LogLevel, message: string, context?: any) {
    // ✅ Filtrer selon niveau minimum configuré
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message,
      context,
      user: getCurrentUserId(),
      role: getCurrentUserRole(),
      sessionId: getSessionId()
    };

    // 🔍 DEV : Logs console
    if (import.meta.env.DEV) {
      const style = this.getStyle(level);
      console.log(`%c[${level.toUpperCase()}] ${message}`, style, context || '');
    }

    // 🚀 PRODUCTION : Envoi backend
    if (LOG_CONFIG.sendToBackend) {
      // Audit : Envoi immédiat (critique)
      if (level === 'audit') {
        this.sendToBackend(entry);
      } 
      // Autres : Buffer + batch
      else if (level !== 'info') {
        this.addToBuffer(entry);
      }
    }
  }

  info(message: string, context?: any) {
    this.log('info', message, context);
  }

  warn(message: string, context?: any) {
    this.log('warn', message, context);
  }

  error(message: string, context?: any) {
    this.log('error', message, context);
  }

  // Log spécifique pour les actions sensibles (Paiements, Changement Statut)
  audit(action: string, details: any) {
    this.log('audit', `AUDIT_TRAIL: ${action}`, details);
  }

  // Debug logs (DEV uniquement)
  debug(message: string, context?: any) {
    if (import.meta.env.DEV) {
      this.log('info', `[DEBUG] ${message}`, context);
    }
  }

  /**
   * Force flush du buffer (utile avant unload page)
   */
  flush(): void {
    this.flushBuffer();
  }
}

export const logger = new Logger();

// ✅ Flush buffer avant fermeture page
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    logger.flush();
  });
}
