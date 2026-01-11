/**
 * INDEXED DB SERVICE - Persistence Locale
 * 
 * Gère le stockage persistant des données offline
 * Utilisé pour la queue d'actions et le cache local
 */

export interface QueuedAction {
  id: string;
  type: 'CREATE_SHIPMENT' | 'UPDATE_STATUS' | 'ADD_DOCUMENT' | 'ADD_EXPENSE' | 'PAY_LIQUIDATION' | 'UPDATE_ARRIVAL_DATE' | 'SET_DECLARATION' | 'UPDATE_SHIPMENT';
  payload: any;
  timestamp: number;
  retries: number;
  lastError?: string;
}

class IndexedDBService {
  private dbName = 'TransitGuineeDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  /**
   * Initialise la base de données IndexedDB
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error('Échec ouverture IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;

        // Store pour queue d'actions offline
        if (!db.objectStoreNames.contains('offlineQueue')) {
          const queueStore = db.createObjectStore('offlineQueue', { keyPath: 'id' });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
          queueStore.createIndex('type', 'type', { unique: false });
        }

        // Store pour cache shipments
        if (!db.objectStoreNames.contains('shipments')) {
          const shipmentsStore = db.createObjectStore('shipments', { keyPath: 'id' });
          shipmentsStore.createIndex('trackingNumber', 'trackingNumber', { unique: true });
          shipmentsStore.createIndex('status', 'status', { unique: false });
        }

        // Store pour cache customs rates (resilience 3G)
        if (!db.objectStoreNames.contains('customsRates')) {
          db.createObjectStore('customsRates', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Ajoute une action à la queue offline
   */
  async addToQueue(action: QueuedAction): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const request = store.add(action);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Échec ajout queue'));
    });
  }

  /**
   * Récupère toutes les actions en attente
   */
  async getQueuedActions(): Promise<QueuedAction[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readonly');
      const store = transaction.objectStore('offlineQueue');
      const request = store.getAll();

      request.onsuccess = () => {
        const actions = request.result as QueuedAction[];
        // Trier par timestamp (FIFO)
        resolve(actions.sort((a, b) => a.timestamp - b.timestamp));
      };
      request.onerror = () => reject(new Error('Échec lecture queue'));
    });
  }

  /**
   * Supprime une action de la queue
   */
  async removeFromQueue(actionId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const request = store.delete(actionId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Échec suppression queue'));
    });
  }

  /**
   * Met à jour une action (pour incrémenter retries)
   */
  async updateQueuedAction(action: QueuedAction): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const request = store.put(action);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Échec mise à jour action'));
    });
  }

  /**
   * Vide complètement la queue
   */
  async clearQueue(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Échec nettoyage queue'));
    });
  }

  /**
   * Cache un shipment localement
   */
  async cacheShipment(shipment: any): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['shipments'], 'readwrite');
      const store = transaction.objectStore('shipments');
      const request = store.put(shipment);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Échec cache shipment'));
    });
  }

  /**
   * Récupère tous les shipments du cache
   */
  async getCachedShipments(): Promise<any[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['shipments'], 'readonly');
      const store = transaction.objectStore('shipments');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Échec lecture cache'));
    });
  }

  /**
   * Obtient le nombre d'actions en attente
   */
  async getQueueSize(): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readonly');
      const store = transaction.objectStore('offlineQueue');
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Échec comptage queue'));
    });
  }

  /**
   * Sauvegarde les taux douaniers dans le cache (resilience 3G)
   */
  async saveCustomsRates(rates: any): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['customsRates'], 'readwrite');
      const store = transaction.objectStore('customsRates');
      const request = store.put({ 
        id: 'current', 
        ...rates, 
        cachedAt: new Date().toISOString() 
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Échec sauvegarde taux douaniers'));
    });
  }

  /**
   * Récupère les taux douaniers depuis le cache
   */
  async getCustomsRates(): Promise<any | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['customsRates'], 'readonly');
      const store = transaction.objectStore('customsRates');
      const request = store.get('current');

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('Échec lecture taux douaniers'));
    });
  }
}

// Instance singleton
export const indexedDB = new IndexedDBService();
export const indexedDBService = indexedDB; // Alias pour imports customs
