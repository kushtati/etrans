# 🧪 Guide de Test - API Gemini Sécurisée

## 📋 Prérequis

1. **Installer packages SQLite** :
```bash
npm install sqlite3 sqlite
npm install -D @types/better-sqlite3
```

2. **Configurer `.env.server`** :
```bash
GEMINI_API_KEY=AIza...votre_clé
JWT_SECRET=votre_secret_jwt_au_moins_32_caracteres
```

3. **Générer un JWT secret sécurisé** :
```powershell
# PowerShell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 🚀 Démarrage

### Terminal 1 : Backend

```bash
npm run dev:server
```

**Attendu** :
```
✅ Audit DB initialized: C:\...\server\data\audit_logs.db
✅ Audit DB ready
🚀 Development server running on http://0.0.0.0:3001
🔑 Gemini API Key: ✅ Configured
```

### Terminal 2 : Frontend

```bash
npm run dev
```

---

## 🧪 Tests Manuels

### Test 1 : Vérifier Build Sécurisé

```powershell
# Build
npm run build

# Vérifier absence clé API
Get-ChildItem -Path dist\assets\*.js | ForEach-Object { 
  $content = Get-Content $_.FullName -Raw
  if ($content -match 'AIza|GoogleGenAI.*apiKey') { 
    Write-Host "⚠️ FOUND in $($_.Name)" -ForegroundColor Red
  } else { 
    Write-Host "✅ CLEAN: $($_.Name)" -ForegroundColor Green
  }
}
```

**Résultat attendu** : ✅ CLEAN pour tous les fichiers

---

### Test 2 : Health Check Backend

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/health"
```

**Résultat attendu** :
```json
{
  "status": "OK",
  "timestamp": "2026-01-07T...",
  "uptime": 123.45,
  "environment": "development",
  "geminiConfigured": true
}
```

---

### Test 3 : Test Sans Token JWT (Doit échouer)

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/ai/analyze" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body '{"input":"test"}'
```

**Résultat attendu** : ❌ 401 Unauthorized
```json
{
  "error": "Token manquant",
  "message": "Authentification requise..."
}
```

---

### Test 4 : Générer Token JWT Temporaire

Créer `test-jwt.js` :
```javascript
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  {
    userId: 'test_user_123',
    email: 'test@transitguinee.com',
    role: 'admin'
  },
  process.env.JWT_SECRET || 'your_super_secure_jwt_secret_change_this_in_production_at_least_32_characters_long',
  { expiresIn: '7d' }
);

console.log(token);
```

```bash
node test-jwt.js
```

Copier le token généré.

---

### Test 5 : Analyse Document avec Token

```powershell
$TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." # Token du Test 4

$body = @{
    input = @"
FACTURE COMMERCIALE
N°: FAC-2026-001
Date: 07/01/2026

Vendeur: CHINA EXPORT CO., LTD
Adresse: Shanghai, Chine

Acheteur: GUINEE IMPORT SARL
Adresse: Conakry, Guinée

Marchandises:
- 500 Véhicules Toyota Corolla 2024
- Poids total: 50 000 kg
- Conteneurs: 10x 40 pieds HC
- Valeur CIF: 25 000 000 USD

Port d'origine: Shanghai
Port de destination: Conakry
ETA: 15/02/2026
"@
    mimeType = "text/plain"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/ai/analyze" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $TOKEN"
  } `
  -Body $body
```

**Résultat attendu** :
```json
{
  "detectedType": "Facture commerciale",
  "summary": "Importation de 500 véhicules Toyota Corolla 2024...",
  "potentialHsCodes": ["8703.24", "8703.32"],
  "riskAnalysis": "Documents conformes...",
  "extractedFields": {
    "shipmentDescription": "500 Véhicules Toyota Corolla 2024",
    "origin": "Shanghai, Chine",
    "weight": "50 000 kg",
    "containerInfo": "10x 40 pieds HC",
    "estimatedArrival": "15/02/2026"
  }
}
```

---

### Test 6 : Assistant Douanes

```powershell
$TOKEN = "eyJhbG..." # Même token

$body = @{
    question = "Quels documents sont requis pour importer des véhicules en Guinée ?"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/ai/assistant" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $TOKEN"
  } `
  -Body $body
