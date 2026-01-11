import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// 🔒 Error Boundary global pour capturer erreurs React
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  props: { children: React.ReactNode };
  state = { hasError: false, error: undefined as Error | undefined };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 React Error Boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          backgroundColor: '#0f172a',
          color: '#fff',
          fontFamily: 'Inter, sans-serif'
        }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>⚠️ Une erreur est survenue</h1>
          <p style={{ color: '#94a3b8', marginBottom: '24px', textAlign: 'center', maxWidth: '500px' }}>
            L'application a rencontré un problème. Veuillez recharger la page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            Recharger l'application
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              fontSize: '12px',
              maxWidth: '90vw',
              overflow: 'auto'
            }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('❌ Élément #root introuvable dans index.html. Vérifiez le DOM.');
}

const root = ReactDOM.createRoot(rootElement);

// ⚠️ Désactiver StrictMode en dev pour éviter les appels doubles à l'API
// qui causent des erreurs 429 (Too Many Requests) avec le rate limiting
if (import.meta.env.PROD) {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// 🔄 Service Worker PWA (offline-first + auto-update)
try {
  const updateSW = registerSW({
    onNeedRefresh() {
      // ⚠️ TODO Sprint UX: Remplacer par toast notification non-bloquant
      // Bibliothèque recommandée: sonner ou react-hot-toast
      if (confirm('Nouvelle version disponible. Recharger maintenant ?')) {
        updateSW(true);
      }
    },
    onOfflineReady() {
      if (import.meta.env.DEV) {
        console.log('✅ App prête pour utilisation offline');
      }
    },
    onRegisteredSW(swUrl, registration) {
      if (import.meta.env.DEV) {
        console.log('✅ Service Worker enregistré:', swUrl);
      }
      
      // Auto-check updates toutes les heures (balance freshness vs battery)
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      }
    }
  });
} catch (error) {
  console.error('❌ Erreur enregistrement Service Worker:', error);
}