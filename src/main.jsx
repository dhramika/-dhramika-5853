
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Error boundary for the entire app
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'system-ui', background: '#F4F0E6', minHeight: '100vh' }}>
          <h1 style={{ color: '#0B3A5B' }}>Something went wrong</h1>
          <p style={{ color: '#4F6475' }}>Please try refreshing or clearing app data.</p>
          <p style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>
            Error: {this.state.error?.message || 'Unknown error'}
          </p>
          <button 
            onClick={() => {
              try {
                localStorage.clear();
              } catch (e) {}
              window.location.reload();
            }} 
            style={{ padding: '12px 24px', marginTop: '20px', background: '#0B3A5B', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px' }}
          >
            Clear Data and Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// Register service worker for Android PWA support
if ('serviceWorker' in navigator) {
  // When a new service worker takes control, reload once so the page runs
  // the latest JavaScript instead of the old cached bundle. This is what
  // makes new features (like the contacts PDF export) actually appear on
  // installed PWAs without a manual hard refresh.
  let hasReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      // Unregister old service workers first to ensure clean state
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (registration.scope !== window.location.origin + '/') {
          await registration.unregister();
        }
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('SW registered:', registration.scope);

      // Force an immediate update check so a newly deployed service worker
      // is fetched and activated right away rather than on the next visit.
      registration.update();

      // If an updated worker is found, activate it as soon as it is installed.
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // Periodically check for updates while the app stays open.
      setInterval(() => registration.update(), 60 * 1000);
    } catch (error) {
      console.log('SW registration failed:', error);
    }
  });
}
