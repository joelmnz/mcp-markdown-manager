import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Login } from './components/Login';
import { Header } from './components/Header';
import { GlobalError } from './components/GlobalError';
import { Home } from './pages/Home';
import { ArticleView } from './pages/ArticleView';
import { ArticleEdit } from './pages/ArticleEdit';
import { RAGStatus } from './pages/RAGStatus';
import { ImportFiles } from './pages/ImportFiles';
import { PublicArticleView } from './components/PublicArticleView';
import {
  initializeRuntimeConfig,
  getRuntimeConfig,
  isRuntimeConfigAvailable,
  addConfigListener,
  type RuntimeConfig
} from './utils/runtimeConfig';
import {
  parseRouteFromUrl,
  buildRouteUrl,
  buildAssetUrl,
  getBasePath,
  isRuntimeConfigAvailable as isUrlBuilderConfigAvailable
} from './utils/urlBuilder';
import { configureApiClient, apiClient } from './utils/apiClient';
import './styles/main.css';

type Route =
  | { type: 'home' }
  | { type: 'article'; filename: string }
  | { type: 'edit'; filename: string }
  | { type: 'new' }
  | { type: 'rag-status' }
  | { type: 'import-files' }
  | { type: 'public-article'; slug: string };

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [route, setRoute] = useState<Route>({ type: 'home' });
  const [intendedRoute, setIntendedRoute] = useState<Route | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [configInitialized, setConfigInitialized] = useState(false);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [healthError, setHealthError] = useState<any>(null);

  useEffect(() => {
    // Check backend health
    const checkHealth = async () => {
      try {
        const response = await apiClient.get('/health');
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          // If 503, it's a specific health failure (like DB down)
          // If 404 or other, it might be a routing issue, but still critical
          throw new Error(data.message || data.error || `Server health check failed with status ${response.status}`);
        }
        setIsHealthy(true);
      } catch (error) {
        console.error('System health check failed:', error);
        setIsHealthy(false);
        setHealthError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    // Initialize runtime configuration first with enhanced error handling
    const configResult = initializeRuntimeConfig();

    if (!configResult.isValid) {
      console.warn('Runtime configuration issues:', configResult.errors);

      // Implement fallback behavior when runtime configuration is unavailable
      if (configResult.errors.includes('No runtime configuration injected by server')) {
        console.log('Falling back to root path behavior - application will work at root path only');
      }
    }

    // Store the configuration for use throughout the component
    const config = getRuntimeConfig();
    setRuntimeConfig(config);

    // Configure API client with runtime configuration
    configureApiClient(config);

    // Check backend health using the configured API client
    checkHealth();

    setConfigInitialized(true);

    // Log configuration status for debugging
    console.log('Runtime configuration status:', {
      isAvailable: isRuntimeConfigAvailable(),
      config: config,
      urlBuilderConfigAvailable: isUrlBuilderConfigAvailable()
    });

    // Listen for configuration changes (useful for dynamic updates)
    const unsubscribe = addConfigListener((newConfig) => {
      console.log('Runtime configuration updated:', newConfig);
      setRuntimeConfig(newConfig);

      // Reconfigure API client with new configuration
      configureApiClient(newConfig);

      // Re-parse current route with new configuration
      const currentPath = parseRouteFromUrl(window.location.href);
      const parsedRoute = parseRoute(currentPath);
      setRoute(parsedRoute);
    });

    // Load saved token and theme
    const savedToken = localStorage.getItem('auth_token');
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;

    if (savedToken) {
      setToken(savedToken);
    }

    if (savedTheme) {
      setTheme(savedTheme);
    }

    // Parse initial route from URL using runtime configuration
    const path = parseRouteFromUrl(window.location.href);
    const parsedRoute = parseRoute(path);

    // Allow public article routes without authentication
    if (!savedToken && parsedRoute.type !== 'home' && parsedRoute.type !== 'public-article') {
      setIntendedRoute(parsedRoute);
    } else {
      setRoute(parsedRoute);
    }

    // Handle browser back/forward with runtime configuration awareness
    const handlePopState = () => {
      const currentPath = parseRouteFromUrl(window.location.href);
      const newRoute = parseRoute(currentPath);
      setRoute(newRoute);
    };

    window.addEventListener('popstate', handlePopState);

    // Register service worker for PWA support with runtime base path
    if ('serviceWorker' in navigator) {
      try {
        const swUrl = buildAssetUrl('/sw.js');
        const basePath = getBasePath();

        // Set service worker scope to match the base path
        const registrationOptions: RegistrationOptions = {};
        if (basePath) {
          // Scope must end with / for proper path matching
          registrationOptions.scope = basePath + '/';
        }

        navigator.serviceWorker
          .register(swUrl, registrationOptions)
          .then((registration) => {
            console.log('Service Worker registered with runtime base path:', {
              url: swUrl,
              scope: registration.scope,
              basePath: basePath || '/'
            });
          })
          .catch((error) => {
            console.error('Service Worker registration failed:', error);
            // Continue operation even if service worker fails
          });
      } catch (error) {
        console.error('Error building service worker URL:', error);
        // Fallback: try to register without base path
        navigator.serviceWorker
          .register('/sw.js')
          .catch((fallbackError) => {
            console.error('Fallback service worker registration also failed:', fallbackError);
          });
      }
    }

    // Cleanup
    return () => {
      window.removeEventListener('popstate', handlePopState);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const parseRoute = (path: string): Route => {
    // Normalize path and handle empty/root cases
    const normalizedPath = path || '/';

    if (normalizedPath === '/' || normalizedPath === '') {
      return { type: 'home' };
    }

    if (normalizedPath === '/rag-status') {
      return { type: 'rag-status' };
    }

    if (normalizedPath === '/import-files') {
      return { type: 'import-files' };
    }

    if (normalizedPath.startsWith('/public-article/')) {
      const slug = normalizedPath.replace('/public-article/', '');
      if (slug) {
        return { type: 'public-article', slug };
      }
    }

    if (normalizedPath.startsWith('/article/')) {
      const filename = normalizedPath.replace('/article/', '');
      if (filename) {
        return { type: 'article', filename };
      }
    }

    if (normalizedPath.startsWith('/edit/')) {
      const filename = normalizedPath.replace('/edit/', '');
      if (filename) {
        return { type: 'edit', filename };
      }
    }

    if (normalizedPath === '/new') {
      return { type: 'new' };
    }

    // Default fallback to home for unrecognized routes
    console.warn(`Unrecognized route: ${normalizedPath}, falling back to home`);
    return { type: 'home' };
  };

  const navigate = (path: string) => {
    try {
      const newRoute = parseRoute(path);
      setRoute(newRoute);

      // Build full URL with base path for browser history using runtime configuration
      const fullUrl = buildRouteUrl(path);
      window.history.pushState({}, '', fullUrl);
    } catch (error) {
      console.error('Navigation error:', error);

      // Fallback behavior: try to navigate without base path
      try {
        const newRoute = parseRoute(path);
        setRoute(newRoute);
        window.history.pushState({}, '', path);
      } catch (fallbackError) {
        console.error('Fallback navigation also failed:', fallbackError);
        // Last resort: navigate to home
        setRoute({ type: 'home' });
        window.history.pushState({}, '', '/');
      }
    }
  };

  const handleLogin = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('auth_token', newToken);

    // Navigate to intended route if exists
    if (intendedRoute) {
      setRoute(intendedRoute);
      setIntendedRoute(null);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('auth_token');
    setRoute({ type: 'home' });
    navigate('/');
  };

  const handleThemeToggle = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Show loading state while runtime configuration or health check is being initialized
  if (!configInitialized || isHealthy === null) {
    return (
      <div className="app">
        <main className="main" style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '1.2rem'
        }}>
          Initializing application...
        </main>
      </div>
    );
  }

  // Show global error if system is unhealthy
  if (isHealthy === false) {
    const isDbError = healthError?.includes('Database') || healthError?.includes('connect');
    return (
      <GlobalError
        title="System Initialization Failed"
        message={isDbError
          ? "The application cannot connect to the database. This usually means the database container is not running or the password configuration is incorrect."
          : "The application server found a critical issue during startup."}
        details={{ error: healthError }}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Show configuration error if runtime config is completely unavailable
  if (!runtimeConfig && !isRuntimeConfigAvailable()) {
    console.error('Critical: Runtime configuration is not available and fallback failed');
    return (
      <div className="app">
        <main className="main" style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h2>Configuration Error</h2>
          <p>The application could not initialize properly. Please check the server configuration.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </main>
      </div>
    );
  }

  if (!token) {
    // Allow access to public article view without authentication
    if (route.type === 'public-article') {
      return (
        <div className="app">
          <main className="main">
            <PublicArticleView slug={route.slug} onNavigate={navigate} />
          </main>
        </div>
      );
    }

    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <Header 
        theme={theme} 
        onThemeToggle={handleThemeToggle} 
        onLogout={handleLogout} 
        onNavigate={navigate}
      />
      <main className="main">
        {route.type === 'home' && (
          <Home token={token} onNavigate={navigate} />
        )}
        {route.type === 'rag-status' && (
          <RAGStatus token={token} onNavigate={navigate} />
        )}
        {route.type === 'import-files' && (
          <ImportFiles token={token} onNavigate={navigate} />
        )}
        {route.type === 'article' && (
          <ArticleView filename={route.filename} token={token} onNavigate={navigate} />
        )}
        {route.type === 'edit' && (
          <ArticleEdit filename={route.filename} token={token} onNavigate={navigate} />
        )}
        {route.type === 'new' && (
          <ArticleEdit token={token} onNavigate={navigate} />
        )}
        {route.type === 'public-article' && (
          <PublicArticleView slug={route.slug} onNavigate={navigate} />
        )}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
