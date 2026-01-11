# 🏗️ REFACTORING ARCHITECTURE - Logique Métier

## ✅ MIGRATION TERMINÉE (2026-01-07)

### Problème Initial

**Violation du principe de séparation des préoccupations** : La logique métier financière complexe était mélangée avec la gestion d'état React dans le Context.

```typescript
// ❌ AVANT - Logique métier dans UI layer
const payLiquidation = (shipmentId: string): { success: boolean; message: string } => {
  let result = { success: false, message: '' };
  setShipments(prev => prev.map(s => {
    if (s.id === shipmentId) {
      // 20 lignes de calculs financiers complexes
      const provisions = s.expenses.filter(e => e.type === 'PROVISION')...
      const paidDisbursements = s.expenses.filter(e => e.type === 'DISBURSEMENT' && e.paid)...
      const currentBalance = provisions - paidDisbursements;
      // ... logique métier complexe
    }
  }));
  return result;
};
```

**Problèmes :**
- ❌ Logique financière dans UI layer (Context)
- ❌ Impossible à tester isolément (dépend de React state)
- ❌ Violation Single Responsibility Principle
- ❌ Code difficilement maintenable
- ❌ Duplication de logique (calculs répétés)

---

## ✅ SOLUTION ARCHITECTURALE

### Architecture en Couches

```
┌────────────────────────────────────────────────────┐
│              UI LAYER (React)                      │
│  Components, Context, Hooks                        │
│  - Gestion d'état                                  │
│  - Appels API                                      │
│  - Mise à jour UI                                  │
└────────────────┬───────────────────────────────────┘
                 │
                 │ Utilise
                 ▼
┌────────────────────────────────────────────────────┐
│           SERVICE LAYER (Pure TS)                  │
│  PaymentService, ValidationService, etc.           │
│  - Logique métier pure                             │
│  - Calculs financiers                              │
│  - Validations règles métier                       │
│  - Fonctions statiques testables                   │
└────────────────┬───────────────────────────────────┘
                 │
                 │ Appelle
                 ▼
┌────────────────────────────────────────────────────┐
│           API LAYER (Backend)                      │
│  Express routes, JWT, Database                     │
│  - Persistance données                             │
│  - Authentification                                │
│  - Validations backend                             │
└────────────────────────────────────────────────────┘
```

---

## 📋 Modifications Effectuées

### 1. Création PaymentService

**Fichier** : [services/paymentService.ts](../services/paymentService.ts) (350+ lignes)

```typescript
/**
 * PAYMENT SERVICE - Logique Métier Financière
 * 
 * Architecture:
 * - Méthodes statiques pures (testables isolément)
 * - Pas de dépendances sur React/Context
 * - Types forts pour garantir la cohérence
 */

export class PaymentService {
  /**
   * Vérifie si une liquidation peut être payée
   * 
   * Règles métier:
   * 1. Une liquidation en attente doit exister
   * 2. Le solde provisions - débours doit être >= montant liquidation
   * 3. Seules les provisions PAYÉES sont comptabilisées
   */
  static canPayLiquidation(shipment: Shipment): PaymentResult {
    const liquidation = this.findPendingLiquidation(shipment);
    
    if (!liquidation) {
      return {
        success: false,
        message: 'Aucune liquidation en attente trouvée.'
      };
    }

    const balance = this.calculateBalance(shipment);

    if (balance.balance < liquidation.amount) {
      const shortfall = liquidation.amount - balance.balance;
      
      return {
        success: false,
        message: `Solde insuffisant: ${this.formatGNF(balance.balance)}`,
        requiredAmount: shortfall,
        currentBalance: balance.balance
      };
    }

    return { success: true, message: 'Paiement autorisé.' };
  }

  /**
   * Calcule le solde financier d'un dossier
   * 
   * Formule: Balance = Provisions payées - Débours payés
   */
  static calculateBalance(shipment: Shipment): BalanceDetails {
    const paidProvisions = shipment.expenses
      .filter(e => e.type === 'PROVISION' && e.paid)
      .reduce((sum, e) => sum + e.amount, 0);

    const paidDisbursements = shipment.expenses
      .filter(e => e.type === 'DISBURSEMENT' && e.paid)
      .reduce((sum, e) => sum + e.amount, 0);

    return {
      provisions,
      paidProvisions,
      disbursements,
      paidDisbursements,
      fees,
      balance: paidProvisions - paidDisbursements
    };
  }

  // + 10 autres méthodes (validation, formatage, rapport, etc.)
}
```

