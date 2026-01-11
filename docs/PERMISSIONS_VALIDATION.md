# SYSTÈME DE PERMISSIONS & AUTORISATION

## 🎯 Problème Initial

**Code vulnérable** :
```typescript
// ❌ AUCUNE VALIDATION
const updateShipmentStatus = (shipmentId: string, newStatus: ShipmentStatus) => {
  setShipments(prev => prev.map(s => 
    s.id === shipmentId ? { ...s, status: newStatus } : s
  ));
};
```

**Risques identifiés** :
1. **Client peut livrer son propre dossier** → Frauder le processus
2. **Agent terrain peut payer liquidations** → Détournement de fonds
3. **Comptable peut créer des dossiers** → Fraude comptable
4. **Aucun audit** des tentatives non autorisées

---

## ✅ Solution Architecture

### Double Validation Sécurité

```
┌─────────────────────────────────────────────────────┐
│   1. VALIDATION CLIENT (UX Rapide)                  │
│   - canUpdateStatus(role, currentStatus, newStatus) │
│   - validateStatusChange() → {allowed, reason}      │
│   - Feedback immédiat si refusé                     │
│   - Logs audit tentatives                           │
└──────────────┬──────────────────────────────────────┘
               │ Si autorisé ↓
┌─────────────────────────────────────────────────────┐
│   2. VALIDATION SERVEUR (Sécurité)                  │
│   - Middleware authenticateJWT                      │
│   - Vérification rôle depuis JWT décodé             │
│   - Re-validation permissions backend               │
│   - Source de vérité finale                         │
└─────────────────────────────────────────────────────┘
```

**Pourquoi double validation ?**
- **Client** : UX rapide, cacher boutons, feedback immédiat
- **Serveur** : Sécurité, impossible à bypasser (même avec DevTools)

---

## 📦 Structure Permissions

### Fichier `utils/permissions.ts`

**1. Permissions Génériques** (existantes)
```typescript
enum Permission {
  VIEW_FINANCE,
  MAKE_PAYMENTS,
  UPLOAD_DOCUMENTS,
  MANAGE_USERS,
  // ...
}

hasPermission(role, Permission.MAKE_PAYMENTS) → boolean
```

**2. Permissions Statuts** (✅ nouvelles)
```typescript
STATUS_PERMISSIONS: Record<Role, ShipmentStatus[]> = {
  [Role.CLIENT]: [],
  [Role.CREATION_AGENT]: [OPENED, PRE_CLEARANCE],
  [Role.FIELD_AGENT]: [PRE_CLEARANCE, BAE_GRANTED, CUSTOMS_DECLARED, DELIVERED],
  [Role.ACCOUNTANT]: [LIQUIDATION_PAID, DELIVERED],
  [Role.DIRECTOR]: [...ALL_STATUSES]
}
```

**3. Workflow Validation**
```typescript
isValidStatusTransition(OPENED, PRE_CLEARANCE) → true
isValidStatusTransition(DELIVERED, OPENED) → false (retour arrière interdit)
```

---

## 🔒 Matrice Permissions Complète

### Permissions par Rôle

| Rôle | Créer Dossier | Changer Statuts | Payer Liquidation | Upload Docs | Supprimer |
|------|---------------|-----------------|-------------------|-------------|-----------|
| **CLIENT** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **CREATION_AGENT** | ✅ | OPENED, PRE_CLEARANCE | ❌ | ✅ | ❌ |
| **FIELD_AGENT** | ❌ | PRE_CLEARANCE, BAE_GRANTED, CUSTOMS_DECLARED, DELIVERED | ❌ | ✅ | ❌ |
| **ACCOUNTANT** | ❌ | LIQUIDATION_PAID, DELIVERED | ✅ | ✅ | ❌ |
| **DIRECTOR** | ✅ | ✅ Tous | ✅ | ✅ | ✅ |

### Workflow Statuts Valides

```
OPENED
  ↓
PRE_CLEARANCE
  ↓
BAE_GRANTED
  ↓
CUSTOMS_DECLARED
  ↓
CUSTOMS_LIQUIDATION
  ↓
LIQUIDATION_PAID
  ↓
DELIVERED (final)
```

