# 🔒 SÉCURITÉ - GESTION DES RÔLES

## ⚠️ FAILLE CRITIQUE CORRIGÉE

### Problème Initial (❌ VULNÉRABLE)

```typescript
// ❌ FAILLE DE SÉCURITÉ - Ne JAMAIS faire ça!
const savedRole = sessionStorage.getItem('currentUserRole');
if (savedRole) {
  setRole(savedRole as Role);
}
```

**Exploit possible :**
```javascript
// Dans Console Chrome :
sessionStorage.setItem('currentUserRole', 'DG / Admin');
location.reload(); 
// 💥 BOOM ! Accès administrateur total
```

**Impact :**
- N'importe quel utilisateur peut devenir admin
- Contournement total du système de permissions
- Accès aux données financières sensibles
- Violation RGPD

---

## ✅ SOLUTION SÉCURISÉE

### Architecture

```
┌─────────────┐           ┌──────────────┐           ┌─────────────┐
│   Client    │  HTTPS    │   Backend    │   Query   │  Database   │
│  (React)    │◄─────────►│  (Express)   │◄─────────►│ (Postgres)  │
└─────────────┘           └──────────────┘           └─────────────┘
      │                          │
      │  1. Login Request        │
      ├─────────────────────────►│
      │  (email + password)      │
      │                          │
      │                     2. Vérification
      │                          ├─ Hash password
      │                          ├─ Query DB
      │                          └─ Validate user
      │                          │
      │  3. JWT + httpOnly       │
      │◄─────────────────────────┤
      │  cookie (auth_token)     │
      │                          │
      │  4. GET /api/auth/me     │
      ├─────────────────────────►│
      │  (cookie auto-envoyé)    │
      │                          │
      │                     5. JWT.verify()
      │                          ├─ Decode token
      │                          └─ Extract role
      │                          │
      │  6. { role, permissions }│
      │◄─────────────────────────┤
      │                          │
```

### 1. Backend - Endpoint `/api/auth/me`

```typescript
// server/routes/auth.ts

router.get('/me', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user; // Extrait du JWT par middleware
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
    }

    // ✅ Décoder permissions depuis JWT
    const { decodePermissions } = require('../../utils/permissions');
    const permissions = decodePermissions(user.permissions);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,           // ✅ Vient du JWT (impossible à falsifier)
        permissions                // ✅ Permissions décodées
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});
```

### 2. Frontend - TransitContext Sécurisé

```typescript
// context/transitContext.tsx

export const TransitProvider: React.FC<TransitProviderProps> = ({ children }) => {
  const [role, setRole] = useState<Role>(Role.DIRECTOR);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // ✅ SÉCURITÉ: Récupérer le rôle depuis JWT backend
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include', // ✅ Envoie cookie httpOnly automatiquement
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          // Token invalide ou expiré → Rediriger login
          setIsAuthenticated(false);
          logger.warn('Token invalide, redirection login requise');
          return;
        }

        const { user } = await response.json();
        
        // ✅ Rôle vient du JWT décodé côté serveur (sécurisé)
        setRole(user.role as Role);
        setCurrentUserId(user.id);
        setIsAuthenticated(true);
        
        logger.info('Session authentifiée', { 
          role: user.role, 
          userId: user.id 
        });

      } catch (err: any) {
        logger.error('Auth check failed', { error: err.message });
        setIsAuthenticated(false);
      }
    };

    fetchUserRole();
  }, []);

  // ❌ SUPPRIMÉ: Lecture depuis sessionStorage
  // useEffect(() => {
  //   const savedRole = sessionStorage.getItem('currentUserRole');
  //   if (savedRole) {
  //     setRole(savedRole as Role);
  //   }
  // }, []);

  // ...
};
```

### 3. Middleware Authentification

```typescript
// server/routes/auth.ts

export function authenticateJWT(req: Request, res: Response, next: any) {
  // ✅ Lecture depuis cookie httpOnly (priorité)
  const token = req.cookies.auth_token || 
                req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Non authentifié'
    });
  }

  try {
    // ✅ Vérification signature JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded; // Injecte dans req
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token invalide ou expiré'
    });
  }
}
```

