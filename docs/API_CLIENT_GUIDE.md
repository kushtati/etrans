# 🌐 Client API Centralisé

## Vue d'ensemble

`src/lib/api-client.ts` fournit une instance Axios préconfigurée pour tous les appels API vers Railway backend.

## Avantages

✅ **Configuration automatique** : Credentials, CSRF, timeout  
✅ **Sécurité** : Token CSRF ajouté automatiquement depuis cookie  
✅ **Resilience** : Retry automatique sur erreurs 5xx  
✅ **Logging** : Toutes les erreurs tracées  
✅ **DRY** : Plus besoin de répéter `credentials: 'include'` partout

## Utilisation

### ❌ Avant (répétitif, error-prone)

```typescript
// LoginScreen.tsx
const response = await fetch(`${API_BASE_URL}/auth/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken // Manuel !
  },
  credentials: 'include', // Oublié = 403 !
  body: JSON.stringify({ email, password })
});
```

### ✅ Après (centralisé, sûr)

```typescript
import apiClient from '@/lib/api-client';

// LoginScreen.tsx
const response = await apiClient.post('/auth/login', {
  email,
  password
});
```

**Le token CSRF est ajouté automatiquement** depuis le cookie `XSRF-TOKEN` !

## Exemples d'utilisation

### GET Request

```typescript
import apiClient from '@/lib/api-client';

// Récupérer shipments
const { data } = await apiClient.get('/shipments');
console.log(data.shipments);
```

### POST Request

```typescript
import apiClient from '@/lib/api-client';

// Créer shipment
const { data } = await apiClient.post('/shipments', {
  trackingNumber: 'SHIP-001',
  clientName: 'John Doe'
});
```

### PUT/PATCH Request

```typescript
import apiClient from '@/lib/api-client';

// Mettre à jour statut
const { data } = await apiClient.patch(`/shipments/${id}`, {
  status: 'delivered'
});
```

### DELETE Request

```typescript
import apiClient from '@/lib/api-client';

// Supprimer document
await apiClient.delete(`/documents/${id}`);
```

### Gestion d'erreurs

```typescript
import apiClient, { getErrorMessage } from '@/lib/api-client';

try {
  const { data } = await apiClient.post('/auth/login', { email, password });
  console.log('Login success:', data.user);
} catch (error) {
  const message = getErrorMessage(error);
  console.error('Login failed:', message);
  alert(message); // Afficher à l'utilisateur
}
```

## Intercepteurs

### Request Interceptor

Automatiquement avant chaque requête :

1. Lit le cookie `XSRF-TOKEN`
2. Décode URL encoding
3. Ajoute header `x-csrf-token`

### Response Interceptor

Automatiquement après chaque réponse :

- **401 Unauthorized** : Recharge la page (session expirée)
- **403 Forbidden** : Log CSRF validation failure
- **5xx Server Error** : Retry 1 fois après 2 secondes
- **Network Error** : Log erreur réseau

## Migration Progressive

Vous pouvez migrer progressivement :

1. **Phase 1** : Garder `fetch()` existant, ajouter `apiClient` pour nouveaux codes
2. **Phase 2** : Remplacer `fetch()` par `apiClient` fichier par fichier
3. **Phase 3** : Supprimer `API_BASE_URL` des imports (centralisé dans api-client)

## Configuration

### Variables d'environnement

```env
# .env ou vercel.json
VITE_API_URL=https://etrans-production.up.railway.app
```

### Timeout

Par défaut : 30 secondes. Pour modifier :

```typescript
import apiClient from '@/lib/api-client';

apiClient.defaults.timeout = 60000; // 60s pour uploads lourds
```

### Headers personnalisés

```typescript
import apiClient from '@/lib/api-client';

const { data } = await apiClient.get('/shipments', {
  headers: {
    'X-Custom-Header': 'value'
  }
});
```

## Tests

```typescript
import apiClient from '@/lib/api-client';
import MockAdapter from 'axios-mock-adapter';

const mock = new MockAdapter(apiClient);

mock.onGet('/shipments').reply(200, {
  shipments: [{ id: '1', trackingNumber: 'SHIP-001' }]
});

const { data } = await apiClient.get('/shipments');
expect(data.shipments).toHaveLength(1);
```

## Sécurité

✅ **CSRF Protection** : Token envoyé automatiquement  
✅ **Cookies HttpOnly** : JWT protégé contre XSS  
✅ **SameSite=None** : Cross-domain (Vercel ↔ Railway)  
✅ **Credentials** : Cookies envoyés avec chaque requête  
✅ **Timeout** : Prévient requêtes infinies

## Dépannage

### Erreur "CSRF token missing"

**Cause** : Cookie `XSRF-TOKEN` absent  
**Solution** : Appeler `/api/auth/csrf-token` avant toute requête protégée

```typescript
import apiClient from '@/lib/api-client';

// Au chargement de l'app
const { data } = await apiClient.get('/auth/csrf-token');
console.log('CSRF token initialized:', data.token);
```

### Erreur "401 Unauthorized"

**Cause** : Session expirée ou cookie `auth_token` absent  
**Solution** : L'intercepteur recharge automatiquement la page → Redirection login

### Erreur "Network Error"

**Cause** : Backend Railway inaccessible  
**Solution** : Vérifier `VITE_API_URL` et firewall

## Références

- [Axios Documentation](https://axios-http.com/)
- [CSRF Protection Guide](../docs/SECURITY_CONTEXT.md)
- [Authentication Flow](../docs/EXAMPLES.md)
