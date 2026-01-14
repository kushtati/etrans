/**
 * HOOKS OPTIMISÉS - Context Selectors
 * 
 * Hooks sélecteurs pour éviter re-renders inutiles
 * Permet de s'abonner seulement aux données nécessaires
 * 
 * Performance:
 * - useContext(TransitContext) → Re-render à chaque changement
 * - useShipments() → Re-render seulement si shipments change
 * - useShipmentById(id) → Re-render seulement si CE dossier change
 */

import { useContext, useMemo } from 'react';
import { TransitContext } from '../context/transitContext';
import { Shipment, ShipmentStatus, Role } from '../types';
import { logger } from '../services/logger';

// ============================================
// HOOKS DONNÉES
// ============================================

/**
 * Hook: Liste complète des dossiers
 * 
 * Re-render: À chaque changement de shipments
 * Usage: Dashboard, liste complète
 */
export const useShipments = (): Shipment[] => {
  const context = useContext(TransitContext);
  
  try {
    if (!context || !context.shipments) {
      logger.warn('useShipments: context invalide - retourne tableau vide');
      return [];
    }
    return context.shipments;
  } catch (error) {
    logger.error('useShipments: erreur', { error });
    return [];
  }
};

/**
 * Hook: Dossier individuel par ID
 * 
 * Re-render: Seulement si CE dossier change (optimisé)
 * Usage: Détail d'un dossier spécifique
 * 
 * @param shipmentId - ID du dossier
 * @returns Dossier ou undefined
 */
export const useShipmentById = (shipmentId: string): Shipment | undefined => {
  const { shipments } = useContext(TransitContext);
  
  // Cache avec useMemo pour éviter find() O(n) à chaque render
  return useMemo(() => {
    try {
      if (!shipments || !Array.isArray(shipments)) return undefined;
      return shipments.find(s => s.id === shipmentId);
    } catch (error) {
      logger.error('useShipmentById: erreur', { shipmentId, error });
      return undefined;
    }
  }, [shipments, shipmentId]);
};

/**
 * Hook: Dossiers filtrés par statut
 * 
 * Re-render: Si shipments change OU si filtre change
 * Usage: Listes filtrées (statut, etc.)
 * 
 * @param status - Statut à filtrer (optionnel)
 * @returns Liste filtrée
 */
export const useShipmentsByStatus = (status?: ShipmentStatus): Shipment[] => {
  const { shipments } = useContext(TransitContext);
  
  return useMemo(() => {
    if (!status) return shipments;
    return shipments.filter(s => s.status === status);
  }, [shipments, status]);
};

/**
 * Hook: Compteur de dossiers
 * 
 * Re-render: Seulement si COUNT change (pas si contenu change)
 * Usage: Statistiques, badges
 */
export const useShipmentsCount = (): number => {
  const { shipments } = useContext(TransitContext);
  return shipments.length;
};

/**
 * Hook: Compteur par statut
 * 
 * Re-render: Seulement si count de ce statut change
 * Usage: Dashboard stats
 */
export const useShipmentsCountByStatus = (status: ShipmentStatus): number => {
  const { shipments } = useContext(TransitContext);
  
  return useMemo(
    () => shipments.filter(s => s.status === status).length,
    [shipments, status]
  );
};

/**
 * Hook: Dossiers de l'utilisateur courant (clients)
 * 
 * Re-render: Si shipments ou userId change
 * Usage: Vue client (seulement ses dossiers)
 */
export const useMyShipments = (): Shipment[] => {
  const { shipments, currentUserId, role } = useContext(TransitContext);
  
  return useMemo(() => {
    try {
      // Si client, filtrer par userId
      if (role === Role.CLIENT) {
        // SÉCURITÉ CRITIQUE : Valider currentUserId avant filtre
        if (!currentUserId || typeof currentUserId !== 'string') {
          logger.error('useMyShipments: currentUserId manquant pour CLIENT', { role });
          return []; // Retourner vide si userId invalide (évite divulgation)
        }
        return shipments.filter(s => s.userId === currentUserId);
      }
      // Autres rôles voient tout
      return shipments;
    } catch (error) {
      logger.error('useMyShipments: erreur', error);
      return [];
    }
  }, [shipments, currentUserId, role]);
};