---

## 🔐 Mécanismes de Sécurité

### 1. httpOnly Cookies

```typescript
// Login successful - Set cookie
res.cookie('auth_token', token, {
  httpOnly: true,        // ✅ Inaccessible depuis JavaScript
  secure: true,          // ✅ HTTPS uniquement
  sameSite: 'strict',    // ✅ Protection CSRF
  maxAge: 24 * 60 * 60 * 1000 // 24h
});
```

**Avantages :**
- Inaccessible via `document.cookie`
- Impossible à voler via XSS
- Envoyé automatiquement par le navigateur
- Protection CSRF avec `sameSite: 'strict'`

### 2. JWT (JSON Web Token)

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "id": "user-123",
    "email": "user@transit.gn",
    "role": "Comptable",
    "permissions": "base64EncodedPermissions",
    "exp": 1736294400,
    "iss": "transit-guinee",
    "aud": "transit-users"
  },
  "signature": "HMACSHA256(...)"
}
```

**Sécurité :**
- Signé avec secret (`JWT_SECRET`)
- Impossible à falsifier sans le secret
- Expiration automatique (`exp`)
- Validé à chaque requête backend

### 3. Permissions Encodées

```typescript
// Permissions encodées dans JWT
const generateJWT = (user: User): string => {
  const { encodePermissions } = require('../../utils/permissions');
  
  return jwt.sign({
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: encodePermissions(user.role) // ✅ Permissions dans JWT
  }, JWT_SECRET, {
    expiresIn: '24h'
  });
};
```

---

## 🛡️ Défenses Mises en Place

### 1. ❌ Suppression sessionStorage/localStorage

```typescript
// ❌ AVANT (Vulnérable)
sessionStorage.setItem('currentUserRole', role);
sessionStorage.setItem('authToken', token);

// ✅ APRÈS (Sécurisé)
// Rien ! Tout est géré par httpOnly cookies
```

**Fichiers modifiés :**
- ✅ `context/transitContext.tsx` - Supprimé lecture sessionStorage
- ✅ `App.tsx` - Login via API au lieu de sessionStorage
- ✅ `services/apiService.ts` - Supprimé stockage tokens
- ✅ `services/logger.ts` - Supprimé lecture rôle

### 2. ✅ Validation Backend Systématique

```typescript
// Chaque route sensible protégée
router.get('/api/shipments', authenticateJWT, requirePermission('view_shipments'), 
  async (req, res) => {
    // Le rôle vient du JWT vérifié
    const userRole = (req as any).user.role;
    
    // Filtrage selon permissions réelles
    const shipments = await filterShipmentsByRole(userRole);
    res.json(shipments);
  }
);
```

### 3. ✅ Refresh Token (Prolongation Session)

```typescript
// Endpoint pour rafraîchir le token sans redemander password
router.post('/auth/refresh', authenticateJWT, async (req, res) => {
  const user = (req as any).user;
  
  // Générer nouveau token avec nouvelles permissions si changées
  const newToken = generateJWT(await findUserById(user.id));
  
  res.cookie('auth_token', newToken, { httpOnly: true, ... });
  res.json({ success: true });
});
```

---

## 🧪 Tests de Sécurité

### Test 1 : Tentative Falsification Rôle

```javascript
// Console Chrome
sessionStorage.setItem('currentUserRole', 'DG / Admin');
location.reload();

// ✅ Résultat attendu : 
// - Rôle ignoré (pas lu depuis sessionStorage)
// - Fetch /api/auth/me → retourne rôle réel depuis JWT
// - Permissions appliquées selon JWT uniquement
```

### Test 2 : Token Expiré

```javascript
// Attendre expiration (24h)
fetch('/api/shipments', { credentials: 'include' });

// ✅ Résultat attendu :
// - 401 Unauthorized
// - Redirection vers login
// - Message "Session expirée"
```

### Test 3 : Manipulation Cookie (Impossible)

```javascript
// Tentative accès cookie
document.cookie;

