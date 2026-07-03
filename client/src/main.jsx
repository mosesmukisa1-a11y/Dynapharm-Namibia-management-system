import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { OfflineProvider } from './lib/OfflineProvider.jsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Force an update check right away, and periodically, so a stale
      // installed worker doesn't linger even if the browser's own
      // "check every 24h" heuristic hasn't kicked in yet.
      registration.update().catch(() => {});
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    }).catch(() => {});

    // When a new service worker takes control of this page (i.e. it just
    // finished activating via skipWaiting/clients.claim), the page that's
    // currently open is still running the OLD cached JS in memory. Reload
    // once so the user actually sees the new build instead of having to
    // manually refresh.
    let hasReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasReloaded) return;
      hasReloaded = true;
      window.location.reload();
    });
  });
}

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[App Error]', error, info);
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message || String(error),
          stack: error?.stack || '',
          componentStack: info?.componentStack || '',
          url: window.location.href,
        }),
      }).catch(() => {});
    } catch (_) {}
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || String(this.state.error || '');
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
          <img src="/assets/dynapharm-logo.png" alt="Dynapharm" style={{ width: 64, height: 64, marginBottom: '1rem', objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem', maxWidth: 400 }}>The application encountered an error. Please refresh the page or try again.</p>
          {errMsg && (
            <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '1.5rem', maxWidth: 400, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {errMsg}
            </p>
          )}
          <button onClick={() => window.location.reload()} style={{ padding: '0.6rem 1.5rem', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <OfflineProvider>
            <App />
          </OfflineProvider>
        </AuthProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>
);
