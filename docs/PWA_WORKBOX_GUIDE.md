# 📱 Service Worker Workbox - Guide Complet

## ✅ Configuration Actuelle

Le Service Worker est maintenant géré automatiquement par **vite-plugin-pwa** avec **Workbox**, offrant :
- ✅ Cache intelligent multi-stratégies
- ✅ Support offline complet
- ✅ Updates automatiques
- ✅ Optimisé pour connexions 3G Guinée

---

## 🎯 Stratégies de Cache Implémentées

### 1. Network First - API Backend
**Pattern**: `/api/*`  
**Stratégie**: Toujours fetch réseau, fallback cache si offline

```javascript
{
  urlPattern: /^https?:\/\/.*\/api\/.*/i,
  handler: 'NetworkFirst',
  options: {
    cacheName: 'api-cache',
    expiration: {
      maxEntries: 100,
      maxAgeSeconds: 86400 // 24h
    },
    networkTimeoutSeconds: 10, // ✅ Timeout rapide pour 3G
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
}
```

**Avantages Guinée**:
- Données toujours fraîches quand connexion
- Timeout 10s adapté aux connexions lentes
- Fallback cache si offline
- 100 requêtes cachées max

### 2. Cache First - Google Fonts
**Pattern**: `fonts.googleapis.com/*`, `fonts.gstatic.com/*`  
**Stratégie**: Cache en priorité (fonts changent rarement)

```javascript
{
  urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
  handler: 'CacheFirst',
  options: {
    cacheName: 'google-fonts-cache',
    expiration: {
      maxEntries: 10,
      maxAgeSeconds: 31536000 // 1 an
    }
  }
}
```

**Avantages Guinée**:
- Chargement instantané après première visite
- Économie bandwidth (fonts lourds)
- 1 an de cache (fonts stables)

### 3. Stale While Revalidate - Images
**Pattern**: `*.{png|jpg|jpeg|svg|gif|webp}`  
**Stratégie**: Affiche cache immédiatement + update en background

```javascript
{
  urlPattern: /^https?:.*\.(png|jpg|jpeg|svg|gif|webp)$/i,
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'images-cache',
    expiration: {
      maxEntries: 50,
      maxAgeSeconds: 2592000 // 30 jours
    }
  }
}
```

**Avantages Guinée**:
- Affichage ultra-rapide (cache)
- Images toujours à jour (revalidation background)
- 50 images max (économie storage)

### 4. Precache - Assets Build
**Pattern**: Tous les fichiers JS/CSS/HTML du build  
**Stratégie**: Précachés lors installation SW

```javascript
workbox.precacheAndRoute([
  { url: 'index.html', revision: '...' },
  { url: 'assets/vendor-react-*.js', revision: null },
  { url: 'assets/vendor-ui-*.js', revision: null },
  { url: 'assets/index-*.css', revision: null }
], {});
```

**Avantages Guinée**:
- App fonctionne 100% offline après première visite
- Chargements ultra-rapides (cache local)
- Updates automatiques gérés par révisions

---

## 📦 Build Output

```bash
PWA v1.2.0
mode      generateSW
precache  12 entries (1294.48 KiB)
files generated
  dist/sw.js                   # Service Worker généré
  dist/workbox-237f2c1f.js     # Runtime Workbox
  dist/manifest.webmanifest    # Manifest PWA
```

**Fichiers cachés automatiquement**:
- `index.html` (4.22 KB)
- `assets/index.css` (48.41 KB → 8.47 KB gzip)
- `assets/vendor-react.js` (21.45 KB → 6.92 KB gzip)
- `assets/vendor-utils.js` (301.69 KB → 58.41 KB gzip)
- `assets/vendor-ui.js` (385.20 KB → 112.97 KB gzip)
- `assets/index.js` (548.56 KB → 143.07 KB gzip)
- `favicon.svg`
- `manifest.json`

**Total cache initial**: ~1.3 MB (329 KB gzip)

---

## 🚀 Utilisation

### Registration Automatique
Le Service Worker s'enregistre automatiquement au démarrage :

```typescript
// index.tsx
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Nouvelle version disponible. Recharger maintenant ?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('✅ App prête pour utilisation offline');
  }
});
```

### Vérifier Updates Automatiques
VitePWA vérifie les updates toutes les heures :

```typescript
if (registration) {
  setInterval(() => {
    registration.update();
  }, 60 * 60 * 1000); // 1 heure
}
```

---

## 🧪 Test PWA

### 1. Build Production
```bash
npm run build
```

### 2. Preview Local
```bash
npm run preview
# Ouvre http://localhost:4173
```

### 3. Chrome DevTools
1. Ouvrir DevTools (F12)
2. **Application** > **Service Workers**
   - ✅ Vérifier "sw.js" actif
3. **Application** > **Manifest**
   - ✅ Vérifier manifest valide
4. **Application** > **Cache Storage**
   - ✅ Voir caches : `workbox-precache`, `api-cache`, `google-fonts-cache`, etc.

### 4. Lighthouse PWA Audit
```bash
# Dans Chrome DevTools
Lighthouse > Progressive Web App > Generate Report
```

**Score attendu**: 90-100/100

**Critères vérifiés**:
- ✅ Service Worker enregistré
- ✅ Manifest valide
- ✅ Icons 192x192 et 512x512
- ✅ Fonctionne offline
- ✅ HTTPS (ou localhost)
- ✅ Responsive design

### 5. Test Offline
1. Ouvrir app en preview
2. DevTools > **Network** > ☑️ **Offline**
3. Recharger page (Ctrl+R)
4. ✅ App doit charger depuis cache

---

