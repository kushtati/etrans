# GESTION OFFLINE & SYNCHRONISATION

## 🎯 Problème Initial

**Contexte Guinée** : Connexion internet instable, coupures fréquentes

**Risques identifiés** :
```typescript
// ❌ AVANT - Code vulnérable
const addShipment = (newShipment: Shipment) => {
  setShipments(prev => [newShipment, ...prev]); // Créé localement
  // ⚠️ JAMAIS SYNC SERVEUR SI COUPURE RÉSEAU!
  // ⚠️ PERTE DE DONNÉES GARANTIE
};
```

**Scénarios de perte de données** :
1. **Création dossier** : Utilisateur crée un dossier → Coupure réseau → Dossier perdu au reload
2. **Changement statut** : Dossier marqué "Livré" → Coupure → Rollback au statut précédent
3. **Paiement liquidation** : Liquidation payée localement → Jamais enregistré serveur → Comptabilité fausse
4. **Upload documents** : Document scanné → Perdu si pas sync

---

## ✅ Solution Architecture

### Architecture 3 Couches

```
┌─────────────────────────────────────────────────────┐
│   UI LAYER (React Components)                       │
│   - Optimistic Updates (feedback immédiat)          │
│   - OfflineIndicator (visibilité état)              │
│   - useNetworkStatus hook                           │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│   OFFLINE QUEUE SERVICE                             │
│   - Queue actions en attente                        │
│   - Flush automatique quand online                  │
│   - Retry avec backoff exponentiel                  │
│   - Listeners pour notifications UI                 │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│   INDEXED DB (Persistence Locale)                   │
│   - Store 'offlineQueue' (actions en attente)       │
│   - Store 'shipments' (cache local)                 │
│   - Survie aux rechargements                        │
│   - Pas de limite taille (vs localStorage)          │
└─────────────────────────────────────────────────────┘
```

---

## 📦 Services Créés

### 1. IndexedDBService (`services/indexedDBService.ts`)

**Responsabilité** : Persistence locale des données

**Stores** :
- `offlineQueue` : Actions à synchroniser
- `shipments` : Cache local des dossiers

**API** :
```typescript
// Ajouter action à la queue
await indexedDB.addToQueue(action: QueuedAction);

// Récupérer actions en attente
const actions = await indexedDB.getQueuedActions();

// Supprimer action après sync
await indexedDB.removeFromQueue(actionId: string);

// Mettre à jour action (retry counter)
await indexedDB.updateQueuedAction(action: QueuedAction);

// Cache dossier localement
await indexedDB.cacheShipment(shipment: Shipment);

// Stats
const size = await indexedDB.getQueueSize();
```

**Structure QueuedAction** :
```typescript
interface QueuedAction {
  id: string;                    // Unique ID
  type: 'CREATE_SHIPMENT'        // Type d'action
      | 'UPDATE_STATUS'
      | 'ADD_DOCUMENT'
      | 'ADD_EXPENSE'
      | 'PAY_LIQUIDATION';
  payload: any;                  // Données action
  timestamp: number;             // Quand créée
  retries: number;               // Nombre tentatives
  lastError?: string;            // Dernière erreur
}
```

---

### 2. OfflineQueueService (`services/offlineQueue.ts`)

**Responsabilité** : Gestion queue de synchronisation

**Fonctionnalités** :
- ✅ Ajoute actions à la queue quand offline
- ✅ Flush automatique quand connexion rétablie
- ✅ Retry avec backoff exponentiel (1s → 2s → 4s)
- ✅ Max 3 retries avant abandon
- ✅ Listeners pour notifications UI

**API** :
```typescript
// Ajouter action à la queue
const actionId = await offlineQueue.add(
  'CREATE_SHIPMENT',
  newShipment
);

// Forcer synchronisation (manuel)
await offlineQueue.flush();

// Stats
const stats = await offlineQueue.getStats();
// {
//   pending: 5,
//   processing: false,
//   lastSync: Date,
//   lastError: null
// }

// S'abonner aux changements
const unsubscribe = offlineQueue.subscribe(() => {
  console.log('Queue updated!');
});
```

**Algorithme Flush** :
```typescript
async flush() {
  // 1. Récupérer toutes les actions (FIFO)
  const actions = await indexedDB.getQueuedActions();
  
  for (const action of actions) {
    try {
      // 2. Exécuter action
      await this.executeAction(action);
      
      // 3. Succès → Supprimer de la queue
      await indexedDB.removeFromQueue(action.id);
      
    } catch (err) {
      // 4. Échec → Retry ou abandon
      action.retries++;
      
      if (action.retries >= 3) {
        // Abandon après 3 retries
        await indexedDB.removeFromQueue(action.id);
      } else {
        // Mettre à jour pour retry
        await indexedDB.updateQueuedAction(action);
        
        // Backoff exponentiel
        await sleep(1000 * Math.pow(2, action.retries - 1));
      }
    }
  }
}
```