**Avantages :**
- ✅ Logique métier isolée et testable
- ✅ Pas de dépendances React
- ✅ Méthodes pures (même input → même output)
- ✅ Types forts (PaymentResult, BalanceDetails)
- ✅ Réutilisable dans tests, backend, CLI, etc.

### 2. Refactorisation TransitContext

**Fichier** : [context/transitContext.tsx](../context/transitContext.tsx)

```diff
+ import { PaymentService } from '../services/paymentService';

- // ❌ AVANT (Logique métier dans Context)
- const payLiquidation = (shipmentId: string): { success: boolean; message: string } => {
-   let result = { success: false, message: '' };
-   setShipments(prev => prev.map(s => {
-     if (s.id === shipmentId) {
-       const provisions = s.expenses.filter(e => e.type === 'PROVISION')...
-       const paidDisbursements = s.expenses.filter(e => e.type === 'DISBURSEMENT' && e.paid)...
-       // ... 20 lignes de logique
-     }
-   }));
-   return result;
- };

+ // ✅ APRÈS (Context délègue au service)
+ const payLiquidation = async (shipmentId: string): Promise<{ success: boolean; message: string }> => {
+   const shipment = shipments.find(s => s.id === shipmentId);
+   
+   if (!shipment) {
+     return { success: false, message: 'Dossier introuvable' };
+   }
+ 
+   // 1. Vérification locale via PaymentService (UX rapide)
+   const localCheck = PaymentService.canPayLiquidation(shipment);
+   
+   if (!localCheck.success) {
+     PaymentService.logPaymentAttempt(shipment, false);
+     return {
+       success: localCheck.success,
+       message: localCheck.message || 'Paiement refusé'
+     };
+   }
+ 
+   // 2. Appel API backend pour paiement réel
+   try {
+     const response = await fetch(`/api/shipments/${shipmentId}/pay-liquidation`, {
+       method: 'POST',
+       credentials: 'include'
+     });
+ 
+     if (!response.ok) {
+       throw new Error('Paiement refusé par le serveur');
+     }
+ 
+     const data = await response.json();
+ 
+     // 3. Mise à jour état local
+     setShipments(prev => prev.map(s => 
+       s.id === shipmentId ? data.updatedShipment : s
+     ));
+ 
+     PaymentService.logPaymentAttempt(data.updatedShipment, true);
+ 
+     return { success: true, message: 'Paiement effectué' };
+ 
+   } catch (err) {
+     return { success: false, message: err.message };
+   }
+ };
```

**Améliorations :**
- ✅ Context focalisé sur gestion d'état
- ✅ Validation locale avant appel API (UX rapide)
- ✅ Appel API backend (sécurité)
- ✅ Logs d'audit automatiques
- ✅ Code 3x plus court et lisible

### 3. Mise à Jour Types

**Fichier** : [types.ts](../types.ts)

```diff
export interface TransitContextType {
  // ...
- payLiquidation: (shipmentId: string) => { success: boolean; message: string };
+ payLiquidation: (shipmentId: string) => Promise<{ success: boolean; message: string }>; // ✅ Async
}
```

### 4. Mise à Jour Composants

**Fichiers** :
- [components/shipmentDetail/FinanceView.tsx](../components/shipmentDetail/FinanceView.tsx)
- [components/shipmentDetail/ShipmentDetailContainer.tsx](../components/shipmentDetail/ShipmentDetailContainer.tsx)

```diff
- const handlePayment = () => {
-   const res = onPayLiquidation(shipment.id);
- };

+ const handlePayment = async () => {
+   const res = await onPayLiquidation(shipment.id); // ✅ Await async
+ };
```

---

## 🧪 Tests Unitaires

**Fichier** : [services/paymentService.test.ts](../services/paymentService.test.ts) (450+ lignes)

### Coverage Complète

```typescript
describe('PaymentService', () => {
  // Balance Calculation (4 tests)
  it('should calculate balance correctly with provisions and disbursements');
  it('should only count paid provisions');
  it('should handle empty expenses array');
  it('should handle negative balance');

  // Find Liquidation (3 tests)
  it('should find unpaid customs liquidation');
  it('should return undefined if no pending liquidation');
  it('should ignore paid liquidations');

  // Payment Validation (6 tests)
  it('should allow payment when balance is sufficient');
  it('should refuse payment when balance is insufficient');
  it('should handle exact balance match');
  it('should account for other paid disbursements');
  it('should fail when no liquidation exists');

  // Provision Recommendations (3 tests)
  it('should detect when provision is required');
  it('should calculate recommended provision with 10% margin');
  it('should return 0 when no provision needed');

  // Financial Integrity (4 tests)
  it('should detect negative provisions');
  it('should detect disbursements exceeding provisions');
  it('should detect suspicious amounts');
  it('should pass validation for healthy shipment');

  // Formatting & Reports (3 tests)
  it('should format amounts correctly');
  it('should generate complete report');
  it('should show anomalies in report');
});
```

