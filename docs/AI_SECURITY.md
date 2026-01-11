# 🔒 Sécurité API Gemini - Documentation

## ❌ FAILLE INITIALE (CRITIQUE)

### Problème détecté
```typescript
// ❌ services/geminiService.ts (AVANT - DANGEREUX)
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });
```

**Impact** :
- Clé API Google Gemini exposée dans bundle JavaScript frontend
- Visible dans `dist/assets/index-[hash].js` après build
- N'importe qui peut extraire la clé via DevTools
- Risque : Utilisation illimitée → Facture Google explosive 💸
- Violation : Politique Google (clé côté client interdite)

### Preuve de la faille
```bash
npm run build
grep -r "GoogleGenAI" dist/assets/*.js
# Résultat : Clé API visible en clair 😱
```

---

## ✅ SOLUTION IMPLÉMENTÉE

### Architecture sécurisée

```
┌────────────────────┐         ┌────────────────────┐         ┌──────────────┐
│  Frontend React    │  HTTPS  │  Backend Express   │  HTTPS  │ Google Gemini│
│                    │ ──────→ │                    │ ──────→ │   API        │
│ geminiService.ts   │   JWT   │ routes/ai.ts       │  API Key│              │
│ (pas de clé API)   │         │ (clé sécurisée)    │         │              │
└────────────────────┘         └────────────────────┘         └──────────────┘
```

### 1. Frontend sécurisé (`services/geminiService.ts`)

```typescript
// ✅ APRÈS - SÉCURISÉ
export const analyzeTransitInfo = async (input: string, mimeType?: string) => {
  const token = localStorage.getItem('authToken');
  
  // Appel au backend proxy (pas de clé API côté client)
  const response = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // JWT requis
    },
    body: JSON.stringify({ input, mimeType }),
    credentials: 'include'
  });
  
  return await response.json();
};
```

**Avantages** :
- ✅ Aucune clé API dans le code frontend
- ✅ Authentification JWT obligatoire
- ✅ Rate limiting automatique
- ✅ Build vérifié : `grep "GoogleGenAI" dist/` → 0 résultats

### 2. Backend proxy sécurisé (`server/routes/ai.ts`)

```typescript
import { GoogleGenAI } from '@google/genai';
import rateLimit from 'express-rate-limit';

// ✅ Clé API côté serveur uniquement
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY 
});

// Rate limiting : 100 requêtes/jour
const analyzeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  message: { error: 'Limite de 100 analyses/jour atteinte' }
});

router.post('/analyze', 
  authenticateJWT,      // Vérifier JWT
  analyzeLimiter,       // Rate limit
  async (req, res) => {
    // Appel Gemini sécurisé
    const response = await ai.models.generateContent({ /* ... */ });
    
    // Log audit
    console.log(`User ${req.user.id} analyzed document`);
    
    res.json(response);
  }
);
```

**Protections** :
- ✅ JWT authentication middleware
- ✅ Rate limiting (100/jour par user)
- ✅ Validation input (max 100KB)
- ✅ Audit logs (tracking utilisation)
- ✅ CORS sécurisé

### 3. Variables environnement (`.env.server`)

```bash
# ✅ Clé API côté serveur UNIQUEMENT
GEMINI_API_KEY=AIza...votre_clé_secrète

# ⚠️ IMPORTANT :
# - Ce fichier est dans .gitignore
# - Ne JAMAIS committer ce fichier
# - En production : configurer via plateforme hébergement
```

**Fichiers sécurisés** :
- `.env.server` → Dans `.gitignore` ✅
- `vite.config.ts` → Clé API supprimée ✅
- `geminiService.ts` → Appels backend uniquement ✅

---

## 📊 ENDPOINTS API

### POST `/api/ai/analyze`
Analyse documents de transit (image/PDF/text) via Gemini

**Request** :
```json
{
  "input": "texte ou data:image/jpeg;base64,...",
  "mimeType": "image/jpeg"
}
```

**Response** :
```json
{
  "detectedType": "Facture commerciale",
  "summary": "Importation 500 conteneurs depuis Chine",
  "potentialHsCodes": ["8703.24", "8703.32"],
  "riskAnalysis": "Documentation complète, aucun risque détecté",
  "extractedFields": {
    "shipmentDescription": "500 Véhicules Toyota Corolla 2024",
    "origin": "Shanghai, Chine",
    "weight": "50 000 kg",
    "containerInfo": "Conteneur 40 pieds HC",
    "estimatedArrival": "2025-06-15"
  }
}
```

**Erreurs** :
- `401 Unauthorized` : Token JWT manquant/invalide
- `429 Too Many Requests` : Limite 100/jour atteinte
- `400 Bad Request` : Input invalide (max 100KB)
- `500 Server Error` : Erreur Gemini API

**Rate limits** :
- `/api/ai/analyze` : 100 requêtes/jour
- `/api/ai/assistant` : 50 requêtes/jour

---

## 🚀 DÉPLOIEMENT PRODUCTION

### 1. Netlify

**Configuration** :
```bash
# Site Settings > Environment Variables
GEMINI_API_KEY=AIza...votre_clé
NODE_ENV=production
JWT_SECRET=votre_secret_jwt
```