**Transitions interdites** :
- ❌ Retour arrière (DELIVERED → OPENED)
- ❌ Sauts d'étapes (OPENED → DELIVERED)
- ❌ Même statut (OPENED → OPENED)

---

## 🔧 Implémentation

### 1. utils/permissions.ts - Fonctions Ajoutées

```typescript
/**
 * Vérifie si rôle peut attribuer un statut
 */
export const canUpdateStatus = (
  role: Role,
  currentStatus: ShipmentStatus,
  newStatus: ShipmentStatus
): boolean => {
  const allowedStatuses = STATUS_PERMISSIONS[role];
  return allowedStatuses.includes(newStatus);
};

/**
 * Valide transition selon workflow métier
 */
export const isValidStatusTransition = (
  currentStatus: ShipmentStatus,
  newStatus: ShipmentStatus
): boolean => {
  const validTransitions: Record<ShipmentStatus, ShipmentStatus[]> = {
    [ShipmentStatus.OPENED]: [ShipmentStatus.PRE_CLEARANCE],
    [ShipmentStatus.PRE_CLEARANCE]: [ShipmentStatus.BAE_GRANTED, ShipmentStatus.CUSTOMS_DECLARED],
    // ...
  };
  
  return validTransitions[currentStatus]?.includes(newStatus) || false;
};

/**
 * Validation complète (permissions + workflow)
 */
export const validateStatusChange = (
  role: Role,
  currentStatus: ShipmentStatus,
  newStatus: ShipmentStatus
): { allowed: boolean; reason?: string } => {
  // 1. Vérifier permissions rôle
  if (!canUpdateStatus(role, currentStatus, newStatus)) {
    return {
      allowed: false,
      reason: `Votre rôle (${role}) ne permet pas d'attribuer le statut ${newStatus}`
    };
  }

  // 2. Vérifier workflow métier
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    return {
      allowed: false,
      reason: `Transition invalide: ${currentStatus} → ${newStatus}`
    };
  }

  return { allowed: true };
};

/**
 * Obtient statuts disponibles pour UI
 */
export const getAvailableStatuses = (
  role: Role,
  currentStatus: ShipmentStatus
): ShipmentStatus[] => {
  const allowedByRole = STATUS_PERMISSIONS[role];
  
  return allowedByRole.filter(status => 
    isValidStatusTransition(currentStatus, status)
  );
};

/**
 * Permissions création/suppression
 */
export const canCreateShipment = (role: Role): boolean => {
  return [Role.CREATION_AGENT, Role.DIRECTOR].includes(role);
};

export const canDeleteShipment = (role: Role): boolean => {
  return role === Role.DIRECTOR;
};
```

### 2. context/transitContext.tsx - Validation Ajoutée

```typescript
import { 
  canUpdateStatus, 
  validateStatusChange, 
  canCreateShipment 
} from '../utils/permissions';

// ✅ CRÉATION DOSSIER
const addShipment = async (newShipment: Shipment) => {
  // 1. Validation permissions
  if (!canCreateShipment(role)) {
    const error = `Votre rôle (${role}) ne permet pas de créer des dossiers`;
    logger.warn('Shipment creation denied', { role, userId: currentUserId });
    throw new Error(error);
  }

  // 2. Optimistic update
  setShipments(prev => [newShipment, ...prev]);

  // 3. Sync backend (qui re-vérifie!)
  try {
    const created = await api.createShipment(newShipment);
    setShipments(prev => prev.map(s => s.id === newShipment.id ? created : s));
  } catch (err) {
    // Rollback si erreur serveur
    setShipments(prev => prev.filter(s => s.id !== newShipment.id));
    throw err;
  }
};