### Résultats

```bash
npm test -- paymentService.test.ts --run

✓ services/paymentService.test.ts (23 tests) 54ms

Test Files  1 passed (1)
     Tests  23 passed (23)
  Duration  1.70s
```

---

## 📊 Comparaison Avant/Après

| Aspect | ❌ Avant (Context) | ✅ Après (Service Layer) |
|--------|-------------------|---------------------------|
| **Localisation** | transitContext.tsx | paymentService.ts |
| **Lignes logique** | 30 lignes inline | 350 lignes structurées |
| **Testabilité** | Impossible (React state) | Complète (méthodes pures) |
| **Tests** | 0 tests unitaires | 23 tests unitaires ✅ |
| **Réutilisabilité** | Limité au Context | Utilisable partout |
| **Maintenabilité** | Difficile (mélangé UI) | Facile (séparé) |
| **Typage** | Faible | Fort (interfaces dédiées) |
| **Documentation** | Aucune | JSDoc complet |
| **Principe SRP** | Violé ❌ | Respecté ✅ |

---

## 🎯 Fonctionnalités PaymentService

### Calculs Financiers

```typescript
// 1. Calcul balance
const balance = PaymentService.calculateBalance(shipment);
// → { provisions: 5M, paidProvisions: 5M, disbursements: 2M, paidDisbursements: 2M, balance: 3M }

// 2. Vérification paiement
const check = PaymentService.canPayLiquidation(shipment);
// → { success: true, message: 'Paiement autorisé' }

// 3. Recherche liquidation
const liquidation = PaymentService.findPendingLiquidation(shipment);
// → { id: 'exp-1', amount: 2500000, category: 'Douane', paid: false }
```

### Recommandations

```typescript
// 4. Provision requise ?
const required = PaymentService.isProvisionRequired(shipment);
// → true si solde insuffisant

// 5. Montant recommandé
const recommended = PaymentService.getRecommendedProvisionAmount(shipment);
// → 2 200 000 (shortfall + 10% marge)
```

### Validations

```typescript
// 6. Intégrité financière
const issues = PaymentService.validateFinancialIntegrity(shipment);
// → ['Débours payés supérieurs aux provisions reçues']
```

### Rapports

```typescript
// 7. Rapport financier
const report = PaymentService.generateFinancialReport(shipment);
```

**Output :**
```
📊 RAPPORT FINANCIER - TR-8849-XY
============================================================

💰 PROVISIONS:
   Total: 5 000 000 GNF
   Payées: 5 000 000 GNF

📤 DÉBOURS:
   Total: 2 500 000 GNF
   Payés: 2 000 000 GNF

💎 SOLDE DISPONIBLE: 3 000 000 GNF

⚖️  LIQUIDATION EN ATTENTE:
   Montant: 2 500 000 GNF
   Description: Liquidation Douane (DDI-2023-001)
   Statut: ✅ Payable
```

### Formatage

```typescript
// 8. Formatage GNF
PaymentService.formatGNF(1500000);
// → "1 500 000 GNF"
```

### Logs

```typescript
// 9. Audit automatique
PaymentService.logPaymentAttempt(shipment, true);
// → [AUDIT] Paiement Liquidation Validé { shipmentId, amount, balanceBefore, balanceAfter }
```

---

## 🔍 Cas d'Usage

### Cas 1 : Paiement Autorisé

```typescript
const shipment: Shipment = {
  expenses: [
    { type: 'PROVISION', amount: 5000000, paid: true },
    { category: 'Douane', type: 'DISBURSEMENT', amount: 2500000, paid: false }
  ]
};

const result = PaymentService.canPayLiquidation(shipment);
// → { success: true, message: 'Paiement autorisé' }
```

### Cas 2 : Solde Insuffisant

```typescript
const shipment: Shipment = {
  expenses: [
    { type: 'PROVISION', amount: 1000000, paid: true },
    { category: 'Douane', type: 'DISBURSEMENT', amount: 2500000, paid: false }
  ]
};

const result = PaymentService.canPayLiquidation(shipment);
// → {
//   success: false,
//   message: 'Solde insuffisant: 1 000 000 GNF disponible, 2 500 000 GNF requis',
//   requiredAmount: 1500000,
//   currentBalance: 1000000
// }
```

