# 🔄 PLAN DE REFACTORING - TRANSIT GUINÉE

## 📋 Fichiers Créés (Version Clean)

### ✅ Fondations
- `server/index.clean.ts` - Serveur Express minimaliste et robuste
- `server/config/validateEnv.clean.ts` - Validation Zod type-safe

## 🎯 Prochaines Étapes

### Phase 1 : Migration vers Version Clean (1-2h)

```bash
# 1. Backup actuel
git checkout -b backup-old-code

# 2. Tester la version clean
mv server/index.ts server/index.old.ts
mv server/index.clean.ts server/index.ts

mv server/config/validateEnv.ts server/config/validateEnv.old.ts
mv server/config/validateEnv.clean.ts server/config/validateEnv.ts

# 3. Installer Zod
npm install zod

# 4. Tester localement
npm run dev:server
```

### Phase 2 : Routes API (3-4h)

**Ordre de création :**

1. **auth.ts** - Login/Logout/CSRF ✅ (garder l'actuel, il est bon)
   - Juste vérifier que trust proxy est bien géré
   
2. **shipments.ts** - CRUD principal
   ```typescript
   // Structure propre :
   GET    /api/shipments          -> Liste (avec pagination)
   GET    /api/shipments/:id      -> Détails
   POST   /api/shipments          -> Création
   PUT    /api/shipments/:id      -> Mise à jour
   DELETE /api/shipments/:id      -> Suppression
   ```

3. **finance.ts** - Calculs financiers
   - Utiliser le fichier actuel comme base
   - Ajouter validation Zod sur les montants

4. **ai.ts** (optionnel) - Gemini
   - Garder l'actuel, il est déjà bien structuré

### Phase 3 : Frontend (5-6h)

**Créer :**

1. `src/lib/api.ts` - Client centralisé
   ```typescript
   import axios from 'axios';
   
   const api = axios.create({
     baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
     withCredentials: true,
     headers: {
       'Content-Type': 'application/json',
     },
   });
   
   export default api;
   ```

2. `src/contexts/AuthContext.clean.tsx`
   - Version simplifiée sans sessionStorage complexe
   - Juste JWT + state React

3. Composants réutilisables
   - `Button.tsx`
   - `Input.tsx`
   - `Card.tsx`
   - `Table.tsx`

## 🔍 Fichiers à GARDER Tels Quels

✅ **Ces fichiers sont bons :**
- `server/config/prisma.ts` (singleton OK)
- `server/config/redis.ts` (gestion connexion OK)
- `server/config/logger.ts` (structure OK)
- `server/middleware/auth.ts` (JWT validation OK)
- `server/middleware/permissions.ts` (RBAC OK)
- `server/utils/permissions.ts` (enum permissions OK)
- `prisma/schema.prisma` (schéma OK)

## 📦 Dépendances à Ajouter

```bash
npm install zod                    # Validation TypeScript
npm install @types/compression     # Types manquants
npm install @types/hpp             # Types manquants
```

## 🚫 Fichiers à SUPPRIMER (une fois migration OK)

- `server/index.old.ts`
- `server/config/validateEnv.old.ts`
- `server/debug-start.ts` (utilisé uniquement pour debug)
- Tous les fichiers `*.old.*`

## 🧪 Tests de Validation

### 1. Démarrage Serveur
```bash
npm run start:prod
# Doit afficher :
# ✅ Trust proxy enabled
# ✅ Redis connected
# ✅ Database connected
# ✅ SERVER STARTED SUCCESSFULLY
```

### 2. Health Check
```bash
curl http://localhost:8080/health
# Doit retourner 200 avec checks: { redis: 'UP', database: 'UP' }
```

### 3. CORS
```bash
curl -H "Origin: http://localhost:5173" http://localhost:8080/
# Doit inclure : Access-Control-Allow-Origin: http://localhost:5173
```

### 4. Rate Limiting
```bash
# Faire 301 requêtes rapidement
for i in {1..301}; do curl http://localhost:8080/; done
# La 301e doit retourner 429
```

## 📊 Avantages de la Version Clean

| Problème Ancien | Solution Clean |
|----------------|----------------|
| 2 instances Prisma | ✅ 1 singleton importé |
| Pas de validation env | ✅ Zod avec types inférés |
| Trust proxy oublié | ✅ En premier, commenté |
| Ordre middlewares flou | ✅ Ordre strict documenté |
| Logs éparpillés | ✅ Logs structurés |
| Shutdown brutal | ✅ Graceful avec timeout |
| Health check basique | ✅ Check Redis + DB |
| Pas de CORS dynamique | ✅ Whitelist + dev mode |

## 🎯 Résultat Final Attendu

**Avant (index.ts actuel) :** 490 lignes, mélange de concerns
**Après (index.clean.ts) :** 300 lignes, séparation claire

**Temps de démarrage :**
- Avant : ~3-5 secondes (avec logs verbeux)
- Après : ~1-2 secondes (logs essentiels uniquement)

**Stabilité :**
- Avant : Erreurs silencieuses (connexions perdues)
- Après : Crash immédiat si config invalide (fail fast)

## 📝 Notes Importantes

1. **Ne pas tout migrer en même temps**
   - Commencer par `index.ts` seul
   - Tester 24h sur Railway
   - Puis migrer les routes une par une

2. **Garder l'ancien code**
   - Branch `backup-old-code`
   - Ne pas supprimer avant 1 semaine de tests

3. **Documentation**
   - Commenter chaque middleware
   - Expliquer pourquoi cet ordre

4. **Monitoring**
   - Ajouter logs de connexion
   - Surveiller Railway metrics (CPU, RAM, requests/s)

## 🚀 Commande de Migration

```bash
# Script automatique (à créer)
npm run migrate:clean

# Ou manuel :
1. cp server/index.ts server/index.backup.ts
2. cp server/index.clean.ts server/index.ts
3. npm install zod
4. npm run dev:server
5. Tester /health
6. git commit -m "Refactor: Migrate to clean architecture"
7. git push
```

---

**Date de création :** 2026-01-19  
**Auteur :** Copilot + Validation Utilisateur  
**Statut :** ✅ Plan validé - Prêt pour exécution
