# ShipmentDetail - Architecture Refactorisée

## 📁 Structure

```
components/shipmentDetail/
├── index.ts                      # Exports centralisés
├── ShipmentDetailContainer.tsx   # Container principal (320 lignes)
├── shipmentDetailState.ts        # State management avec useReducer (155 lignes)
├── TimelineView.tsx              # Vue chronologique (215 lignes)
├── DocumentsView.tsx             # Gestion documents (130 lignes)
└── FinanceView.tsx               # Gestion financière (265 lignes)
```

## 🎯 Bénéfices de la Refactorisation

### Avant
- ❌ **1 fichier monolithe** : 573 lignes
- ❌ **10+ useState** : État explosif difficile à maintenir
- ❌ **Logique métier dans UI** : Couplage fort
- ❌ **Tests impossibles** : Tout est mélangé
- ❌ **Responsabilités multiples** : Violation SOLID

### Après
- ✅ **Architecture modulaire** : 5 fichiers séparés
- ✅ **useReducer** : État centralisé et typé
- ✅ **Séparation UI/Logique** : Container pattern
- ✅ **Testabilité** : Chaque composant isolé
- ✅ **SOLID** : Une responsabilité par fichier

## 🏗️ Architecture

### Container Pattern

```tsx
ShipmentDetailContainer (Logique)
├── TimelineView (Présentation)
├── DocumentsView (Présentation)
└── FinanceView (Présentation)
```

### State Management

**Ancien (10+ useState):**
```tsx
const [activeTab, setActiveTab] = useState('timeline');
const [showScanner, setShowScanner] = useState(false);
const [analysisResult, setAnalysisResult] = useState(null);
// ... 10+ états séparés
```

**Nouveau (useReducer):**
```tsx
const [state, dispatch] = useReducer(shipmentDetailReducer, initialState);

// Actions typées
dispatch({ type: 'SET_ACTIVE_TAB', payload: 'finance' });
dispatch({ type: 'OPEN_SCANNER', payload: { type: 'BAE' } });
```

## 📦 Composants

### 1. ShipmentDetailContainer
**Responsabilité** : Orchestration et logique métier
- Gestion contexte TransitContext
- Handlers métier (scan, paiement, validation)
- Permissions et sécurité
- Coordination entre vues

### 2. TimelineView
**Responsabilité** : Affichage chronologique workflow
- 7 étapes du processus douane
- Composant TimelineStep réutilisable
- Formulaires inline pour chaque étape
- Statut visuel (completed/current/pending)

### 3. DocumentsView
**Responsabilité** : Gestion documents
- Liste documents avec statuts
- Upload via scanner
- Icônes par type de document
- Guide types documents

### 4. FinanceView
**Responsabilité** : Gestion financière
- Résumé financier (provisions, débours, liquidation)
- Ajout provisions/débours
- Paiement liquidation
- Historique dépenses avec reçus

### 5. shipmentDetailState
**Responsabilité** : State management
- Interface `ShipmentDetailState` typée
- 12 actions typées
- Reducer centralisé
- Initial state configurable

## 🔧 Utilisation

### Import
```tsx
import { ShipmentDetail } from './components/shipmentDetail';

// Usage
<ShipmentDetail shipmentId="123" onBack={() => navigate('/')} />
```

### Tester un composant isolé
```tsx
import { TimelineView } from './components/shipmentDetail/TimelineView';

<TimelineView
  shipment={mockShipment}
  role={Role.DIRECTOR}
  canEditOperations={true}
  onOpenScanner={mockFn}
  // ...props
/>
```

## 🧪 Tests

### Container
```tsx
describe('ShipmentDetailContainer', () => {
  it('should render timeline by default', () => {
    render(<ShipmentDetailContainer shipmentId="1" onBack={jest.fn()} />);
    expect(screen.getByText('Suivi')).toBeInTheDocument();
  });
});
```

### Reducer
```tsx
describe('shipmentDetailReducer', () => {
  it('should handle SET_ACTIVE_TAB', () => {
    const state = createInitialState();
    const newState = shipmentDetailReducer(state, {
      type: 'SET_ACTIVE_TAB',
      payload: 'finance'
    });
    expect(newState.activeTab).toBe('finance');
  });
});
```

### View Components
```tsx
describe('TimelineView', () => {
  it('should display completed steps', () => {
    const shipment = { ...mockShipment, status: ShipmentStatus.BAE_GRANTED };
    render(<TimelineView shipment={shipment} {...mockProps} />);
    expect(screen.getByText('✅')).toBeInTheDocument();
  });
});
```

## 📊 Métriques

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| **Fichiers** | 1 | 5 | +400% modularité |
| **Lignes max/fichier** | 573 | 320 | -44% complexité |
| **États gérés** | 10+ useState | 1 useReducer | -90% mental load |
| **Testabilité** | ❌ Impossible | ✅ Unitaire | +∞ |
| **Réutilisabilité** | ❌ Couplé | ✅ Modulaire | +∞ |

## 🔄 Migration

L'ancien fichier `ShipmentDetail.tsx` est **conservé** pour référence. La migration est transparente grâce au fichier `index.ts` :

```tsx
// Ancien import - fonctionne toujours
import { ShipmentDetail } from './components/ShipmentDetail';

// Nouveau import - même interface
import { ShipmentDetail } from './components/shipmentDetail';
```

## 🚀 Prochaines Améliorations

1. **Hooks personnalisés** : Extraire logique métier
   ```tsx
   useShipmentActions(shipmentId)
   useShipmentWorkflow(shipment)
   ```

2. **Tests unitaires** : Coverage 80%+
3. **Storybook** : Documentation visuelle
4. **Performance** : React.memo sur vues
5. **Zustand** : Remplacer Context API si nécessaire

## 📝 Conventions

- **Nommage** : PascalCase pour composants, camelCase pour fonctions
- **Types** : Interfaces explicites, pas de `any`
- **Props** : Interfaces nommées `ComponentNameProps`
- **Handlers** : Préfixe `handle` (handleOpenScanner)
- **Callbacks** : Préfixe `on` (onOpenScanner)

## 🎓 Principes Appliqués

- ✅ **SOLID** : Single Responsibility Principle
- ✅ **DRY** : Composant TimelineStep réutilisable
- ✅ **Container/Presentation** : Séparation logique/UI
- ✅ **Unidirectional Data Flow** : Props down, events up
- ✅ **Type Safety** : TypeScript strict mode

---

**Auteur** : Refactorisation Janvier 2026
**Stack** : React 19 + TypeScript 5.8 + useReducer
