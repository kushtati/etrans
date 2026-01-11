import React, { createContext, useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import DOMPurify from 'dompurify';
import { 
  Role, Shipment, ShipmentStatus, TransitContextType, Document, Expense, CommodityType, DeliveryInfo, DocumentType
} from '../types';
import { logger } from '../services/logger';
import * as api from '../services/apiService';
import { PaymentService } from '../services/paymentService';
import { offlineQueue } from '../services/offlineQueue';
import { 
  canUpdateStatus, 
  validateStatusChange, 
  canCreateShipment 
} from '../utils/permissions';
import { IS_MOCK_MODE, validateEnvironment } from '../config/environment';

// ============================================
// CONTEXT
// ============================================

export const TransitContext = createContext<TransitContextType>({} as TransitContextType);

interface TransitProviderProps {
  children: ReactNode;
}

/**
 * TransitProvider encapsulates all state management for the transit app
 * Exposes context value with shipments, methods, and role management
 * 
 * ✅ SÉCURISÉ: Données chargées depuis API backend avec authentification
 * ⚠️ Mode mock disponible UNIQUEMENT en développement (VITE_USE_MOCK=true)
 */
export const TransitProvider: React.FC<TransitProviderProps> = ({ children }) => {
  // ✅ SÉCURITÉ: Valider environnement au montage
  useEffect(() => {
    validateEnvironment();
  }, []);

  const isMountedRef = useRef(true);
  const [role, setRole] = useState<Role>(Role.DIRECTOR);
  const [currentUserId, setCurrentUserId] = useState<string>('user-default');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  
  // ✅ SÉCURITÉ: Verrouillage automatique en cas de mise en veille
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());
  
  // ✅ NOUVEAU: State sécurisé avec loading/error
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);

  // ✅ Protection montage/démontage
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ✅ SÉCURITÉ: Verrouillage automatique lors de la mise en veille/changement d'onglet
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isAuthenticated) {
        // L'utilisateur quitte l'onglet ou met en veille
        logger.info('🔒 Session verrouillée (écran éteint/changement onglet)', {
          userId: currentUserId,
          lastActivity: new Date(lastActivityTime).toISOString()
        });
        
        // Marquer comme verrouillé (ne pas déconnecter complètement)
        setIsLocked(true);
        
        // Effacer les données sensibles en mémoire (optionnel)
        // sessionStorage.removeItem('sensitive_data');
      } else if (document.visibilityState === 'visible' && isLocked) {
        // L'utilisateur revient : on garde l'état verrouillé
        logger.info('👁️ Retour à l\'application (verrouillée)', {
          userId: currentUserId
        });
      }
    };

    // Détecter inactivité prolongée (15 minutes)
    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
    const checkInactivity = () => {
      const now = Date.now();
      if (isAuthenticated && !isLocked && (now - lastActivityTime > INACTIVITY_TIMEOUT)) {
        logger.warn('⏰ Verrouillage automatique (inactivité 15min)', {
          userId: currentUserId,
          inactiveDuration: Math.round((now - lastActivityTime) / 60000) + 'min'
        });
        setIsLocked(true);
      }
    };

    // Mettre à jour lastActivityTime à chaque interaction
    const updateActivity = () => {
      if (isAuthenticated && !isLocked) {
        setLastActivityTime(Date.now());
      }
    };

    // Listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const inactivityTimer = setInterval(checkInactivity, 60000); // Vérifier chaque minute
    
    // Détecter activité utilisateur
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(inactivityTimer);
      activityEvents.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, [isAuthenticated, isLocked, lastActivityTime, currentUserId]);

  // ✅ SÉCURITÉ: Charger les données depuis l'API au montage
  useEffect(() => {
    let isMounted = true; // Protection contre les mises à jour après démontage
    
    const loadShipments = async () => {
      // ✅ Ne pas charger si pas authentifié (évite 401 inutiles)
      if (!isAuthenticated) {
        logger.info('Pas encore authentifié, skip loadShipments');
        setShipments([]);
        setLoading(false);
        return;
      }

      try {
        if (!isMounted) return;
        
        setLoading(true);
        setError(null);
        
        if (IS_MOCK_MODE) {
          // ⚠️ MODE MOCK - Développement uniquement
          console.warn(
            '%c⚠️ MODE MOCK ACTIVÉ - DONNÉES FICTIVES',
            'background: #ff9800; color: white; font-size: 16px; font-weight: bold; padding: 8px 16px; border-radius: 4px;'
          );
          console.warn('Ne JAMAIS utiliser en production!');
          
          // Import dynamique pour éviter le chargement en production
          const { MOCK_SHIPMENTS } = await import('../config/mockData');
          if (isMounted) {
            setShipments(MOCK_SHIPMENTS);
            logger.info('Mock data loaded', { count: MOCK_SHIPMENTS.length });
          }
        } else {
          // ✅ PRODUCTION - Backend filtre automatiquement selon le rôle (JWT)
          const data = await api.fetchShipments();
          if (isMounted) {
            setShipments(data);
            logger.info('Shipments loaded from API', { count: data.length });
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        
        const errorMsg = err.message || 'Erreur de chargement';
        
        // ⚠️ Si erreur 401 (non authentifié), ne pas logger comme erreur
        if (err.message !== 'Session expirée') {
          setError(errorMsg);
          logger.error('Failed to load shipments', { error: errorMsg });
        } else {
          // L'utilisateur n'est pas authentifié, c'est normal au premier chargement
          logger.info('User not authenticated yet');
          setShipments([]); // Données vides jusqu'à l'authentification
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Charger les shipments immédiatement (la vérification isAuthenticated est dans loadShipments)
    loadShipments();

    return () => {
      isMounted = false;
    };
  }, [reloadTrigger, isAuthenticated]); // ✅ Recharger quand authentifié ou trigger change

  // ✅ SÉCURITÉ: Récupérer le rôle depuis le JWT backend (pas sessionStorage!)
  useEffect(() => {
    let isMounted = true; // Protection contre les appels multiples
    
    const fetchUserRole = async () => {
      try {
        // 🔥 CACHE BUSTING : Ajouter timestamp pour éviter 304 Not Modified
        const response = await fetch(`/api/auth/me?t=${Date.now()}`, {
          credentials: 'include', // httpOnly cookie
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });

        if (!response.ok) {
          // Token invalide ou expiré
          if (isMounted) {
            setIsAuthenticated(false);
            logger.warn('Token invalide, redirection login requise');
          }
          return;
        }

        const { user } = await response.json();
        
        if (isMounted) {
          // ✅ SÉCURITÉ: Reset complet puis mise à jour atomique
          setRole(null as any); // Reset pour éviter les mélanges
          setCurrentUserId('');
          setCurrentUserName('');
          
          // Mise à jour atomique (tout d'un coup)
          setRole(user.role as Role);
          setCurrentUserId(user.id);
          setCurrentUserName(user.name || user.email);
          setIsAuthenticated(true);
          
          logger.info('Session authentifiée', { 
            role: user.role, 
            userId: user.id 
          });
        }

      } catch (err: any) {
        if (isMounted) {
          logger.error('Auth check failed', { error: err.message });
          setIsAuthenticated(false);
        }
      }
    };

    fetchUserRole();
    
    return () => {
      isMounted = false; // Cleanup pour éviter les updates après unmount
    };
  }, []);

  const toggleOffline = () => {
    setIsOffline(!isOffline);
    logger.info(`Mode ${!isOffline ? 'Hors-ligne' : 'Connecté'} activé`);
  };

  // ✅ SÉCURISÉ + OFFLINE: Créer un dossier avec optimistic update
  const addShipment = async (newShipment: Shipment) => {
    // Vérifier que le composant est monté avant toute opération
    if (!isMountedRef.current) {
      logger.warn('addShipment called on unmounted component');
      return;
    }
    
    // ⚠️ VALIDATION PERMISSIONS - Vérifier si l'utilisateur peut créer
    if (!canCreateShipment(role)) {
      const error = `Votre rôle (${role}) ne permet pas de créer des dossiers`;
      logger.warn('Shipment creation denied', { role, userId: currentUserId });
      throw new Error(error);
    }

    // 1. Optimistic Update - UI immédiat
    if (isMountedRef.current) {
      setShipments(prev => [newShipment, ...prev]);
      logger.info('Optimistic: Dossier créé', { id: newShipment.id });
    }

    try {
      if (!navigator.onLine) {
        // Mode offline - Queue pour sync ultérieur
        await offlineQueue.add('CREATE_SHIPMENT', newShipment);
        logger.warn('Dossier créé en mode offline - sync différé', { 
          id: newShipment.id 
        });
        return;
      }

      // Mode online - Envoi immédiat à l'API
      const created = await api.createShipment(newShipment);
      
      logger.audit('Dossier créé et synchronisé', { 
        id: created.id, 
        tracking: created.trackingNumber 
      });
      
      // ✅ Déclencher rechargement via useEffect
      setReloadTrigger(prev => prev + 1);

    } catch (err: any) {
      // Rollback optimistic update en cas d'erreur
      setShipments(prev => prev.filter(s => s.id !== newShipment.id));
      
      logger.error('Échec création dossier - rollback', { 
        id: newShipment.id, 
        error: err.message 
      });
      
      throw new Error(`Échec création: ${err.message}`);
    }
  };

  // ✅ SÉCURISÉ + OFFLINE: Mettre à jour le statut avec validation permissions
  const updateShipmentStatus = async (shipmentId: string, newStatus: ShipmentStatus, deliveryInfo?: DeliveryInfo) => {
    // Sauvegarder état précédent pour rollback
    const previousShipment = shipments.find(s => s.id === shipmentId);
    
    if (!previousShipment) {
      throw new Error('Dossier introuvable');
    }

    // ⚠️ VALIDATION PERMISSIONS - Double vérification
    // 1. Vérifier permissions rôle
    if (!canUpdateStatus(role, previousShipment.status, newStatus)) {
      const error = `Votre rôle (${role}) ne permet pas d'attribuer le statut ${newStatus}`;
      logger.warn('Status change denied - role permission', { 
        role, 
        currentStatus: previousShipment.status, 
        newStatus 
      });
      throw new Error(error);
    }

    // 2. Valider workflow métier (transition valide)
    const validation = validateStatusChange(role, previousShipment.status, newStatus);
    if (!validation.allowed) {
      logger.warn('Status change denied - invalid transition', {
        role,
        currentStatus: previousShipment.status,
        newStatus,
        reason: validation.reason
      });
      throw new Error(validation.reason || 'Changement de statut non autorisé');
    }

    // 3. Optimistic Update (validation passée)
    setShipments(prev => prev.map(s => 
      s.id === shipmentId 
        ? { ...s, status: newStatus, deliveryInfo: deliveryInfo || s.deliveryInfo }
        : s
    ));
    
    logger.info('Optimistic: Statut changé', { shipmentId, status: newStatus });

    try {
      if (!navigator.onLine) {
        // Mode offline - Queue pour sync
        await offlineQueue.add('UPDATE_STATUS', { 
          shipmentId, 
          status: newStatus, 
          deliveryInfo 
        });
        
        logger.warn('Statut changé en mode offline - sync différé', { 
          shipmentId, 
          status: newStatus 
        });
        return;
      }

      // Mode online - API immédiat (backend re-vérifie permissions!)
      const updated = await api.updateShipmentStatus(shipmentId, newStatus, deliveryInfo);
      
      // Sync avec données serveur
      setShipments(prev => prev.map(s => s.id === shipmentId ? updated : s));
      
      logger.audit('Statut changé et synchronisé', { 
        shipmentId, 
        status: newStatus,
        role 
      });
      
      // Recharger les données depuis le serveur
      if (isMountedRef.current) {
        setReloadTrigger(prev => prev + 1);
      }

    } catch (err: any) {
      // Rollback vers état précédent
      setShipments(prev => prev.map(s => 
        s.id === shipmentId ? previousShipment : s
      ));
      
      logger.error('Échec changement statut - rollback', { 
        shipmentId, 
        status: newStatus, 
        error: err.message 
      });
      
      throw new Error(`Échec changement statut: ${err.message}`);
    }
  };

  // ✅ MIGRÉ API: Définir date d'arrivée
  const setArrivalDate = async (shipmentId: string, date: string) => {
    const previousShipment = shipments.find(s => s.id === shipmentId);
    
    if (!previousShipment) {
      throw new Error('Dossier introuvable');
    }

    // Optimistic update
    setShipments(prev => prev.map(s => 
      s.id === shipmentId ? { ...s, arrivalDate: date } : s
    ));

    try {
      if (!navigator.onLine) {
        await offlineQueue.add('UPDATE_ARRIVAL_DATE', { shipmentId, date });
        logger.warn('Date arrivée définie offline - sync différé', { shipmentId, date });
        return;
      }

      // API call avec apiService
      await fetch(`/api/shipments/${shipmentId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arrivalDate: date })
      });

      logger.info('Date arrivée synchronisée', { shipmentId, date });
      
      // Recharger les données depuis le serveur
      if (isMountedRef.current) {
        setReloadTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      // Rollback
      setShipments(prev => prev.map(s => 
        s.id === shipmentId ? previousShipment : s
      ));
      logger.error('Échec mise à jour date arrivée - rollback', { shipmentId, error: err.message });
      throw err;
    }
  };

  // ✅ MIGRÉ API: Définir déclaration avec UUID et sanitization
  const setDeclarationDetails = async (shipmentId: string, number: string, amount: string) => {
    const previousShipment = shipments.find(s => s.id === shipmentId);
    
    if (!previousShipment) {
      throw new Error('Dossier introuvable');
    }

    // Sanitization
    const sanitizedNumber = DOMPurify.sanitize(number.trim(), {
      ALLOWED_TAGS: [],
      KEEP_CONTENT: true
    });

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Montant invalide');
    }

    const newExpense: Expense = {
      id: uuidv4(), // UUID au lieu de Date.now()
      description: `Liquidation Douane (${sanitizedNumber})`,
      amount: parsedAmount,
      category: 'Douane',
      paid: false,
      type: 'DISBURSEMENT',
      date: new Date().toISOString()
    };

    // Optimistic update
    setShipments(prev => prev.map(s => {
      if (s.id === shipmentId) {
        return {
          ...s,
          declarationNumber: sanitizedNumber,
          expenses: [...(s.expenses || []), newExpense]
        };
      }
      return s;
    }));

    logger.audit('Déclaration Enregistrée', { shipmentId, declaration: sanitizedNumber, amount: parsedAmount });

    try {
      if (!navigator.onLine) {
        await offlineQueue.add('SET_DECLARATION', { shipmentId, number: sanitizedNumber, amount: parsedAmount });
        logger.warn('Déclaration enregistrée offline - sync différé', { shipmentId });
        return;
      }

      // API call
      await fetch(`/api/shipments/${shipmentId}/declaration`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ declarationNumber: sanitizedNumber, liquidationAmount: parsedAmount })
      });

      logger.info('Déclaration synchronisée', { shipmentId });
      
      // Recharger les données depuis le serveur
      if (isMountedRef.current) {
        setReloadTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      // Rollback
      setShipments(prev => prev.map(s => 
        s.id === shipmentId ? previousShipment : s
      ));
      logger.error('Échec enregistrement déclaration - rollback', { shipmentId, error: err.message });
      throw err;
    }
  };

  /**
   * Payer une liquidation douane
   * 
   * Architecture:
   * 1. Vérification locale via PaymentService (UX rapide)
   * 2. Optimistic update (marquer comme payé immédiatement)
   * 3. Appel API backend ou queue si offline
   * 4. Rollback si erreur
   * 
   * ✅ Logique métier séparée dans PaymentService (testable)
   * ✅ Validation backend (sécurité)
   * ✅ Optimistic UI avec rollback
   * ✅ Mode offline avec queue
   */
  const payLiquidation = async (shipmentId: string): Promise<{ success: boolean; message: string }> => {
    // 1. Récupérer dossier
    const shipment = shipments.find(s => s.id === shipmentId);
    
    if (!shipment) {
      return { 
        success: false, 
        message: 'Dossier introuvable' 
      };
    }

    // 2. Vérification locale (UX rapide + validation règles métier)
    const localCheck = PaymentService.canPayLiquidation(shipment);
    
    if (!localCheck.success) {
      PaymentService.logPaymentAttempt(shipment, false);
      return {
        success: localCheck.success,
        message: localCheck.message || 'Paiement refusé'
      };
    }

    // Sauvegarder état pour rollback (deep clone)
    const previousShipment = JSON.parse(JSON.stringify(shipment));

    // 3. Optimistic Update - Marquer liquidation comme payée
    const liquidation = (shipment.expenses || []).find(e => 
      e.category === 'Douane' && e.type === 'DISBURSEMENT' && !e.paid
    );

    if (liquidation) {
      setShipments(prev => prev.map(s => {
        if (s.id === shipmentId) {
          return {
            ...s,
            expenses: (s.expenses || []).map(e => 
              e.id === liquidation.id ? { ...e, paid: true } : e
            )
          };
        }
        return s;
      }));

      logger.info('Optimistic: Liquidation payée', { shipmentId });
    }

    // 4. Sync avec backend ou queue
    try {
      if (!navigator.onLine) {
        // Mode offline - Queue pour sync ultérieur
        await offlineQueue.add('PAY_LIQUIDATION', { shipmentId });
        
        logger.warn('Paiement effectué en mode offline - sync différé', { 
          shipmentId 
        });

        return { 
          success: true, 
          message: 'Paiement enregistré (sera synchronisé)' 
        };
      }

      // Mode online - API immédiat via apiService
      const response = await api.payLiquidation(shipmentId);

      // Sync avec données serveur
      setShipments(prev => prev.map(s => 
        s.id === shipmentId ? response.updatedShipment : s
      ));

      PaymentService.logPaymentAttempt(response.updatedShipment, true);
      
      // Recharger les données depuis le serveur
      if (isMountedRef.current) {
        setReloadTrigger(prev => prev + 1);
      }

      return { 
        success: true, 
        message: 'Paiement effectué avec succès' 
      };

    } catch (err: any) {
      // Rollback optimistic update
      setShipments(prev => prev.map(s => 
        s.id === shipmentId ? previousShipment : s
      ));

      logger.error('Échec paiement - rollback', { 
        shipmentId, 
        error: err.message 
      });
      
      return { 
        success: false, 
        message: err.message || 'Erreur lors du paiement' 
      };
    }
  };

  // ✅ SÉCURISÉ: Ajouter un document via API avec sanitization
  const addDocument = async (id: string, doc: Document) => {
    try {
      // Sanitize strings
      const sanitizedName = DOMPurify.sanitize(doc.name || '', { ALLOWED_TAGS: [], KEEP_CONTENT: true });
      const sanitizedTypeString = DOMPurify.sanitize(doc.type || '', { ALLOWED_TAGS: [], KEEP_CONTENT: true });
      
      // Validate DocumentType
      const validTypes = ['BL', 'Facture', 'Packing List', 'Certificat', 
        'DDI', 'BSC', 'Quittance', 'BAE', 'BAD', 'Photo Camion', 'Autre'] as const;
      type ValidType = typeof validTypes[number];
      
      const sanitizedType: DocumentType = validTypes.includes(sanitizedTypeString as ValidType)
        ? (sanitizedTypeString as unknown as DocumentType)
        : ('Autre' as unknown as DocumentType); // Fallback sécurisé
      
      const sanitized: Document = {
        ...doc,
        name: sanitizedName,
        type: sanitizedType
      };
      
      const created = await api.addDocumentToShipment(id, sanitized);
      setShipments(prev => prev.map(s => {
        if (s.id === id) {
          return { ...s, documents: [...s.documents, created] };
        }
        return s;
      }));
      logger.info('Document ajouté', { shipmentId: id, type: sanitized.type });
    } catch (err: any) {
      logger.error('Failed to add document', err);
      throw err;
    }
  };
  
  // ✅ SÉCURISÉ: Ajouter une dépense via API avec sanitization
  const addExpense = async (id: string, expense: Expense) => {
    // Vérifier que le composant est monté avant toute opération
    if (!isMountedRef.current) {
      logger.warn('addExpense called on unmounted component');
      return;
    }
    
    try {
      const sanitized: Expense = {
        ...expense,
        description: DOMPurify.sanitize(expense.description || '', { ALLOWED_TAGS: [], KEEP_CONTENT: true }),
        id: expense.id || uuidv4() // UUID si pas fourni
      };
      
      await api.addExpense(id, sanitized);
      logger.audit('Transaction Financière', { shipmentId: id, amount: sanitized.amount, type: sanitized.type });
      
      // ✅ Déclencher rechargement via useEffect
      setReloadTrigger(prev => prev + 1);
      
    } catch (err: any) {
      logger.error('Failed to add expense', err);
      throw err;
    }
  };
  
  // ✅ MIGRÉ API: Mettre à jour détails dossier avec sanitization
  const updateShipmentDetails = async (id: string, updates: Partial<Shipment>) => {
    const previousShipment = shipments.find(s => s.id === id);
    
    if (!previousShipment) {
      throw new Error('Dossier introuvable');
    }

    // Sanitization des champs texte
    const sanitized: Partial<Shipment> = { ...updates };
    if (updates.blNumber) {
      sanitized.blNumber = DOMPurify.sanitize(updates.blNumber, { ALLOWED_TAGS: [], KEEP_CONTENT: true });
    }
    if (updates.containerNumber) {
      sanitized.containerNumber = DOMPurify.sanitize(updates.containerNumber, { ALLOWED_TAGS: [], KEEP_CONTENT: true });
    }
    if (updates.clientName) {
      sanitized.clientName = DOMPurify.sanitize(updates.clientName, { ALLOWED_TAGS: [], KEEP_CONTENT: true });
    }

    // Optimistic update
    setShipments(prev => prev.map(s => s.id === id ? { ...s, ...sanitized } : s));
    logger.info('Mise à jour dossier', { shipmentId: id, fields: Object.keys(sanitized) });

    try {
      if (!navigator.onLine) {
        await offlineQueue.add('UPDATE_SHIPMENT', { shipmentId: id, updates: sanitized });
        logger.warn('Dossier mis à jour offline - sync différé', { shipmentId: id });
        return;
      }

      // API call
      await fetch(`/api/shipments/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitized)
      });

      logger.info('Dossier synchronisé', { shipmentId: id });
    } catch (err: any) {
      // Rollback
      setShipments(prev => prev.map(s => s.id === id ? previousShipment : s));
      logger.error('Échec mise à jour dossier - rollback', { shipmentId: id, error: err.message });
      throw err;
    }
  };

  // ============================================
  // DÉVERROUILLAGE RAPIDE (WebAuthn/Biométrie)
  // ============================================
  
  /**
   * ✅ SÉCURITÉ: Déverrouillage rapide avec biométrie (Face ID, Touch ID)
   * 
   * Utilise WebAuthn pour authentification sans mot de passe
   * Compatible Face ID (iPhone), Touch ID (Mac), Windows Hello
   */
  const quickUnlock = async (password?: string) => {
    try {
      logger.info('🔓 Tentative déverrouillage', { 
        userId: currentUserId,
        method: password ? 'password' : 'biometric'
      });

      if (password) {
        // Méthode 1 : Déverrouillage par mot de passe
        const response = await fetch('/api/auth/unlock', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        if (!response.ok) {
          throw new Error('Mot de passe incorrect');
        }

        const { success } = await response.json();
        if (success) {
          setIsLocked(false);
          setLastActivityTime(Date.now());
          setReloadTrigger(prev => prev + 1); // Recharger données
          logger.info('✅ Session déverrouillée (password)', { userId: currentUserId });
          return true;
        }
      } else {
        // Méthode 2 : Déverrouillage biométrique (WebAuthn)
        // ⚠️ Nécessite configuration WebAuthn préalable
        
        // Vérifier si WebAuthn est disponible
        if (!window.PublicKeyCredential) {
          logger.warn('⚠️ Biométrie non disponible sur cet appareil');
          return false; // ✅ Retourner false au lieu de throw
        }

        // TODO: Implémenter appel WebAuthn
        // const credential = await navigator.credentials.get({
        //   publicKey: { /* options du serveur */ }
        // });
        
        // Pour l'instant, fallback sur password
        logger.warn('⚠️ WebAuthn non encore implémenté, utiliser mot de passe');
        return false;
      }
    } catch (err: any) {
      // ✅ AMÉLIORATION: Ne pas throw pour biométrie, juste logger et retourner false
      logger.error('❌ Échec déverrouillage', { 
        userId: currentUserId,
        error: err.message 
      });
      
      // Si erreur de connexion réseau ou autre, on peut throw
      // Mais pour biométrie non configurée, on retourne false
      if (err.message.includes('Mot de passe incorrect')) {
        throw err; // On throw seulement si c'est une vraie erreur auth
      }
      
      return false; // Sinon fallback vers password
    }
    
    return false;
  };

  /**
   * ✅ SÉCURITÉ: Forcer verrouillage manuel
   */
  const lockSession = () => {
    logger.info('🔒 Verrouillage manuel', { userId: currentUserId });
    setIsLocked(true);
  };

  // ============================================
  // OPTIMISATION PERFORMANCES
  // ============================================
  
  /**
   * ✅ PERFORMANCE: Mémoriser les actions pour éviter re-création
   * 
   * Les fonctions sont stables et ne changent pas à chaque render
   * Seuls les consumers qui utilisent `shipments` vont re-render
   */
  const actions = useMemo(() => ({
    addDocument,
    addExpense,
    addShipment,
    updateShipmentStatus,
    setArrivalDate,
    setDeclarationDetails,
    payLiquidation,
    updateShipmentDetails,
    toggleOffline,
    setRole,
    quickUnlock,
    lockSession
  }), []); // Pas de dépendances - fonctions stables

  /**
   * ✅ PERFORMANCE: Mémoriser le value complet
   * 
   * Re-crée seulement si les dépendances changent
   * Évite re-renders inutiles des consumers
   */
  const value: TransitContextType = useMemo(() => ({
    role,
    currentUserId,
    currentUserName,
    isOffline,
    isLocked,
    shipments,
    loading,
    error,
    ...actions
  }), [
    role,
    currentUserId,
    currentUserName,
    isOffline,
    isLocked,
    shipments,
    loading,
    error,
    actions
  ]);

  // ✅ SÉCURITÉ: Afficher un état de chargement si nécessaire
  if (loading) {
    return (
      <TransitContext.Provider value={value}>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Chargement sécurisé...</p>
          </div>
        </div>
      </TransitContext.Provider>
    );
  }

  return (
    <TransitContext.Provider value={value}>
      {children}
    </TransitContext.Provider>
  );
};
