import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Role } from './types';
import { TransitProvider } from './context/transitContext';
import { LoginScreen } from './components/LoginScreen';
import { LockScreen } from './components/LockScreen';
import { MockWarningBanner } from './components/MockWarningBanner';
import { logger } from './services/logger';
import { 
  Zap, LogOut, Search, Bell, LayoutGrid, Calculator, PieChart, MessageSquare, Send, 
  Wifi, WifiOff, User, Settings
} from 'lucide-react';
import { useAuth, useShipments, useOfflineStatus } from './hooks/useTransitSelectors';

// ⚡ LAZY LOADING: Charger composants à la demande (optimisation bundle)
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const ShipmentDetail = lazy(() => import('./components/ShipmentDetail').then(m => ({ default: m.ShipmentDetail })));
const CustomsCalculator = lazy(() => import('./components/CustomsCalculator').then(m => ({ default: m.CustomsCalculator })));
const CreateShipmentForm = lazy(() => import('./components/CreateShipmentForm').then(m => ({ default: m.CreateShipmentForm })));
const AccountingView = lazy(() => import('./components/AccountingView').then(m => ({ default: m.AccountingView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));

/**
 * AppLayout: Main application layout and routing
 * Separated from state management (now in TransitProvider)
 */
const AppLayout: React.FC = () => {
  // ✅ OPTIMISÉ: Hooks sélecteurs pour re-renders minimaux
  const { role, userId: currentUserId, userName: currentUserName } = useAuth(); // Re-render seulement si auth change
  const shipments = useShipments(); // Re-render seulement si liste change
  const { isOffline, toggleOffline } = useOfflineStatus(); // Re-render seulement si offline change
  
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'detail' | 'create' | 'calculator' | 'assistant' | 'accounting' | 'settings'>('dashboard');
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<{role: 'user'|'ai', text: string}[]>([
    { role: 'ai', text: 'Bonjour. Je suis votre expert transit. Une question sur la douane ou un dossier ?' }
  ]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0); // Nombre de notifications non lues

  // Search Filtering Logic (AVANT tout return conditionnel)
  const filteredShipments = useMemo(() => {
    if (!searchQuery) return shipments;
    const lowerQ = searchQuery.toLowerCase();
    return shipments.filter(s => 
      s.trackingNumber.toLowerCase().includes(lowerQ) ||
      s.blNumber.toLowerCase().includes(lowerQ) ||
      s.clientName.toLowerCase().includes(lowerQ) ||
      (s.containerNumber && s.containerNumber.toLowerCase().includes(lowerQ))
    );
  }, [shipments, searchQuery]);

  // ✅ Déconnexion automatique au rafraîchissement de page (sécurité)
  const authCheckCalled = useRef(false);
  
  useEffect(() => {
    // Éviter les appels multiples en mode strict ou HMR
    if (authCheckCalled.current) return;
    authCheckCalled.current = true;
    
    const checkAuth = async () => {
      try {
        // 🔐 SÉCURITÉ: Détecter rafraîchissement de page (F5, Ctrl+R)
        // Si sessionStorage est vide, c'est un vrai rafraîchissement
        const wasAuthenticated = sessionStorage.getItem('app_session');
        
        if (!wasAuthenticated) {
          // Premier chargement ou rafraîchissement -> Déconnexion
          logger.info('Page refresh detected - Logout for security');
          setIsAuthenticated(false);
          setAuthChecking(false);
          return; // ✅ STOP ici, ne pas appeler /api/auth/me
        }
        
        // Session déjà active -> Vérifier le token
        // 🔥 CACHE BUSTING : Ajouter timestamp pour éviter 304 Not Modified
        const response = await fetch(`/api/auth/me?t=${Date.now()}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        if (response.ok) {
          setIsAuthenticated(true);
          logger.info('User authenticated');
        } else {
          setIsAuthenticated(false);
          logger.info('User not authenticated');
        }
      } catch (err) {
        setIsAuthenticated(false);
        logger.info('Auth check failed', { error: err });
      } finally {
        setAuthChecking(false);
      }
    };
    
    checkAuth();
  }, []);

  // Afficher un loader pendant la vérification auth
  if (authChecking) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Vérification de la session...</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (selectedRole: Role, token?: string) => {
    // ✅ LoginScreen a déjà validé les credentials et obtenu le JWT
    // On marque simplement l'utilisateur comme authentifié
    
    try {
      // Le JWT est déjà stocké dans httpOnly cookie par le backend
      // LoginScreen a déjà fait la requête /api/auth/login avec succès
      
      // ✅ Attendre un petit instant pour que le cookie soit bien défini
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // ✅ Marquer la session comme active
      sessionStorage.setItem('app_session', 'active');
      
      setIsAuthenticated(true);
      logger.info('Utilisateur connecté', { role: selectedRole });
      
      // ✅ State update - le token JWT est dans les cookies httpOnly
      // Pas besoin de window.location.reload() - React rerender automatiquement
    } catch (err: any) {
      logger.error('Login state update error', { error: err.message });
      alert('Erreur lors de la connexion. Réessayez.');
    }
  };

  // 🔐 Helper: Récupérer CSRF token (depuis cookie ou meta tag HTML)
  const getCsrfToken = (): string => {
    // Option 1: Meta tag <meta name="csrf-token" content="...">
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) return metaTag.getAttribute('content') || '';
    
    // Option 2: Cookie XSRF-TOKEN (Angular convention)
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? match[1] : '';
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          // 🔐 CSRF protection
          'X-CSRF-Token': getCsrfToken()
        }
      });
      
      if (!response.ok) {
        throw new Error(`Logout failed: ${response.status}`);
      }
      
      // ✅ Nettoyer la session
      sessionStorage.removeItem('app_session');
      
      // ✅ Update state seulement si backend confirme logout
      setIsAuthenticated(false);
      setCurrentView('dashboard');
      logger.info('Utilisateur déconnecté');
    } catch (err: any) {
      logger.error('Logout error', { error: err.message });
      // ⚠️ Afficher erreur utilisateur (toast recommandé)
      alert('Erreur de déconnexion. Veuillez réessayer.');
    }
  };

  const viewShipment = (id: string) => {
    setSelectedShipmentId(id);
    setCurrentView('detail');
    logger.info('Consultation dossier', { shipmentId: id });
  };

  const handleAssistantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistantInput.trim()) return;

    const userMsg = assistantInput;
    setAssistantMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setAssistantInput('');
    setIsAssistantLoading(true);

    try {
      // ✅ Call backend API proxy /api/assistant
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken()
        },
        credentials: 'include',
        body: JSON.stringify({ message: userMsg })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setAssistantMessages(prev => [...prev, { role: 'ai', text: data.answer || data.message }]);
    } catch (error: any) {
      logger.error('Assistant AI error', { error: error.message });
      // ⚠️ Message erreur user-friendly
      setAssistantMessages(prev => [
        ...prev, 
        { 
          role: 'ai', 
          text: '⚠️ Service temporairement indisponible. Veuillez réessayer dans quelques instants.' 
        }
      ]);
    } finally {
      setIsAssistantLoading(false);
    }
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Determine if user has access to sensitive modules
  const canViewAccounting = role === Role.DIRECTOR || role === Role.ACCOUNTANT;

  return (
    <div className={`flex flex-col h-screen overflow-hidden ${isOffline ? 'grayscale' : ''} bg-[#f1f5f9]`}>
      
      {/* Mock Warning Banner - Développement uniquement */}
      <MockWarningBanner />
      
      {/* GLOBAL SEARCH HEADER */}
      <div className="pt-safe-top bg-slate-900 text-white shadow-md sticky top-0 z-50">
        <div className="px-4 py-3">
           <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                 <Zap size={18} className="text-blue-400" fill="currentColor" />
                 <span className="font-bold text-lg tracking-tight">TransitSecure</span>
              </div>
              <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2 rounded-full hover:bg-slate-800 transition-colors"
                    title="Notifications"
                  >
                      <Bell size={20} />
                      {unreadNotifications > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-slate-900"></span>
                      )}
                  </button>
                  
                  {/* Panneau notifications */}
                  {showNotifications && (
                    <div className="absolute right-0 top-14 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
                      <div className="p-3 border-b border-slate-700">
                        <h3 className="font-semibold text-sm">Notifications</h3>
                      </div>
                      <div className="p-4 text-center text-slate-400 text-sm">
                        Aucune notification pour le moment
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-full border border-slate-700">
                      <User size={12} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-200">{currentUserName || role}</span>
                  </div>
                  <button onClick={handleLogout} className="p-2 rounded-full bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-colors" title="Déconnexion">
                      <LogOut size={18} />
                  </button>
              </div>
           </div>
           
           {/* Search Bar */}
           <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input 
                 type="text" 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 placeholder="Recherche (BL, Tracking, Client, Châssis)..."
                 className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500 transition-all"
              />
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-24 scroll-smooth">
        <Suspense fallback={
          <div className="flex items-center justify-center h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        }>
          {currentView === 'dashboard' && (
            <div className="p-5 max-w-5xl mx-auto">
              <Dashboard 
                onViewShipment={viewShipment} 
                onCreateShipment={() => setCurrentView('create')} 
              />
            </div>
          )}
          
          {currentView === 'create' && (
             <CreateShipmentForm 
                currentUserId={currentUserId}
                onCancel={() => setCurrentView('dashboard')} 
             />
          )}

          {currentView === 'detail' && selectedShipmentId && (
            <ShipmentDetail 
              shipmentId={selectedShipmentId} 
              onBack={() => setCurrentView('dashboard')} 
          />
        )}

        {currentView === 'calculator' && (
          <div className="p-5 max-w-3xl mx-auto animate-in fade-in duration-300">
            <header className="mb-6 pb-4 border-b border-slate-200">
              <h1 className="text-2xl font-bold text-slate-900">Simulateur Douanier</h1>
              <p className="text-sm text-slate-500">Estimation des droits et taxes</p>
            </header>
            <CustomsCalculator />
          </div>
        )}
        
        {currentView === 'accounting' && canViewAccounting && (
           <AccountingView />
        )}

        {currentView === 'settings' && (
          <SettingsView />
        )}

        {currentView === 'assistant' && (
          <div className="flex flex-col h-full bg-white max-w-3xl mx-auto border-x border-slate-200 shadow-sm">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {assistantMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3.5 rounded-lg text-sm leading-relaxed shadow-sm border ${m.role === 'user' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-800'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isAssistantLoading && (
                 <div className="flex justify-start">
                   <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 text-slate-400">
                      <span className="text-xs">Recherche en cours...</span>
                   </div>
                 </div>
              )}
            </div>
            <form onSubmit={handleAssistantSubmit} className="p-3 bg-white border-t border-slate-200 flex gap-2">
              <input 
                value={assistantInput}
                onChange={e => setAssistantInput(e.target.value)}
                placeholder="Posez votre question technique..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
              />
              <button type="submit" disabled={isAssistantLoading} className="bg-slate-900 text-white px-4 rounded-lg hover:bg-slate-800 transition-colors">
                <Send size={18} />
              </button>
            </form>
          </div>
        )}
        </Suspense>
      </div>

      {/* Professional Tab Bar Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe-bottom z-40">
        <div className="max-w-lg mx-auto flex justify-around items-center px-2 py-2">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg w-16 transition-all ${currentView === 'dashboard' || currentView === 'create' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <LayoutGrid size={22} strokeWidth={currentView === 'dashboard' ? 2.5 : 2} />
            <span className="text-[10px]">Accueil</span>
          </button>
          
          <button 
            onClick={() => setCurrentView('calculator')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg w-16 transition-all ${currentView === 'calculator' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Calculator size={22} strokeWidth={currentView === 'calculator' ? 2.5 : 2} />
            <span className="text-[10px]">Taxes</span>
          </button>

          {canViewAccounting && (
            <button 
               onClick={() => setCurrentView('accounting')}
               className={`flex flex-col items-center gap-1 p-2 rounded-lg w-16 transition-all ${currentView === 'accounting' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
            >
               <PieChart size={22} strokeWidth={currentView === 'accounting' ? 2.5 : 2} />
               <span className="text-[10px]">Compta</span>
            </button>
          )}

          <button 
             onClick={() => setCurrentView('assistant')}
             className={`flex flex-col items-center gap-1 p-2 rounded-lg w-16 transition-all ${currentView === 'assistant' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
          >
             <MessageSquare size={22} strokeWidth={currentView === 'assistant' ? 2.5 : 2} />
             <span className="text-[10px]">IA</span>
          </button>
          
          <button 
            onClick={() => setCurrentView('settings')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg w-16 transition-all ${currentView === 'settings' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Settings size={22} strokeWidth={currentView === 'settings' ? 2.5 : 2} />
            <span className="text-[10px]">⚡</span>
          </button>
        </div>

      </div>

    </div>
  );
};

/**
 * App: Root component that wraps layout with TransitProvider
 * Encapsulates global state management
 */
const App: React.FC = () => {
  return (
    <TransitProvider>
      {/* 🔒 SÉCURITÉ: Écran de verrouillage automatique */}
      <LockScreen />
      <AppLayout />
    </TransitProvider>
  );
};

export default App;
