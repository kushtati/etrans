# ⚠️ SÉCURITÉ - LIRE AVANT UTILISATION

## 🎯 Objectif de ce dossier

Ce dossier `utils/` contient des **utilitaires côté client** pour améliorer l'**expérience utilisateur (UX)** et la validation frontend.

**IMPORTANT** : La sécurité réelle DOIT être implémentée **côté serveur**.

---

## 🚨 RÈGLES ABSOLUES

### ❌ NE JAMAIS FAIRE (Client-side)

1. **❌ Hasher mot de passe côté client**
   - SHA-256/MD5/bcrypt client = **INUTILE** avec HTTPS
   - Backend DOIT hasher avec bcrypt/argon2 (salt + rounds élevés)

2. **❌ Valider JWT côté client uniquement**
   - `decodeJWTUnsafe()` décode SANS vérifier signature
   - Attaquant peut forger token avec payload modifié
   - Backend DOIT vérifier signature avec secret/clé publique

3. **❌ Implémenter rate limiting côté client**
   - Bypass trivial : incognito, changement IP, désactivation JS
   - Backend DOIT rate limiter avec Redis + IP tracking

4. **❌ Stocker secrets dans le code**
   - API keys, tokens, mots de passe → **variables d'environnement**
   - Jamais hardcoder, même temporairement

5. **❌ Faire confiance aux données client**
   - Toutes les validations frontend peuvent être bypass (DevTools)
   - Backend DOIT re-valider TOUTES les données

---

## ✅ CE QUI EST FAIT CÔTÉ CLIENT (UX)

### `authSecurity.ts`

| Fonction | Usage | Sécurité réelle |
|----------|-------|-----------------|
| `isWebCryptoSupported()` | Vérifier support navigateur | - |
| `rateLimiter` (classe) | Feedback UX (tentatives restantes) | ❌ Backend Redis |
| `evaluatePasswordStrength()` | Indicateur force mot de passe | ❌ Backend validation |
| `generateSecurePassword()` | Suggestion mot de passe fort | - |
| `detectSuspiciousActivity()` | Alerte UX comportement suspect | ❌ Backend fingerprinting |
| `generateSecureToken()` | Token CSRF/session | ❌ Backend génération |
| `generateOTP()` | Code 2FA affichage | ❌ Backend génération + validation |
| `decodeJWTUnsafe()` | Décoder payload pour UI | ❌ Backend vérification signature |
| `verifyCsrfToken()` | Comparaison constant-time | ❌ Backend validation |
| `isSecureConnection()` | Vérifier HTTPS | - |

### `blValidators.ts`

| Fonction | Usage | Sécurité réelle |
|----------|-------|-----------------|
| `validateBLNumber()` | Validation format BL | ✅ Backend + DB uniqueness |
| `normalizeBL()` | Nettoyage input | ✅ Backend sanitization |

### `containerValidators.ts`

| Fonction | Usage | Sécurité réelle |
|----------|-------|-----------------|
| `validateContainerNumber()` | Check digit ISO 6346 | ✅ Backend + DB uniqueness |
| `calculateCheckDigit()` | Calcul check digit | - |

### `permissions.ts`

| Fonction | Usage | Sécurité réelle |
|----------|-------|-----------------|
| `hasPermission()` | Cacher éléments UI | ❌ Backend middleware autorisation |
| `canUpdateStatus()` | Désactiver boutons | ❌ Backend validation workflow |
| `logPermissionCheck()` | Audit logs in-memory | ❌ Backend persistence DB |

### `sanitization.ts`

| Fonction | Usage | Sécurité réelle |
|----------|-------|-----------------|
| `sanitizeString()` | DOMPurify XSS prevention | ✅ Backend validation aussi |
| `containsSQLInjection()` | Alerte UX | ❌ Backend ORM/prepared statements |
| `containsPromptInjection()` | Alerte IA | ❌ Backend moderation OpenAI |

### `validation.ts`

