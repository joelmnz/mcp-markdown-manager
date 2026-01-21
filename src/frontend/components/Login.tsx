import React, { useState } from 'react';
import { getConfiguredApiClient } from '../utils/apiClient';

interface LoginProps {
  onLogin: (token: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Verify token by making a test API call using the configured API client
      const apiClient = getConfiguredApiClient();
      const response = await apiClient.get('/api/articles', password);

      if (response.ok) {
        onLogin(password);
      } else {
        setError('Invalid authentication token');
      }
    } catch (err) {
      setError('Failed to authenticate');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>MCP Markdown Manager</h1>
        <p className="login-subtitle">Enter your authentication token to access the dashboard</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="auth-token" className="edit-label" style={{ display: 'block' }}>
            Authentication Token
          </label>
          <input
            id="auth-token"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="sk-md-..."
            className="login-input"
            autoFocus
            disabled={isLoading}
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
          />
          {error && (
            <div id="login-error" className="error-message" role="alert">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="login-button"
            disabled={isLoading || !password}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
