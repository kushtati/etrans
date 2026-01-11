# 🚀 Guide de Déploiement - Transit Guinée

## 📋 Prérequis

- Code source sur GitHub (repository public ou privé)
- Compte sur Railway.app ou Render.com
- Variables d'environnement prêtes

---

## 🎯 Architecture Recommandée

### Option A : Tout sur Railway (Simplicité)
- **Frontend + Backend** : Railway.app
- **Base de données** : PostgreSQL (Railway)
- **Cache** : Redis (Railway)

### Option B : Split (Performance Maximale)
- **Frontend** : Vercel.com (gratuit, ultra-rapide)
- **Backend** : Railway.app
- **Base de données** : Railway PostgreSQL
- **Cache** : Railway Redis

---

## 📦 Étape 1 : Préparer le Code

### 1.1 Créer un fichier `.env.production` (NE PAS COMMIT)

```env
# Base de données (fournie par Railway)
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT Secret (générer un nouveau en production)
JWT_SECRET=votre-secret-ultra-securise-64-caracteres-minimum-production

# Redis (fourni par Railway)
REDIS_URL=redis://default:password@host:6379

# Frontend URL (à adapter selon votre déploiement)
FRONTEND_URL=https://votre-app.vercel.app

# API Gemini (optionnel)
GEMINI_API_KEY=votre-cle-si-vous-utilisez-lIA

# Environnement
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
```

### 1.2 Créer `.gitignore` si absent

```gitignore
.env*
!.env.example
node_modules/
dist/
.DS_Store
```

### 1.3 Pousser sur GitHub

```bash
git add .
git commit -m "Prêt pour déploiement production"
git push origin main
```

---

## 🚂 Étape 2 : Déployer sur Railway.app

### 2.1 Créer le projet

1. Aller sur [Railway.app](https://railway.app)
2. Se connecter avec GitHub
3. Cliquer "New Project"
4. Sélectionner "Deploy from GitHub repo"
5. Choisir votre repository `e.trans`

### 2.2 Ajouter PostgreSQL

1. Dans votre projet Railway, cliquer "+ New"
2. Choisir "Database" → "PostgreSQL"
3. Railway génère automatiquement `DATABASE_URL`

### 2.3 Ajouter Redis

1. Cliquer "+ New"
2. Choisir "Database" → "Redis"
3. Railway génère automatiquement `REDIS_URL`

### 2.4 Configurer les Variables d'Environnement

Dans votre service backend (pas la DB) :

1. Onglet "Variables"
2. Ajouter :

```
NODE_ENV=production
JWT_SECRET=votre-secret-securise-64-chars
FRONTEND_URL=https://votre-frontend.vercel.app (ou Railway)
GEMINI_API_KEY=votre-cle-si-necessaire
TWO_FACTOR_ISSUER=TransitGuinée-Prod
LOG_LEVEL=info
```

⚠️ **IMPORTANT** : `DATABASE_URL` et `REDIS_URL` sont déjà injectées automatiquement !

### 2.5 Configurer le Build

Railway détecte automatiquement Node.js. Si besoin, forcer :

**Build Command** (dans Settings) :
```bash
npm install && npx prisma generate && npm run build:all
```

**Start Command** :
```bash
npx prisma migrate deploy && npm run start:prod
```

### 2.6 Déployer

Railway démarre automatiquement. Suivre les logs en temps réel.

Votre backend sera accessible sur : `https://votre-app.up.railway.app`

---

## ⚡ Étape 3 : Déployer le Frontend sur Vercel (Optionnel mais recommandé)

### 3.1 Préparer Vercel

1. Aller sur [Vercel.com](https://vercel.com)
2. Se connecter avec GitHub
3. Importer le même repository

### 3.2 Configuration Vercel

**Framework Preset** : Vite

**Build Command** :
```bash
npm run build
```

**Output Directory** :
```
dist
```

**Environment Variables** :
```
VITE_API_URL=https://votre-backend.up.railway.app
```

### 3.3 Mettre à jour le Frontend

Dans `vite.config.ts`, s'assurer que le proxy pointe vers Railway en production :

```typescript
server: {
  proxy: {
    '/api': {
      target: process.env.VITE_API_URL || 'http://localhost:3001',
      changeOrigin: true
    }
  }
}
```

### 3.4 Déployer

Vercel build automatiquement. Votre frontend sera sur : `https://votre-app.vercel.app`

---

## 🔐 Étape 4 : Tester Face ID

1. Ouvrir `https://votre-app.vercel.app` sur mobile
2. Se connecter avec un compte
3. Aller dans Paramètres → Sécurité
4. Cliquer "Activer Face ID"
5. Le navigateur demande la biométrie ✅

⚠️ **Face ID ne fonctionne QUE sur HTTPS** (c'est pour ça qu'il fallait héberger)

---

## 📊 Étape 5 : Migration Base de Données

### 5.1 Appliquer les migrations Prisma

Railway exécute automatiquement :
```bash
npx prisma migrate deploy
```

### 5.2 Seed initial (optionnel)

Se connecter en SSH à Railway :
```bash
railway run npx prisma db seed
```

Ou via l'interface Railway : Settings → Deploy Trigger

---

## 🛡️ Checklist Sécurité Production

- ✅ `NODE_ENV=production` configuré
- ✅ `JWT_SECRET` différent du développement (64+ caractères)
- ✅ CORS configuré avec origines exactes (pas de wildcard)
- ✅ Rate limiting activé (1000 req/15min)
- ✅ HTTPS forcé (automatique sur Railway/Vercel)
- ✅ Variables sensibles dans Railway (pas dans code)
- ✅ `.env*` dans `.gitignore`

---

## 📈 Monitoring

### Railway Dashboard
- Logs en temps réel
- Métriques CPU/RAM
- Statistiques réseau

### Alertes
Railway envoie des emails si :
- Service crash
- Dépassement mémoire
- Erreurs 500

---

## 🔄 Mises à jour

Pour déployer une nouvelle version :

```bash
git add .
git commit -m "Nouvelle fonctionnalité X"
git push origin main
```

Railway redéploie automatiquement à chaque push sur `main`.

---

## 💰 Coûts

### Railway
- **Gratuit** : $5 de crédit/mois (suffit pour tester)
- **Developer** : $5/mois (500h runtime)
- **Pro** : $20/mois (usage illimité)

### Vercel
- **Hobby** : Gratuit (100 GB bandwidth/mois)
- **Pro** : $20/mois (si besoin de plus)

**Estimation totale pour tester** : $0-5/mois

---

## 🆘 Troubleshooting

### Erreur "Cannot connect to database"
→ Vérifier que `DATABASE_URL` est bien configurée dans Railway

### Erreur CORS
→ Ajouter l'URL exacte de votre frontend dans `allowedOrigins` (server/index.ts)

### Face ID ne fonctionne pas
→ Vérifier que l'URL commence par `https://` (pas `http://`)

### Application lente au premier chargement
→ Normal sur le plan gratuit (cold start). Upgrade vers plan payant ou utiliser un ping service.

---

## 📞 Support

- Railway Docs : https://docs.railway.app
- Vercel Docs : https://vercel.com/docs
- WebAuthn Guide : https://webauthn.guide

Bon déploiement ! 🚀
