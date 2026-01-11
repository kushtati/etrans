/**
 * Vitest Setup File
 * Configuration globale pour tous les tests
 */

import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import '@testing-library/jest-dom';

// ==========================================
// 1. MOCKS GLOBAUX
// ==========================================

// Mock fetch API (Node.js natif depuis v18 mais setup requis)
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
Object.defineProperty(window, 'sessionStorage', { value: localStorageMock });

// Mock IndexedDB (PWA offline storage)
const indexedDBMock = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    result: {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          add: vi.fn(),
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
        })),
      })),
    },
  })),
  deleteDatabase: vi.fn(),
};

Object.defineProperty(window, 'indexedDB', { value: indexedDBMock });

// Mock IntersectionObserver (lucide-react lazy load)
class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: IntersectionObserverMock,
});

// Mock ResizeObserver (recharts graphiques)
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

// Mock matchMedia (responsive design)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock console methods pour tests propres (optionnel)
global.console = {
  ...console,
  // Supprimer logs pendant tests (garde error/warn)
  log: vi.fn(),
  debug: vi.fn(),
  // Garder error/warn pour debugging
  error: console.error,
  warn: console.warn,
};

// ==========================================
// 2. LIFECYCLE HOOKS
// ==========================================

// Avant tous les tests
beforeAll(() => {
  // Configuration globale timezone Guinée
  process.env.TZ = 'Africa/Conakry';
});

// Après chaque test (cleanup)
afterEach(() => {
  // Reset tous les mocks
  vi.clearAllMocks();
  
  // Clear localStorage/sessionStorage
  localStorageMock.clear();
  
  // Reset fetch mock
  (global.fetch as any).mockClear();
  
  // Clear DOM (happy-dom auto-cleanup mais explicite)
  document.body.innerHTML = '';
});

// Après tous les tests
afterAll(() => {
  // Restore mocks (si nécessaire)
  vi.restoreAllMocks();
});

// ==========================================
// 3. CUSTOM MATCHERS (optionnel)
// ==========================================

// Exemple: matcher custom pour tester dates Guinée
// expect.extend({
//   toBeGuineeDate(received: Date) {
//     const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
//     return {
//       pass: timezone === 'Africa/Conakry',
//       message: () => `Expected timezone Africa/Conakry, got ${timezone}`,
//     };
//   },
// });

// ==========================================
// 4. ENVIRONMENT VARIABLES
// ==========================================

// Variables env tests (évite .env.test)
process.env.NODE_ENV = 'test';
process.env.VITE_API_URL = 'http://localhost:3001';
process.env.VITE_LOG_LEVEL = 'error'; // Moins verbose tests
