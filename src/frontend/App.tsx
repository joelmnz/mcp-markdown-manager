import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Login } from './components/Login';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { ArticleView } from './pages/ArticleView';
import { ArticleEdit } from './pages/ArticleEdit';
import { RAGStatus } from './pages/RAGStatus';
import { PublicArticleView } from './components/PublicArticleView';
import './styles/main.css';

type Route = 
  | { type: 'home' }
  | { type: 'article'; filename: string }
  | { type: 'edit'; filename: string }
  | { type: 'new' }
  | { type: 'rag-status' }
  | { type: 'public-article'; slug: string };

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [route, setRoute] = useState<Route>({ type: 'home' });
  const [intendedRoute, setIntendedRoute] = useState<Route | null>(null);

  useEffect(() => {
    // Load saved token and theme
    const savedToken = localStorage.getItem('auth_token');
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    
    if (savedToken) {
      setToken(savedToken);
    }
    
    if (savedTheme) {
      setTheme(savedTheme);
    }

    // Parse initial route from URL
    const path = window.location.pathname;
    const parsedRoute = parseRoute(path);
    
    // Allow public article routes without authentication
    if (!savedToken && parsedRoute.type !== 'home' && parsedRoute.type !== 'public-article') {
      setIntendedRoute(parsedRoute);
    } else {
      setRoute(parsedRoute);
    }

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      setRoute(parseRoute(window.location.pathname));
    });

    // Register service worker for PWA support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const parseRoute = (path: string): Route => {
    if (path === '/' || path === '') {
      return { type: 'home' };
    }
    
    if (path === '/rag-status') {
      return { type: 'rag-status' };
    }
    
    if (path.startsWith('/public-article/')) {
      const slug = path.replace('/public-article/', '');
      return { type: 'public-article', slug };
    }
    
    if (path.startsWith('/article/')) {
      const filename = path.replace('/article/', '');
      return { type: 'article', filename };
    }
    
    if (path.startsWith('/edit/')) {
      const filename = path.replace('/edit/', '');
      return { type: 'edit', filename };
    }
    
    if (path === '/new') {
      return { type: 'new' };
    }
    
    return { type: 'home' };
  };

  const navigate = (path: string) => {
    const newRoute = parseRoute(path);
    setRoute(newRoute);
    window.history.pushState({}, '', path);
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
      <Header theme={theme} onThemeToggle={handleThemeToggle} onLogout={handleLogout} />
      <main className="main">
        {route.type === 'home' && (
          <Home token={token} onNavigate={navigate} />
        )}
        {route.type === 'rag-status' && (
          <RAGStatus token={token} onNavigate={navigate} />
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
