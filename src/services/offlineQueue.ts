/**
 * OFFLINE QUEUE SERVICE - Synchronisation Différée
 * 
 * Gère la queue d'actions à exécuter quand la connexion est rétablie
 * Persistance via IndexedDB pour survie aux rechargements
 * 
 * Architecture:
 * 1. Actions ajoutées à la queue quand offline
 * 2. Persistance automatique dans IndexedDB
 * 3. Flush automatique quand connexion rétablie
 * 4. Retry avec backoff exponentiel
 */

import { indexedDB, QueuedAction } from './indexedDBService';
import { logger } from './logger';
import * as api from './apiService';

export interface QueueStats {
  pending: number;
  processing: boolean;
  lastSync: Date | null;
  lastError: string | null;
}

class OfflineQueueService {
  private processing = false;
  private maxRetries = 3;
  private retryDelay = 1000; // 1s initial
  private listeners: Array<() => void> = [];

  /**
   * Initialise le service
   */
  async init(): Promise<void> {
    await indexedDB.init();
    logger.info('OfflineQueue initialized');

    // Auto-flush si des actions en attente
    const size = await this.getSize();
    if (size > 0 && navigator.onLine) {
      logger.info('Pending actions detected, starting sync', { count: size });
      this.flush();
    }
  }

  /**
   * Ajoute une action à la queue
   * 
   * @param type - Type d'action
   * @param payload - Données de l'action
   * @returns ID de l'action
   */
  async add(
    type: QueuedAction['type'],
    payload: any
  ): Promise<string> {
    const action: QueuedAction = {
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
      retries: 0
    };

    await indexedDB.addToQueue(action);
    
    logger.info('Action queued for offline sync', {
      id: action.id,
      type: action.type
    });

    this.notifyListeners();

    // Tenter flush si online
    if (navigator.onLine && !this.processing) {
      this.flush();
    }

    return action.id;
  }

  /**
   * Exécute toutes les actions en attente
   * 
   * FIFO: First In First Out
   * Retry avec backoff exponentiel
   */
  async flush(): Promise<void> {
    if (this.processing) {
      logger.warn('Flush already in progress');
      return;
    }

    if (!navigator.onLine) {
      logger.warn('Cannot flush offline');
      return;
    }

    this.processing = true;
    this.notifyListeners();

    try {
      const actions = await indexedDB.getQueuedActions();

      logger.info('Starting queue flush', { count: actions.length });

      for (const action of actions) {
        try {
          await this.executeAction(action);
          
          // Succès - Supprimer de la queue
          await indexedDB.removeFromQueue(action.id);
          
          logger.info('Action executed successfully', {
            id: action.id,
            type: action.type
          });

        } catch (err: any) {
          // Échec - Incrémenter retry counter
          action.retries++;
          action.lastError = err.message;

          if (action.retries >= this.maxRetries) {
            // Max retries atteint - Notifier utilisateur avant suppression
            logger.error('Action failed after max retries - DATA LOSS', {
              id: action.id,
              type: action.type,
              retries: action.retries,
              error: err.message,
              payload: action.payload
            });
            
            // TODO: Afficher notification utilisateur (toast/alert)
            // TODO: Sauvegarder dans table "failed_actions" pour review manuel

            await indexedDB.removeFromQueue(action.id);
          } else {
            // Retry plus tard
            await indexedDB.updateQueuedAction(action);
            
            logger.warn('Action failed, will retry', {
              id: action.id,
              type: action.type,
              retries: action.retries,
              error: err.message
            });

            // Backoff exponentiel
            const delay = this.retryDelay * Math.pow(2, action.retries - 1);
            await this.sleep(delay);
          }
        }
      }

      logger.info('Queue flush completed');

    } catch (err: any) {
      logger.error('Queue flush error', { error: err.message });
    } finally {
      this.processing = false;
      this.notifyListeners();
    }
  }

  /**
   * Exécute une action individuelle
   */
  private async executeAction(action: QueuedAction): Promise<void> {
    switch (action.type) {
      case 'CREATE_SHIPMENT':
        await api.createShipment(action.payload);
        break;

      case 'UPDATE_STATUS':
        await api.updateShipmentStatus(
          action.payload.shipmentId,
          action.payload.status,
          action.payload.deliveryInfo
        );
        break;

      case 'ADD_DOCUMENT':
        await api.addDocumentToShipment(
          action.payload.shipmentId,
          action.payload.document
        );
        break;

      case 'ADD_EXPENSE':
        await api.addExpense(
          action.payload.shipmentId,
          action.payload.expense
        );
        break;

      case 'PAY_LIQUIDATION':
        await api.payLiquidation(action.payload.shipmentId);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Obtient les statistiques de la queue
   */
  async getStats(): Promise<QueueStats> {
    const actions = await indexedDB.getQueuedActions();
    const size = actions.length;
    
    const lastAction = actions[actions.length - 1];
    const lastError = lastAction?.lastError || null;

    return {
      pending: size,
      processing: this.processing,
      lastSync: size === 0 ? new Date() : null,
      lastError
    };
  }

  /**
   * Obtient le nombre d'actions en attente
   */
  async getSize(): Promise<number> {
    return indexedDB.getQueueSize();
  }

  /**
   * Vide la queue (DANGER: Perte de données)
   */
  async clear(): Promise<void> {
    logger.warn('Clearing offline queue - DATA LOSS!');
    await indexedDB.clearQueue();
    this.notifyListeners();
  }

  /**
   * S'abonne aux changements de la queue
   */
  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    
    // Retourne fonction de désabonnement
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notifie les listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(cb => cb());
  }

  /**
   * Utilitaire sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Instance singleton
export const offlineQueue = new OfflineQueueService();

// Auto-initialisation
if (typeof window !== 'undefined') {
  offlineQueue.init().catch(err => {
    logger.error('Failed to initialize offline queue', err);
  });

  // Listener online/offline
  window.addEventListener('online', () => {
    logger.info('Network connection restored, flushing queue');
    offlineQueue.flush();
  });

  window.addEventListener('offline', () => {
    logger.warn('Network connection lost, switching to offline mode');
  });
}
