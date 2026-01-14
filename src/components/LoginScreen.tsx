import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Role } from '../types';
import { ShieldCheck, Mail, Lock, Zap, Building2, AlertTriangle, Shield, Eye, EyeOff } from 'lucide-react';
import { 
  rateLimiter, 
  evaluatePasswordStrength,
  detectSuspiciousActivity,
  isSecureConnection,
  enforceHTTPS,
  isWebCryptoSupported,
  decodeJWTUnsafe
} from '../utils/authSecurity';
import { logger } from '../services/logger';

interface LoginScreenProps {
  onLogin: (role: Role, token: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  // États de base
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Sécurité
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaSliderPosition, setCaptchaSliderPosition] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [blockTimeRemaining, setBlockTimeRemaining] = useState(0);
  const [requiresSecureConnection, setRequiresSecureConnection] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<{ level: 'weak' | 'medium' | 'strong', score: number }>({ level: 'weak', score: 0 });

  // Vérification HTTPS au montage
  useEffect(() => {
    if (!isSecureConnection() && window.location.hostname !== 'localhost') {
      setRequiresSecureConnection(true);
      logger.error('Insecure connection detected');
    }

    if (!isWebCryptoSupported()) {
      logger.error('Web Crypto API not supported');
      setError('Navigateur non compatible avec les standards de sécurité requis');
    }

    // Récupérer CSRF token avec timeout 5s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    fetch('/api/auth/csrf-token', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeoutId);
        setCsrfToken(data.token);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        logger.error('CSRF token fetch failed', { error: err.message });
      });
  }, []);

  // Évaluer force du mot de passe
  useEffect(() => {
    if (password.length > 0) {
      const strength = evaluatePasswordStrength(password);
      setPasswordStrength(strength);
    } else {
      setPasswordStrength({ level: 'weak', score: 0 });
    }
  }, [password]);

  // Reset CAPTCHA slider
  const resetCaptcha = () => {
    setCaptchaSliderPosition(0);
  };

  // Vérifier rate limiting
  useEffect(() => {
    if (email) {
      const remaining = rateLimiter.getRemainingAttempts(email);
      setRemainingAttempts(remaining);

      if (remaining === 0) {
        const blockTime = rateLimiter.getBlockTimeRemaining(email);
        setBlockTimeRemaining(blockTime);
      }
    }
  }, [email]);

  // Timer pour déblocage (en secondes)
  useEffect(() => {
    if (blockTimeRemaining > 0) {
      const timer = setInterval(() => {
        setBlockTimeRemaining(prev => {
          if (prev <= 1) {
            setRemainingAttempts(3);
            return 0;
          }
          return prev - 1;
        });
      }, 1000); // Chaque seconde

      return () => clearInterval(timer);
    }
  }, [blockTimeRemaining]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Sanitization email
    const sanitizedEmail = DOMPurify.sanitize(email.trim().toLowerCase(), {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });

    // 2. Validation basique
    if (!sanitizedEmail || !password) {
      setError('Email et mot de passe requis');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      setError('Format email invalide');
      return;
    }

    // 3. Vérifier rate limiting
    // ⚠️ WARNING : Rate limiting client-side = UX uniquement (bypass facile)
    // Sécurité réelle : Backend doit implémenter Redis rate limiter
    // Voir utils/README_SECURITY.md pour détails
    if (!rateLimiter.isAllowed(sanitizedEmail)) {
      const blockTime = rateLimiter.getBlockTimeRemaining(sanitizedEmail);
      const minutes = Math.floor(blockTime / 60);
      const seconds = blockTime % 60;
      setError(`Trop de tentatives. Réessayez dans ${minutes}:${seconds.toString().padStart(2, '0')}.`);
      setBlockTimeRemaining(blockTime);
      logger.audit('LOGIN_BLOCKED_RATE_LIMIT', { email: sanitizedEmail });
      return;
    }

    // 4. CAPTCHA requis après 2 tentatives échouées (slider)
    if (captchaRequired) {
      const REQUIRED_POSITION = 100;
      if (Math.abs(captchaSliderPosition - REQUIRED_POSITION) > 5) {
        setError('Veuillez valider le CAPTCHA en faisant glisser à droite');
        resetCaptcha();
        return;
      }
    }

    // 5. Détection activités suspectes
    const suspicious = detectSuspiciousActivity(
      sanitizedEmail, 
      password, 
      navigator.userAgent
    );

    if (suspicious.some(s => s.severity === 'CRITICAL')) {
      setError('Activité suspecte détectée. Contactez l\'administrateur.');
      logger.audit('SUSPICIOUS_LOGIN_BLOCKED', { email: sanitizedEmail, suspicious });
      return;
    }

    setIsLoading(true);

    try {
      // 5. Le mot de passe est envoyé en clair via HTTPS (backend hashera avec bcrypt)
      // Pas de hachage client-side : SHA-256 client inutile avec HTTPS
      const passwordToSend = password;

      // 6. Appel API backend
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include', // httpOnly cookies
        body: JSON.stringify({
          email: sanitizedEmail,
          password: passwordToSend, // Mot de passe en clair (HTTPS requis)
          isHashed: false
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Échec login
        const remaining = rateLimiter.getRemainingAttempts(sanitizedEmail);
        setRemainingAttempts(remaining);

        // Activer CAPTCHA après 2 échecs
        if (remaining <= 1 && !captchaRequired) {
          setCaptchaRequired(true);
          resetCaptcha();
        }

        // Message générique pour ne pas révéler si email existe
        throw new Error('Identifiants invalides');
      }

      // 7. Succès - Réinitialiser rate limit
      // Note: Backend a déjà validé JWT signature, pas besoin côté client
      rateLimiter.reset(sanitizedEmail);
      
      logger.audit('LOGIN_SUCCESS', { 
        email: sanitizedEmail, 
        role: data.user.role,
        twoFactorEnabled: data.twoFactorRequired 
      });

      // 9. Si 2FA requis, rediriger vers écran 2FA
      if (data.twoFactorRequired) {
        // TODO: Implémenter écran 2FA
        setError('Authentification à deux facteurs requise (à implémenter)');
        return;
      }

      // 10. Login réussi
      onLogin(data.user.role, data.token);

    } catch (err: any) {
      logger.error('Login failed', { email: sanitizedEmail, error: err.message });
      setError(err.message || 'Erreur de connexion. Vérifiez vos identifiants.');
      
    } finally {
      setIsLoading(false);
    }
  };

  // Forcer HTTPS si nécessaire
  if (requiresSecureConnection) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-6">
        <div className="bg-red-900/20 border-2 border-red-500 rounded-xl p-8 max-w-md text-center">
          <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-4">Connexion Non Sécurisée</h2>
          <p className="text-red-200 mb-6">
            Cette application requiert une connexion HTTPS sécurisée pour protéger vos données.
          </p>
          <button
            onClick={() => enforceHTTPS()}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold"
          >
            Activer HTTPS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1120] flex flex-col items-center justify-center p-6 relative">
      
      {/* Background Grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none"></div>

      <div className="w-full max-w-sm relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Branding */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
               <Zap size={20} className="text-white" fill="currentColor" />
            </div>
            Transit<span className="text-blue-500">Secure</span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm font-medium">Système de Gestion Logistique Intégré</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl p-8 shadow-2xl shadow-black/50 border border-slate-800/50">
          
          {/* Error Display */}
          {error && (
            <div id="login-error" className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2" role="alert">
              <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Rate Limit Warning */}
          {remainingAttempts < 3 && remainingAttempts > 0 && (
            <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-xs text-orange-700 font-bold">
                ⚠️ {remainingAttempts} tentative{remainingAttempts > 1 ? 's' : ''} restante{remainingAttempts > 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Blocked Warning */}
          {blockTimeRemaining > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
              <p className="text-xs text-red-700 font-bold">
                🔒 Compte bloqué ({Math.floor(blockTimeRemaining / 60)}:{(blockTimeRemaining % 60).toString().padStart(2, '0')})
              </p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* Email */}
            <div>
              <label htmlFor="email-input" className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Identifiant</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="email-input"
                  type="email"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-sm font-medium"
                  placeholder="nom@entreprise.gn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={blockTimeRemaining > 0}
                  aria-label="Adresse email"
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? 'login-error' : undefined}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password-input" className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Mot de passe</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-sm font-medium"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={blockTimeRemaining > 0}
                  aria-label="Mot de passe"
                  aria-invalid={error ? 'true' : 'false'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                  ) : (
                    <Eye className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                  )}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          passwordStrength.level === 'weak' ? 'bg-red-500 w-1/3' :
                          passwordStrength.level === 'medium' ? 'bg-orange-500 w-2/3' :
                          'bg-green-500 w-full'
                        }`}
                      />
                    </div>
                    <span className={`text-xs font-medium ${
                      passwordStrength.level === 'weak' ? 'text-red-600' :
                      passwordStrength.level === 'medium' ? 'text-orange-600' :
                      'text-green-600'
                    }`}>
                      {passwordStrength.level === 'weak' ? 'Faible' :
                       passwordStrength.level === 'medium' ? 'Moyen' : 'Fort'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* CAPTCHA Slider (après 2 tentatives) */}
            {captchaRequired && (
              <div className="pt-2 border-t border-slate-100">
                <label htmlFor="captcha-slider" className="block text-xs font-bold text-slate-700 uppercase mb-2">
                  🤖 Vérification Humaine
                </label>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-slate-700 mb-3 text-center font-medium">
                    Faites glisser le curseur jusqu'à la fin pour valider
                  </p>
                  <input
                    id="captcha-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={captchaSliderPosition}
                    onChange={(e) => setCaptchaSliderPosition(Number(e.target.value))}
                    className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${captchaSliderPosition}%, #cbd5e1 ${captchaSliderPosition}%, #cbd5e1 100%)`
                    }}
                    aria-label="Curseur de vérification CAPTCHA"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={captchaSliderPosition}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-slate-500">Début</span>
                    <span className="text-[10px] font-bold" style={{ color: captchaSliderPosition >= 95 ? '#10b981' : '#64748b' }}>
                      {captchaSliderPosition >= 95 ? '✓ Validé' : `${captchaSliderPosition}%`}
                    </span>
                    <span className="text-[10px] text-slate-500">Fin</span>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || blockTimeRemaining > 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-sm transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed text-sm"
              aria-label="Se connecter de manière sécurisée"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  Connexion
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center space-y-2">
           <p className="text-[10px] text-slate-600 opacity-60">© Kushtati 2026. Tous droits réservés.</p>
        </div>

      </div>
    </div>
  );
};