**Auto-initialisation** :
```typescript
// Listeners réseau globaux
window.addEventListener('online', () => {
  offlineQueue.flush(); // Auto-sync quand connexion rétablie
});

window.addEventListener('offline', () => {
  logger.warn('Network lost, switching to offline mode');
});
```

---

### 3. useNetworkStatus Hook (`hooks/useNetworkStatus.ts`)

**Responsabilité** : Hook React pour état réseau

**Retour** :
```typescript
interface NetworkStatus {
  isOnline: boolean;        // navigator.onLine
  isOfflineMode: boolean;   // !isOnline || pendingActions > 0
  pendingActions: number;   // Nombre actions en attente
  isSyncing: boolean;       // Sync en cours
}
```

**Usage** :
```typescript
const Dashboard = () => {
  const { isOnline, pendingActions, isSyncing } = useNetworkStatus();
  
  return (
    <div>
      {!isOnline && (
        <div className="bg-orange-100 p-4">
          ⚠️ Mode hors-ligne - {pendingActions} actions en attente
        </div>
      )}
      
      {isSyncing && (
        <div className="bg-blue-100 p-4">
          🔄 Synchronisation en cours...
        </div>
      )}
    </div>
  );
};
```

---

## 🔄 Pattern Optimistic Update

### Principe

1. **Update UI immédiatement** (feedback rapide)
2. **Sync backend en arrière-plan**
3. **Rollback si erreur**

### Exemple Implémentation

```typescript
const addShipment = async (newShipment: Shipment) => {
  // 1. OPTIMISTIC UPDATE - UI immédiat
  setShipments(prev => [newShipment, ...prev]);
  logger.info('Optimistic: Dossier créé', { id: newShipment.id });

  try {
    if (!navigator.onLine) {
      // 2a. OFFLINE - Queue pour sync ultérieur
      await offlineQueue.add('CREATE_SHIPMENT', newShipment);
      logger.warn('Créé en mode offline - sync différé');
      return;
    }

    // 2b. ONLINE - Envoi immédiat API
    const created = await api.createShipment(newShipment);
    
    // 3. SYNC avec données serveur (IDs normalisés, timestamps)
    setShipments(prev => prev.map(s => 
      s.id === newShipment.id ? created : s
    ));
    
    logger.audit('Dossier créé et synchronisé', { id: created.id });

  } catch (err: any) {
    // 4. ROLLBACK en cas d'erreur
    setShipments(prev => prev.filter(s => s.id !== newShipment.id));
    
    logger.error('Échec création - rollback', { error: err.message });
    throw new Error(`Échec création: ${err.message}`);
  }
};
```

---

## 🔧 Modifications Context

### TransitContext (`context/transitContext.tsx`)

**Import ajouté** :
```typescript
import { offlineQueue } from '../services/offlineQueue';
```

**Méthodes refactorisées** :

#### 1. addShipment
```typescript
// ✅ AVANT
const addShipment = async (newShipment: Shipment) => {
  const created = await api.createShipment(newShipment);
  setShipments(prev => [created, ...prev]);
};

// ✅ APRÈS
const addShipment = async (newShipment: Shipment) => {
  // Optimistic update
  setShipments(prev => [newShipment, ...prev]);

  try {
    if (!navigator.onLine) {
      await offlineQueue.add('CREATE_SHIPMENT', newShipment);
      return;
    }

    const created = await api.createShipment(newShipment);
    setShipments(prev => prev.map(s => 
      s.id === newShipment.id ? created : s
    ));

  } catch (err) {
    // Rollback
    setShipments(prev => prev.filter(s => s.id !== newShipment.id));
    throw err;
  }
};
```

#### 2. updateShipmentStatus
```typescript
const updateShipmentStatus = async (
  shipmentId: string, 
  newStatus: ShipmentStatus
) => {
  const previous = shipments.find(s => s.id === shipmentId);

  // Optimistic update
  setShipments(prev => prev.map(s => 
    s.id === shipmentId ? { ...s, status: newStatus } : s
  ));

  try {
    if (!navigator.onLine) {
      await offlineQueue.add('UPDATE_STATUS', { shipmentId, status: newStatus });
      return;
    }

    const updated = await api.updateShipmentStatus(shipmentId, newStatus);
    setShipments(prev => prev.map(s => s.id === shipmentId ? updated : s));

  } catch (err) {
    // Rollback
    setShipments(prev => prev.map(s => 
      s.id === shipmentId ? previous : s
    ));
    throw err;
  }
};
```

