# ✅ CHECKLIST MIGRATION VERS VERSION CLEAN

## 📋 Étapes de Migration

### Phase 0 : Préparation (5 min)

- [ ] Backup du code actuel
  ```bash
  git checkout -b backup-before-clean-migration
  git push -u origin backup-before-clean-migration
  ```

- [ ] Installer dépendances manquantes
  ```bash
  npm install zod
  npm install --save-dev @types/compression @types/hpp
  ```

- [ ] Copier .env.server.example vers .env.server
  ```bash
  cp .env.server.example .env.server
  # Puis éditer avec vos vraies valeurs
  ```

### Phase 1 : Backend - Fichiers Config (10 min)

- [ ] Vérifier `server/config/env.ts` créé
- [ ] Vérifier `server/config/validateEnv.clean.ts` créé
- [ ] Tester validation env
  ```bash
  npx tsx server/config/validateEnv.clean.ts
  ```

### Phase 2 : Backend - Serveur Principal (15 min)

- [ ] Renommer fichiers
  ```bash
  # Backup ancien
  mv server/index.ts server/index.old.ts
  
  # Activer nouveau
  mv server/index.clean.ts server/index.ts
  mv server/config/validateEnv.clean.ts server/config/validateEnv.ts
  ```

- [ ] Vérifier imports dans index.ts
  - [ ] `import './config/env'` en premier
  - [ ] `import { validateEnvironment }` OK
  - [ ] `import { prisma }` depuis config/prisma
  - [ ] `import { redis }` depuis config/redis

- [ ] Tester démarrage local
  ```bash
  npm run dev:server
  # Doit afficher :
  # ✅ Environment loaded from .env.server
  # ✅ Redis connected
  # ✅ Database connected
  # ✅ SERVER STARTED SUCCESSFULLY
  ```

### Phase 3 : Tests Locaux (20 min)

- [ ] Test root endpoint
  ```bash
  curl http://localhost:8080/
  # Doit retourner : { "service": "Transit Guinée API", "status": "running" }
  ```

- [ ] Test health check
  ```bash
  curl http://localhost:8080/health
  # Doit retourner : { "status": "OK", "checks": { "redis": "UP", "database": "UP" } }
  ```

- [ ] Test CORS
  ```bash
  curl -H "Origin: http://localhost:5173" -i http://localhost:8080/
  # Doit inclure : Access-Control-Allow-Origin: http://localhost:5173
  ```

- [ ] Test rate limiting
  ```bash
  # Faire 301 requêtes
  for i in {1..301}; do curl -s http://localhost:8080/ > /dev/null; done
  curl http://localhost:8080/
  # Doit retourner 429 Too Many Requests
  ```

- [ ] Test graceful shutdown
  ```bash
  # Démarrer serveur, puis CTRL+C
  # Doit afficher :
  # [SHUTDOWN] SIGINT received
  # [SHUTDOWN] ✅ HTTP server closed
  # [SHUTDOWN] ✅ Database disconnected
  # [SHUTDOWN] ✅ Redis disconnected
  # [SHUTDOWN] ✅ Graceful shutdown complete
  ```

### Phase 4 : Frontend - API Client (10 min)

- [ ] Vérifier `src/lib/api.ts` créé

- [ ] Copier .env.example vers .env.local
  ```bash
  cp .env.example .env.local
  # Éditer VITE_API_URL si nécessaire
  ```

- [ ] Remplacer les appels API dans composants
  ```typescript
  // ❌ Ancien (à remplacer)
  await fetch('/api/shipments')
  
  // ✅ Nouveau
  import { apiGet } from '@/lib/api';
  await apiGet('/api/shipments')
  ```

- [ ] Tester un composant modifié
  ```bash
  npm run dev
  # Ouvrir http://localhost:5173
  # Vérifier console : [API] Base URL configured: http://localhost:8080
  ```

### Phase 5 : Migration Routes API (1-2h)

- [ ] Décommenter routes dans `server/index.ts`
  ```typescript
  app.use('/api/auth', authRoutes);
  app.use('/api/shipments', shipmentsRoutes);
  // etc.
  ```