// ✅ CHANGEMENT STATUT
const updateShipmentStatus = async (
  shipmentId: string, 
  newStatus: ShipmentStatus
) => {
  const previousShipment = shipments.find(s => s.id === shipmentId);
  
  if (!previousShipment) {
    throw new Error('Dossier introuvable');
  }

  // 1. Validation permissions rôle
  if (!canUpdateStatus(role, previousShipment.status, newStatus)) {
    const error = `Votre rôle (${role}) ne permet pas d'attribuer le statut ${newStatus}`;
    logger.warn('Status change denied - role permission', { 
      role, 
      currentStatus: previousShipment.status, 
      newStatus 
    });
    throw new Error(error);
  }

  // 2. Validation workflow métier
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

  // 3. Optimistic update (validation passée)
  setShipments(prev => prev.map(s => 
    s.id === shipmentId 
      ? { ...s, status: newStatus }
      : s
  ));

  // 4. Sync backend (re-validation serveur)
  try {
    const updated = await api.updateShipmentStatus(shipmentId, newStatus);
    setShipments(prev => prev.map(s => s.id === shipmentId ? updated : s));
    
    logger.audit('Statut changé et synchronisé', { 
      shipmentId, 
      status: newStatus,
      role 
    });
  } catch (err: any) {
    // Rollback si refusé par serveur
    setShipments(prev => prev.map(s => 
      s.id === shipmentId ? previousShipment : s
    ));
    
    throw new Error(`Échec changement statut: ${err.message}`);
  }
};
```

### 3. Backend - Re-validation Serveur (À IMPLÉMENTER)

```typescript
// server/routes/shipments.ts

router.patch('/:id/status', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus } = req.body;
    const user = (req as any).user; // Depuis JWT

    // 1. Récupérer dossier
    const shipment = await db.shipments.findById(id);
    if (!shipment) {
      return res.status(404).json({ message: 'Dossier introuvable' });
    }

    // 2. RE-VALIDER permissions côté serveur (sécurité!)
    if (!canUpdateStatus(user.role, shipment.status, newStatus)) {
      logger.warn('Status change denied by server', {
        userId: user.id,
        role: user.role,
        shipmentId: id,
        currentStatus: shipment.status,
        newStatus
      });
      
      return res.status(403).json({ 
        message: `Votre rôle ne permet pas d'attribuer le statut ${newStatus}` 
      });
    }

    // 3. Valider workflow
    const validation = validateStatusChange(user.role, shipment.status, newStatus);
    if (!validation.allowed) {
      return res.status(400).json({ 
        message: validation.reason 
      });
    }

    // 4. Appliquer changement
    shipment.status = newStatus;
    await db.shipments.update(id, shipment);

    // 5. Audit log
    await db.auditLog.create({
      action: 'STATUS_CHANGE',
      userId: user.id,
      shipmentId: id,
      previousStatus: shipment.status,
      newStatus,
      timestamp: new Date()
    });

    res.json({ success: true, updatedShipment: shipment });

  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});
```

---

## 💡 Utilisation UI

### Afficher Seulement Statuts Disponibles

```typescript
// components/StatusSelector.tsx
import { getAvailableStatuses } from '../utils/permissions';