// ============================================
// HOOKS ACTIONS (Stables)
// ============================================

/**
 * Hook: Actions seulement (pas de données)
 * 
 * Re-render: JAMAIS (fonctions stables)
 * Usage: Composants qui modifient mais n'affichent pas
 * 
 * @returns Objet avec toutes les actions
 */
export const useShipmentActions = () => {
  const {
    addShipment,
    updateShipmentStatus,
    addDocument,
    addExpense,
    payLiquidation,
    setArrivalDate,
    setDeclarationDetails,
    updateShipmentDetails
  } = useContext(TransitContext);

  // Retourner objet stable (pas de re-création)
  return useMemo(() => ({
    addShipment,
    updateShipmentStatus,
    addDocument,
    addExpense,
    payLiquidation,
    setArrivalDate,
    setDeclarationDetails,
    updateShipmentDetails
  }), [
    addShipment,
    updateShipmentStatus,
    addDocument,
    addExpense,
    payLiquidation,
    setArrivalDate,
    setDeclarationDetails,
    updateShipmentDetails
  ]);
};

// ============================================
// HOOKS ÉTAT APPLICATION
// ============================================

/**
 * Hook: État d'authentification
 * 
 * Re-render: Seulement si role ou userId change
 * Usage: Header, navigation
 */
export const useAuth = () => {
  const { role, currentUserId, currentUserName } = useContext(TransitContext);
  
  return useMemo(() => ({
    role,
    userId: currentUserId,
    userName: currentUserName,
    isAuthenticated: !!currentUserId
  }), [role, currentUserId, currentUserName]);
};

/**
 * Hook: État offline
 * 
 * Re-render: Seulement si isOffline change
 * Usage: Indicateur réseau
 */
export const useOfflineStatus = () => {
  const { isOffline, toggleOffline } = useContext(TransitContext);
  
  return useMemo(() => ({
    isOffline,
    toggleOffline
  }), [isOffline, toggleOffline]);
};

/**
 * Hook: État loading/error
 * 
 * Re-render: Seulement si loading ou error change
 * Usage: Gestion états chargement
 */
export const useLoadingState = () => {
  const { loading, error } = useContext(TransitContext);
  
  return useMemo(() => ({
    loading,
    error,
    isReady: !loading && !error
  }), [loading, error]);
};

// ============================================
// HOOKS STATISTIQUES
// ============================================

/**
 * Hook: Statistiques globales
 * 
 * Re-render: Si stats changent (compteurs)
 * Usage: Dashboard overview
 */
export const useShipmentStats = () => {
  const { shipments } = useContext(TransitContext);
  
  return useMemo(() => {
    const total = shipments.length;
    const byStatus = shipments.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {} as Record<ShipmentStatus, number>);

    return {
      total,
      byStatus,
      opened: byStatus[ShipmentStatus.OPENED] || 0,
      inTransit: byStatus[ShipmentStatus.PRE_CLEARANCE] || 0,
      delivered: byStatus[ShipmentStatus.DELIVERED] || 0
    };
  }, [shipments]);
};

/**
 * Hook: Statistiques financières
 * 
 * Re-render: Si données financières changent
 * Usage: Dashboard comptabilité
 */
export const useFinancialStats = () => {
  const { shipments } = useContext(TransitContext);
  
  return useMemo(() => {
    try {
      let totalProvisions = 0;
      let totalDisbursements = 0;
      let totalPaid = 0;
      let totalUnpaid = 0;

      shipments.forEach(shipment => {
        if (!shipment.expenses || !Array.isArray(shipment.expenses)) return;
        
        shipment.expenses.forEach(expense => {
          // SÉCURITÉ CRITIQUE : Validation montant (cohérence DB CHECK >= 0)
          if (expense.amount == null || !isFinite(expense.amount) || expense.amount < 0) {
            logger.warn('useFinancialStats: montant invalide ignoré', { 
              shipmentId: shipment.id, 
              expense 
            });
            return; // Skip cet expense
          }
          
          if (expense.type === 'PROVISION') {
            totalProvisions += expense.amount;
          } else if (expense.type === 'DISBURSEMENT') {
            totalDisbursements += expense.amount;
            if (expense.paid) {
              totalPaid += expense.amount;
            } else {
              totalUnpaid += expense.amount;
            }
          }
        });
      });

      return {
        totalProvisions,
        totalDisbursements,
        totalPaid,
        totalUnpaid,
        balance: totalProvisions - totalDisbursements
      };
    } catch (error) {
      logger.error('useFinancialStats: erreur calcul', error);
      return {
        totalProvisions: 0,
        totalDisbursements: 0,
        totalPaid: 0,
        totalUnpaid: 0,
        balance: 0
      };
    }
  }, [shipments]);
};

