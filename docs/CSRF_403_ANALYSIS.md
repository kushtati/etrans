# 🔍 Analyse du Problème CSRF 403

## Symptôme
- ✅ Redis CONNECTED (test write/read: SUCCESS)
- ✅ Cookies créés (`csrf_session` + `XSRF-TOKEN`)
- ✅ Cookies envoyés avec requête login
- ❌ **403 "Token CSRF invalide"** systématique

## Tests Effectués

### Test 1: Redis Fonctionnel
```bash
GET /api/debug-redis
```
**Résultat**: 
- `testWrite: SUCCESS`
- `testValue: functioning`
- Redis écrit et lit correctement ✅

### Test 2: Flow Login Node.js
```bash
node test-auth-node.mjs
```
**Résultat**:
```
1️⃣ GET /csrf-token → 200 OK
   Cookies: csrf_session, XSRF-TOKEN ✅

2️⃣ POST /login → 403 Forbidden ❌
   Message: "Token CSRF invalide"
```

### Test 3: PowerShell avec Session
```powershell
Invoke-WebRequest avec -WebSession
```
**Résultat**:
- SessionId créé: `e796a1b7fb153ec21b6f3babea0079a0`
- Token créé: `0f155f34a51bb0fa...`
- Login: **403 Forbidden**

## Hypothèses

### ❌ Hypothèse 1: Redis déconnecté
**ÉLIMINÉE** - `/api/debug-redis` montre que Redis fonctionne

### ❌ Hypothèse 2: Cookies non envoyés
**ÉLIMINÉE** - Logs montrent que cookies sont présents dans requête

### ❌ Hypothèse 3: SessionId change entre requêtes
**ÉLIMINÉE** - WebSession PowerShell + fetch-cookie Node.js préservent cookies

### ✅ Hypothèse 4: Token CSRF non trouvé dans Redis
**À VÉRIFIER** - Clé Redis différente de celle cherchée

## Diagnostic Probable

Le problème est dans la **clé Redis** :

```typescript
// Route /csrf-token crée :
await redis.set(`csrf:${sessionId}`, token, 3600);

// Middleware validateCSRF cherche :
const sessionId = req.cookies?.csrf_session || req.user?.id || 'anonymous';
const storedToken = await redis.get(`csrf:${sessionId}`);
```

**Problème potentiel** :
1. Cookie `csrf_session` créé avec valeur `A` 
2. Redis stocke clé `csrf:A` avec token
3. Lors du POST, cookie `csrf_session` reçu avec valeur `B` (différente !)
4. Redis cherche clé `csrf:B` → **NOT FOUND** → 403

## Solutions Possibles

### Solution 1: Vérifier encodage cookie
Le cookie peut être URL-encoded/decoded différemment entre GET et POST.

**Test** :
```typescript
console.log('[CSRF] SessionId from cookie:', req.cookies.csrf_session);
console.log('[CSRF] Redis key:', `csrf:${req.cookies.csrf_session}`);
```

### Solution 2: Utiliser XSRF-TOKEN directement
Au lieu de stocker dans Redis avec `sessionId`, stocker avec `token` comme clé.

**Changement** :
```typescript
// Au lieu de :
await redis.set(`csrf:${sessionId}`, token, 3600);

// Faire :
await redis.set(`csrf:${token}`, 'valid', 3600);

// Et dans validateCSRF :
const tokenExists = await redis.get(`csrf:${csrfToken}`);
if (!tokenExists) return 403;
```

### Solution 3: Utiliser double-submit cookie pattern
Comparer simplement `req.cookies.XSRF-TOKEN` avec `req.headers['x-csrf-token']`.

**Plus simple** :
```typescript
const validateCSRF = (req, res, next) => {
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies['XSRF-TOKEN'];
  
  if (headerToken !== cookieToken) {
    return res.status(403).json({ message: 'Token CSRF invalide' });
  }
  
  next();
};
```

## Prochaines Étapes

1. **Activer logs debug Railway** pour voir sessionId réel
2. **Tester Solution 3** (plus simple, pas de Redis)
3. **Si échec**: Implémenter Solution 2

## Références

- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Double Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)
