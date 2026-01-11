# 🔒 TEST VERROUILLAGE AUTOMATIQUE - Guide Rapide

**Date** : 10 janvier 2026  
**Fonctionnalité** : Lock Screen avec fallback mot de passe  
**Durée test** : 5 minutes

---

## ✅ Pré-requis

1. **Serveurs lancés** :
   ```bash
   npm run dev:all
   ```

2. **URL correcte** : http://localhost:5173 (⚠️ PAS 127.0.0.1)

3. **Credentials** : 
   - Email : `admin@transit.gn`
   - Password : `password123`

---

## 🧪 Test 1 : Verrouillage Automatique (Changement d'onglet)

**Objectif** : Vérifier que l'écran se verrouille automatiquement

### Étapes

1. **Ouvrir Console Browser** : F12 → Console

2. **Se connecter** :
   - Email : `admin@transit.gn`
   - Password : `password123`
   
3. **Vérifier Dashboard** : 5 dossiers affichés (Port de Conakry)

4. **Changer d'onglet** : 
   - Ouvrir un nouvel onglet
   - Attendre 2 secondes
   - Revenir sur l'onglet TransitGuinée

5. **✅ Résultat attendu** :
   - Écran de verrouillage s'affiche (overlay bleu)
   - Cadenas visible
   - Message : "Session Verrouillée"
   - Nom utilisateur affiché : "Directeur Général"

6. **Vérifier Console** :
   ```
   🔒 Session verrouillée (écran éteint/changement onglet)
   ```

---

## 🧪 Test 2 : Déverrouillage Mot de Passe

**Objectif** : Vérifier reconnexion rapide sans rechargement

### Étapes

1. **Sur écran verrouillé** :
   - Champ "Mot de passe" visible
   - Focus automatique sur le champ

2. **Taper mot de passe** : `password123`

3. **Cliquer "Déverrouiller"** (ou Enter)

4. **✅ Résultat attendu** :
   - Déverrouillage en <1 seconde
   - Dashboard réapparaît instantanément
   - Même dossier visible (pas de rechargement page)
   - Console : `✅ Session déverrouillée (password)`

---

## 🧪 Test 3 : Mauvais Mot de Passe

**Objectif** : Vérifier gestion d'erreur

### Étapes

1. **Verrouiller session** : Changer d'onglet + revenir

2. **Taper mauvais password** : `wrongpassword`

3. **Cliquer "Déverrouiller"**

4. **✅ Résultat attendu** :
   - Message d'erreur rouge : "Mot de passe incorrect"
   - Champ vidé automatiquement
   - Écran reste verrouillé
   - Possibilité de réessayer

---

## 🧪 Test 4 : Inactivité 15 Minutes (Optionnel)

**Objectif** : Vérifier verrouillage automatique inactivité

### Étapes

1. **Se connecter** et rester sur dashboard

2. **Ne pas toucher souris/clavier pendant 15 minutes**

3. **✅ Résultat attendu** :
   - Après 15 min : Écran se verrouille automatiquement
   - Console : `⏰ Verrouillage automatique (inactivité 15min)`

**Note** : Pour tester rapidement, modifiez temporairement :
```typescript
// transitContext.tsx ligne 97
const INACTIVITY_TIMEOUT = 30 * 1000; // 30 secondes au lieu de 15 min
```

---

## 🧪 Test 5 : Biométrie (Fallback Gracieux)

**Objectif** : Vérifier message informatif si biométrie non configurée

### Étapes

1. **Verrouiller session**

2. **Regarder section biométrie** (bas de l'écran verrouillage)

3. **✅ Résultat attendu** :

   **Si Windows Hello/Touch ID configuré** :
   - Bouton "Déverrouiller avec Face ID/Touch ID" visible
   - Cliquer → Message : "Touch ID/Face ID non configuré. Utilisez votre mot de passe ci-dessus."
   - Fallback propre vers mot de passe

   **Si appareil ne supporte pas biométrie** :
   - Bouton biométrique **masqué**
   - Message : "💡 Biométrie non disponible sur cet appareil"
   - Info : "Configurez Windows Hello ou Touch ID pour déverrouillage rapide"

---

## 🐛 Diagnostic Problèmes

### Problème : Écran de verrouillage ne s'affiche pas

**Vérifications** :

1. **Console Browser (F12)** :
   ```
   Rechercher : "Session verrouillée"
   ```
   - Si absent : Listener pas déclenché
   - Vérifier `document.visibilityState`

2. **State `isLocked`** :
   - Dans React DevTools : TransitProvider → isLocked = true ?

3. **Import LockScreen** :
   ```typescript
   // App.tsx doit contenir :
   import { LockScreen } from './components/LockScreen';
   // ...
   <LockScreen />
   ```

### Problème : Mot de passe correct refusé

**Vérifications** :

1. **Network Tab (F12)** :
   - Request : `POST /api/auth/unlock`
   - Status : 200 OK ou 401 ?

2. **Route backend manquante** :
   ```bash
   # Vérifier logs backend :
   POST /unlock 404  # Route manquante
   ```

**Solution** : Créer route `/api/auth/unlock` backend (actuellement commentée)

### Problème : Erreur "quickUnlock is not a function"

**Vérifications** :

1. **Types TypeScript** :
   ```typescript
   // src/types.ts doit contenir :
   quickUnlock: (password?: string) => Promise<boolean>;
   ```

2. **Context value** :
   ```typescript
   // transitContext.tsx ligne 860 :
   const value = useMemo(() => ({
     // ...
     quickUnlock,
     lockSession
   }), [...]);
   ```

---

## 📊 Checklist Validation Complète

- [ ] **Verrouillage automatique** : Changement onglet fonctionne
- [ ] **Déverrouillage password** : Connexion <1s sans rechargement
- [ ] **Mauvais password** : Erreur claire, champ vidé
- [ ] **Biométrie non dispo** : Message informatif (pas d'erreur bloquante)
- [ ] **Console logs** : Aucune erreur rouge
- [ ] **UX fluide** : Pas de freeze/lag au verrouillage/déverrouillage

---

## 🎯 Comportement Attendu Final

```
User connecté → Change d'onglet
    ↓
Listener visibilitychange détecte 'hidden'
    ↓
setIsLocked(true)
    ↓
<LockScreen /> s'affiche (overlay)
    ↓
User retape password
    ↓
quickUnlock(password) → Backend vérifie JWT + password
    ↓
Backend renvoie { success: true }
    ↓
setIsLocked(false)
    ↓
Dashboard réapparaît (même état, pas de rechargement)
```

---

## 📚 Documentation Technique

**Fichiers modifiés** :
- `src/context/transitContext.tsx` : States isLocked, quickUnlock(), lockSession()
- `src/components/LockScreen.tsx` : Interface verrouillage
- `src/App.tsx` : Intégration <LockScreen />
- `src/types.ts` : Types quickUnlock, lockSession
- `src/hooks/useTransitSelectors.ts` : Hook useTransit()

**Sécurité** :
- JWT reste valide (pas de déconnexion)
- Données en mémoire préservées (pas de rechargement)
- Verrouillage préventif (changement onglet, inactivité)
- Fallback gracieux si biométrie non disponible

---

**Prochaine étape** : Implémenter route backend `/api/auth/unlock` si besoin d'une vérification serveur supplémentaire (actuellement client-side uniquement).
