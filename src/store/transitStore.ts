/**
 * ZUSTAND STORE - Alternative Performante au Context
 * 
 * Store Zustand pour gestion d'état ultra-performante
 * Migration progressive possible depuis Context
 * 
 * Avantages Zustand:
 * - ✅ Re-renders minimaux (selectors automatiques)
 * - ✅ Pas de Provider wrapper
 * - ✅ DevTools intégrés
 * - ✅ Persistence simple
 * - ✅ TypeScript natif
 * - ✅ Middleware (persist, devtools, immer)
 * 
 * Migration:
 * 1. Commencer par un module (ex: auth)
 * 2. Tester performances
 * 3. Migrer progressivement autres modules
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { Shipment, ShipmentStatus, Role, Document, Expense, DeliveryInfo } from '../types';
import * as api from '../services/apiService';
import { logger } from '../services/logger';
import { offlineQueue } from '../services/offlineQueue';

// ============================================
// TYPES
// ============================================

interface TransitState {
  // État
  shipments: Shipment[];
  role: Role;
  currentUserId: string;
  isOffline: boolean;
  loading: boolean;
  error: string | null;
  
  // Actions
  setShipments: (shipments: Shipment[]) => void;
  setRole: (role: Role) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleOffline: () => void;
  
  // Actions Shipments
  addShipment: (shipment: Shipment) => Promise<void>;
  updateShipmentStatus: (
    shipmentId: string, 
    newStatus: ShipmentStatus, 
    deliveryInfo?: DeliveryInfo
  ) => Promise<void>;
  addDocument: (shipmentId: string, document: Document) => Promise<void>;
  addExpense: (shipmentId: string, expense: Expense) => Promise<void>;
  payLiquidation: (shipmentId: string) => Promise<{ success: boolean; message: string }>;
  
  // Async Actions
  fetchShipments: () => Promise<void>;
  
  // Selectors (computed)
  getShipmentById: (id: string) => Shipment | undefined;
  getShipmentsByStatus: (status: ShipmentStatus) => Shipment[];
  getShipmentsCount: () => number;
}

// ============================================
// STORE CONFIGURATION
// ============================================

export const useTransitStore = create<TransitState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // État initial
        shipments: [],
        role: Role.CLIENT,
        currentUserId: 'user-default',
        isOffline: false,
        loading: false,
        error: null,

        // ============================================
        // SETTERS SIMPLES
        // ============================================

        setShipments: (shipments) => {
          set({ shipments });
        },

        setRole: (role) => {
          set({ role });
          logger.info('Role changed', { role });
        },

        setLoading: (loading) => {
          set({ loading });
        },

        setError: (error) => {
          set({ error });
        },

        toggleOffline: () => {
          set((state) => {
            state.isOffline = !state.isOffline;
          });
        },

        // ============================================
        // ACTIONS ASYNC
        // ============================================

        /**
         * Charger les dossiers depuis l'API
         */
        fetchShipments: async () => {
          set({ loading: true, error: null });
          
          try {
            const shipments = await api.fetchShipments();
            set({ shipments, loading: false });
            logger.info('Shipments loaded', { count: shipments.length });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            set({ error: message, loading: false });
            logger.error('Failed to load shipments', err);
          }
        },

        /**
         * Créer un nouveau dossier
         */
        addShipment: async (newShipment) => {
          // Optimistic update
          set((state) => {
            state.shipments.unshift(newShipment);
          });
          
          logger.info('Optimistic: Dossier créé', { id: newShipment.id });

          try {
            if (!navigator.onLine) {
              await offlineQueue.add('CREATE_SHIPMENT', newShipment);
              logger.warn('Dossier créé en mode offline - sync différé');
              return;
            }

            const created = await api.createShipment(newShipment);
            
            // Remplacer par données serveur
            set((state) => {
              const index = state.shipments.findIndex(s => s.id === newShipment.id);
              if (index !== -1) {
                state.shipments[index] = created;
              }
            });
            
            logger.audit('Dossier créé et synchronisé', { 
              id: created.id, 
              tracking: created.trackingNumber 
            });

          } catch (err: unknown) {
            // Rollback
            set((state) => {
              state.shipments = state.shipments.filter(s => s.id !== newShipment.id);
            });
            
            logger.error('Échec création dossier - rollback', err);
            throw err;
          }
        },

        /**
         * Mettre à jour le statut d'un dossier
         */
        updateShipmentStatus: async (shipmentId, newStatus, deliveryInfo) => {
          const shipmentToUpdate = get().shipments.find(s => s.id === shipmentId);
          
          if (!shipmentToUpdate) {
            throw new Error('Dossier introuvable');
          }
          
          // Deep clone for complete rollback (including deliveryInfo)
          const previousShipment = structuredClone(shipmentToUpdate);

          // Optimistic update
          set((state) => {
            const shipment = state.shipments.find(s => s.id === shipmentId);
            if (shipment) {
              shipment.status = newStatus;
              if (deliveryInfo) {
                shipment.deliveryInfo = deliveryInfo;
              }
            }
          });
          
          logger.info('Optimistic: Statut changé', { shipmentId, status: newStatus });

          try {
            if (!navigator.onLine) {
              await offlineQueue.add('UPDATE_STATUS', { 
                shipmentId, 
                status: newStatus, 
                deliveryInfo 
              });
              logger.warn('Statut changé en mode offline - sync différé');
              return;
            }

            const updated = await api.updateShipmentStatus(shipmentId, newStatus, deliveryInfo);
            
            // Sync avec données serveur
            set((state) => {
              const index = state.shipments.findIndex(s => s.id === shipmentId);
              if (index !== -1) {
                state.shipments[index] = updated;
              }
            });
            
            logger.audit('Statut changé et synchronisé', { shipmentId, status: newStatus });

          } catch (err: unknown) {
            // Rollback with deep cloned previous state
            set((state) => {
              const index = state.shipments.findIndex(s => s.id === shipmentId);
              if (index !== -1) {
                state.shipments[index] = previousShipment;
              }
            });
            
            logger.error('Échec changement statut - rollback', err);
            throw err;
          }
        },

        /**
         * Ajouter un document
         */
        addDocument: async (shipmentId, document) => {
          try {
            const created = await api.addDocumentToShipment(shipmentId, document);
            
            set((state) => {
              const shipment = state.shipments.find(s => s.id === shipmentId);
              if (shipment) {
                shipment.documents.push(created);
              }
            });
            
            logger.info('Document ajouté', { shipmentId, type: document.type });
          } catch (err: unknown) {
            logger.error('Failed to add document', err);
            throw err;
          }
        },

        /**
         * Ajouter une dépense
         */
        addExpense: async (shipmentId, expense) => {
          try {
            const created = await api.addExpense(shipmentId, expense);
            
            set((state) => {
              const shipment = state.shipments.find(s => s.id === shipmentId);
              if (shipment) {
                shipment.expenses.push(created);
              }
            });
            
            logger.audit('Transaction Financière', { 
              shipmentId, 
              amount: expense.amount, 
              type: expense.type 
            });
          } catch (err: unknown) {
            logger.error('Failed to add expense', err);
            throw err;
          }
        },

        /**
         * Payer liquidation douane
         */
        payLiquidation: async (shipmentId) => {
          const shipment = get().shipments.find(s => s.id === shipmentId);
          
          if (!shipment) {
            return { success: false, message: 'Dossier introuvable' };
          }

          // TODO: Ajouter validation PaymentService

          try {
            // Use apiService for consistent auth and error handling
            const data = await api.payLiquidation(shipmentId);
            
            // Update avec données serveur
            set((state) => {
              const index = state.shipments.findIndex(s => s.id === shipmentId);
              if (index !== -1 && data.updatedShipment) {
                state.shipments[index] = data.updatedShipment;
              }
            });

            return { success: true, message: data.message || 'Paiement effectué avec succès' };

          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Erreur paiement';
            logger.error('Payment error', err);
            return { success: false, message };
          }
        },

        // ============================================
        // SELECTORS
        // ============================================

        /**
         * Obtenir un dossier par ID
         */
        getShipmentById: (id) => {
          return get().shipments.find(s => s.id === id);
        },

        /**
         * Obtenir dossiers par statut
         */
        getShipmentsByStatus: (status) => {
          return get().shipments.filter(s => s.status === status);
        },

        /**
         * Compteur total
         */
        getShipmentsCount: () => {
          return get().shipments.length;
        }
      })),
      {
        name: 'transit-storage', // Nom dans localStorage
        partialize: (state) => ({
          // Persister seulement certains états
          role: state.role,
          currentUserId: state.currentUserId
          // isOffline NON persisté (détecté dynamiquement via navigator.onLine)
          // shipments NON persisté (vient de l'API)
        })
      }
    ),
    { name: 'TransitStore' } // Nom dans DevTools
  )
);

