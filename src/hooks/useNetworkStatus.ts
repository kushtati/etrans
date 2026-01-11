/**
 * HOOK USE NETWORK STATUS
 * 
 * Hook React pour tracker l'état de la connexion réseau
 * Utilisé pour afficher indicateurs offline et gérer sync
 */

import { useState, useEffect } from 'react';
import { offlineQueue } from '../services/offlineQueue';

export interface NetworkStatus {
  isOnline: boolean;
  isOfflineMode: boolean;
  pendingActions: number;
  isSyncing: boolean;
}

export const useNetworkStatus = (): NetworkStatus => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingActions, setPendingActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Listener changements réseau
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Abonnement aux changements de la queue
    const unsubscribe = offlineQueue.subscribe(async () => {
      try {
        const stats = await offlineQueue.getStats();
        setPendingActions(stats.pending);
        setIsSyncing(stats.processing);
      } catch (error) {
        console.error('useNetworkStatus: erreur getStats', error);
        // Garder état précédent en cas d'erreur
      }
    });

    // Check initial
    offlineQueue.getStats().then(stats => {
      setPendingActions(stats.pending);
      setIsSyncing(stats.processing);
    }).catch(error => {
      console.error('useNetworkStatus: erreur getStats initial', error);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  return {
    isOnline,
    isOfflineMode: !isOnline || pendingActions > 0,
    pendingActions,
    isSyncing
  };
};