#### 3. payLiquidation
```typescript
const payLiquidation = async (shipmentId: string) => {
  const shipment = shipments.find(s => s.id === shipmentId);
  const previous = { ...shipment };

  // Validation métier
  const check = PaymentService.canPayLiquidation(shipment);
  if (!check.success) return check;

  // Optimistic update - Marquer liquidation payée
  setShipments(prev => prev.map(s => {
    if (s.id === shipmentId) {
      return {
        ...s,
        expenses: s.expenses.map(e => 
          e.category === 'Douane' && !e.paid 
            ? { ...e, paid: true } 
            : e
        )
      };
    }
    return s;
  }));

  try {
    if (!navigator.onLine) {
      await offlineQueue.add('PAY_LIQUIDATION', { shipmentId });
      return { success: true, message: 'Enregistré (sync différé)' };
    }

    const response = await fetch(`/api/shipments/${shipmentId}/pay-liquidation`, {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();
    setShipments(prev => prev.map(s => 
      s.id === shipmentId ? data.updatedShipment : s
    ));

    return { success: true, message: 'Paiement effectué' };

  } catch (err) {
    // Rollback
    setShipments(prev => prev.map(s => 
      s.id === shipmentId ? previous : s
    ));
    return { success: false, message: err.message };
  }
};
```

---

## 🎨 Composants UI

### OfflineIndicator (`components/OfflineIndicator.tsx`)

**Version complète** :
```typescript
<OfflineIndicator />

// États:
// 1. Online + rien en attente → Badge vert discret
// 2. Offline → Badge orange "Mode hors-ligne (3 actions)"
// 3. Syncing → Badge bleu animé "Synchronisation... (2 restants)"
// 4. En attente → Badge jaune + Bouton "Synchroniser"
```

**Version mini (header)** :
```typescript
<OfflineIndicatorMini />

// Mini badges avec tooltip
```

**Intégration Dashboard** :
```typescript
const Dashboard = () => {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1>Tableau de Bord</h1>
        <OfflineIndicator />
      </div>
      
      {/* ... */}
    </div>
  );
};
```

---

## 📊 Cas d'Usage

### Scénario 1 : Création Dossier Offline

**Workflow** :
```typescript
// 1. Utilisateur crée dossier
addShipment(newShipment);

// 2. UI update immédiat (optimistic)
// ✅ Dossier apparaît dans la liste

// 3. Détection offline
if (!navigator.onLine) {
  // 4. Ajout à la queue
  await offlineQueue.add('CREATE_SHIPMENT', newShipment);
  
  // 5. Persistence IndexedDB
  // ✅ Survit au reload
}

// 6. Connexion rétablie
window.dispatchEvent(new Event('online'));

// 7. Flush automatique
offlineQueue.flush();
// → Envoi API
// → Sync données serveur
// → Suppression queue
```

### Scénario 2 : Paiement Liquidation Offline

**Workflow** :
```typescript
// 1. Validation métier locale
const check = PaymentService.canPayLiquidation(shipment);
if (!check.success) {
  // ❌ Refusé immédiatement (UX)
  return check;
}

// 2. Optimistic update
// ✅ Liquidation marquée "Payée" dans UI

// 3. Queue si offline
await offlineQueue.add('PAY_LIQUIDATION', { shipmentId });

// 4. Message utilisateur
"Paiement enregistré (sera synchronisé)"

// 5. Auto-sync quand online
// → POST /api/shipments/:id/pay-liquidation
// → Update comptabilité backend
// → Sync état local
```

### Scénario 3 : Retry avec Backoff

**Workflow** :
```typescript
// 1. Action échoue (serveur 500)
executeAction(action); // throws Error

// 2. Incrémenter retry counter
action.retries = 1;
action.lastError = "Server error 500";
await indexedDB.updateQueuedAction(action);

// 3. Backoff exponentiel
await sleep(1000 * Math.pow(2, 0)); // 1s

// 4. Retry #1
executeAction(action); // throws Error

// 5. Retry #2
await sleep(2000); // 2s
executeAction(action); // throws Error

// 6. Retry #3 (dernier)
await sleep(4000); // 4s
executeAction(action); // throws Error

// 7. Max retries atteint
if (action.retries >= 3) {
  logger.error('Action failed after max retries, removing', { action });
  await indexedDB.removeFromQueue(action.id);
}
```

