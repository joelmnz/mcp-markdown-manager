import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface AccessToken {
  id: number;
  name: string;
  scope: 'read-only' | 'write';
  created_at: string;
  last_used_at: string | null;
  masked_token: string;
}

interface NewTokenResult {
  id: number;
  token: string;
  name: string;
  scope: string;
  created_at: string;
}

interface SettingsProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function Settings({ token, onNavigate }: SettingsProps) {
  const [tokens, setTokens] = useState<AccessToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenScope, setNewTokenScope] = useState<'read-only' | 'write'>('write');
  const [creating, setCreating] = useState(false);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<NewTokenResult | null>(null);
  const [visibleTokens, setVisibleTokens] = useState<Set<number>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState<number | null>(null);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/api/access-tokens', token);

      if (!response.ok) {
        throw new Error('Failed to load access tokens');
      }

      const data = await response.json();
      setTokens(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTokenName.trim()) {
      setError('Token name is required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await apiClient.post(
        '/api/access-tokens',
        { name: newTokenName.trim(), scope: newTokenScope },
        token
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create token');
      }

      const newToken = await response.json();
      setNewlyCreatedToken(newToken);
      setNewTokenName('');
      setNewTokenScope('write');
      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteToken = async (tokenId: number, tokenName: string) => {
    if (!confirm(`Are you sure you want to delete "${tokenName}"? Active integrations using this token will stop working.`)) {
      return;
    }

    try {
      const response = await apiClient.delete(
        `/api/access-tokens/${tokenId}`,
        token
      );

      if (!response.ok) {
        throw new Error('Failed to delete token');
      }

      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete token');
    }
  };

  const toggleTokenVisibility = (tokenId: number) => {
    setVisibleTokens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tokenId)) {
        newSet.delete(tokenId);
      } else {
        newSet.add(tokenId);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (text: string, tokenId: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(tokenId);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const closeNewTokenModal = () => {
    setNewlyCreatedToken(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        <button onClick={() => onNavigate('/')} className="back-button">
          ← Back
        </button>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <section className="settings-section">
        <h2>Access Tokens</h2>
        <p className="section-description">
          Generate access tokens to grant third-party applications access to your MCP server and API.
          Each token can have either read-only or write permissions.
        </p>

        <div className="token-form">
          <h3>Generate New Token</h3>
          <form onSubmit={handleCreateToken}>
            <div className="form-group">
              <label htmlFor="token-name">Token Name</label>
              <input
                type="text"
                id="token-name"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="e.g., Claude Desktop, Production API"
                required
                disabled={creating}
              />
            </div>

            <div className="form-group">
              <label htmlFor="token-scope">Scope</label>
              <select
                id="token-scope"
                value={newTokenScope}
                onChange={(e) => setNewTokenScope(e.target.value as 'read-only' | 'write')}
                disabled={creating}
              >
                <option value="write">Write (Full Access)</option>
                <option value="read-only">Read-Only</option>
              </select>
              <small className="form-help">
                {newTokenScope === 'write'
                  ? 'Full access: can read, create, update, and delete articles'
                  : 'Read-only access: can only list and read articles'}
              </small>
            </div>

            <button type="submit" disabled={creating} className="create-button">
              {creating ? 'Generating...' : 'Generate Access Token'}
            </button>
          </form>
        </div>

        <div className="tokens-list">
          <h3>Active Tokens</h3>
          {loading ? (
            <p>Loading tokens...</p>
          ) : tokens.length === 0 ? (
            <p className="empty-message">No access tokens yet. Create one to get started.</p>
          ) : (
            <table className="tokens-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Scope</th>
                  <th>Token</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="token-name">{t.name}</td>
                    <td>
                      <span className={`scope-badge scope-${t.scope}`}>
                        {t.scope === 'write' ? 'Write' : 'Read-Only'}
                      </span>
                    </td>
                    <td className="token-value">
                      <code className="token-display">
                        {visibleTokens.has(t.id) ? t.masked_token : '••••••••••'}
                      </code>
                    </td>
                    <td className="token-date">{formatDate(t.created_at)}</td>
                    <td className="token-date">
                      {t.last_used_at ? formatDate(t.last_used_at) : 'Never'}
                    </td>
                    <td className="token-actions">
                      <button
                        onClick={() => handleDeleteToken(t.id, t.name)}
                        className="delete-button"
                        title="Delete token"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {newlyCreatedToken && (
        <div className="modal-overlay" onClick={closeNewTokenModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Access Token Created!</h2>
            <div className="modal-warning">
              ⚠️ <strong>Important:</strong> This token will only be shown once. Copy it now and store it securely.
            </div>

            <div className="token-details">
              <div className="detail-row">
                <label>Name:</label>
                <span>{newlyCreatedToken.name}</span>
              </div>
              <div className="detail-row">
                <label>Scope:</label>
                <span className={`scope-badge scope-${newlyCreatedToken.scope}`}>
                  {newlyCreatedToken.scope === 'write' ? 'Write' : 'Read-Only'}
                </span>
              </div>
              <div className="detail-row full-width">
                <label>Token:</label>
                <div className="token-copy-container">
                  <code className="new-token-display">{newlyCreatedToken.token}</code>
                  <button
                    onClick={() => copyToClipboard(newlyCreatedToken.token, -1)}
                    className="copy-button"
                  >
                    {copyFeedback === -1 ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <button onClick={closeNewTokenModal} className="modal-close-button">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
