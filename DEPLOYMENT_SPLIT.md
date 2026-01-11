# 🚀 Déploiement Split : Vercel (Frontend) + Railway (Backend)

## Architecture Recommandée

```
┌─────────────────────────────────────────┐
│          UTILISATEUR (Browser)          │
└─────────────────┬───────────────────────┘
                  │
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────┐
│   VERCEL - Frontend (React + Vite)      │
│   https://transit-guinee.vercel.app     │
│                                          │
│   - Servir les fichiers statiques       │
│   - Proxy API vers Railway               │
│   - CDN global ultra-rapide              │
└─────────────────┬───────────────────────┘
                  │
                  │ API Calls
                  ▼
┌─────────────────────────────────────────┐
│   RAILWAY - Backend (Node.js + Prisma)  │
│   https://backend.up.railway.app/api    │
│                                          │
│   - Express Server                       │
│   - PostgreSQL Database                  │
│   - Redis Cache                          │
│   - JWT Authentication                   │
└──────────────────────────────────────────┘
```

## 🎯 Avantages de cette Architecture

✅ **Performance** : Frontend sur CDN Vercel (100+ pays)
✅ **Sécurité** : Backend isolé, pas d'accès direct
✅ **Coût** : Vercel gratuit pour frontend, Railway pour backend seulement
✅ **Scalabilité** : Chaque partie scale indépendamment
✅ **Face ID** : HTTPS partout (requis pour WebAuthn)

---

## 📦 Étape 1 : Déployer le Backend sur Railway

### 1.1 Créer le Projet Railway