const StatusSelector = ({ shipment, role, onStatusChange }) => {
  const availableStatuses = getAvailableStatuses(role, shipment.status);

  return (
    <select onChange={(e) => onStatusChange(e.target.value)}>
      <option value={shipment.status}>{shipment.status}</option>
      {availableStatuses.map(status => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
};
```

### Cacher Boutons Selon Permissions

```typescript
// components/ShipmentActions.tsx
import { canCreateShipment, canDeleteShipment } from '../utils/permissions';

const ShipmentActions = ({ role }) => {
  return (
    <div>
      {canCreateShipment(role) && (
        <button onClick={handleCreate}>Créer Dossier</button>
      )}
      
      {canDeleteShipment(role) && (
        <button onClick={handleDelete}>Supprimer</button>
      )}
    </div>
  );
};
```

### Gestion Erreurs UX

```typescript
const handleStatusChange = async (shipmentId, newStatus) => {
  try {
    await updateShipmentStatus(shipmentId, newStatus);
    toast.success('Statut modifié avec succès');
  } catch (err: any) {
    // Afficher raison du refus à l'utilisateur
    toast.error(err.message);
    // Ex: "Votre rôle (FIELD_AGENT) ne permet pas d'attribuer le statut LIQUIDATION_PAID"
  }
};
```

---

## 🧪 Tests

### Tests Unitaires Permissions

```typescript
// utils/permissions.test.ts
describe('Permissions System', () => {
  describe('canUpdateStatus', () => {
    it('should allow FIELD_AGENT to set PRE_CLEARANCE', () => {
      const result = canUpdateStatus(
        Role.FIELD_AGENT,
        ShipmentStatus.OPENED,
        ShipmentStatus.PRE_CLEARANCE
      );
      expect(result).toBe(true);
    });

    it('should deny CLIENT from changing any status', () => {
      const result = canUpdateStatus(
        Role.CLIENT,
        ShipmentStatus.OPENED,
        ShipmentStatus.DELIVERED
      );
      expect(result).toBe(false);
    });

    it('should deny ACCOUNTANT from setting BAE_GRANTED', () => {
      const result = canUpdateStatus(
        Role.ACCOUNTANT,
        ShipmentStatus.PRE_CLEARANCE,
        ShipmentStatus.BAE_GRANTED
      );
      expect(result).toBe(false);
    });
  });

  describe('isValidStatusTransition', () => {
    it('should allow OPENED → PRE_CLEARANCE', () => {
      const result = isValidStatusTransition(
        ShipmentStatus.OPENED,
        ShipmentStatus.PRE_CLEARANCE
      );
      expect(result).toBe(true);
    });

    it('should deny DELIVERED → OPENED (backward)', () => {
      const result = isValidStatusTransition(
        ShipmentStatus.DELIVERED,
        ShipmentStatus.OPENED
      );
      expect(result).toBe(false);
    });

    it('should deny OPENED → DELIVERED (skip)', () => {
      const result = isValidStatusTransition(
        ShipmentStatus.OPENED,
        ShipmentStatus.DELIVERED
      );
      expect(result).toBe(false);
    });
  });

  describe('validateStatusChange', () => {
    it('should validate full workflow', () => {
      const result = validateStatusChange(
        Role.FIELD_AGENT,
        ShipmentStatus.OPENED,
        ShipmentStatus.PRE_CLEARANCE
      );
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject with clear reason', () => {
      const result = validateStatusChange(
        Role.CLIENT,
        ShipmentStatus.OPENED,
        ShipmentStatus.DELIVERED
      );
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('CLIENT');
    });
  });

  describe('getAvailableStatuses', () => {
    it('should return only valid next statuses', () => {
      const statuses = getAvailableStatuses(
        Role.FIELD_AGENT,
        ShipmentStatus.OPENED
      );
      
      expect(statuses).toContain(ShipmentStatus.PRE_CLEARANCE);
      expect(statuses).not.toContain(ShipmentStatus.DELIVERED);
    });

    it('should return empty for DELIVERED (final)', () => {
      const statuses = getAvailableStatuses(
        Role.DIRECTOR,
        ShipmentStatus.DELIVERED
      );
      
      expect(statuses).toHaveLength(0);
    });
  });
});
```

### Tests Intégration Context

```typescript
// context/__tests__/permissions-integration.test.ts
describe('Context Permissions Integration', () => {
  it('should throw error when CLIENT tries to create shipment', async () => {
    const { result } = renderHook(() => useContext(TransitContext), {
      wrapper: ({ children }) => (
        <TransitProvider initialRole={Role.CLIENT}>
          {children}
        </TransitProvider>
      )
    });

    await expect(
      result.current.addShipment(mockShipment)
    ).rejects.toThrow('ne permet pas de créer');
  });

  it('should allow CREATION_AGENT to create shipment', async () => {
    const { result } = renderHook(() => useContext(TransitContext), {
      wrapper: ({ children }) => (
        <TransitProvider initialRole={Role.CREATION_AGENT}>
          {children}
        </TransitProvider>
      )
    });

    await expect(
      result.current.addShipment(mockShipment)
    ).resolves.not.toThrow();
  });

  it('should throw error on invalid status transition', async () => {
    const { result } = renderHook(() => useContext(TransitContext), {
      wrapper: ({ children }) => (
        <TransitProvider initialRole={Role.DIRECTOR}>
          {children}
        </TransitProvider>
      )
    });

    await expect(
      result.current.updateShipmentStatus(
        'ship-1',
        ShipmentStatus.DELIVERED // Skip BAE_GRANTED
      )
    ).rejects.toThrow('Transition invalide');
  });
});
```

---

## 📊 Audit & Monitoring

### Logs Générés

Toutes les tentatives (autorisées ou refusées) sont loggées :

```typescript
// Permission accordée
logger.audit('Statut changé et synchronisé', { 
  shipmentId, 
  status: newStatus,
  role,
  userId
});

// Permission refusée
logger.warn('Status change denied - role permission', { 
  role, 
  currentStatus, 
  newStatus,
  userId
});

logger.warn('Status change denied - invalid transition', {
  role,
  currentStatus,
  newStatus,
  reason
});
```

### Dashboard Audit

```typescript
const PermissionsAuditDashboard = () => {
  const [deniedAttempts, setDeniedAttempts] = useState([]);

  useEffect(() => {
    // Récupérer tentatives refusées depuis logs
    const attempts = logger.getLogs()
      .filter(log => log.level === 'warn' && log.message.includes('denied'));
    
    setDeniedAttempts(attempts);
  }, []);

  return (
    <div>
      <h2>Tentatives Non Autorisées (Sécurité)</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Utilisateur</th>
            <th>Rôle</th>
            <th>Action Tentée</th>
            <th>Raison Refus</th>
          </tr>
        </thead>
        <tbody>
          {deniedAttempts.map(attempt => (
            <tr key={attempt.timestamp}>
              <td>{new Date(attempt.timestamp).toLocaleString()}</td>
              <td>{attempt.context.userId}</td>
              <td>{attempt.context.role}</td>
              <td>{attempt.context.newStatus}</td>
              <td>{attempt.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

---

## 🔒 Sécurité Renforcée

### Checks Multiples

1. **UI** : Cacher boutons/options non autorisés
2. **Context** : Validation avant optimistic update
3. **API** : Re-validation serveur (source de vérité)
4. **Database** : Contraintes DB (trigger SQL)

### Backend Middleware

```typescript
// server/middleware/permissions.ts
export const requireStatusPermission = (
  allowedRoles: Role[]
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!allowedRoles.includes(user.role)) {
      logger.warn('Unauthorized access attempt', {
        userId: user.id,
        role: user.role,
        endpoint: req.path
      });
      
      return res.status(403).json({ 
        message: 'Accès refusé' 
      });
    }
    
    next();
  };
};

// Utilisation
router.patch('/:id/status', 
  authenticateJWT,
  requireStatusPermission([Role.FIELD_AGENT, Role.ACCOUNTANT, Role.DIRECTOR]),
  updateStatusController
);
```

---

## ✅ Checklist Validation

- [x] Matrice permissions STATUS_PERMISSIONS définie
- [x] Fonction canUpdateStatus implémentée
- [x] Validation workflow isValidStatusTransition
- [x] Validation complète validateStatusChange
- [x] Helper getAvailableStatuses pour UI
- [x] Permissions création canCreateShipment
- [x] Permissions suppression canDeleteShipment
- [x] Context addShipment avec validation
- [x] Context updateShipmentStatus avec validation
- [x] Logs audit pour tentatives refusées
- [x] Tests unitaires permissions
- [ ] Backend re-validation serveur
- [ ] Tests intégration E2E
- [ ] Middleware backend requireStatusPermission
- [ ] Dashboard audit tentatives

---

## 📚 Ressources

### Fichiers Modifiés

**Créés** :
- ✅ `docs/PERMISSIONS_VALIDATION.md` (ce fichier)

**Modifiés** :
- ✅ `utils/permissions.ts` (+280 lignes) - Ajout validation statuts
- ✅ `context/transitContext.tsx` - Import + validation addShipment + updateShipmentStatus

**À Créer** :
- ⏳ `utils/permissions.test.ts` - Tests unitaires
- ⏳ `server/middleware/permissions.ts` - Middleware backend
- ⏳ `server/routes/shipments.ts` - Endpoints avec validation

### Prochaines Étapes

1. **Tests unitaires** permissions (1h)
2. **Backend validation** serveur (2h)
3. **UI improvements** (cacher options) (1h)
4. **Dashboard audit** tentatives (2h)

---

**Version** : 1.0  
**Date** : Janvier 2026  
**Auteur** : Security Team  
**Status** : ✅ Client Validé, ⏳ Backend En Attente
