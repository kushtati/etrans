import React, { useState, useEffect } from 'react';
import { useTransit } from '../hooks/useTransitSelectors';
import { useAuth } from '../hooks/useTransitSelectors';

export const LockScreen: React.FC = () => {
  const { currentUserName, quickUnlock, isLocked } = useTransit();
  const { userId } = useAuth(); // Récupérer userId pour WebAuthn
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    const checkBiometric = async () => {
      if (window.PublicKeyCredential) {
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setBiometricAvailable(available);
        } catch (err) {
          setBiometricAvailable(false);
        }
      }
    };
    checkBiometric();
  }, []);

  // 🚀 DÉCLENCHEMENT AUTOMATIQUE BIOMÉTRIE (ULTRA-RAPIDE)
  useEffect(() => {
    if (isLocked && biometricAvailable) {
      // Délai de 600ms pour laisser l'interface se stabiliser
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isLocked, biometricAvailable]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Mot de passe requis');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const success = await quickUnlock(password);
      if (!success) {
        setError('Mot de passe incorrect');
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message || 'Échec déverrouillage');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    if (!userId) {
      console.log('Pas de userId, impossible de déverrouiller avec biométrie');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // 1. Récupérer les options du backend
      const optionsResponse = await fetch('/api/webauthn/unlock-options', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }) // ✅ Envoyer userId (pas de JWT)
      });

      if (!optionsResponse.ok) {
        // Si pas configuré, on fallback silencieusement (pas d'erreur affichée)
        console.log('Biométrie non configurée pour cet utilisateur');
        setLoading(false);
        return;
      }

      const { options } = await optionsResponse.json();

      // Décoder le challenge (base64url → ArrayBuffer)
      const challengeBuffer = Uint8Array.from(
        atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')),
        c => c.charCodeAt(0)
      );

      // Décoder allowCredentials
      const allowCredentials = options.allowCredentials.map((cred: any) => ({
        ...cred,
        id: Uint8Array.from(
          atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')),
          c => c.charCodeAt(0)
        )
      }));

      // 2. Demander au navigateur de scanner (Face ID/Touch ID)
      const credential = await navigator.credentials.get({
        publicKey: {
          ...options,
          challenge: challengeBuffer,
          allowCredentials,
          userVerification: 'required',
          timeout: 60000
        },
        mediation: 'optional' // Pas de prompt si déjà authentifié récemment
      }) as PublicKeyCredential;

      if (!credential) {
        // Utilisateur a annulé, pas d'erreur
        setLoading(false);
        return;
      }

      // 3. Encoder la réponse en base64url pour le backend
      const response = credential.response as AuthenticatorAssertionResponse;
      
      const credentialId = btoa(
        String.fromCharCode(...new Uint8Array(credential.rawId))
      ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const authenticatorData = btoa(
        String.fromCharCode(...new Uint8Array(response.authenticatorData))
      ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const clientDataJSON = btoa(
        String.fromCharCode(...new Uint8Array(response.clientDataJSON))
      ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const signature = btoa(
        String.fromCharCode(...new Uint8Array(response.signature))
      ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      // 4. Vérifier la signature côté backend
      const verifyResponse = await fetch('/api/webauthn/unlock-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId, // ✅ Envoyer userId pour validation
          credentialId,
          authenticatorData,
          clientDataJSON,
          signature
        })
      });

      if (!verifyResponse.ok) {
        setError('Échec vérification. Utilisez votre mot de passe.');
        setLoading(false);
        return;
      }

      // 5. Succès ! Déverrouiller via quickUnlock sans password
      const success = await quickUnlock();
      if (!success) {
        setError('Erreur déverrouillage. Réessayez avec le mot de passe.');
      }

    } catch (err: any) {
      // Échec silencieux : l'utilisateur peut utiliser le mot de passe
      if (err.name === 'NotAllowedError') {
        // Utilisateur a annulé → pas d'erreur affichée
        console.log('Biométrie annulée par l\'utilisateur');
      } else {
        console.error('Erreur biométrie:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isLocked) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.5),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(147,197,253,0.3),transparent_40%)]"></div>
      </div>

      <div className="relative z-10 w-full max-w-[280px] sm:max-w-xs bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden border border-white/20">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h2 className="text-base font-bold text-white">Verrouillé</h2>
          </div>
          <p className="text-blue-100 text-xs">{currentUserName || 'Utilisateur'}</p>
        </div>

        <div className="px-4 py-4">
          <form onSubmit={handleUnlock} className="space-y-3">
            <div>
              <label htmlFor="unlock-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                🔑 Mot de passe
              </label>
              <div className="relative">
                <input
                  id="unlock-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm font-medium placeholder-slate-400 hover:border-slate-300"
                  placeholder="••••••••"
                  autoFocus
                  disabled={loading}
                />
                {password && (
                  <button type="button" onClick={() => setPassword('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="p-2 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                <p className="text-xs text-red-800 flex items-start">
                  <svg className="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">{error}</span>
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-2 px-3 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-xs">Vérification...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">Déverrouiller</span>
                </>
              )}
            </button>
          </form>

          {biometricAvailable && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <button onClick={handleBiometricUnlock} disabled={loading} className="w-full flex items-center justify-center gap-1.5 text-slate-700 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 py-2 px-2 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
                <span className="text-xs font-semibold">Face ID</span>
              </button>
            </div>
          )}

          {!biometricAvailable && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 text-center">💡 Biométrie non disponible</p>
            </div>
          )}
        </div>

        <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-4 py-2 text-center border-t border-slate-200">
          <p className="text-xs text-slate-600 font-medium">🔒 TransitGuinée</p>
        </div>
      </div>
    </div>
  );
};
