/**
 * ENREGISTREMENT SERVICE WORKER
 * 
 * À inclure dans index.tsx pour activer PWA
 */

export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
      });

      console.log('✅ Service Worker enregistré:', registration.scope);

      // Écouter les mises à jour
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nouvelle version disponible
              console.log('🔄 Nouvelle version disponible - Rechargez la page');
              
              // Afficher notification utilisateur (optionnel)
              if (confirm('Nouvelle version disponible. Recharger maintenant ?')) {
                window.location.reload();
              }
            }
          });
        }
      });

      // Écouter les messages du Service Worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_COMPLETE') {
          console.log('✅ Synchronisation offline terminée');
          // Optionnel: afficher notification utilisateur
        }
      });

      // Vérifier les mises à jour toutes les heures
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

    } catch (error) {
      console.error('❌ Erreur Service Worker:', error);
    }
  } else {
    console.warn('⚠️ Service Worker non supporté par ce navigateur');
  }
};

/**
 * Demander permission notifications (optionnel)
 */
export const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('✅ Notifications autorisées');
    } else {
      console.log('⚠️ Notifications refusées');
    }
    
    return permission;
  }
  
  return Notification.permission;
};

/**
 * Vérifier si app installée (PWA)
 */
export const isAppInstalled = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
};

/**
 * Prompt installation PWA
 */
let deferredPrompt: any = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Afficher bouton "Installer l'app" si souhaité
  console.log('💾 Installation PWA disponible');
});

export const promptInstallPWA = async () => {
  if (!deferredPrompt) {
    console.log('⚠️ Prompt installation non disponible');
    return false;
  }

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  console.log(`Installation PWA: ${outcome}`);
  deferredPrompt = null;
  
  return outcome === 'accepted';
};

window.addEventListener('appinstalled', () => {
  console.log('✅ PWA installée avec succès');
  deferredPrompt = null;
});