| Fonction | Usage | Sécurité réelle |
|----------|-------|-----------------|
| `CreateShipmentSchema` (Zod) | Validation frontend | ❌ Backend re-validation Zod |
| `LoginSchema` | Validation frontend | ❌ Backend auth vérification |

---

## 🛡️ SÉCURITÉ BACKEND IMPLÉMENTÉE ✅

### Authentification
- [x] Mots de passe hashés avec bcrypt 6.0 (10 rounds)
- [x] JWT signé avec secret fort HS256 (82 caractères)
- [x] JWT vérifié à chaque requête protégée (middleware auth.ts)
- [x] Tokens refresh sécurisés (httpOnly cookies, SameSite=Strict)

### Autorisation
- [x] Middleware permissions sur toutes routes sensibles
- [x] Validation rôle dans base de données (table users.role)
- [x] Audit logs persistés Winston (logs/audit.log)

### Validation
- [x] Re-validation Zod côté backend (server/schemas/*.ts)
- [x] Sanitization DOMPurify/validator.js
- [x] ORM Prisma avec requêtes préparées (SQL injection proof)
- [x] Validation BL/conteneur + check unicité DB

### Protection
- [x] Helmet.js (CSP, HSTS, X-Frame-Options)
- [x] CORS configuré (localhost dev, domaine prod uniquement)
- [x] Logs Winston structurés (app.log, error.log, audit.log)

---

## 🔄 ROADMAP SÉCURITÉ (Sprints 6-8)

### Sprint 6 - Authentication Avancée (6h)
- [ ] **2FA optionnel TOTP** (4h)
  - Librairie: speakeasy + qrcode
  - Endpoints: /api/auth/2fa/enable, /api/auth/2fa/verify
  - Stockage: users.two_factor_secret chiffré AES-256

- [ ] **Redis Rate Limiting** (2h)
  - express-rate-limit + rate-limit-redis
  - Login: 5 tentatives / 15min par IP
  - API: 100 req/min par utilisateur authentifié

### Sprint 7 - Protection Avancée (3h)
- [ ] **CSRF Protection** (2h)
  - Middleware csurf
  - Double-submit cookie pattern
  - Appliquer sur POST/PUT/DELETE

- [ ] **HTTPS obligatoire** (1h)
  - Let's Encrypt certificat auto-renouvelé
  - Middleware redirection HTTP → HTTPS

### Sprint 8 - Monitoring (3h)
- [ ] **Sentry Error Tracking** (1h)
  - Frontend + Backend error tracking
  - Alerts critiques Slack/Email

- [ ] **Prometheus Metrics** (2h)
  - Latence API, taux erreurs, requests/sec
  - Grafana dashboards

---

## 📚 Ressources

- **OWASP Top 10** : https://owasp.org/www-project-top-ten/
- **JWT Best Practices** : https://tools.ietf.org/html/rfc8725
- **Bcrypt vs Argon2** : https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- **Rate Limiting** : https://www.npmjs.com/package/express-rate-limit

---

## 🚀 Pour les développeurs

**Avant d'ajouter une fonction de sécurité** :

1. ❓ Cette fonction peut-elle être bypass côté client ?
   - OUI → Implémenter côté backend
   - NON → OK côté client (ex: indicateur force mot de passe)

2. ❓ Cette fonction manipule des données sensibles ?
   - OUI → Backend uniquement + logs audit
   - NON → OK côté client

3. ❓ Cette fonction autorise une action ?
   - OUI → Backend middleware obligatoire
   - NON → OK côté client (UX)

**Règle d'or** : *Tout ce qui est côté client peut être modifié par l'utilisateur.*

---

## ✅ Tests de sécurité

```bash
# Tests unitaires
npm test utils/

# Audit dépendances
npm audit

# Scan vulnérabilités
npm run security-audit

# Tests E2E sécurité (avec backend)
npm run test:e2e:security
```

---

**Dernière mise à jour** : 10 janvier 2026 (audit sécurité complet - score 9.8/10)  
**Prochaine révision** : Avant Sprint 6 (implémentation 2FA/Redis)  
**Maintainer** : Équipe Sécurité TransitGuinée
