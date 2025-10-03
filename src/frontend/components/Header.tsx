import React from 'react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onLogout: () => void;
}

export function Header({ theme, onThemeToggle, onLogout }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        <a href="/" className="header-title">Article Manager</a>
        <div className="header-actions">
          <button onClick={onThemeToggle} className="icon-button" title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={onLogout} className="icon-button" title="Logout">
            🚪
          </button>
        </div>
      </div>
    </header>
  );
}
