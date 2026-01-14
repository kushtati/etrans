# ============================================
# 📋 DÉPLOIEMENT PRODUCTION - Guide Complet
# ============================================

## 🎯 Architecture Split

- **Frontend** : Vercel (React + Vite)
- **Backend** : Railway (Node.js + Express + Prisma)
- **Database** : Railway PostgreSQL
- **Cache** : Railway Redis

---

## 🚂 RAILWAY - Backend Déploiement

### 1. Créer le Projet Railway

```bash
# Installer Railway CLI (optionnel)
npm install -g @railway/cli

# Login Railway
railway login
```

### 2. Créer les Services

**Dans Railway Dashboard :**

1. **New Project** → Empty Project
2. **Add Service** → GitHub Repo → Sélectionner `transit-guinee`
3. **Add Service** → Database → PostgreSQL
4. **Add Service** → Database → Redis

### 3. Configurer les Variables Backend

**Dans le service Backend (Node.js) :**

```env
# Secrets (à générer)
GEMINI_API_KEY=AIzaSy...  # https://aistudio.google.com/app/apikey
JWT_SECRET=<généré avec: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">

# Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
FRONTEND_URL=https://votre-app.vercel.app

# Références Railway (auto-configurées)
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Optionnel
LOG_LEVEL=info
TWO_FACTOR_ISSUER=TransitGuinée
```

### 4. Configurer Build Railway

- **Build Command** : `npm run build:server && npx prisma generate`
- **Start Command** : `npx prisma migrate deploy && npm run start:prod`
- **Watch Paths** : `server/**`, `prisma/**`, `package.json`

### 5. Health Check Railway

- **Path** : `/api/health`
- **Interval** : 30s
- **Timeout** : 10s

### 6. Déployer

```bash
# Via CLI
railway up

# Ou via Dashboard
# Push to GitHub → Railway auto-déploie
```

---

## ▲ VERCEL - Frontend Déploiement

### 1. Créer le Projet Vercel

```bash
# Installer Vercel CLI
npm install -g vercel

# Login Vercel
vercel login
```

### 2. Import GitHub Repo

**Dans Vercel Dashboard :**

1. **New Project** → Import Git Repository
2. Sélectionner `transit-guinee`
3. **Framework Preset** : Vite
4. **Root Directory** : `./`

### 3. Configurer Variables Frontend

```env
# URL du backend Railway (REMPLACER par votre URL Railway)
VITE_API_URL=https://votre-backend.up.railway.app
```

### 4. Configurer Build Vercel

- **Build Command** : `npm run build:frontend`
- **Output Directory** : `dist`
- **Install Command** : `npm install`

### 5. Déployer

```bash
# Via CLI
vercel --prod

# Ou via Dashboard
# Push to GitHub → Vercel auto-déploie
```

---

## 🔧 Configuration Post-Déploiement

### 1. Mettre à Jour CORS Backend

Dans `server/index.ts`, ajouter votre domaine Vercel :

```typescript
const allowedOrigins = [
  'https://votre-app.vercel.app',  // Ajouter ici
  /\.vercel\.app$/,
  // ...
];
```

### 2. Mettre à Jour URL Backend dans Vercel

Dans `vercel.json`, remplacer l'URL Railway :

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://votre-backend.up.railway.app/api/:path*"
    }
  ]
}
```

### 3. Vérifier Variables Production

**Railway :**
```bash
railway variables
```

**Vercel :**
```bash
vercel env ls
```

---

## ✅ Tests Post-Déploiement

### 1. Health Check Backend

```bash
curl https://votre-backend.up.railway.app/api/health
```

Réponse attendue :
```json
{
  "status": "OK",
  "checks": {
    "redis": "ok",
    "database": "ok"
  }
}
```

### 2. Test Frontend

```bash
curl https://votre-app.vercel.app
```

### 3. Test API via Frontend

```bash
curl https://votre-app.vercel.app/api/health
# Doit proxy vers Railway
```

### 4. Logs Monitoring

**Railway :**
```bash
railway logs
```

**Vercel :**
```bash
vercel logs
```

---

## 🔐 Sécurité Production

### Checklist Finale

- [ ] `JWT_SECRET` unique 64+ caractères
- [ ] `GEMINI_API_KEY` valide (AIzaSy... ou gen-lang-client-...)
- [ ] CORS configuré avec domaines exacts
- [ ] HTTPS forcé (automatique Vercel/Railway)
- [ ] Rate limiting actif (voir logs)
- [ ] Database backups activés (Railway auto)
- [ ] Redis persistence activée
- [ ] Logs rotation Winston (14j errors, 7j combined)
- [ ] Variables sensibles masquées (pas dans code)
- [ ] `.env` files exclus `.gitignore`

---

## 📊 Monitoring

### Railway Metrics

- CPU/Memory usage
- Request latency
- Database connections
- Redis hit rate

### Vercel Analytics

- Page load times
- Core Web Vitals
- Deploy frequency
- Error tracking

---

## 🐛 Troubleshooting

### Backend ne démarre pas

```bash
# Vérifier logs Railway
railway logs --tail 100

# Vérifier variables
railway variables

# Tester migration Prisma
railway run npx prisma migrate status
```

### Frontend ne charge pas

```bash
# Vérifier logs Vercel
vercel logs --follow

# Vérifier build
vercel inspect <deployment-url>
```

### Erreurs CORS

```typescript
// Ajouter dans server/index.ts allowedOrigins
'https://votre-domaine-exact.vercel.app'
```

### Database connection fails

```bash
# Vérifier DATABASE_URL Railway
railway run echo $DATABASE_URL

# Tester connexion
railway run npx prisma db execute --stdin <<< "SELECT 1"
```

---

## 🚀 Commandes Rapides

### Redéploiement complet

```bash
# Backend Railway
git push origin main  # Auto-deploy si GitHub connecté

# Frontend Vercel
vercel --prod
```

### Rollback

```bash
# Railway (via Dashboard ou CLI)
railway rollback <deployment-id>

# Vercel
vercel rollback <deployment-url>
```

### Variables Update

```bash
# Railway
railway variables set JWT_SECRET=<nouveau>

# Vercel
vercel env add VITE_API_URL production
```

---

## 📝 Notes Importantes

1. **Database Migrations** : Railway exécute `prisma migrate deploy` automatiquement au démarrage
2. **Redis Persistence** : Activé par défaut sur Railway (RDB + AOF)
3. **Logs Retention** : Railway 7 jours, Vercel selon plan
4. **Scaling** : Railway auto-scale, Vercel edge functions
5. **Cost** : Railway $5/mois (500h), Vercel gratuit (fair use)

---

## 🔗 Liens Utiles

- **Railway Dashboard** : https://railway.app/dashboard
- **Vercel Dashboard** : https://vercel.com/dashboard
- **Prisma Cloud** : https://cloud.prisma.io
- **Gemini API** : https://aistudio.google.com/app/apikey
- **Logs Winston** : `logs/` directory (backend uniquement)

---

**🎉 Déploiement terminé ! L'application est prête pour la production.**
