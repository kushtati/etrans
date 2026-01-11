/**
 * 🧪 Tests Logger Config
 */

import { describe, it, expect } from 'vitest';
import { LOG_CONFIG, LOG_LEVELS, shouldLogLevel, type LogLevel } from './config/logger.config';

describe('Logger Config', () => {
  describe('LOG_CONFIG', () => {
    it('contient minLevel, sendToBackend, maxBufferSize', () => {
      expect(LOG_CONFIG).toHaveProperty('minLevel');
      expect(LOG_CONFIG).toHaveProperty('sendToBackend');
      expect(LOG_CONFIG).toHaveProperty('maxBufferSize');
    });

    it('minLevel est un LogLevel valide', () => {
      const validLevels: LogLevel[] = ['info', 'warn', 'error', 'audit'];
      expect(validLevels).toContain(LOG_CONFIG.minLevel);
    });

    it('sendToBackend est boolean', () => {
      expect(typeof LOG_CONFIG.sendToBackend).toBe('boolean');
    });

    it('maxBufferSize est number positif', () => {
      expect(typeof LOG_CONFIG.maxBufferSize).toBe('number');
      expect(LOG_CONFIG.maxBufferSize).toBeGreaterThan(0);
    });
  });

  describe('LOG_LEVELS', () => {
    it('contient 4 niveaux avec index croissant', () => {
      expect(LOG_LEVELS.info).toBe(0);
      expect(LOG_LEVELS.warn).toBe(1);
      expect(LOG_LEVELS.error).toBe(2);
      expect(LOG_LEVELS.audit).toBe(3);
    });

    it('ordre croissant de sévérité', () => {
      expect(LOG_LEVELS.info).toBeLessThan(LOG_LEVELS.warn);
      expect(LOG_LEVELS.warn).toBeLessThan(LOG_LEVELS.error);
      expect(LOG_LEVELS.error).toBeLessThan(LOG_LEVELS.audit);
    });
  });

  describe('shouldLogLevel', () => {
    it('info avec minLevel=info → true', () => {
      expect(shouldLogLevel('info', 'info')).toBe(true);
    });

    it('info avec minLevel=warn → false', () => {
      expect(shouldLogLevel('info', 'warn')).toBe(false);
    });

    it('warn avec minLevel=info → true', () => {
      expect(shouldLogLevel('warn', 'info')).toBe(true);
    });

    it('warn avec minLevel=warn → true', () => {
      expect(shouldLogLevel('warn', 'warn')).toBe(true);
    });

    it('warn avec minLevel=error → false', () => {
      expect(shouldLogLevel('warn', 'error')).toBe(false);
    });

    it('error avec minLevel=info → true', () => {
      expect(shouldLogLevel('error', 'info')).toBe(true);
    });

    it('error avec minLevel=warn → true', () => {
      expect(shouldLogLevel('error', 'warn')).toBe(true);
    });

    it('error avec minLevel=error → true', () => {
      expect(shouldLogLevel('error', 'error')).toBe(true);
    });

    it('error avec minLevel=audit → false', () => {
      expect(shouldLogLevel('error', 'audit')).toBe(false);
    });

    it('audit avec minLevel=info → true', () => {
      expect(shouldLogLevel('audit', 'info')).toBe(true);
    });

    it('audit avec minLevel=warn → true', () => {
      expect(shouldLogLevel('audit', 'warn')).toBe(true);
    });

    it('audit avec minLevel=error → true', () => {
      expect(shouldLogLevel('audit', 'error')).toBe(true);
    });

    it('audit avec minLevel=audit → true', () => {
      expect(shouldLogLevel('audit', 'audit')).toBe(true);
    });
  });

  describe('Filtrage par niveau', () => {
    it('minLevel=info : tous les logs passent', () => {
      expect(shouldLogLevel('info', 'info')).toBe(true);
      expect(shouldLogLevel('warn', 'info')).toBe(true);
      expect(shouldLogLevel('error', 'info')).toBe(true);
      expect(shouldLogLevel('audit', 'info')).toBe(true);
    });

    it('minLevel=warn : info bloqué, autres passent', () => {
      expect(shouldLogLevel('info', 'warn')).toBe(false);
      expect(shouldLogLevel('warn', 'warn')).toBe(true);
      expect(shouldLogLevel('error', 'warn')).toBe(true);
      expect(shouldLogLevel('audit', 'warn')).toBe(true);
    });

    it('minLevel=error : info/warn bloqués, error/audit passent', () => {
      expect(shouldLogLevel('info', 'error')).toBe(false);
      expect(shouldLogLevel('warn', 'error')).toBe(false);
      expect(shouldLogLevel('error', 'error')).toBe(true);
      expect(shouldLogLevel('audit', 'error')).toBe(true);
    });

    it('minLevel=audit : seulement audit passe', () => {
      expect(shouldLogLevel('info', 'audit')).toBe(false);
      expect(shouldLogLevel('warn', 'audit')).toBe(false);
      expect(shouldLogLevel('error', 'audit')).toBe(false);
      expect(shouldLogLevel('audit', 'audit')).toBe(true);
    });
  });

  describe('Use cases réels', () => {
    it('DEV : minLevel=info (tout logger)', () => {
      const minLevel: LogLevel = 'info';
      
      // Simulation logs dev
      const devLogs: LogLevel[] = ['info', 'warn', 'error', 'audit'];
      const passed = devLogs.filter(level => shouldLogLevel(level, minLevel));
      
      expect(passed).toHaveLength(4);
      expect(passed).toEqual(['info', 'warn', 'error', 'audit']);
    });

    it('PROD : minLevel=warn (ignorer info)', () => {
      const minLevel: LogLevel = 'warn';
      
      // Simulation logs prod
      const prodLogs: LogLevel[] = ['info', 'info', 'warn', 'error', 'audit'];
      const passed = prodLogs.filter(level => shouldLogLevel(level, minLevel));
      
      expect(passed).toHaveLength(3);
      expect(passed).toEqual(['warn', 'error', 'audit']);
    });

    it('PROD STRICT : minLevel=error (seulement erreurs critiques)', () => {
      const minLevel: LogLevel = 'error';
      
      const logs: LogLevel[] = ['info', 'warn', 'error', 'audit'];
      const passed = logs.filter(level => shouldLogLevel(level, minLevel));
      
      expect(passed).toHaveLength(2);
      expect(passed).toEqual(['error', 'audit']);
    });
  });
});