**Netlify Functions** (alternative) :
```typescript
// netlify/functions/ai-analyze.ts
import { GoogleGenAI } from '@google/genai';

export async function handler(event, context) {
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
  });
  
  // Traitement...
  
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
}
```

### 2. Vercel

**Configuration** :
```bash
# Project Settings > Environment Variables
GEMINI_API_KEY=AIza...votre_clé
NODE_ENV=production
```

**Vercel Serverless** :
```typescript
// api/ai/analyze.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest, 
  res: VercelResponse
) {
  // Implémentation...
}
```

### 3. VPS (Linux)

**Variables environnement** :
```bash
# /etc/environment
GEMINI_API_KEY="AIza...votre_clé"
JWT_SECRET="votre_secret"

# Redémarrer shell
source /etc/environment
```

**Systemd service** :
```ini
# /etc/systemd/system/transit-api.service
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

---

## 🧪 TESTS SÉCURITÉ

### Test 1 : Vérifier absence clé dans bundle

```bash
# Build production
npm run build

# Vérifier absence clé API
grep -r "AIza" dist/
# ✅ Attendu : 0 résultats

grep -r "GoogleGenAI" dist/assets/*.js
# ✅ Attendu : Pas de clé API visible

# Vérifier taille bundle
ls -lh dist/assets/*.js
# ✅ Attendu : ~329 KB gzip (similaire avant)
```

### Test 2 : Test appel backend

```bash
# Démarrer backend
npm run dev:server

# Test analyse document
curl -X POST http://localhost:3001/api/ai/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "input": "Facture commerciale conteneur 40 pieds origine Chine",
    "mimeType": "text/plain"
  }'

# ✅ Attendu : {"detectedType": "Facture", ...}
```

### Test 3 : Test rate limiting

```bash
# Faire 101 requêtes rapidement
for i in {1..101}; do
  curl -X POST http://localhost:3001/api/ai/analyze \
    -H "Authorization: Bearer ${TOKEN}" \
    -d '{"input": "test"}' &
done

# ✅ Attendu : 101ème requête retourne 429
# {"error": "Limite de 100 analyses/jour atteinte"}
```

### Test 4 : Test authentification

```bash
# Sans token JWT
curl -X POST http://localhost:3001/api/ai/analyze \
  -d '{"input": "test"}'

# ✅ Attendu : 401 Unauthorized
# {"error": "Token manquant"}
```

---

## 📈 MONITORING

### Logs audit (à implémenter)

```typescript
// server/services/auditService.ts
export const logAIRequest = async (data: {
  userId: string;
  endpoint: string;
  inputLength: number;
  model: string;
  timestamp: Date;
  responseTime: number;
}) => {
  await db.aiLogs.create(data);
};
```

**Table DB `ai_logs`** :
```sql
CREATE TABLE ai_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  endpoint VARCHAR(100),
  input_length INTEGER,
  model VARCHAR(50),
  timestamp TIMESTAMP,
  response_time INTEGER,
  success BOOLEAN
);
```

### Dashboard monitoring

**Métriques à tracker** :
- Nombre requêtes/jour par user
- Temps réponse Gemini API
- Erreurs 429 (rate limit)
- Coût mensuel API Gemini
- Top 10 users actifs

---

## ⚠️ CHECKLIST SÉCURITÉ

### Avant déploiement

- [ ] ✅ `.env.server` créé avec `GEMINI_API_KEY`
- [ ] ✅ `.env.server` dans `.gitignore`
- [ ] ✅ `vite.config.ts` : Clé API supprimée
- [ ] ✅ `geminiService.ts` : Appels backend uniquement
- [ ] ✅ `server/routes/ai.ts` : Routes sécurisées créées
- [ ] ✅ JWT authentication activée
- [ ] ✅ Rate limiting configuré (100/jour)
- [ ] ✅ Build vérifié : `grep API_KEY dist/` → 0 résultats
- [ ] ✅ Tests curl backend réussis
- [ ] ⏳ Variables environnement production configurées
- [ ] ⏳ Tests Lighthouse PWA (100 attendu)
- [ ] ⏳ Monitoring logs audit activé

### En production

- [ ] Variables environnement plateforme configurées
- [ ] HTTPS activé (Let's Encrypt)
- [ ] Certificat SSL valide (A+ SSLLabs)
- [ ] Headers sécurité (CSP, HSTS)
- [ ] Monitoring erreurs (Sentry)
- [ ] Backup DB réguliers
- [ ] Logs audit actifs

---

## 📚 RÉFÉRENCES

- **Google Gemini API** : https://ai.google.dev/gemini-api/docs
- **Best Practices Sécurité API** : https://owasp.org/www-project-api-security/
- **Rate Limiting Express** : https://github.com/express-rate-limit/express-rate-limit
- **JWT Authentication** : https://jwt.io/introduction

---

## 🆘 SUPPORT

En cas de problème :
1. Vérifier logs backend : `npm run dev:server`
2. Tester `/api/health` : `curl http://localhost:3001/api/health`
3. Vérifier variable environnement : `echo $GEMINI_API_KEY`
4. Consulter logs audit dans DB

**Contact** : [Votre email support]

---

**Dernière mise à jour** : 2025-01-XX  
**Version** : 1.0.0  
**Auteur** : TransitGuinée Secure Team