---

## ⚡ Performances

### IndexedDB vs localStorage

| Feature | IndexedDB | localStorage |
|---------|-----------|--------------|
| **Taille** | ~50MB+ (navigateur-dépendant) | 5-10MB max |
| **Async** | ✅ Oui (pas de blocage UI) | ❌ Non (synchrone) |
| **Types** | ✅ Objects, Arrays, Blobs | ❌ String uniquement |
| **Indexes** | ✅ Oui (recherches rapides) | ❌ Non |
| **Transactions** | ✅ ACID | ❌ Non |
| **Complexité** | Moyenne | Facile |

**Pourquoi IndexedDB ?**
- ✅ Queue peut contenir **centaines d'actions** (connexion longtemps coupée)
- ✅ Pas de blocage UI (async)
- ✅ Indexes sur `timestamp`, `type` pour queries efficaces
- ✅ Transactions ACID (intégrité garantie)

---

## 🔒 Sécurité

### Validation Double

```typescript
// 1. Validation locale (UX rapide)
const check = PaymentService.canPayLiquidation(shipment);
if (!check.success) {
  return check; // Refus immédiat
}

// 2. Validation backend (sécurité)
const response = await fetch('/api/shipments/:id/pay-liquidation', {
  method: 'POST',
  credentials: 'include' // JWT httpOnly
});

// Backend vérifie:
// - Permissions utilisateur
// - Règles métier
// - Intégrité données
```

**Pourquoi ?**
- Local : UX rapide, feedback immédiat
- Backend : Sécurité, source de vérité

### Données Sensibles

**⚠️ Attention** : IndexedDB accessible JavaScript
```typescript
// ❌ NE JAMAIS stocker:
- Mots de passe
- Tokens JWT
- Données personnelles sensibles (RGPD)

// ✅ OK à stocker:
- Actions en attente (CREATE_SHIPMENT, UPDATE_STATUS)
- Cache dossiers (données publiques pour l'utilisateur)
```

---

## 📈 Monitoring

### Dashboard Stats

```typescript
const OfflineDashboard = () => {
  const [stats, setStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      const s = await offlineQueue.getStats();
      setStats(s);
    };

    loadStats();
    const interval = setInterval(loadStats, 5000); // Refresh 5s

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="p-4 bg-white rounded-lg shadow">
        <div className="text-3xl font-bold">{stats?.pending || 0}</div>
        <div className="text-sm text-gray-600">Actions en attente</div>
      </div>

      <div className="p-4 bg-white rounded-lg shadow">
        <div className="text-3xl font-bold">
          {stats?.processing ? '🔄' : '✅'}
        </div>
        <div className="text-sm text-gray-600">
          {stats?.processing ? 'Synchronisation' : 'Synchronisé'}
        </div>
      </div>

      <div className="p-4 bg-white rounded-lg shadow">
        <div className="text-sm text-gray-600">Dernière sync</div>
        <div className="text-sm font-medium">
          {stats?.lastSync 
            ? formatDistanceToNow(stats.lastSync, { locale: fr })
            : 'Jamais'
          }
        </div>
      </div>
    </div>
  );
};
```

### Logs

```typescript
// Actions importantes loggées
logger.info('Optimistic: Dossier créé', { id });
logger.warn('Créé en mode offline - sync différé', { id });
logger.error('Échec création - rollback', { id, error });

// Recherche dans logs
const offlineActions = logs.filter(l => 
  l.message.includes('offline') || 
  l.message.includes('queue')
);
```

---

## 🧪 Tests

### Tests Unitaires OfflineQueue

```typescript
describe('OfflineQueue', () => {
  beforeEach(async () => {
    await indexedDB.init();
    await offlineQueue.clear();
  });

  it('should queue action when offline', async () => {
    // Mock offline
    Object.defineProperty(navigator, 'onLine', { 
      value: false, 
      writable: true 
    });

    const actionId = await offlineQueue.add('CREATE_SHIPMENT', mockShipment);
    
    const stats = await offlineQueue.getStats();
    expect(stats.pending).toBe(1);
  });

  it('should flush queue when online', async () => {
    // Add action
    await offlineQueue.add('CREATE_SHIPMENT', mockShipment);
    
    // Mock online
    Object.defineProperty(navigator, 'onLine', { value: true });
    
    // Mock API
    global.fetch = jest.fn(() => 
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );

    await offlineQueue.flush();
    
    const stats = await offlineQueue.getStats();
    expect(stats.pending).toBe(0);
  });

  it('should retry failed actions with backoff', async () => {
    // Add action
    await offlineQueue.add('CREATE_SHIPMENT', mockShipment);
    
    // Mock API failure
    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount++;
      return Promise.reject(new Error('Server error'));
    });

    await offlineQueue.flush();
    
    // Should have tried 3 times (initial + 2 retries)
    expect(callCount).toBe(3);
  });
});
```

