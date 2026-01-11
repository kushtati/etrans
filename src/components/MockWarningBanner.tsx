/**
 * BANNIÈRE D'AVERTISSEMENT MODE MOCK
 * 
 * Affichée en mode développement quand VITE_USE_MOCK=true
 * Alerte visuellement que les données sont fictives
 */

import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { IS_MOCK_MODE } from '../config/environment';

export const MockWarningBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(() => {
    if (!IS_MOCK_MODE) return false;
    const dismissed = localStorage.getItem('mock-banner-dismissed');
    return !dismissed;
  });

  if (!IS_MOCK_MODE || !isVisible) return null;

  const handleDismiss = () => {
    localStorage.setItem('mock-banner-dismissed', 'true');
    setIsVisible(false);
  };

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg"
      role="alert"
      aria-live="polite"
    >
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-center gap-3">
          <AlertTriangle 
            size={20} 
            className="animate-pulse motion-reduce:animate-none" 
            aria-hidden="true"
          />
          <div className="flex-1 text-center">
            <p className="font-bold text-sm">
              ⚠️ MODE DÉVELOPPEMENT - DONNÉES FICTIVES
            </p>
            <p className="text-xs opacity-90">
              Ces données sont uniquement pour le développement. Ne pas utiliser en production.
            </p>
          </div>
          <AlertTriangle 
            size={20} 
            className="animate-pulse motion-reduce:animate-none" 
            aria-hidden="true"
          />
          <button
            onClick={handleDismiss}
            className="ml-2 text-white hover:bg-white/20 rounded-full p-1 transition-colors"
            aria-label="Masquer l'avertissement de mode développement"
            title="Masquer"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
