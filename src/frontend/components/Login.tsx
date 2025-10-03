import React, { useState } from 'react';

interface LoginProps {
  onLogin: (token: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Verify token by making a test API call
      const response = await fetch('/api/articles', {
        headers: {
          'Authorization': `Bearer ${password}`
        }
      });

      if (response.ok) {
        onLogin(password);
      } else {
        setError('Invalid authentication token');
      }
    } catch (err) {
      setError('Failed to authenticate');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>MCP Markdown Manager</h1>
        <p className="login-subtitle">Enter your authentication token</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Authentication token"
            className="login-input"
            autoFocus
          />
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="login-button">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