// ============================================
// HOOKS SELECTORS OPTIMISÉS
// ============================================

/**
 * Hook: Dossier par ID (re-render seulement si CE dossier change)
 */
export const useShipment = (id: string) => {
  return useTransitStore(
    (state) => state.shipments.find(s => s.id === id)
  );
};

/**
 * Hook: Dossiers par statut
 */
export const useShipmentsByStatus = (status: ShipmentStatus) => {
  return useTransitStore(
    (state) => state.shipments.filter(s => s.status === status)
  );
};

/**
 * Hook: Compteur (re-render seulement si count change)
 */
export const useShipmentsCount = () => {
  return useTransitStore((state) => state.shipments.length);
};

/**
 * Hook: Actions seulement (jamais de re-render)
 */
export const useShipmentActions = () => {
  return useTransitStore((state) => ({
    addShipment: state.addShipment,
    updateShipmentStatus: state.updateShipmentStatus,
    addDocument: state.addDocument,
    addExpense: state.addExpense,
    payLiquidation: state.payLiquidation
  }));
};

/**
 * Hook: État auth
 */
export const useAuth = () => {
  return useTransitStore((state) => ({
    role: state.role,
    userId: state.currentUserId
  }));
};

// ============================================
// EXEMPLES D'UTILISATION
// ============================================

/**
 * EXEMPLE 1: Composant avec données
 * 
 * const ShipmentCard = ({ id }) => {
 *   // Re-render seulement si CE dossier change
 *   const shipment = useShipment(id);
 *   
 *   if (!shipment) return null;
 *   
 *   return <div>{shipment.trackingNumber}</div>;
 * };
 */

/**
 * EXEMPLE 2: Composant compteur
 * 
 * const StatsBadge = () => {
 *   // Re-render seulement si COUNT change
 *   const count = useShipmentsCount();
 *   
 *   return <span>{count} dossiers</span>;
 * };
 */

/**
 * EXEMPLE 3: Composant actions (pas de data)
 * 
 * const CreateButton = () => {
 *   // JAMAIS de re-render (actions stables)
 *   const { addShipment } = useShipmentActions();
 *   
 *   return <button onClick={() => addShipment(...)}>Créer</button>;
 * };
 */

/**
 * EXEMPLE 4: Utilisation directe (hors React)
 * 
 * // Dans un service ou middleware
 * const count = useTransitStore.getState().getShipmentsCount();
 * useTransitStore.getState().addShipment(newShipment);
 */
