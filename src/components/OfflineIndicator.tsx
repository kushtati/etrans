/**
 * OFFLINE INDICATOR - Indicateur Réseau
 * 
 * Affiche l'état de la connexion réseau et la queue de synchronisation
 * 
 * États:
 * - Online: Badge vert discret
 * - Offline: Badge orange avec actions en attente
 * - Syncing: Badge bleu avec animation
 */

import React, { useState } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { offlineQueue } from '../services/offlineQueue';
import { logger } from '../services/logger';

interface OfflineIndicatorProps {
  className?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ className = '' }) => {
  const { isOnline, pendingActions, isSyncing } = useNetworkStatus();
  const [lastSyncTime, setLastSyncTime] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);
  
  const SYNC_COOLDOWN_MS = 5000; // 5 secondes

  const handleManualSync = async () => {
    const now = Date.now();
    
    // Rate limiting
    if (now - lastSyncTime < SYNC_COOLDOWN_MS) {
      const waitTime = Math.ceil((SYNC_COOLDOWN_MS - (now - lastSyncTime)) / 1000);
      setSyncError(`Veuillez attendre ${waitTime}s avant la prochaine synchronisation`);
      setTimeout(() => setSyncError(null), 3000);
      return;
    }

    if (isOnline && !isSyncing) {
      setSyncError(null);
      setSyncSuccess(false);
      setLastSyncTime(now);
      
      try {
        const actionCount = pendingActions;
        await offlineQueue.flush();
        
        // Success notification
        setSyncSuccess(true);
        logger.info('Manual sync completed', { actionCount });
        
        setTimeout(() => setSyncSuccess(false), 3000);
      } catch (error: any) {
        setSyncError('Échec de la synchronisation. Réessayez.');
        logger.error('Manual sync failed', error);
        setTimeout(() => setSyncError(null), 5000);
      }
    }
  };

  // Online et rien en attente - Affichage discret
  if (isOnline && pendingActions === 0 && !isSyncing) {
    return (
      <div 
        className={`flex items-center gap-2 text-sm text-green-600 ${className}`}
        role="status"
        aria-label="En ligne"
      >
        <div className="w-2 h-2 bg-green-500 rounded-full" aria-hidden="true"></div>
        <span className="hidden sm:inline">En ligne</span>
      </div>
    );
  }

  // Offline - Badge orange
  if (!isOnline) {
    return (
      <div 
        className={`flex items-center gap-2 bg-orange-100 border border-orange-300 rounded-lg px-3 py-2 ${className}`}
        role="status"
        aria-live="polite"
        aria-label={`Mode hors ligne${pendingActions > 0 ? `, ${pendingActions} action(s) en attente` : ''}`}
      >
        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse motion-reduce:animate-none" aria-hidden="true"></div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-orange-900">Mode hors-ligne</span>
          {pendingActions > 0 && (
            <span className="text-xs text-orange-700">
              {pendingActions} action{pendingActions > 1 ? 's' : ''} en attente
            </span>
          )}
        </div>
      </div>
    );
  }

  // Syncing - Badge bleu avec animation
  if (isSyncing) {
    return (
      <div 
        className={`flex items-center gap-2 bg-blue-100 border border-blue-300 rounded-lg px-3 py-2 ${className}`}
        role="status"
        aria-live="polite"
        aria-label={`Synchronisation en cours, ${pendingActions} action(s) restante(s)`}
      >
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping motion-reduce:animate-none" aria-hidden="true"></div>
        <span className="text-sm font-medium text-blue-900">
          Synchronisation... ({pendingActions} restant{pendingActions > 1 ? 's' : ''})
        </span>
      </div>
    );
  }

  // En attente de sync - Badge jaune avec bouton manuel
  return (
    <div className="relative">
      <div 
        className={`flex items-center gap-3 bg-yellow-100 border border-yellow-300 rounded-lg px-3 py-2 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="w-2 h-2 bg-yellow-500 rounded-full" aria-hidden="true"></div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-yellow-900">
            {pendingActions} action{pendingActions > 1 ? 's' : ''} à synchroniser
          </span>
        </div>
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="ml-2 px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={`Synchroniser ${pendingActions} action(s) en attente`}
        >
          {isSyncing ? 'Syncing...' : 'Synchroniser'}
        </button>
      </div>
      
      {/* Error notification */}
      {syncError && (
        <div 
          className="absolute top-full left-0 right-0 mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 shadow-lg z-10"
          role="alert"
        >
          {syncError}
        </div>
      )}
      
      {/* Success notification */}
      {syncSuccess && (
        <div 
          className="absolute top-full left-0 right-0 mt-2 bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700 shadow-lg z-10"
          role="status"
        >
          ✓ Synchronisation réussie
        </div>
      )}
    </div>
  );
};

/**
 * MINI VERSION - Pour header compact
 */
export const OfflineIndicatorMini: React.FC<OfflineIndicatorProps> = ({ className = '' }) => {
  const { isOnline, pendingActions, isSyncing } = useNetworkStatus();

  if (isOnline && pendingActions === 0 && !isSyncing) {
    return (
      <div 
        className={`flex items-center gap-1 text-xs ${className}`} 
        title="En ligne"
        role="status"
        aria-label="En ligne"
      >
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" aria-hidden="true"></div>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div 
        className={`flex items-center gap-1 text-xs text-orange-600 ${className}`}
        title="Mode hors-ligne"
        role="status"
        aria-label={`Mode hors ligne${pendingActions > 0 ? `, ${pendingActions} action(s) en attente` : ''}`}
      >
        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse motion-reduce:animate-none" aria-hidden="true"></div>
        <span>Offline</span>
        {pendingActions > 0 && <span className="font-medium">({pendingActions})</span>}
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div 
        className={`flex items-center gap-1 text-xs text-blue-600 ${className}`}
        title="Synchronisation en cours"
        role="status"
        aria-live="polite"
        aria-label={`Synchronisation en cours, ${pendingActions} action(s) restante(s)`}
      >
        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping motion-reduce:animate-none" aria-hidden="true"></div>
        <span>Sync...</span>
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center gap-1 text-xs text-yellow-600 ${className}`}
      title={`${pendingActions} action(s) à synchroniser`}
      role="status"
      aria-label={`${pendingActions} action(s) à synchroniser`}
    >
      <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" aria-hidden="true"></div>
      <span>{pendingActions}</span>
    </div>
  );
};
