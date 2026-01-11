# 🔍 ERREURS 401 NORMALES AU DÉMARRAGE

## ❓ Pourquoi ces erreurs apparaissent ?

Lorsque vous ouvrez l'application pour la première fois ou après un rafraîchissement de page (F5), vous voyez ces erreurs dans la console du navigateur :

```
:5173/api/auth/me?t=1768063148585:1  Failed to load resource: 401 (Unauthorized)
:5173/api/shipments:1  Failed to load resource: 401 (Unauthorized)
```

**C'est NORMAL et attendu !** ✅

---

## 🔐 Flow d'Authentification

### Séquence au Démarrage

1. **Application se charge**
   - React monte les composants
   - TransitContext s'initialise
   - App.tsx vérifie l'authentification

2. **Vérification de session (GET /api/auth/me)**
   - Essaie de récupérer l'utilisateur connecté
   - Si pas de cookie JWT → **401 Unauthorized** ← NORMAL
   - Code détecte l'erreur et affiche l'écran de login

3. **Tentative de chargement données (GET /api/shipments)**
   - Essaie de charger les dossiers
   - Si pas authentifié → **401 Unauthorized** ← NORMAL
   - Code détecte l'erreur et initialise liste vide `[]`

4. **Écran de login s'affiche**
   - Utilisateur se connecte
   - JWT cookie créé
   - Données rechargées avec succès ✅

---

## ✅ Corrections Appliquées

### 1. App.tsx - Éviter appel inutile /api/auth/me
```typescript
if (!wasAuthenticated) {
  logger.info('Page refresh detected - Logout for security');
  setIsAuthenticated(false);
  setAuthChecking(false);
  return; // ✅ STOP ici, ne pas appeler /api/auth/me
}
```

### 2. TransitContext - Skip loadShipments si pas authentifié
```typescript
const loadShipments = async () => {
  // ✅ Ne pas charger si pas authentifié (évite 401 inutiles)
  if (!isAuthenticated) {
    logger.info('Pas encore authentifié, skip loadShipments');
    setShipments([]);
    setLoading(false);
    return;
  }
  // ... fetch shipments
};
```

### 3. Dépendances useEffect mises à jour
```typescript
}, [reloadTrigger, isAuthenticated]); 
// ✅ Recharge automatiquement quand l'utilisateur se connecte
```

---

## 🧪 Test du Flow Corrigé

### Scénario 1 : Premier chargement
1. Ouvrir http://localhost:5174
2. Console devrait montrer :
   ```
   Page refresh detected - Logout for security
   Pas encore authentifié, skip loadShipments
   ```
3. **Pas de 401** car on n'appelle plus les API si pas authentifié
4. Écran de login s'affiche

### Scénario 2 : Connexion réussie
1. Se connecter : `admin@transit.gn` / `password123`
2. Console devrait montrer :
   ```
   Session authentifiée { role: 'DIRECTOR', userId: '...' }
   Shipments loaded from API { count: 6 }
   ```
3. Dashboard s'affiche avec les données

### Scénario 3 : Rafraîchissement pendant session
1. Utilisateur connecté, F5 pour rafraîchir
2. `sessionStorage.getItem('app_session')` = null (effacé par refresh)
3. Application déconnecte automatiquement (sécurité)
4. Écran de login réapparaît

---

## 📊 Comparaison Avant/Après

### ❌ Avant (Erreurs 401 dans console)
```
1. App.tsx mount
2. TransitContext mount
3. GET /api/auth/me → 401 Unauthorized ❌
4. GET /api/shipments → 401 Unauthorized ❌
5. Code détecte erreurs
6. Écran login s'affiche
```

### ✅ Après (Propre, pas d'erreurs)
```
1. App.tsx mount
2. Détecte sessionStorage vide
3. setIsAuthenticated(false) → STOP
4. TransitContext détecte !isAuthenticated
5. Skip loadShipments → Pas d'appel API
6. Écran login s'affiche directement
```

---

## 🔧 Pourquoi ne pas cacher complètement les 401 ?

Les erreurs 401 au **premier chargement** ont été **éliminées** avec les corrections appliquées.

Si vous voyez encore des 401, c'est probablement :
1. **Navigation vers route protégée** : Utilisateur clique sur un lien alors que sa session a expiré
2. **Token JWT expiré** : Après plusieurs heures d'inactivité
3. **Déconnexion en arrière-plan** : Serveur a nettoyé les sessions

Dans ces cas, les 401 sont **légitimes** et indiquent que l'utilisateur doit se reconnecter.

---

## 🎯 Validation Finale

### Checklist
- [ ] Ouvrir http://localhost:5174 en navigation privée
- [ ] Vérifier console : **Pas de 401** au premier chargement
- [ ] Se connecter avec admin@transit.gn
- [ ] Vérifier Dashboard charge les données
- [ ] F5 pour rafraîchir → Déconnexion automatique (sécurité)
- [ ] Écran login réapparaît sans erreurs 401

### Logs Attendus (Console)
```javascript
// Premier chargement
Page refresh detected - Logout for security
Pas encore authentifié, skip loadShipments

// Après connexion
Session authentifiée { role: 'DIRECTOR', userId: 'cmk4opthe000087uiya69nf77' }
Shipments loaded from API { count: 6 }
```

---

## 🔐 Sécurité par Refresh

La logique actuelle **déconnecte automatiquement** à chaque rafraîchissement de page (F5, Ctrl+R) pour des raisons de sécurité :

### Avantages
- ✅ Empêche qu'un utilisateur laisse son ordinateur avec session active
- ✅ Force re-authentification régulière
- ✅ Compatible avec environnement multi-utilisateurs (écoles, bibliothèques)

### Inconvénients
- ❌ Utilisateur doit se reconnecter après chaque F5
- ❌ Perte de l'état si rafraîchissement accidentel

### Alternative (à implémenter si besoin)
Si vous voulez **persister la session** même après refresh :

```typescript
// Stocker le token dans localStorage au lieu de sessionStorage
localStorage.setItem('app_session', 'active');

// Ou utiliser un cookie avec expiration longue (7 jours)
// Backend : res.cookie('token', jwt, { maxAge: 7 * 24 * 60 * 60 * 1000 });
```

⚠️ **Trade-off sécurité vs UX** : À décider selon vos besoins.

---

## 📚 Ressources

- [MDN Web Docs - HTTP 401](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Session Management - OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

---

**Les erreurs 401 au démarrage ont été éliminées** ✅  
**Flow d'authentification propre** 🔐  
**Console sans pollution** 🎯
