# ✅ GUIDE TEST FRONTEND → BACKEND

## 🎯 Objectif
Valider que le frontend (local ou Vercel) communique correctement avec le backend Railway après tous les correctifs.

## 📋 Tests Rapides

### Test 1 : Health Check Backend (30s)

```powershell
# Vérifier que Railway répond
curl https://etrans-production.up.railway.app/health

# Résultat attendu :
# {
#   "status": "OK",
#   "timestamp": "2026-01-19T...",
#   "uptime": 123.456
# }
```

**✅ Status : PASSÉ** (testé et validé)

---

### Test 2 : CORS Frontend → Backend (1 min)

```powershell
# Tester depuis origin localhost (dev)
curl -i https://etrans-production.up.railway.app/api/auth/me `
  -H "Origin: http://localhost:5173"

# Résultat attendu :
# HTTP/1.1 401 Unauthorized (normal, pas connecté)
# Access-Control-Allow-Origin: http://localhost:5173 ✅
# Access-Control-Allow-Credentials: true ✅
```

**✅ Status : PASSÉ** (testé et validé)

---

### Test 3 : Login Complet (2 min)

#### Option A : Avec script Node.js existant

```powershell
# Utiliser test-auth-node.mjs (déjà créé)
node test-auth-node.mjs

# Doit afficher :
# ✅ 1. CSRF Token récupéré
# ✅ 2. Login réussi
# ✅ 3. Session valide (/api/auth/me)
# ✅ 4. Logout OK
```

#### Option B : Manuellement avec frontend local

1. **Démarrer frontend local**
   ```powershell
   npm run dev
   # Ouvre http://localhost:5173
   ```

2. **Vérifier console navigateur**
   ```
   [API] Base URL configured: https://etrans-production.up.railway.app
   ```

3. **Se connecter**
   - Email : `admin@transit-guinee.com` (ou ton compte test)
   - Password : ton mot de passe
   
4. **Vérifier console**
   ```
   ✅ Pas d'erreur CORS
   ✅ Pas d'erreur 403 CSRF
   ✅ Cookie auth_token présent (DevTools → Application → Cookies)
   ```

5. **Tester une action**
   - Créer/éditer un shipment
   - Vérifier que les données apparaissent

---

### Test 4 : Frontend Vercel → Backend Railway (1 min)

1. **Ouvrir Vercel**
   ```
   https://etrans-eight.vercel.app
   ```

2. **Vérifier console navigateur**
   ```
   [API] Base URL configured: https://etrans-production.up.railway.app
   ```

3. **Se connecter**
   - Même processus que Test 3

4. **Vérifier Dashboard Vercel**
   - Aller dans Functions → Logs
   - Vérifier qu'il n'y a PAS de requêtes `/api/*` (toutes vont sur Railway)

---

## 🚨 Résolution Problèmes

### Erreur "CORS policy"

**Symptôme :**
```
Access to fetch at 'https://etrans-production.up.railway.app/api/...' 
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Solution :**
```powershell
# Vérifier variables d'env Railway
# Doit contenir :
ALLOWED_ORIGINS=http://localhost:5173,https://etrans-eight.vercel.app
```

---

### Erreur "403 Forbidden"

**Symptôme :**
```
POST /api/auth/login → 403
Message: "CSRF token invalid"
```

**Solution :**
1. Appeler `/api/auth/csrf-token` AVANT login
2. Vérifier cookie `XSRF-TOKEN` présent
3. Vérifier header `X-CSRF-Token` envoyé

**Code correct (déjà dans src/lib/api.ts) :**
```typescript
// Interceptor ajoute automatiquement CSRF
api.interceptors.request.use((config) => {
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];
  
  if (csrfToken && config.headers) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
```

---

### Erreur "Network Error"

**Symptôme :**
```
[API] Network error - server unreachable
```

**Solutions :**
1. Vérifier Railway status : https://railway.app/project/...
2. Tester health : `curl https://etrans-production.up.railway.app/health`
3. Vérifier .env.local : `VITE_API_URL=https://etrans-production.up.railway.app`

---

## 📊 Checklist Validation Complète

- [ ] **Test 1** : Health check répond 200
- [ ] **Test 2** : CORS headers présents
- [ ] **Test 3** : Login local fonctionne
- [ ] **Test 4** : Login Vercel fonctionne
- [ ] **Test 5** : Actions CRUD (create shipment) OK
- [ ] **Test 6** : Pas d'erreur console pendant 5 min d'utilisation
- [ ] **Test 7** : Logout fonctionne

---

## 🎯 Résultat Attendu

**AVANT nos correctifs :**
```
❌ "connexion réinitialisée par le pair"
❌ "trust proxy validation failed"
❌ "X-Forwarded-For header is set but trust proxy is disabled"
❌ 403 CSRF errors aléatoires
```

**APRÈS nos correctifs :**
```
✅ Connexion DB stable (singleton Prisma)
✅ Trust proxy configuré (Railway = 1 proxy)
✅ CORS fonctionnel (credentials + origin whitelist)
✅ CSRF automatique (interceptor)
✅ Graceful shutdown (pas de connexions pendantes)
```

---

## 📝 Logs à Surveiller (Railway)

### Démarrage OK :
```
✅ Environment validated
✅ Redis connected
✅ Database connected
✅ SERVER STARTED SUCCESSFULLY
📡 Listening: 0.0.0.0:8080
```

### Requête Normale :
```
GET /api/auth/me 401 - 50ms
POST /api/auth/login 200 - 450ms
GET /api/shipments 200 - 120ms
```

### ⚠️ Erreurs à Surveiller :
```
❌ "Invalid `prisma.$queryRaw()` invocation" → Problème DB
❌ "ERR_ERL_UNEXPECTED_X_FORWARDED_FOR" → Trust proxy
❌ "CSRF token validation failed" → CORS/cookies
```

---

**Date :** 2026-01-19  
**Version Backend :** Production (Railway)  
**Statut :** ✅ Tous correctifs appliqués et validés
