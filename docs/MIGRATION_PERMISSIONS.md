# 🔒 Guide Migration Permissions - Sécurité Renforcée

## ⚠️ PROBLÈME IDENTIFIÉ

**Code actuel (VULNÉRABLE)** :
```typescript
// ❌ ShipmentDetailContainer.tsx ligne 25-27
const canViewFinance = role === Role.ACCOUNTANT || role === Role.DIRECTOR;
const canMakePayments = role === Role.ACCOUNTANT || role === Role.DIRECTOR;
const canEditOperations = role !== Role.CLIENT;
```

**Vulnérabilités** :
1. ❌ **Vérification uniquement côté client** → Peut être contournée (inspect element, console, proxy)
2. ❌ **Logique dupliquée** → Risques d'incohérence entre composants
3. ❌ **Pas d'audit** → Impossible de tracer qui a accédé à quoi
4. ❌ **Pas de protection backend** → API exposées sans vérification

---

## ✅ SOLUTION IMPLÉMENTÉE

### Architecture Double Couche

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (UI Protection)                                    │
│  - Hook usePermissions()                                     │
│  - Masque/affiche éléments UI                                │
│  - Feedback utilisateur immédiat                             │
└──────────────────────┬──────────────────────────────────────┘
                       │ Requête HTTP + JWT
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  BACKEND (Security Enforcement)                              │
│  - Middleware requirePermission()                            │
│  - Vérifie JWT + Permissions                                 │
│  - Bloque accès non autorisés (403)                          │
│  - Audit logging                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 MIGRATION ÉTAPE PAR ÉTAPE

### Étape 1 : Migrer Frontend (ShipmentDetailContainer.tsx)

**AVANT** (lignes 25-27) :
```typescript
const canViewFinance = role === Role.ACCOUNTANT || role === Role.DIRECTOR;
const canMakePayments = role === Role.ACCOUNTANT || role === Role.DIRECTOR;
const canEditOperations = role !== Role.CLIENT;
```

**APRÈS** :
```typescript
import { usePermissions } from '../../hooks/usePermissions';

// Dans le composant
const {
  canViewFinance,
  canMakePayments,
  canEditOperations,
  canUploadDocuments
} = usePermissions();
```

**Avantages** :
- ✅ Single Source of Truth
- ✅ Mémoïsation automatique (performance)
- ✅ Audit logging intégré
- ✅ Type-safe

---

### Étape 2 : Protéger les Routes Backend

**Créer les routes sécurisées** :
```typescript
// server/index.ts - Ajouter après routes auth
import financeRoutes from './routes/finance';
app.use('/api/finance', financeRoutes);
```

**Exemple de route protégée** :
```typescript
// server/routes/finance.ts
router.post(
  '/expenses',
  authenticateJWT,                           // 1. Vérifier token JWT
  requirePermission(Permission.ADD_EXPENSES), // 2. Vérifier permission
  async (req, res) => {
    // Route sécurisée - Code métier
  }
);
```

**Résultat** :
```bash
# Utilisateur avec permission
POST /api/finance/expenses → 201 Created ✅

# Utilisateur sans permission
POST /api/finance/expenses → 403 Forbidden ❌
{
  "success": false,
  "message": "Permission insuffisante",
  "requiredPermission": "ADD_EXPENSES"
}
```

---

### Étape 3 : Mettre à Jour Appels API Frontend

**AVANT** (non sécurisé) :
```typescript
// Aucune vérification, appel direct
const handleAddExpense = async () => {
  const response = await fetch('/api/finance/expenses', {
    method: 'POST',
    body: JSON.stringify({ ... })
  });
};
```

**APRÈS** (sécurisé) :
```typescript
const { canAddExpenses, requirePermission } = usePermissions();

const handleAddExpense = async () => {
  // 1. Vérification côté client (UX)
  try {
    requirePermission(Permission.ADD_EXPENSES, 'Adding expense');
  } catch (error) {
    toast.error('Vous n\'avez pas la permission d\'ajouter des dépenses');
    return;
  }

  // 2. Appel API (serveur vérifiera aussi)
  try {
    const response = await fetch('/api/finance/expenses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ... })
    });

    if (response.status === 403) {
      toast.error('Accès refusé');
      return;
    }

    // Success handling
  } catch (error) {
    // Error handling
  }
};
```

---

## 🔍 FICHIERS À MIGRER

### Priorité HAUTE (Sécurité critique)

**1. ShipmentDetailContainer.tsx** (lignes 25-27)
```bash
# Recherche
grep -n "role === Role\." components/shipmentDetail/ShipmentDetailContainer.tsx

# Lignes à remplacer
25: const canViewFinance = role === Role.ACCOUNTANT || role === Role.DIRECTOR;
26: const canMakePayments = role === Role.ACCOUNTANT || role === Role.DIRECTOR;
27: const canEditOperations = role !== Role.CLIENT;
```

**2. Dashboard.tsx**
```bash
# Recherche tous checks permissions inline
grep -rn "role === Role\." components/Dashboard.tsx
```

**3. FinanceView.tsx** (si checks inline)
```bash
grep -rn "role === Role\." components/shipmentDetail/FinanceView.tsx
```

### Priorité MOYENNE

**4. Autres composants** :
```bash
# Recherche globale
grep -r "role === Role\." components/ --include="*.tsx"
```

---

## 🧪 TESTS DE VALIDATION

### Test 1 : Vérifier Permissions Frontend

