import React, { useState, useEffect } from 'react';

export const BiometricSetup: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    checkBiometricSupport();
    loadDevices();
  }, []);

  const checkBiometricSupport = async () => {
    if (window.PublicKeyCredential) {
      try {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setBiometricAvailable(available);
      } catch (err) {
        setBiometricAvailable(false);
      }
    }
  };

  const loadDevices = async () => {
    try {
      const res = await fetch('/api/webauthn/devices', {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (err) {
      console.error('Erreur chargement appareils:', err);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);
    
    try {
      // 1. Récupérer les options d'enregistrement du serveur
      const optionsResponse = await fetch('/api/webauthn/register-options', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!optionsResponse.ok) {
        throw new Error('Erreur récupération options');
      }
      
      const { options } = await optionsResponse.json();
      
      // 2. Décoder le challenge (base64url → ArrayBuffer)
      const challengeBuffer = Uint8Array.from(
        atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')),
        c => c.charCodeAt(0)
      );
      
      const userIdBuffer = Uint8Array.from(
        atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')),
        c => c.charCodeAt(0)
      );
      
      // 3. Créer la credential avec le capteur biométrique
      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: challengeBuffer,
          user: {
            ...options.user,
            id: userIdBuffer
          }
        }
      }) as PublicKeyCredential;
      
      if (!credential) {
        throw new Error('Enregistrement annulé');
      }
      
      // 4. Encoder en base64url pour envoi au serveur
      const credentialId = btoa(
        String.fromCharCode(...new Uint8Array(credential.rawId))
      ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      
      const response = credential.response as AuthenticatorAttestationResponse;
      const publicKeyBuffer = response.getPublicKey();
      
      if (!publicKeyBuffer) {
        throw new Error('Clé publique non disponible');
      }
      
      const publicKey = btoa(
        String.fromCharCode(...new Uint8Array(publicKeyBuffer))
      ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      
      // 5. Détection du nom de l'appareil
      const userAgent = navigator.userAgent;
      let deviceName = 'Appareil';
      
      if (userAgent.includes('iPhone')) {
        deviceName = 'iPhone';
      } else if (userAgent.includes('iPad')) {
        deviceName = 'iPad';
      } else if (userAgent.includes('Mac')) {
        deviceName = 'MacBook';
      } else if (userAgent.includes('Windows')) {
        deviceName = 'PC Windows';
      } else if (userAgent.includes('Android')) {
        deviceName = 'Android';
      }
      
      // 6. Envoyer au serveur pour stockage
      const verifyResponse = await fetch('/api/webauthn/register-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId,
          publicKey,
          counter: 0,
          deviceName
        })
      });
      
      if (!verifyResponse.ok) {
        throw new Error('Erreur vérification');
      }
      
      setSuccess(true);
      loadDevices(); // Recharger la liste des appareils
      
    } catch (err: any) {
      console.error('[BIOMETRIC] Registration error:', err);
      
      if (err.name === 'NotAllowedError') {
        setError('Enregistrement annulé. Veuillez réessayer.');
      } else if (err.name === 'InvalidStateError') {
        setError('Cet appareil est déjà enregistré.');
      } else {
        setError(err.message || 'Échec enregistrement');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Supprimer cet appareil ? Vous devrez le réenregistrer pour utiliser Face ID.')) {
      return;
    }

    try {
      const res = await fetch(`/api/webauthn/devices/${deviceId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        loadDevices(); // Recharger la liste
      } else {
        alert('Erreur suppression appareil');
      }
    } catch (err) {
      console.error('Erreur suppression:', err);
      alert('Erreur suppression appareil');
    }
  };

  if (!biometricAvailable) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">🔐 Déverrouillage Biométrique</h3>
        <div className="bg-amber-50 border border-amber-200 rounded p-4">
          <p className="text-amber-800 text-sm">
            ⚠️ Votre appareil ne supporte pas la biométrie ou elle n'est pas configurée.
          </p>
          <p className="text-amber-600 text-xs mt-2">
            Activez Face ID, Touch ID ou Windows Hello dans les paramètres de votre appareil.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-bold mb-4">🔐 Déverrouillage Biométrique</h3>
      
      {success ? (
        <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
          <p className="text-green-800 font-medium">✅ Biométrie configurée avec succès !</p>
          <p className="text-green-600 text-sm mt-2">
            Vous pouvez maintenant déverrouiller l'application automatiquement avec Face ID/Touch ID.
          </p>
        </div>
      ) : (
        <>
          <p className="text-slate-600 mb-4 text-sm">
            Enregistrez cet appareil pour déverrouiller l'application automatiquement 
            avec <strong>Face ID</strong>, <strong>Touch ID</strong> ou <strong>Windows Hello</strong>.
          </p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          
          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Enregistrement en cours...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
                Enregistrer cet appareil
              </>
            )}
          </button>
        </>
      )}

      {/* Liste des appareils enregistrés */}
      {devices.length > 0 && (
        <div className="mt-6 pt-6 border-t border-slate-200">
          <h4 className="text-sm font-bold text-slate-700 mb-3">📱 Appareils enregistrés</h4>
          <div className="space-y-2">
            {devices.map((device) => (
              <div key={device.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                <div className="flex-1">
                  <p className="font-medium text-slate-800 text-sm">{device.deviceName || 'Appareil inconnu'}</p>
                  <p className="text-xs text-slate-500">
                    Ajouté le {new Date(device.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                  {device.lastUsedAt && (
                    <p className="text-xs text-slate-400">
                      Dernière utilisation : {new Date(device.lastUsedAt).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteDevice(device.id)}
                  className="ml-4 text-red-500 hover:text-red-700 transition-colors p-2 hover:bg-red-50 rounded"
                  title="Supprimer cet appareil"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-500">
          💡 <strong>Astuce :</strong> Une fois configuré, l'écran de verrouillage demandera automatiquement 
          votre Face ID ou Touch ID dès qu'il s'affiche. Plus besoin de cliquer !
        </p>
      </div>
    </div>
  );
};
