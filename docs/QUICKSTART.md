# 🚀 Guide de Démarrage Rapide - Sécurité Gemini API

## ⚡ DÉMARRAGE EXPRESS (5 minutes)

### 1. Configurer la clé API (CÔTÉ SERVEUR)

Éditez `.env.server` :
```bash
GEMINI_API_KEY=VOTRE_CLÉ_GOOGLE_GEMINI_ICI
```

**Obtenir votre clé** :
1. Allez sur https://aistudio.google.com/app/apikey
2. Cliquez "Create API Key"
3. Copiez la clé (commence par `AIza...`)
4. Collez dans `.env.server`

### 2. Vérifier la sécurité

```bash
# Build production
npm run build

# ✅ Vérifier absence clé API dans bundle
# PowerShell :
Get-ChildItem -Path dist\assets\*.js -Recurse | Select-String "AIza"

# Cmd :
findstr /s /i "AIza" dist\assets\*.js

# ✅ Attendu : Aucun résultat trouvé
```

### 3. Démarrer l'application

```bash
# Terminal 1 : Frontend Vite
npm run dev

# Terminal 2 : Backend Express
npm run dev:server
```

**Accès** :
- Frontend : http://localhost:5173
- Backend API : http://localhost:3001
- Health check : http://localhost:3001/api/health

### 4. Tester l'API

```bash
# PowerShell
$TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

Invoke-RestMethod -Uri "http://localhost:3001/api/ai/analyze" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $TOKEN"
  } `
  -Body '{"input": "Facture conteneur 40 pieds Chine", "mimeType": "text/plain"}'
```

---

## 🔒 CHECKLIST SÉCURITÉ

Avant déploiement, vérifier :

### Fichiers

- [x] ✅ `.env.server` créé avec `GEMINI_API_KEY`
- [x] ✅ `.env.server` dans `.gitignore`
- [x] ✅ `geminiService.ts` : Appels backend uniquement
- [x] ✅ `vite.config.ts` : Clé API supprimée
- [x] ✅ `server/routes/ai.ts` : Routes sécurisées
- [x] ✅ `server/index.ts` : Routes AI intégrées

### Sécurité

- [x] ✅ JWT authentication active
- [x] ✅ Rate limiting configuré (100 analyse/jour, 50 assistant/jour)
- [x] ✅ Validation input (max 100KB)
- [x] ✅ CORS configuré
- [ ] ⏳ Variables production configurées (Netlify/Vercel)

### Tests

```bash
# Test 1 : Absence clé dans bundle
npm run build
findstr /s "AIza" dist\assets\*.js
# ✅ Attendu : 0 résultats

# Test 2 : Backend répond
curl http://localhost:3001/api/health
# ✅ Attendu : {"status":"OK", "geminiConfigured":true}

# Test 3 : Rate limiting
# Faire 101 requêtes → 101ème devrait retourner 429
```

---

## 🚀 DÉPLOIEMENT PRODUCTION

### Option 1 : Netlify

**1. Configurer variables environnement** :
```
Site Settings > Environment Variables > Add New
```

Variables :
```
GEMINI_API_KEY=AIza...votre_clé
NODE_ENV=production
JWT_SECRET=votre_secret_jwt
```

**2. Build settings** :
```
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

**3. Netlify Function (alternative backend)** :
```typescript
// netlify/functions/ai-analyze.ts
import { GoogleGenAI } from '@google/genai';

export async function handler(event) {
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
  });
  
  const { input, mimeType } = JSON.parse(event.body);
  
  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash', // Version stable et rapide
    contents: input
  });
  
  return {
    statusCode: 200,
    body: JSON.stringify(JSON.parse(response.text))
  };
}
```

### Option 2 : Vercel

**1. Variables environnement** :
```
Project Settings > Environment Variables
```

Variables :
```
GEMINI_API_KEY=AIza...
NODE_ENV=production
```

**2. Vercel Serverless** :
```typescript
// api/ai/analyze.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
  });
  
  // Traitement...
  
  res.json({ success: true, data: result });
}
```

### Option 3 : VPS

**1. Installer Node.js** :
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**2. Configurer variables** :
```bash
sudo nano /etc/environment

# Ajouter :
GEMINI_API_KEY="AIza..."
JWT_SECRET="votre_secret"

# Recharger
source /etc/environment
```

**3. Systemd service** :
```bash
sudo nano /etc/systemd/system/transit-api.service
```

