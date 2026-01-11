/**
 * 📊 Configuration Logger
 * 
 * Paramètres :
 * - minLevel : Niveau minimum de log (filtrage)
 * - sendToBackend : Activer envoi backend
 * - maxBufferSize : Taille buffer avant flush
 */

import { LOGGER_CONFIG, IS_PRODUCTION } from './environment';

export type LogLevel = 'info' | 'warn' | 'error' | 'audit';

export interface LoggerConfig {
  minLevel: LogLevel;
  sendToBackend: boolean;
  maxBufferSize: number;
}

/**
 * Configuration par défaut
 */
export const LOG_CONFIG: LoggerConfig = {
  // Réutiliser configuration d'environment.ts
  minLevel: LOGGER_CONFIG.logLevel as LogLevel,
  
  // Backend uniquement en production (depuis environment.ts)
  sendToBackend: LOGGER_CONFIG.enableRemote,
  
  // Buffer optimisé pour réseau 3G Guinée (50 au lieu de 100)
  maxBufferSize: import.meta.env.VITE_LOG_BUFFER_SIZE 
    ? parseInt(import.meta.env.VITE_LOG_BUFFER_SIZE, 10)
    : 50
};

/**
 * Index des niveaux pour comparaison
 */
export const LOG_LEVELS: Record<LogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
  audit: 3
};

/**
 * Vérifier si un niveau doit être loggé
 */
export const shouldLogLevel = (level: LogLevel, minLevel: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
};

/**
 * Valider qu'une chaîne est un LogLevel valide
 */
export const validateLogLevel = (level: string): level is LogLevel => {
  return ['info', 'warn', 'error', 'audit'].includes(level);
};

/**
 * Convertir logLevel d'environment vers LogLevel local
 */
export const parseLogLevel = (level: string): LogLevel => {
  if (validateLogLevel(level)) return level;
  console.warn(`[Logger] Niveau invalide "${level}", fallback sur "info"`);
  return 'info';
};