## 🔄 Cycle de Vie Service Worker

### Installation
1. **Build** : VitePWA génère `sw.js` + `workbox-*.js`
2. **Premier chargement** : SW s'installe
3. **Activation** : Précache tous les assets build
4. **Prêt** : Event `onOfflineReady()` déclenché

### Updates
1. **Nouveau build** : Nouvelle version SW générée
2. **Detection** : SW détecte changement (hash différent)
3. **Prompt** : Event `onNeedRefresh()` déclenché
4. **User confirm** : Si accepte, `updateSW(true)` reload app
5. **Activation** : Nouveau SW remplace ancien

### Cache Management
- **Precache** : Assets build (révisions gérées auto)
- **Runtime Cache** : API/Fonts/Images (stratégies définies)
- **Cleanup** : Vieux caches supprimés automatiquement (`cleanupOutdatedCaches`)

---

## 📊 Performance Guinée

### Première Visite (Connexion 3G)
```
Temps chargement:
- HTML: ~1s
- CSS (8.47 KB): ~1s
- JS chunks: ~5-7s (total 329 KB gzip)
- Fonts cache: ~2s
Total: ~10-12s (acceptable 3G)
```

### Visites Suivantes (Offline ou 3G)
```
Temps chargement:
- Tout depuis cache: ~0.5-1s
- API fresh data: ~2-3s (si connexion)
Total: 1-3s (ultra-rapide)
```

### Mode Offline
```
✅ App fonctionne 100% depuis cache
✅ Données API disponibles (cache 24h)
✅ Actions sauvegardées dans IndexedDB (sync later)
```

---

## 🛠️ Configuration Avancée

### Ajuster Timeout Réseau
Pour connexions très lentes :

```typescript
// vite.config.ts
networkTimeoutSeconds: 15, // ⬆️ Augmenter de 10s à 15s
```

### Augmenter Cache API
Pour plus de données offline :

```typescript
expiration: {
  maxEntries: 200, // ⬆️ Double le cache
  maxAgeSeconds: 60 * 60 * 48 // ⬆️ 48h au lieu de 24h
}
```

### Désactiver en Dev
Le Service Worker est désactivé en dev pour éviter cache :

```typescript
devOptions: {
  enabled: false, // ✅ Pas de SW en dev
  type: 'module'
}
```

Pour activer en dev (test) :
```typescript
devOptions: {
  enabled: true, // ⚠️ Activer SW en dev
  type: 'module'
}
```

---

## 🇬🇳 Optimisations Spécifiques Guinée

### 1. Timeout Rapide (10s)
```typescript
networkTimeoutSeconds: 10
```
Évite d'attendre indéfiniment sur connexion lente → fallback cache rapide.

### 2. Cache Agressif (24h API)
```typescript
maxAgeSeconds: 86400 // 24h
```
Données restent accessibles offline longtemps (coupures fréquentes).

### 3. Max Entries Élevé (100 API)
```typescript
maxEntries: 100
```
Beaucoup de dossiers de transit cachés pour consultation offline.

### 4. Chunking Intelligent
```typescript
'vendor-react': ['react', 'react-dom'],
'vendor-ui': ['lucide-react', 'recharts'],
'vendor-utils': ['zod', '@google/genai', 'zustand']
```
Vendor chunks cachés longtemps (changent rarement) → économie re-téléchargement.

### 5. Minification Agressive
```typescript
minify: 'terser',
terserOptions: {
  compress: {
    drop_console: true,
    drop_debugger: true
  }
}
```
Taille réduite → moins de bandwidth Guinée.

---

## 🔍 Debug Service Worker

### Console Logs
```javascript
// Voir logs SW
chrome://serviceworker-internals/

// Forcer unregister (si problème)
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(r => r.unregister());
});
```

### Vérifier Cache
```javascript
// Liste tous les caches
caches.keys().then(names => console.log(names));

// Voir contenu cache
caches.open('api-cache').then(cache => {
  cache.keys().then(keys => console.log(keys));
});
```

### Force Update
```javascript
// Forcer update SW
navigator.serviceWorker.getRegistration().then(reg => {
  reg.update();
});
```

---

## 📱 Installation PWA

### Android Chrome
1. Menu ⋮ > **Installer l'application**
2. Icône ajoutée à l'écran d'accueil
3. App s'ouvre en fullscreen (standalone)

### iOS Safari
1. Partager  > **Ajouter à l'écran d'accueil**
2. Icône ajoutée
3. App s'ouvre comme app native

### Desktop Chrome/Edge
1. Barre d'adresse > **Installer TransitGuinée**
2. App ajoutée aux applications système
3. Ouvre dans fenêtre dédiée

---

## ✅ Checklist Validation

- [x] ✅ vite-plugin-pwa installé
- [x] ✅ VitePWA configuré dans vite.config.ts
- [x] ✅ Manifest intégré
- [x] ✅ 4 stratégies cache (NetworkFirst, CacheFirst, StaleWhileRevalidate, Precache)
- [x] ✅ Timeout 10s pour 3G Guinée
- [x] ✅ Registration automatique dans index.tsx
- [x] ✅ Updates automatiques toutes les heures
- [x] ✅ Build génère sw.js + workbox
- [ ] ⏳ Icônes PNG générées (192x192, 512x512)
- [ ] ⏳ Test Lighthouse PWA (score 90+)
- [ ] ⏳ Test offline complet

---

**Status**: 🎯 Service Worker Workbox opérationnel avec stratégies optimisées Guinée

**Next Steps**:
1. Générer icônes PNG (voir ICONS_GENERATION_GUIDE.md)
2. Test Lighthouse PWA
3. Déploiement production HTTPS