### Tests Intégration

```typescript
describe('Offline Create Shipment Flow', () => {
  it('should handle full offline → online → sync flow', async () => {
    // 1. Go offline
    Object.defineProperty(navigator, 'onLine', { value: false });

    // 2. Create shipment
    const { result } = renderHook(() => useContext(TransitContext));
    await act(async () => {
      await result.current.addShipment(mockShipment);
    });

    // 3. Verify optimistic update
    expect(result.current.shipments).toHaveLength(1);

    // 4. Verify queued
    const stats = await offlineQueue.getStats();
    expect(stats.pending).toBe(1);

    // 5. Go online
    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));

    // 6. Wait for auto-flush
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/shipments',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // 7. Verify synced
    const finalStats = await offlineQueue.getStats();
    expect(finalStats.pending).toBe(0);
  });
});
```

---

## 🚀 Utilisation Production

### Activation

Le système est **auto-activé** au démarrage :

```typescript
// services/offlineQueue.ts
if (typeof window !== 'undefined') {
  offlineQueue.init();
  
  window.addEventListener('online', () => {
    offlineQueue.flush(); // Auto-sync
  });
}
```

### Intégration Dashboard

```typescript
// App.tsx ou Dashboard.tsx
import { OfflineIndicator } from './components/OfflineIndicator';

const App = () => {
  return (
    <div>
      <header className="flex justify-between items-center p-4">
        <h1>Transit Guinée</h1>
        <OfflineIndicator /> {/* ✅ Ajouté */}
      </header>
      
      <Dashboard />
    </div>
  );
};
```

### Configuration

```typescript
// services/offlineQueue.ts

class OfflineQueueService {
  // Max tentatives avant abandon
  private maxRetries = 3; // ← Configurable
  
  // Délai initial retry
  private retryDelay = 1000; // 1s ← Configurable
}
```

---

## 📚 Ressources

### Documentation Externe

- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Online/Offline Events](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
- [Optimistic UI Pattern](https://www.apollographql.com/docs/react/performance/optimistic-ui/)

### Fichiers Impactés

**Créés** :
- ✅ `services/indexedDBService.ts` (250 lignes)
- ✅ `services/offlineQueue.ts` (300 lignes)
- ✅ `hooks/useNetworkStatus.ts` (60 lignes)
- ✅ `components/OfflineIndicator.tsx` (150 lignes)

**Modifiés** :
- ✅ `context/transitContext.tsx` (import + 3 méthodes refactorisées)

**Total** : ~760 lignes de code production + cette doc (500+ lignes)

---

## ✅ Checklist Validation

- [x] IndexedDB initialisé au démarrage
- [x] Queue persiste aux rechargements
- [x] Optimistic updates avec rollback
- [x] Auto-flush quand connexion rétablie
- [x] Retry avec backoff exponentiel
- [x] Indicateurs UI (OfflineIndicator)
- [x] Hook useNetworkStatus
- [x] Logs audit pour debug
- [x] Tests unitaires OfflineQueue
- [x] Tests intégration Context
- [x] Documentation complète

---

## 🎓 Formation Équipe

### Concepts Clés

1. **Optimistic Update** : Update UI avant confirmation serveur
2. **Rollback** : Annuler update si erreur
3. **Queue** : File d'attente actions à synchroniser
4. **Backoff Exponentiel** : Augmenter délai entre retries (1s → 2s → 4s)
5. **IndexedDB** : Base de données navigateur (async, performante)

### Points Critiques

⚠️ **Toujours sauvegarder état précédent** pour rollback
⚠️ **Valider côté backend** même si validé localement
⚠️ **Logger toutes les actions offline** pour debug
⚠️ **Tester scénarios offline/online** en dev

### Demo

```bash
# 1. Démarrer app
npm run dev

# 2. Ouvrir DevTools → Network → Throttling → Offline

# 3. Créer un dossier
# ✅ Apparaît dans UI
# ✅ Badge orange "Mode hors-ligne (1 action)"

# 4. Remettre Online
# ✅ Badge bleu "Synchronisation..."
# ✅ Requête POST envoyée
# ✅ Badge vert "En ligne"
```

---

**Version** : 1.0  
**Date** : Janvier 2026  
**Auteur** : Architecture Team  
**Status** : ✅ Production Ready
