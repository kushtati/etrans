/**
 * TESTS UNITAIRES - OFFLINE QUEUE
 * 
 * Tests du système de gestion offline avec queue de synchronisation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { offlineQueue } from '../services/offlineQueue';
import { indexedDB as indexedDBService, QueuedAction } from '../services/indexedDBService';

// Mock IndexedDB pour Node.js
const mockDB = new Map<string, any>();

class MockIDBDatabase {
  objectStoreNames = {
    contains: (name: string) => mockDB.has(`store_${name}`)
  };

  transaction(storeNames: string[], mode: string) {
    return new MockIDBTransaction(storeNames, mode);
  }

  createObjectStore(name: string, options: any) {
    mockDB.set(`store_${name}`, new Map());
    return new MockIDBObjectStore(name);
  }
}

class MockIDBTransaction {
  constructor(private storeNames: string[], private mode: string) {}

  objectStore(name: string) {
    return new MockIDBObjectStore(name);
  }
}

class MockIDBObjectStore {
  constructor(private name: string) {}

  add(value: any) {
    const store = mockDB.get(`store_${this.name}`) || new Map();
    store.set(value.id, value);
    mockDB.set(`store_${this.name}`, store);
    return { onsuccess: null, onerror: null };
  }

  get(key: string) {
    const store = mockDB.get(`store_${this.name}`) || new Map();
    const value = store.get(key);
    setTimeout(() => {
      const request = { result: value, onsuccess: null, onerror: null };
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return { result: null, onsuccess: null, onerror: null };
  }

  getAll() {
    const store = mockDB.get(`store_${this.name}`) || new Map();
    const values = Array.from(store.values());
    const request = {
      result: values,
      onsuccess: null as any,
      onerror: null as any
    };
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }

  put(value: any) {
    const store = mockDB.get(`store_${this.name}`) || new Map();
    store.set(value.id, value);
    mockDB.set(`store_${this.name}`, store);
    const request = { onsuccess: null as any, onerror: null as any };
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }

  delete(key: string) {
    const store = mockDB.get(`store_${this.name}`) || new Map();
    store.delete(key);
    const request = { onsuccess: null as any, onerror: null as any };
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }

  clear() {
    mockDB.set(`store_${this.name}`, new Map());
    const request = { onsuccess: null as any, onerror: null as any };
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }

  count() {
    const store = mockDB.get(`store_${this.name}`) || new Map();
    const request = {
      result: store.size,
      onsuccess: null as any,
      onerror: null as any
    };
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }

  createIndex() {
    return {};
  }
}

class MockIDBOpenRequest {
  result: any = null;
  onsuccess: any = null;
  onerror: any = null;
  onupgradeneeded: any = null;

  constructor() {
    setTimeout(() => {
      if (this.onupgradeneeded) {
        this.onupgradeneeded({ target: { result: new MockIDBDatabase() } });
      }
      this.result = new MockIDBDatabase();
      if (this.onsuccess) {
        this.onsuccess();
      }
    }, 0);
  }
}

// Mock global indexedDB
(global as any).window = {
  indexedDB: {
    open: () => new MockIDBOpenRequest()
  }
};

// Mock fetch global
global.fetch = vi.fn();

describe('IndexedDBService', () => {
  beforeEach(async () => {
    mockDB.clear();
    await indexedDBService.init();
    await indexedDBService.clearQueue();
  });

  describe('Queue Operations', () => {
    it('should add action to queue', async () => {
      const action: QueuedAction = {
        id: 'test-1',
        type: 'CREATE_SHIPMENT',
        payload: { trackingNumber: 'TR-001' },
        timestamp: Date.now(),
        retries: 0
      };

      await indexedDBService.addToQueue(action);
      
      const actions = await indexedDBService.getQueuedActions();
      expect(actions).toHaveLength(1);
      expect(actions[0].id).toBe('test-1');
    });

    it('should retrieve queued actions in FIFO order', async () => {
      const action1: QueuedAction = {
        id: 'test-1',
        type: 'CREATE_SHIPMENT',
        payload: {},
        timestamp: 1000,
        retries: 0
      };

      const action2: QueuedAction = {
        id: 'test-2',
        type: 'UPDATE_STATUS',
        payload: {},
        timestamp: 2000,
        retries: 0
      };

      await indexedDBService.addToQueue(action2); // Ajouté en second
      await indexedDBService.addToQueue(action1); // Ajouté en premier

      const actions = await indexedDBService.getQueuedActions();
      
      // Doit être trié par timestamp (FIFO)
      expect(actions[0].id).toBe('test-1');
      expect(actions[1].id).toBe('test-2');
    });

    it('should remove action from queue', async () => {
      const action: QueuedAction = {
        id: 'test-1',
        type: 'CREATE_SHIPMENT',
        payload: {},
        timestamp: Date.now(),
        retries: 0
      };

      await indexedDBService.addToQueue(action);
      await indexedDBService.removeFromQueue('test-1');
      
      const actions = await indexedDBService.getQueuedActions();
      expect(actions).toHaveLength(0);
    });

    it('should update queued action', async () => {
      const action: QueuedAction = {
        id: 'test-1',
        type: 'CREATE_SHIPMENT',
        payload: {},
        timestamp: Date.now(),
        retries: 0
      };

      await indexedDBService.addToQueue(action);
      
      action.retries = 2;
      action.lastError = 'Server error';
      await indexedDBService.updateQueuedAction(action);

      const actions = await indexedDBService.getQueuedActions();
      expect(actions[0].retries).toBe(2);
      expect(actions[0].lastError).toBe('Server error');
    });

    it('should get queue size', async () => {
      await indexedDBService.addToQueue({
        id: 'test-1',
        type: 'CREATE_SHIPMENT',
        payload: {},
        timestamp: Date.now(),
        retries: 0
      });

      await indexedDBService.addToQueue({
        id: 'test-2',
        type: 'UPDATE_STATUS',
        payload: {},
        timestamp: Date.now(),
        retries: 0
      });

      const size = await indexedDBService.getQueueSize();
      expect(size).toBe(2);
    });

    it('should clear entire queue', async () => {
      await indexedDBService.addToQueue({
        id: 'test-1',
        type: 'CREATE_SHIPMENT',
        payload: {},
        timestamp: Date.now(),
        retries: 0
      });

      await indexedDBService.clearQueue();
      
      const size = await indexedDBService.getQueueSize();
      expect(size).toBe(0);
    });
  });

  describe('Shipment Caching', () => {
    it('should cache shipment locally', async () => {
      const shipment = {
        id: 'ship-1',
        trackingNumber: 'TR-001',
        clientName: 'Test Client'
      };

      await indexedDBService.cacheShipment(shipment);
      
      const cached = await indexedDBService.getCachedShipments();
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe('ship-1');
    });

    it('should retrieve all cached shipments', async () => {
      const shipment1 = { id: 'ship-1', trackingNumber: 'TR-001' };
      const shipment2 = { id: 'ship-2', trackingNumber: 'TR-002' };

      await indexedDBService.cacheShipment(shipment1);
      await indexedDBService.cacheShipment(shipment2);

      const cached = await indexedDBService.getCachedShipments();
      expect(cached).toHaveLength(2);
    });
  });
});

describe('OfflineQueueService', () => {
  beforeEach(async () => {
    await offlineQueue.init();
    await offlineQueue.clear();
    vi.clearAllMocks();
  });

  describe('Queue Management', () => {
    it('should add action to queue', async () => {
      const actionId = await offlineQueue.add(
        'CREATE_SHIPMENT',
        { trackingNumber: 'TR-001' }
      );

      expect(actionId).toBeTruthy();
      expect(actionId).toContain('action-');

      const stats = await offlineQueue.getStats();
      expect(stats.pending).toBe(1);
    });

    it('should generate unique action IDs', async () => {
      const id1 = await offlineQueue.add('CREATE_SHIPMENT', {});
      const id2 = await offlineQueue.add('CREATE_SHIPMENT', {});
      
      expect(id1).not.toBe(id2);
    });

    it('should get queue stats', async () => {
      await offlineQueue.add('CREATE_SHIPMENT', {});
      await offlineQueue.add('UPDATE_STATUS', {});

      const stats = await offlineQueue.getStats();
      
      expect(stats.pending).toBe(2);
      expect(stats.processing).toBe(false);
    });

    it('should clear queue', async () => {
      await offlineQueue.add('CREATE_SHIPMENT', {});
      await offlineQueue.add('UPDATE_STATUS', {});

      await offlineQueue.clear();

      const stats = await offlineQueue.getStats();
      expect(stats.pending).toBe(0);
    });
  });

  describe('Flush Operations', () => {
    beforeEach(() => {
      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });
    });

    it('should not flush when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      await offlineQueue.add('CREATE_SHIPMENT', {});
      await offlineQueue.flush();

      const stats = await offlineQueue.getStats();
      expect(stats.pending).toBe(1); // Still pending
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should execute CREATE_SHIPMENT action', async () => {
      const mockShipment = {
        id: 'ship-1',
        trackingNumber: 'TR-001'
      };

      // Mock API success
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await offlineQueue.add('CREATE_SHIPMENT', mockShipment);
      await offlineQueue.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockShipment)
        })
      );

      const stats = await offlineQueue.getStats();
      expect(stats.pending).toBe(0); // Cleared after success
    });

    it('should execute UPDATE_STATUS action', async () => {
      const payload = {
        shipmentId: 'ship-1',
        status: 'IN_TRANSIT'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await offlineQueue.add('UPDATE_STATUS', payload);
      await offlineQueue.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments/ship-1/status',
        expect.objectContaining({
          method: 'PUT'
        })
      );
    });

    it('should execute PAY_LIQUIDATION action', async () => {
      const payload = { shipmentId: 'ship-1' };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await offlineQueue.add('PAY_LIQUIDATION', payload);
      await offlineQueue.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments/ship-1/pay-liquidation',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include'
        })
      );
    });

    it('should remove action after successful execution', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await offlineQueue.add('CREATE_SHIPMENT', {});
      
      const statsBefore = await offlineQueue.getStats();
      expect(statsBefore.pending).toBe(1);

      await offlineQueue.flush();

      const statsAfter = await offlineQueue.getStats();
      expect(statsAfter.pending).toBe(0);
    });
  });

  describe('Retry Logic', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should retry failed action with backoff', async () => {
      let callCount = 0;

      // Mock API failure 2 times, then success
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Server error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      await offlineQueue.add('CREATE_SHIPMENT', {});
      
      const flushPromise = offlineQueue.flush();
      
      // Fast-forward timers for retries
      await vi.runAllTimersAsync();
      await flushPromise;

      expect(callCount).toBe(3); // Initial + 2 retries
    });

    it('should remove action after max retries', async () => {
      // Mock API always fails
      (global.fetch as any).mockRejectedValue(new Error('Server error'));

      await offlineQueue.add('CREATE_SHIPMENT', {});
      
      const flushPromise = offlineQueue.flush();
      await vi.runAllTimersAsync();
      await flushPromise;

      // Should be removed after 3 retries
      const stats = await offlineQueue.getStats();
      expect(stats.pending).toBe(0);
    });

    it('should use exponential backoff for retries', async () => {
      const delays: number[] = [];
      let originalSetTimeout = global.setTimeout;

      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(callback, 0); // Immediate for test
      });

      (global.fetch as any).mockRejectedValue(new Error('Server error'));

      await offlineQueue.add('CREATE_SHIPMENT', {});
      await offlineQueue.flush();

      // Exponential backoff: 1s, 2s (formula: Math.pow(2, retries) * 1000)
      expect(delays[0]).toBe(1000); // First retry
      expect(delays[1]).toBe(2000); // Second retry
    });
  });

  describe('Event Listeners', () => {
    it('should subscribe to queue changes', async () => {
      const mockCallback = vi.fn();
      
      const unsubscribe = offlineQueue.subscribe(mockCallback);
      
      await offlineQueue.add('CREATE_SHIPMENT', {});
      
      expect(mockCallback).toHaveBeenCalled();
      
      unsubscribe();
    });

    it('should unsubscribe from queue changes', async () => {
      const mockCallback = vi.fn();
      
      const unsubscribe = offlineQueue.subscribe(mockCallback);
      unsubscribe();
      
      mockCallback.mockClear();
      await offlineQueue.add('CREATE_SHIPMENT', {});
      
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should notify multiple subscribers', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      offlineQueue.subscribe(callback1);
      offlineQueue.subscribe(callback2);
      
      await offlineQueue.add('CREATE_SHIPMENT', {});
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('Action Types', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });
    });

    it('should handle CREATE_SHIPMENT action', async () => {
      const shipment = { trackingNumber: 'TR-001' };
      
      await offlineQueue.add('CREATE_SHIPMENT', shipment);
      await offlineQueue.flush();
      
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(shipment)
        })
      );
    });

    it('should handle UPDATE_STATUS action', async () => {
      const payload = { shipmentId: 'ship-1', status: 'DELIVERED' };
      
      await offlineQueue.add('UPDATE_STATUS', payload);
      await offlineQueue.flush();
      
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments/ship-1/status',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should handle ADD_DOCUMENT action', async () => {
      const payload = {
        shipmentId: 'ship-1',
        document: { type: 'BL', fileUrl: 'url' }
      };
      
      await offlineQueue.add('ADD_DOCUMENT', payload);
      await offlineQueue.flush();
      
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments/ship-1/documents',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle ADD_EXPENSE action', async () => {
      const payload = {
        shipmentId: 'ship-1',
        expense: { description: 'Frais', amount: 50000 }
      };
      
      await offlineQueue.add('ADD_EXPENSE', payload);
      await offlineQueue.flush();
      
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments/ship-1/expenses',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle PAY_LIQUIDATION action', async () => {
      const payload = { shipmentId: 'ship-1' };
      
      await offlineQueue.add('PAY_LIQUIDATION', payload);
      await offlineQueue.flush();
      
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments/ship-1/pay-liquidation',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include'
        })
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'onLine', { value: true });
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await offlineQueue.add('CREATE_SHIPMENT', {});
      await offlineQueue.flush();

      const stats = await offlineQueue.getStats();
      expect(stats.lastError).toBe('Network error');
    });

    it('should handle server errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Server error 500'));

      await offlineQueue.add('CREATE_SHIPMENT', {});
      await offlineQueue.flush();

      const stats = await offlineQueue.getStats();
      expect(stats.lastError).toContain('500');
    });

    it('should continue with next action if one fails', async () => {
      // First action fails
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        });
      });

      await offlineQueue.add('CREATE_SHIPMENT', { id: 'ship-1' });
      await offlineQueue.add('CREATE_SHIPMENT', { id: 'ship-2' });

      await offlineQueue.flush();

      // Second action should have been attempted despite first failure
      expect(callCount).toBeGreaterThan(1);
      const stats = await offlineQueue.getStats();
      expect(stats.pending).toBe(1); // ship-2 succeeded, ship-1 still pending/removed
    });
  });

  describe('Performance', () => {
    it('should handle large queue efficiently', async () => {
      // Add 100 actions
      const promises = Array.from({ length: 100 }, (_, i) =>
        offlineQueue.add('CREATE_SHIPMENT', { id: `ship-${i}` })
      );

      await Promise.all(promises);

      const stats = await offlineQueue.getStats();
      expect(stats.pending).toBe(100);
    });

    it('should batch process queue items', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      // Add multiple actions
      await offlineQueue.add('CREATE_SHIPMENT', { id: 'ship-1' });
      await offlineQueue.add('CREATE_SHIPMENT', { id: 'ship-2' });
      await offlineQueue.add('CREATE_SHIPMENT', { id: 'ship-3' });

      const startTime = Date.now();
      await offlineQueue.flush();
      const duration = Date.now() - startTime;

      // Should complete quickly (all in one flush) - 5s timeout for slow CI
      expect(duration).toBeLessThan(5000);

      const stats = await offlineQueue.getStats();
      expect(stats.pending).toBe(0);
    });
  });
});