// ✅ Résultat attendu :
// - auth_token non visible (httpOnly)
// - Impossible à lire ou modifier
```

### Test 4 : CSRF Attack

```html
<!-- Site malveillant -->
<form action="https://transit.gn/api/shipments/delete" method="POST">
  <input type="hidden" name="id" value="123" />
</form>

<!-- ✅ Bloqué par sameSite: 'strict' -->
<!-- Cookie non envoyé depuis domaine externe -->
```

---

## 📋 Checklist Sécurité

### Backend
- [x] JWT avec secret robuste (`JWT_SECRET`)
- [x] Cookies httpOnly pour tokens
- [x] Middleware `authenticateJWT` sur routes sensibles
- [x] Permissions encodées dans JWT
- [x] Endpoint `/api/auth/me` pour vérification rôle
- [x] Rate limiting sur login (`5 tentatives/15min`)
- [x] Audit logs pour actions sensibles
- [x] Validation expiration tokens

### Frontend
- [x] Suppression sessionStorage/localStorage pour tokens
- [x] Fetch rôle depuis `/api/auth/me` uniquement
- [x] Credentials: 'include' sur tous les appels API
- [x] Redirection login si 401
- [x] Pas de stockage rôle côté client
- [x] Logs d'erreurs auth

### Configuration
- [x] HTTPS en production (`secure: true`)
- [x] SameSite cookies (`sameSite: 'strict'`)
- [x] CORS configuré correctement
- [x] JWT_SECRET en variable d'environnement
- [x] Expiration tokens (`24h`)

---

## 🚀 Migration Depuis sessionStorage

### Étapes

1. **Backend** : Créer `/api/auth/me`
   ```bash
   ✅ Endpoint créé dans server/routes/auth.ts
   ```

2. **Frontend** : Modifier TransitContext
   ```bash
   ✅ useEffect() appelle /api/auth/me
   ✅ Supprimé sessionStorage.getItem('currentUserRole')
   ```

3. **Services** : Supprimer sessionStorage
   ```bash
   ✅ apiService.ts - Tokens via cookies uniquement
   ✅ logger.ts - Supprimé lecture rôle
   ```

4. **App.tsx** : Login via API
   ```bash
   ✅ handleLogin() appelle /api/auth/login
   ✅ Supprimé sessionStorage.setItem()
   ```

5. **Tests**
   ```bash
   ⚠️ À faire : Tests automatisés sécurité
   ```

---

## 🔍 Audit Trail

Toutes les actions sensibles loggées :

```typescript
auditLog('USER_INFO_FETCHED', {
  userId: user.id,
  role: user.role,
  ip: req.ip,
  timestamp: new Date()
});
```

**Actions auditées :**
- Login/Logout
- Récupération infos user (`/me`)
- Refresh token
- Échecs d'authentification
- Tentatives d'accès non autorisé

---

## 📚 Ressources

- [OWASP Session Management](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management_Testing/README)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [httpOnly Cookies](https://owasp.org/www-community/HttpOnly)
- [CSRF Protection](https://owasp.org/www-community/attacks/csrf)

---

## ⚠️ IMPORTANT PRODUCTION

```bash
# Variables d'environnement OBLIGATOIRES

# JWT Secret (min 32 caractères aléatoires)
JWT_SECRET=GenerateSecureRandomString32CharsMin

# Database connection (PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5432/transit_db

# Backend API
PORT=3001
NODE_ENV=production

# HTTPS (Let's Encrypt recommandé)
SSL_CERT_PATH=/etc/letsencrypt/live/transit.gn/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/transit.gn/privkey.pem
```

**Ne JAMAIS :**
- Utiliser `JWT_SECRET` par défaut
- Stocker tokens en sessionStorage/localStorage
- Lire rôle depuis client
- Activer mode mock en production

---

**Dernière mise à jour :** 2026-01-07  
**Auteur :** Équipe Sécurité Transit Guinée  
**Version :** 2.0 (Post-sessionStorage Migration)