1. Aller sur [railway.app](https://railway.app)
2. Cliquer "Start a New Project"
3. Choisir "Deploy from GitHub repo"
4. Sélectionner votre repository `e.trans`
5. Railway détecte automatiquement Node.js

### 1.2 Ajouter PostgreSQL

1. Dans votre projet, cliquer "+ New"
2. Choisir "Database" → "PostgreSQL"
3. Railway génère automatiquement `DATABASE_URL`

### 1.3 Ajouter Redis

1. Cliquer "+ New" 
2. Choisir "Database" → "Redis"
3. Railway génère automatiquement `REDIS_URL`

### 1.4 Configurer les Variables (Backend)

Dans l'onglet "Variables" de votre service backend :

```env
NODE_ENV=production
JWT_SECRET=VOTRE-SECRET-64-CARACTERES-UNIQUE-PRODUCTION
FRONTEND_URL=https://transit-guinee.vercel.app
GEMINI_API_KEY=votre-cle-si-necessaire
TWO_FACTOR_ISSUER=TransitGuinée-Prod
LOG_LEVEL=info
PORT=3001
HOST=0.0.0.0
```

⚠️ **IMPORTANT** : 
- `DATABASE_URL` et `REDIS_URL` sont auto-injectées par Railway
- Changez `FRONTEND_URL` après avoir déployé sur Vercel

### 1.5 Configurer le Déploiement

Railway utilise automatiquement `railway.toml` :

**Build Command** : 
```bash
npm install && npx prisma generate && npm run build
```

**Start Command** :
```bash
npx prisma migrate deploy && npm run start:prod
```

### 1.6 Déployer

1. Cliquer "Deploy" ou push sur GitHub
2. Suivre les logs en temps réel
3. Noter l'URL générée : `https://backend-xxx.up.railway.app`

---

## ⚡ Étape 2 : Déployer le Frontend sur Vercel

### 2.1 Préparer la Configuration

**Modifier `vercel.json`** (déjà créé) :

Remplacer la ligne :
```json
"destination": "https://your-backend.up.railway.app/api/:path*"
```

Par votre vraie URL Railway :
```json
"destination": "https://backend-xxx.up.railway.app/api/:path*"
```

### 2.2 Créer le Projet Vercel

1. Aller sur [vercel.com](https://vercel.com)
2. Cliquer "Add New" → "Project"
3. Importer le même repository GitHub
4. Sélectionner le repository `e.trans`

### 2.3 Configurer Vercel

**Framework Preset** : Vite

**Root Directory** : `.` (racine)

**Build Command** :
```bash
npm run build
```

**Output Directory** :
```
dist
```

**Install Command** :
```bash
npm install
```

### 2.4 Variables d'Environnement (Frontend)

Dans les Settings → Environment Variables :

```env
VITE_API_URL=https://backend-xxx.up.railway.app
```

⚠️ Remplacer `backend-xxx` par votre vraie URL Railway !

### 2.5 Déployer

1. Cliquer "Deploy"
2. Vercel build en 30-60 secondes
3. Vous obtenez : `https://transit-guinee.vercel.app`

---

## 🔗 Étape 3 : Connecter Frontend et Backend

### 3.1 Mettre à Jour Railway

Retourner sur Railway → Variables → Modifier :

```env
FRONTEND_URL=https://transit-guinee.vercel.app
```

⚠️ Utiliser votre vraie URL Vercel !

### 3.2 Redéployer Railway

Railway redémarre automatiquement. Vérifier les logs.

### 3.3 Tester la Connexion

1. Ouvrir `https://transit-guinee.vercel.app`
2. Ouvrir la console navigateur (F12)
3. Vérifier qu'il n'y a pas d'erreurs CORS
4. Essayer de se connecter

---

## 🧪 Étape 4 : Tester Face ID

### 4.1 Sur Mobile

1. Ouvrir Safari/Chrome sur iPhone/Android
2. Aller sur `https://transit-guinee.vercel.app`
3. Se connecter avec un compte
4. Aller dans Paramètres → Sécurité
5. Cliquer "Activer Face ID"

### 4.2 Vérifications

✅ L'URL est en **HTTPS** (cadenas vert)
✅ Le navigateur demande la biométrie
✅ Un credential est créé
✅ La prochaine connexion utilise Face ID

---

## 📊 Étape 5 : Monitoring

### Railway Dashboard

- Logs backend en temps réel
- Métriques CPU/RAM/Network
- PostgreSQL metrics
- Redis metrics

### Vercel Dashboard

- Analytics (visites, pays, devices)
- Logs de déploiement
- Performance metrics (Web Vitals)
- Bandwidth usage

---

## 🔄 Workflow de Mise à Jour

### Mise à Jour Frontend Seul

```bash
git add src/
git commit -m "Update frontend"
git push origin main
```

Vercel redéploie automatiquement.

### Mise à Jour Backend Seul

```bash
git add server/
git commit -m "Update backend"
git push origin main
```

Railway redéploie automatiquement.

### Mise à Jour Complète

```bash
git add .
git commit -m "Full update"
git push origin main
```

Les deux redéploient en parallèle.

---

## 🛡️ Sécurité Production

### Checklist Backend (Railway)

- ✅ `NODE_ENV=production`
- ✅ JWT_SECRET unique (différent du dev)
- ✅ CORS avec origine exacte Vercel
- ✅ Rate limiting activé
- ✅ Helmet activé
- ✅ HTTPS forcé
- ✅ Variables sensibles dans Railway (pas GitHub)

### Checklist Frontend (Vercel)

- ✅ API_URL pointe vers Railway HTTPS
- ✅ Pas de secrets dans le code
- ✅ Build optimisé (minification)
- ✅ PWA activé (manifest.json, service worker)
- ✅ Headers de sécurité (vercel.json)

---

## 💰 Coûts Estimés

### Vercel (Frontend)
- **Hobby** : Gratuit
  - 100 GB bandwidth/mois
  - Domaine .vercel.app
  - SSL automatique
  - Déploiements illimités

### Railway (Backend + DB)
- **Trial** : $5 gratuits/mois
  - 500h runtime
  - PostgreSQL + Redis
  - Suffisant pour tester

- **Developer** : $5/mois
  - 500h runtime incluses
  - PostgreSQL + Redis inclus

- **Pro** : $20/mois
  - Usage illimité
  - Recommandé pour production

**Total pour commencer** : $0-5/mois

---

## 🆘 Troubleshooting

### Erreur CORS

**Symptôme** : `Access-Control-Allow-Origin`

**Solution** : 
1. Vérifier `FRONTEND_URL` dans Railway
2. Vérifier `allowedOrigins` dans `server/index.ts`
3. Ajouter `.vercel.app` dans CORS regex

### API non accessible

**Symptôme** : `Failed to fetch` ou `net::ERR_NAME_NOT_RESOLVED`

**Solution** :
1. Vérifier que Railway backend est démarré
2. Vérifier `VITE_API_URL` dans Vercel
3. Tester directement : `https://backend-xxx.up.railway.app/api/auth/csrf-token`

### Face ID ne fonctionne pas

**Symptôme** : "Non configuré" ou erreur biométrique

**Solution** :
1. Vérifier URL en **HTTPS** (pas HTTP)
2. Tester sur mobile réel (pas simulateur)
3. Vérifier que WebAuthn est supporté (Safari iOS 14+, Chrome Android 70+)
4. Réenregistrer le credential sur le nouveau domaine

### Build Vercel échoue

**Symptôme** : Erreur pendant `npm run build`

**Solution** :
1. Tester localement : `npm run build`
2. Vérifier que `dist/` est créé
3. Vérifier les erreurs TypeScript
4. Vérifier `vite.config.ts`

### PostgreSQL connection error

**Symptôme** : `Cannot connect to database`

**Solution** :
1. Vérifier que PostgreSQL est démarré sur Railway
2. Vérifier `DATABASE_URL` dans variables
3. Tester : `npx prisma db pull` dans Railway shell
4. Vérifier les migrations : `npx prisma migrate deploy`

---

## 🎯 Optimisations Post-Déploiement

### Performance Frontend

1. **Vérifier Lighthouse** : Devrait être 85-90+
2. **Activer Vercel Analytics** : Settings → Analytics
3. **Configurer domaine custom** : Settings → Domains

### Performance Backend

1. **Activer Redis cache** : Déjà configuré (30s TTL)
2. **Monitorer logs** : Vérifier temps de réponse
3. **Augmenter RAM si nécessaire** : Railway Settings

### Base de Données

1. **Seeder les données** : Railway shell → `npm run db:seed`
2. **Créer backup** : Railway → PostgreSQL → Settings → Backup
3. **Indexer colonnes** : Ajouter index Prisma si requêtes lentes

---

## 📞 Ressources

- Railway Docs : https://docs.railway.app
- Vercel Docs : https://vercel.com/docs
- Prisma Deploy : https://www.prisma.io/docs/guides/deployment
- WebAuthn Guide : https://webauthn.guide

---

## ✅ Checklist Finale

Avant de considérer le déploiement terminé :

**Railway (Backend)**
- [ ] Backend démarré sans erreurs
- [ ] PostgreSQL connecté
- [ ] Redis connecté
- [ ] `/api/auth/csrf-token` répond
- [ ] Migrations appliquées
- [ ] Variables configurées

**Vercel (Frontend)**
- [ ] Build réussi
- [ ] Site accessible en HTTPS
- [ ] Pas d'erreurs console
- [ ] Login fonctionne
- [ ] Dashboard affiche données

**Intégration**
- [ ] API calls fonctionnent
- [ ] Pas d'erreurs CORS
- [ ] Face ID demande biométrie
- [ ] PWA installable
- [ ] Lighthouse > 85

**Sécurité**
- [ ] JWT_SECRET unique en prod
- [ ] .env* dans .gitignore
- [ ] HTTPS partout
- [ ] CORS configuré strictement
- [ ] Rate limiting actif

---

Bon déploiement ! 🚀

Votre application sera accessible mondialement avec :
- ⚡ Performance maximale (Vercel CDN)
- 🔐 Sécurité optimale (HTTPS + isolation)
- 📱 Face ID fonctionnel
- 💰 Coûts minimaux ($0-5/mois)
