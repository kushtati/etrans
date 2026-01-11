/**
 * SERVICE WORKER - Progressive Web App
 * 
 * Permet le fonctionnement offline et le cache intelligent
 * Critique pour la Guinée avec connexions instables
 * 
 * Stratégies:
 * - Network First: API calls (toujours les données fraîches)
 * - Cache First: Assets statiques (CSS, JS, fonts, images)
 * - Stale While Revalidate: Documents
 */

// Version dynamique basée sur timestamp
const CACHE_VERSION = '2026-01-08-v2';
const CACHE_NAME = `transitguinee-${CACHE_VERSION}`;
const STATIC_CACHE = `transitguinee-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `transitguinee-dynamic-${CACHE_VERSION}`;

// Assets critiques à cacher immédiatement
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installation...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Cache des assets statiques');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  
  // Force activation immédiate
  self.skipWaiting();
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  
  // Prend contrôle immédiatement
  return self.clients.claim();
});

// Stratégie de fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 🔐 SÉCURITÉ : Valider origin (éviter cache pollution)
  // Ne cacher que les requests de notre domaine
  if (url.origin !== self.location.origin) {
    // Laisser browser gérer requests externes
    return;
  }

  // API Calls: Network First (toujours données fraîches)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cacher la réponse pour offline
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback au cache si offline
          return caches.match(request).then((cached) => {
            if (cached) {
              return cached;
            }
            // Si pas en cache, retourner erreur offline
            return new Response(
              JSON.stringify({ error: 'Mode offline - données non disponibles' }),
              {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store, no-cache, must-revalidate'
                },
              }
            );
          });
        })
    );
    return;
  }

  // Assets statiques: Cache First (performance maximale)
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // HTML: Stale While Revalidate (affichage rapide + update background)
  if (request.destination === 'document') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });

        // Retourner cache immédiatement si disponible, sinon attendre fetch
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default: Network First
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

// Sync en arrière-plan (quand connexion rétablie)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-shipments') {
    event.waitUntil(
      // Synchroniser les données offline avec le serveur
      syncOfflineData()
    );
  }
});

async function syncOfflineData() {
  try {
    console.log('[SW] 🔄 Synchronisation des données offline...');
    
    // Notifier l'application pour déclencher offlineQueue.flush()
    const clients = await self.clients.matchAll({ type: 'window' });
    
    if (clients.length === 0) {
      console.log('[SW] ⚠️ Aucun client actif pour sync');
      return;
    }
    
    // Envoyer message à tous les clients ouverts
    clients.forEach((client) => {
      client.postMessage({ 
        type: 'SYNC_OFFLINE_QUEUE',
        timestamp: Date.now()
      });
    });
    
    console.log('[SW] ✅ Message sync envoyé à', clients.length, 'client(s)');
    
    // Attendre confirmation (timeout 30s)
    const syncPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[SW] ⚠️ Timeout sync après 30s');
        resolve();
      }, 30000);
      
      // Écouter réponse des clients
      self.addEventListener('message', function handler(event) {
        if (event.data?.type === 'SYNC_COMPLETE') {
          clearTimeout(timeout);
          self.removeEventListener('message', handler);
          console.log('[SW] ✅ Sync confirmée par client');
          resolve();
        }
      });
    });
    
    await syncPromise;
    
  } catch (error) {
    console.error('[SW] ❌ Erreur sync:', error);
    throw error;
  }
}

// Notifications push (optionnel - pour alertes importantes)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Nouvelle notification TransitGuinée',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'transit-notification',
    data: data,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'TransitGuinée', options)
  );
});

// Click sur notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Si app déjà ouverte, focus
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon, ouvrir nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