```ini
[Unit]
Description=Transit Guinée API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/transit-guinee
ExecStart=/usr/bin/node dist/server/index.js
Restart=always
Environment="GEMINI_API_KEY=AIza..."
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

**4. Démarrer service** :
```bash
sudo systemctl daemon-reload
sudo systemctl enable transit-api
sudo systemctl start transit-api
sudo systemctl status transit-api
```

---

## 🧪 TESTS SÉCURITÉ COMPLETS

### Test 1 : Build sécurisé

```powershell
# Build
npm run build

# Vérifier taille (doit être similaire à avant)
Get-ChildItem dist\assets -Recurse | Measure-Object -Property Length -Sum

# ✅ Attendu : ~329 KB gzip (pas d'augmentation)

# Vérifier absence clé
Get-ChildItem dist\assets\*.js | Select-String "AIza|GoogleGenAI|GEMINI"

# ✅ Attendu : 0 résultats ou pas de clé API visible
```

### Test 2 : Appels API

```powershell
# Test avec token
$TOKEN = "eyJhbGc..."

$body = @{
    input = "Facture commerciale 500 conteneurs origine Chine"
    mimeType = "text/plain"
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/ai/analyze" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $TOKEN"
  } `
  -Body $body

Write-Host "Détecté: $($response.detectedType)"
Write-Host "Résumé: $($response.summary)"

# ✅ Attendu : Réponse JSON avec analyse
```

### Test 3 : Rate limiting

```bash
# Boucle 101 requêtes
for ($i=1; $i -le 101; $i++) {
  try {
    Invoke-RestMethod `
      -Uri "http://localhost:3001/api/ai/analyze" `
      -Method POST `
      -Headers @{"Authorization" = "Bearer $TOKEN"} `
      -Body '{"input":"test"}' | Out-Null
    Write-Host "Request $i : OK"
  } catch {
    Write-Host "Request $i : FAILED - $($_.Exception.Message)"
  }
}

# ✅ Attendu : 101ème requête retourne 429
```

### Test 4 : Authentification

```powershell
# Sans token
try {
  Invoke-RestMethod `
    -Uri "http://localhost:3001/api/ai/analyze" `
    -Method POST `
    -Body '{"input":"test"}'
} catch {
  Write-Host "Erreur (attendue) : $($_.Exception.Message)"
}

# ✅ Attendu : 401 Unauthorized
```

---

## 📊 MONITORING

### Logs backend

```bash
# Voir logs en temps réel
npm run dev:server

# Logs production (systemd)
sudo journalctl -u transit-api -f

# Logs production (PM2)
pm2 logs transit-api
```

**Exemple logs** :
```
[2025-01-15T10:30:00.000Z] POST /api/ai/analyze
[AI LOG] User user_abc123 analyzed text (1234 chars)
[2025-01-15T10:30:02.000Z] POST /api/ai/analyze 200 - 2000ms
```

### Health check

```bash
# Vérifier backend
curl http://localhost:3001/api/health

# ✅ Attendu :
{
  "status": "OK",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 123.45,
  "environment": "development",
  "geminiConfigured": true
}
```

---

## 🆘 DÉPANNAGE

### Erreur : "API Key is missing"

**Symptôme** :
```json
{"error": "Service AI temporairement indisponible"}
```

**Solution** :
```bash
# Vérifier .env.server existe
ls .env.server

# Vérifier contenu
cat .env.server | grep GEMINI_API_KEY

# Redémarrer serveur
npm run dev:server
```

### Erreur : "401 Unauthorized"

**Symptôme** :
```json
{"error": "Token manquant"}
```

**Solution** :
```typescript
// Vérifier token localStorage frontend
const token = localStorage.getItem('authToken');
console.log('Token:', token);

// Vérifier format Authorization header
headers: {
  'Authorization': `Bearer ${token}` // ✅ Espace après Bearer
}
```

### Erreur : "429 Too Many Requests"

**Symptôme** :
```json
{"error": "Limite de 100 analyses/jour atteinte"}
```

**Solution** :
```bash
# Attendre 24h ou augmenter limite
# Éditer server/routes/ai.ts
const analyzeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 200 // ← Augmenter ici
});
```

---

## 📚 DOCUMENTATION COMPLÈTE

- **Sécurité** : [docs/AI_SECURITY.md](./AI_SECURITY.md)
- **API Endpoints** : [docs/API.md](./API.md)
- **Déploiement** : [docs/DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Mise à jour** : 10 janvier 2026  
**Version** : 1.1.0  
**Contact** : support[at]transitguinee[dot]com