// ============================================
// HOOKS RECHERCHE
// ============================================

/**
 * Hook: Recherche dossiers
 * 
 * Re-render: Si shipments ou query change
 * Usage: Barre de recherche
 * 
 * @param query - Terme de recherche
 * @returns Dossiers correspondants
 */
export const useSearchShipments = (query: string): Shipment[] => {
  const { shipments } = useContext(TransitContext);
  
  return useMemo(() => {
    try {
      // SÉCURITÉ : Validation longueur query (DoS si 100000 chars)
      if (!query || typeof query !== 'string') return shipments;
      if (query.length > 100) {
        logger.warn('useSearchShipments: query trop longue', { length: query.length });
        return [];
      }
      
      const sanitizedQuery = query.trim();
      if (sanitizedQuery.length < 2) return shipments; // Performance: éviter recherche <2 chars
      
      const lowerQuery = sanitizedQuery.toLowerCase();
      
      return shipments.filter(s => 
        s.trackingNumber?.toLowerCase().includes(lowerQuery) ||
        s.clientName?.toLowerCase().includes(lowerQuery) ||
        s.origin?.toLowerCase().includes(lowerQuery) ||
        s.destination?.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      logger.error('useSearchShipments: erreur', error);
      return [];
    }
  }, [shipments, query]);
};

// ============================================
// EXEMPLES D'UTILISATION
// ============================================

/**
 * EXEMPLE 1: Composant liste (besoin de toutes les données)
 * 
 * const ShipmentsList = () => {
 *   const shipments = useShipments(); // Re-render si shipments change
 *   
 *   return (
 *     <ul>
 *       {shipments.map(s => <li key={s.id}>{s.trackingNumber}</li>)}
 *     </ul>
 *   );
 * };
 */

/**
 * EXEMPLE 2: Composant détail (1 dossier seulement)
 * 
 * const ShipmentDetail = ({ id }) => {
 *   const shipment = useShipmentById(id); // Re-render seulement si CE dossier change
 *   
 *   if (!shipment) return <div>Non trouvé</div>;
 *   
 *   return <div>{shipment.trackingNumber}</div>;
 * };
 */

/**
 * EXEMPLE 3: Composant stats (compteurs seulement)
 * 
 * const StatsBadge = () => {
 *   const count = useShipmentsCount(); // Re-render seulement si COUNT change
 *   
 *   return <span>{count} dossiers</span>;
 * };
 */

/**
 * EXEMPLE 4: Composant actions (pas d'affichage)
 * 
 * const CreateButton = () => {
 *   const { addShipment } = useShipmentActions(); // JAMAIS de re-render
 *   
 *   return <button onClick={() => addShipment(...)}>Créer</button>;
 * };
 */

/**
 * EXEMPLE 5: Recherche optimisée
 * 
 * const SearchBar = () => {
 *   const [query, setQuery] = useState('');
 *   const results = useSearchShipments(query); // Re-render si query ou shipments change
 *   
 *   return (
 *     <div>
 *       <input value={query} onChange={e => setQuery(e.target.value)} />
 *       <ul>
 *         {results.map(s => <li key={s.id}>{s.trackingNumber}</li>)}
 *       </ul>
 *     </div>
 *   );
 * };
 */

// ============================================
// HOOK CONTEXTE COMPLET
// ============================================

/**
 * Hook: Accès contexte complet Transit
 * 
 * Re-render: À chaque changement du contexte
 * Usage: Composants nécessitant plusieurs propriétés
 * 
 * ⚠️ Utiliser les hooks sélecteurs ci-dessus pour optimiser
 */
export const useTransit = () => {
  const context = useContext(TransitContext);
  
  if (!context) {
    throw new Error('useTransit doit être utilisé dans TransitProvider');
  }
  
  return context;
};