```typescript
// hooks/usePermissions.test.ts
import { renderHook } from '@testing-library/react';
import { usePermissions } from './usePermissions';

describe('usePermissions', () => {
  it('ACCOUNTANT peut voir finance', () => {
    const { result } = renderHook(() => usePermissions(), {
      wrapper: ({ children }) => (
        <TransitContext.Provider value={{ role: Role.ACCOUNTANT }}>
          {children}
        </TransitContext.Provider>
      )
    });

    expect(result.current.canViewFinance).toBe(true);
    expect(result.current.canMakePayments).toBe(true);
  });

  it('CLIENT ne peut PAS voir finance', () => {
    const { result } = renderHook(() => usePermissions(), {
      wrapper: ({ children }) => (
        <TransitContext.Provider value={{ role: Role.CLIENT }}>
          {children}
        </TransitContext.Provider>
      )
    });

    expect(result.current.canViewFinance).toBe(false);
    expect(result.current.canMakePayments).toBe(false);
  });
});
```

### Test 2 : Vérifier Protection Backend

```bash
# Test avec curl (CLIENT tente accès finance)
curl -X GET http://localhost:3000/api/finance/overview/123 \
  -H "Authorization: Bearer CLIENT_TOKEN"

# Résultat attendu
HTTP/1.1 403 Forbidden
{
  "success": false,
  "message": "Permission insuffisante",
  "requiredPermission": "VIEW_FINANCE"
}
```

### Test 3 : Vérifier JWT Permissions

```typescript
// Test décodage JWT
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const decoded = jwt.verify(token, JWT_SECRET);

console.log(decoded);
// {
//   id: "user123",
//   email: "comptable@transit.gn",
//   role: "ACCOUNTANT",
//   permissions: "eyJ...encoded_permissions...=",
//   exp: 1737894000
// }
```

---

## 📊 MATRICE PERMISSIONS (Référence)

| Permission          | CLIENT | CREATION | TRACKING | ACCOUNTANT | DIRECTOR |
|---------------------|--------|----------|----------|------------|----------|
| VIEW_FINANCE        | ❌     | ❌       | ❌       | ✅         | ✅       |
| MAKE_PAYMENTS       | ❌     | ❌       | ❌       | ✅         | ✅       |
| ADD_EXPENSES        | ❌     | ❌       | ❌       | ✅         | ✅       |
| APPROVE_EXPENSES    | ❌     | ❌       | ❌       | ❌         | ✅       |
| EDIT_OPERATIONS     | ❌     | ❌       | ✅       | ✅         | ✅       |
| EDIT_SHIPMENTS      | ❌     | ✅       | ❌       | ❌         | ✅       |
| UPLOAD_DOCUMENTS    | ❌     | ✅       | ✅       | ✅         | ✅       |
| VIEW_SHIPMENTS      | ❌     | ✅       | ✅       | ✅         | ✅       |
| VIEW_OWN_SHIPMENTS  | ✅     | ❌       | ❌       | ❌         | ✅       |
| MANAGE_USERS        | ❌     | ❌       | ❌       | ❌         | ✅       |
| VIEW_AUDIT_LOGS     | ❌     | ❌       | ❌       | ❌         | ✅       |
| EXPORT_DATA         | ❌     | ❌       | ❌       | ❌         | ✅       |

---

## 🚨 AUDIT LOGGING

Le système enregistre automatiquement :

```typescript
// Exemple log permission check
{
  timestamp: "2025-01-27T10:30:45.123Z",
  role: "CLIENT",
  permission: "VIEW_FINANCE",
  granted: false,
  context: "Attempting to view finance dashboard"
}
```

**Consulter logs** :
```typescript
import { getPermissionAuditLog } from '../utils/permissions';

// Derniers 100 checks
const logs = getPermissionAuditLog(100);
console.table(logs);
```

---

## ✅ CHECKLIST MIGRATION

### Frontend
- [ ] Remplacer checks inline dans ShipmentDetailContainer.tsx
- [ ] Remplacer checks inline dans Dashboard.tsx
- [ ] Importer usePermissions dans tous composants concernés
- [ ] Supprimer imports `Role` inutilisés
- [ ] Tester UI avec différents rôles

### Backend
- [ ] Importer routes finance dans server/index.ts
- [ ] Créer routes protégées pour toutes opérations sensibles
- [ ] Ajouter middleware authenticateJWT + requirePermission
- [ ] Tester avec Postman/curl (status 403 si denied)
- [ ] Vérifier JWT contient champ `permissions`

### Tests
- [ ] Écrire tests unitaires usePermissions
- [ ] Écrire tests intégration routes backend
- [ ] Test manuel : CLIENT essaye accès finance → 403
- [ ] Test manuel : ACCOUNTANT accède finance → 200

### Documentation
- [ ] Mettre à jour README.md avec système permissions
- [ ] Documenter nouvelles routes API
- [ ] Ajouter exemples utilisation dans code comments

---

## 🔗 RESSOURCES

**Fichiers créés** :
- `utils/permissions.ts` - Système permissions centralisé
- `hooks/usePermissions.ts` - Hook React
- `server/middleware/permissions.ts` - Middleware Express
- `server/routes/finance.ts` - Routes sécurisées (exemple)

**Documentation** :
- [components/shipmentDetail/README.md](../components/shipmentDetail/README.md) - Architecture
- [.env.example](../.env.example) - Configuration JWT_SECRET

**Prochaine étape** :
```bash
# 1. Appliquer migration dans un composant
code components/shipmentDetail/ShipmentDetailContainer.tsx

# 2. Tester
npm run dev:all

# 3. Vérifier console browser + server logs
```
