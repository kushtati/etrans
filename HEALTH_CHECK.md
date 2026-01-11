# ✅ Checklist de Santé - TransitGuinée

## Avant Chaque Démarrage

### Infrastructure
- [ ] Docker Desktop actif
- [ ] PostgreSQL sur port 5433: `docker ps | findstr postgres`
- [ ] Redis sur port 6379: `docker ps | findstr redis`

### Variables d'Environnement (.env.server)
- [ ] JWT_SECRET défini (minimum 32 caractères)
- [ ] DATABASE_URL correct
- [ ] REDIS_URL correct
- [ ] PORT=3001

### Dépendances
- [ ] node_modules présent
- [ ] Dernière installation: `npm install` (si package.json modifié)

## Pendant l'Exécution

### Terminal Backend (vert = OK)
```
✅ .env.server loaded successfully
✅ Environnement validé avec succès
✅ Audit DB ready
✅ Connected successfully (Redis)
🚀 Development server running on http://127.0.0.1:3001
```

### Terminal Frontend (vert = OK)
```
VITE v6.4.1  ready in XXXms
➜  Local:   http://localhost:5173/
```

### Console Navigateur (F12)
- [ ] 0 erreurs rouges (les 401 sont normales si non connecté)
- [ ] Requêtes CSRF: 200 OK
- [ ] Pas de boucles infinies (même requête répétée)

## Tests Rapides (5 secondes)

```bash
# Test 1: Backend répond
curl http://localhost:3001/api/auth/csrf-token
# Attendu: {"token":"..."}

# Test 2: Frontend accessible
curl http://localhost:5173/
# Attendu: HTML avec <div id="root">

# Test 3: Proxy fonctionne
curl http://localhost:5173/api/auth/csrf-token
# Attendu: {"token":"..."}
```

## Problèmes Courants

### Port 3001 déjà utilisé
```powershell
Get-NetTCPConnection -LocalPort 3001 | Select -ExpandProperty OwningProcess | % { taskkill /PID $_ /F }
```

### Port 5173 déjà utilisé
```powershell
Get-NetTCPConnection -LocalPort 5173 | Select -ExpandProperty OwningProcess | % { taskkill /PID $_ /F }
```

### Redis ne se connecte pas
```bash
docker restart transit-redis
```

### PostgreSQL ne se connecte pas
```bash
docker restart transit-postgres
```

### Erreurs 500 dans la console
1. Vérifier logs backend (terminal [1])
2. Chercher "Error:" ou "CSRF token generation failed"
3. Vérifier imports ES modules (pas de `require()`)

## Performance

### Temps de Chargement Normaux
- Frontend ready: 800-1200ms ✅
- Backend ready: 2000-3000ms ✅
- Page index.html: < 500ms ✅

### Mémoire Normale
- Node backend: 100-200MB ✅
- Chrome frontend: 200-400MB ✅

## Sécurité

### Headers Attendus (curl -I)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000`

### Cookies Sécurisés
- HttpOnly: ✅
- Secure (production): ✅
- SameSite: Strict ✅

## Erreurs Normales vs Anormales

### ✅ NORMALES (Pas d'action requise)
```
GET /me 401 - Unauthorized
GET /shipments 401 - Unauthorized
```
→ **Raison**: Utilisateur non connecté, JWT token absent  
→ **Action**: Aucune, c'est le comportement sécurisé

### ❌ ANORMALES (Nécessitent correction)
```
GET /csrf-token 500 - Internal Server Error
Error: require is not defined
ECONNREFUSED 127.0.0.1:3001
Port 3001 is already in use
```
→ **Raison**: Problème de configuration ou code  
→ **Action**: Vérifier logs, corriger le code

## Commandes Utiles

### Redémarrer tout proprement
```powershell
# Arrêter tous les processus Node
Get-Process -Name node,tsx -ErrorAction SilentlyContinue | Stop-Process -Force

# Attendre 2 secondes
Start-Sleep 2

# Relancer
npm run dev
```

### Nettoyer le cache
```bash
# Supprimer node_modules
rm -rf node_modules

# Supprimer package-lock.json
rm package-lock.json

# Réinstaller
npm install
```

### Logs en temps réel
```bash
# Logs backend uniquement
npm run backend

# Logs frontend uniquement  
npm run frontend
```

## Checklist Avant Production

- [ ] GEMINI_API_KEY remplacé par vraie clé (si IA utilisée)
- [ ] JWT_SECRET changé (générer nouveau: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- [ ] DATABASE_URL pointe vers DB production
- [ ] REDIS_URL pointe vers Redis production
- [ ] NODE_ENV=production
- [ ] HTTPS activé
- [ ] Rate limiting activé (déjà fait ✅)
- [ ] Logs configurés vers service externe (Datadog, ELK)
- [ ] Backups DB automatiques
- [ ] Monitoring actif