- [ ] Vérifier chaque route :
  - [ ] `/api/auth/*` (login, logout, me)
  - [ ] `/api/shipments/*` (CRUD)
  - [ ] `/api/finance/*` (calculs)
  - [ ] `/api/ai/*` (Gemini)
  - [ ] `/api/webauthn/*` (biométrie)

### Phase 6 : Déploiement Railway (30 min)

- [ ] Commit et push
  ```bash
  git add -A
  git commit -m "Refactor: Migrate to clean architecture

  - New index.ts with proper middleware ordering
  - Zod environment validation
  - Centralized API client (frontend)
  - Trust proxy fixed
  - Graceful shutdown improved
  - Health check with Redis + DB tests"
  
  git push
  ```

- [ ] Vérifier variables d'env Railway
  - [ ] `NODE_ENV=production`
  - [ ] `DATABASE_URL` (depuis Railway PostgreSQL)
  - [ ] `REDIS_URL` (depuis Railway Redis)
  - [ ] `JWT_SECRET` (généré avec `openssl rand -base64 32`)
  - [ ] `GEMINI_API_KEY` (optionnel)

- [ ] Surveiller logs Railway
  ```
  ✅ Environment loaded from .env
  ✅ Redis connected
  ✅ Database connected
  ✅ SERVER STARTED SUCCESSFULLY
  📡 Listening: 0.0.0.0:8080
  ```

- [ ] Test health check production
  ```bash
  curl https://votre-app.up.railway.app/health
  ```

### Phase 7 : Déploiement Vercel (Frontend)

- [ ] Ajouter variable d'env Vercel
  ```
  VITE_API_URL=https://votre-app.up.railway.app
  ```

- [ ] Redéployer Vercel
  ```bash
  vercel --prod
  ```

- [ ] Tester frontend production
  - [ ] Ouvrir https://votre-app.vercel.app
  - [ ] Se connecter
  - [ ] Vérifier console : pas d'erreur 401/403/CORS

### Phase 8 : Monitoring (48h)

- [ ] Jour 1 : Surveiller logs Railway toutes les 2h
  - [ ] Pas d'erreur "connexion réinitialisée"
  - [ ] Pas d'erreur "trust proxy"
  - [ ] Pas d'erreur "rate limit validation"

- [ ] Jour 2 : Tester toutes les fonctionnalités
  - [ ] Login/Logout
  - [ ] CRUD shipments
  - [ ] Calculs financiers
  - [ ] Chat AI (si Gemini configuré)

- [ ] Jour 3 : Supprimer anciens fichiers si tout OK
  ```bash
  rm server/index.old.ts
  rm server/config/validateEnv.old.ts
  rm server/debug-start.ts
  git commit -m "Clean: Remove old files"
  ```

## 🚨 Rollback Plan (si problème)

```bash
# Retour rapide à l'ancienne version
git checkout backup-before-clean-migration
git push -f origin main

# Ou juste les fichiers :
git checkout backup-before-clean-migration -- server/index.ts
npm run build
```

## 📊 Validation Finale

### Critères de Succès

✅ **Stabilité**
- [ ] Aucune erreur "connexion réinitialisée" pendant 24h
- [ ] Aucune erreur rate limit validation
- [ ] Graceful shutdown fonctionne (pas de connexions pendantes)

✅ **Performance**
- [ ] Temps de démarrage < 2s
- [ ] Health check répond en < 500ms
- [ ] Pas de memory leak (RAM stable sur 24h)

✅ **Sécurité**
- [ ] CORS configuré correctement
- [ ] CSRF fonctionnel
- [ ] JWT validé sur toutes routes protégées
- [ ] Rate limiting actif

✅ **DX (Developer Experience)**
- [ ] Code lisible et commenté
- [ ] Logs clairs et structurés
- [ ] Erreurs explicites
- [ ] Types TypeScript stricts

## 🎯 Métriques Attendues

| Métrique | Avant | Après (Clean) |
|----------|-------|---------------|
| Lignes index.ts | 490 | 300 |
| Temps démarrage | 3-5s | 1-2s |
| Erreurs silencieuses | Oui | Non |
| Type safety | Partiel | Total (Zod) |
| Logs structurés | Non | Oui |
| Graceful shutdown | Basique | Avancé |

---

**Date :** 2026-01-19  
**Version :** 3.0.0-clean  
**Statut :** 📝 Prêt pour migration