### Cas 3 : Provision Requise

```typescript
const shipment: Shipment = {
  expenses: [
    { type: 'PROVISION', amount: 1000000, paid: true },
    { category: 'Douane', type: 'DISBURSEMENT', amount: 3000000, paid: false }
  ]
};

// Vérifier si provision nécessaire
if (PaymentService.isProvisionRequired(shipment)) {
  const recommended = PaymentService.getRecommendedProvisionAmount(shipment);
  console.log(`Provision recommandée: ${PaymentService.formatGNF(recommended)}`);
  // → "Provision recommandée: 2 200 000 GNF" (2M shortfall + 10%)
}
```

### Cas 4 : Détection Anomalies

```typescript
const shipment: Shipment = {
  expenses: [
    { type: 'PROVISION', amount: 1000000, paid: true },
    { type: 'DISBURSEMENT', amount: 5000000, paid: true } // Anomalie!
  ]
};

const issues = PaymentService.validateFinancialIntegrity(shipment);
// → ['Débours payés supérieurs aux provisions reçues']
```

---

## 📝 Checklist Architecture

### Service Layer
- [x] PaymentService créé (350+ lignes)
- [x] Méthodes statiques pures
- [x] Types dédiés (PaymentResult, BalanceDetails)
- [x] JSDoc complet
- [x] Pas de dépendances React
- [x] Logs d'audit intégrés

### Tests
- [x] 23 tests unitaires
- [x] Coverage des calculs financiers
- [x] Coverage des validations
- [x] Coverage des edge cases
- [x] Tests des recommandations
- [x] Tests d'intégrité financière

### Context (Refactorisé)
- [x] Délégation à PaymentService
- [x] Méthode async (await backend)
- [x] Validation locale avant API
- [x] Gestion erreurs
- [x] Mise à jour état optimiste

### Composants
- [x] FinanceView.tsx - Handler async
- [x] ShipmentDetailContainer.tsx - Handler async
- [x] Types mis à jour (Promise)

### Documentation
- [x] REFACTORING_ARCHITECTURE.md - Ce document
- [x] README tests
- [x] JSDoc dans service

---

## 🚀 Utilisation

### Dans le Context

```typescript
import { PaymentService } from '../services/paymentService';

const payLiquidation = async (shipmentId: string) => {
  const shipment = shipments.find(s => s.id === shipmentId);
  
  // Validation locale
  const check = PaymentService.canPayLiquidation(shipment);
  if (!check.success) return check;
  
  // Appel API
  const response = await fetch('/api/shipments/.../pay-liquidation', {...});
  const data = await response.json();
  
  // Mise à jour état
  setShipments(prev => prev.map(s => s.id === shipmentId ? data.updatedShipment : s));
  
  return { success: true };
};
```

### Dans les Composants

```typescript
import { PaymentService } from '../../services/paymentService';

const FinanceView = ({ shipment }) => {
  const balance = PaymentService.calculateBalance(shipment);
  const canPay = PaymentService.canPayLiquidation(shipment);
  
  return (
    <div>
      <p>Solde: {PaymentService.formatGNF(balance.balance)}</p>
      <button disabled={!canPay.success}>
        Payer Liquidation
      </button>
      {!canPay.success && <p>{canPay.message}</p>}
    </div>
  );
};
```

### Dans les Tests

```typescript
import { PaymentService } from './paymentService';

it('should refuse payment when balance is insufficient', () => {
  const shipment = createMockShipment({
    expenses: [
      { type: 'PROVISION', amount: 1000000, paid: true },
      { category: 'Douane', type: 'DISBURSEMENT', amount: 2500000, paid: false }
    ]
  });

  const result = PaymentService.canPayLiquidation(shipment);

  expect(result.success).toBe(false);
  expect(result.requiredAmount).toBe(1500000);
});
```

---

## 📚 Patterns Appliqués

### 1. Service Layer Pattern
Séparation logique métier (services) et gestion d'état (context)

### 2. Single Responsibility Principle
- Context : Gestion d'état React
- PaymentService : Logique métier financière

### 3. Dependency Inversion
Context dépend de PaymentService (abstraction), pas l'inverse

### 4. Pure Functions
Méthodes statiques sans effets de bord (testabilité maximale)

### 5. Optimistic UI
Validation locale rapide avant appel API

---

**Dernière mise à jour** : 2026-01-07  
**Refactoring par** : Équipe Architecture Transit Guinée  
**Version** : 4.0 (Service Layer Pattern)  
**Statut** : ✅ Production Ready