```

**Résultat attendu** :
```json
{
  "answer": "Pour importer des véhicules en Guinée, vous devez fournir :\n\n1. Documents obligatoires :\n- Facture commerciale originale\n- Connaissement (Bill of Lading)...\n"
}
```

---

### Test 7 : Vérifier Audit Logs

```powershell
# Lire DB SQLite
sqlite3 server/data/audit_logs.db "SELECT * FROM ai_logs ORDER BY timestamp DESC LIMIT 5;"
```

**Ou créer un endpoint de stats** (`server/routes/ai.ts`) :
```typescript
router.get('/stats', authenticateJWT, async (req, res) => {
  const stats = await getUserStats(req.user!.userId, 30);
  res.json(stats);
});
```

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/ai/stats" `
  -Headers @{"Authorization" = "Bearer $TOKEN"}
```

---

### Test 8 : Rate Limiting

```powershell
# Faire 101 requêtes rapidement
$TOKEN = "eyJhbG..."

for ($i=1; $i -le 101; $i++) {
  try {
    $body = @{ input = "test $i"; mimeType = "text/plain" } | ConvertTo-Json
    
    Invoke-RestMethod `
      -Uri "http://localhost:3001/api/ai/analyze" `
      -Method POST `
      -Headers @{
        "Authorization" = "Bearer $TOKEN"
        "Content-Type" = "application/json"
      } `
      -Body $body | Out-Null
      
    Write-Host "✅ Request $i : OK" -ForegroundColor Green
    
  } catch {
    if ($_.Exception.Message -like "*429*") {
      Write-Host "🚦 Rate limit atteint à la requête $i" -ForegroundColor Yellow
      break
    }
    Write-Host "❌ Request $i : $($_.Exception.Message)" -ForegroundColor Red
  }
}
```

**Résultat attendu** : Rate limit à 101ème requête

---

## 📊 Vérifications Finales

### Checklist Sécurité

- [x] ✅ Build ne contient pas clé API (`grep "AIza" dist/` → 0)
- [x] ✅ JWT authentication fonctionne
- [x] ✅ Rate limiting actif (100/jour analyse, 50/jour assistant)
- [x] ✅ Audit logs enregistrés dans SQLite
- [x] ✅ Validation input (max 100KB)
- [x] ✅ Erreurs JWT gérées (expired, invalid, etc.)

### Métriques Performance

| Endpoint | Temps Réponse | Rate Limit |
|----------|---------------|------------|
| /api/health | <10ms | Illimité |
| /api/ai/analyze (texte) | 1-3s | 100/jour |
| /api/ai/analyze (image) | 3-5s | 100/jour |
| /api/ai/assistant | 1-2s | 50/jour |

### Base de Données

**Structure table `ai_logs`** :
```sql
CREATE TABLE ai_logs (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  input_length INTEGER,
  output_length INTEGER,
  duration INTEGER,
  success BOOLEAN,
  error TEXT,
  timestamp DATETIME,
  ip_address TEXT,
  user_agent TEXT
);
```

**Requêtes utiles** :
```sql
-- Stats globales
SELECT 
  COUNT(*) as total,
  COUNT(DISTINCT user_id) as users,
  AVG(duration) as avg_ms
FROM ai_logs
WHERE timestamp >= datetime('now', '-7 days');

-- Top 10 users
SELECT user_id, COUNT(*) as requests
FROM ai_logs
GROUP BY user_id
ORDER BY requests DESC
LIMIT 10;

-- Taux d'erreur
SELECT 
  (SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as error_rate
FROM ai_logs
WHERE timestamp >= datetime('now', '-24 hours');
```

---

## 🐛 Dépannage

### Erreur : "GEMINI_API_KEY manquante"

**Solution** :
```bash
# Vérifier .env.server existe
ls .env.server

# Vérifier contenu
cat .env.server | Select-String "GEMINI_API_KEY"

# Redémarrer serveur
npm run dev:server
```

### Erreur : "JWT_SECRET manquant"

**Solution** :
```bash
# Générer secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Ajouter dans .env.server
JWT_SECRET=<secret_généré>
```

### Erreur : "Audit DB initialization failed"

**Solution** :
```bash
# Installer packages SQLite
npm install sqlite3 sqlite

# Créer dossier data
mkdir -p server/data

# Permissions (Linux/Mac)
chmod 755 server/data
```

---

## 📚 Documentation

- [AI_SECURITY.md](./AI_SECURITY.md) - Architecture complète
- [EXAMPLES.md](./EXAMPLES.md) - Exemples code React
- [SECURITY_FIX_REPORT.md](./SECURITY_FIX_REPORT.md) - Rapport correction

---

**Dernière mise à jour** : 2026-01-07  
**Version** : 1.1.0
