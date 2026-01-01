import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface OAuthClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
  created_at: string;
  updated_at: string;
}

interface OAuthToken {
  token_hash: string;
  client_id: string;
  client_name?: string;
  user_id?: string;
  scope?: string;
  expires_at: string;
  created_at: string;
  revoked_at?: string;
  access_token_hash?: string; // For refresh tokens
}

interface SettingsProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function Settings({ token, onNavigate }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'clients' | 'tokens'>('clients');
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [tokens, setTokens] = useState<{ accessTokens: OAuthToken[]; refreshTokens: OAuthToken[] }>({
    accessTokens: [],
    refreshTokens: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oauthEnabled, setOauthEnabled] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'clients') {
        const response = await apiClient.get('/api/oauth/clients', token);
        if (!response.ok) {
          if (response.status === 503) {
            setOauthEnabled(false);
            setClients([]);
            return;
          }
          throw new Error('Failed to load OAuth clients');
        }
        const data = await response.json();
        setClients(data);
      } else {
        const response = await apiClient.get('/api/oauth/tokens', token);
        if (!response.ok) {
          if (response.status === 503) {
            setOauthEnabled(false);
            setTokens({ accessTokens: [], refreshTokens: [] });
            return;
          }
          throw new Error('Failed to load OAuth tokens');
        }
        const data = await response.json();
        setTokens(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!confirm('Are you sure you want to delete this OAuth client? This will revoke all associated tokens.')) {
      return;
    }

    try {
      const response = await apiClient.delete(`/api/oauth/clients/${clientId}`, token);
      if (!response.ok) {
        throw new Error('Failed to delete OAuth client');
      }
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete client');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  if (!oauthEnabled) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Settings</h1>
          <button className="button button-secondary" onClick={() => onNavigate('/')}>
            Back to Articles
          </button>
        </div>

        <div className="rag-section">
          <h2>OAuth Not Enabled</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            OAuth authentication is currently disabled. To enable OAuth and use Claude Web Custom Connectors,
            set <code style={{ backgroundColor: 'var(--bg-tertiary)', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>OAUTH_ENABLED=true</code> in your environment variables and restart the server.
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            See the <a href="https://github.com/joelmnz/mcp-markdown-manager/blob/master/docs/QUICKSTART_CLAUDE_WEB.md" target="_blank" rel="noopener noreferrer">
              Quick Start Guide
            </a> for setup instructions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
        <button className="button button-secondary" onClick={() => onNavigate('/')}>
          Back to Articles
        </button>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2rem',
        borderBottom: '2px solid var(--border-color)'
      }}>
        <button
          onClick={() => setActiveTab('clients')}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'clients' ? '2px solid var(--accent-color)' : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '1rem',
            color: activeTab === 'clients' ? 'var(--accent-color)' : 'var(--text-secondary)',
            marginBottom: '-2px',
            transition: 'all 0.2s',
          }}
        >
          OAuth Clients ({clients.length})
        </button>
        <button
          onClick={() => setActiveTab('tokens')}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'tokens' ? '2px solid var(--accent-color)' : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '1rem',
            color: activeTab === 'tokens' ? 'var(--accent-color)' : 'var(--text-secondary)',
            marginBottom: '-2px',
            transition: 'all 0.2s',
          }}
        >
          OAuth Tokens ({tokens.accessTokens.length + tokens.refreshTokens.length})
        </button>
      </div>

      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && activeTab === 'clients' && (
        <div>
          <div className="info-section" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>OAuth Clients</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Manage OAuth 2.0 clients that have registered with your server.
            </p>
          </div>

          {clients.length === 0 ? (
            <div className="empty-state">
              <p>No OAuth clients registered yet.</p>
              <p>Connect from Claude web to automatically register a client via Dynamic Client Registration (DCR).</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {clients.map((client) => (
                <div key={client.client_id} className="rag-section">
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    paddingBottom: '1rem',
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{client.client_name || 'Unnamed Client'}</h3>
                    <button
                      className="button button-danger"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
                      onClick={() => handleDeleteClient(client.client_id)}
                    >
                      Delete
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Client ID:</span>
                      <code style={{
                        fontFamily: 'monospace',
                        fontSize: '0.9rem',
                        backgroundColor: 'var(--bg-tertiary)',
                        padding: '0.2rem 0.4rem',
                        borderRadius: '4px'
                      }}>{client.client_id}</code>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Grant Types:</span>
                      <span>{client.grant_types.join(', ')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Redirect URIs:</span>
                      <span style={{ wordBreak: 'break-all' }}>{client.redirect_uris.join(', ')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Scope:</span>
                      <span>{client.scope || 'None'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Created:</span>
                      <span>{formatDate(client.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && !error && activeTab === 'tokens' && (
        <div>
          <div className="info-section" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>OAuth Tokens</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              View active and expired OAuth tokens. Expired tokens are automatically cleaned up.
            </p>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Access Tokens ({tokens.accessTokens.length})</h3>
            {tokens.accessTokens.length === 0 ? (
              <div className="empty-state">
                <p>No access tokens found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {tokens.accessTokens.map((accessToken) => {
                  const expired = isExpired(accessToken.expires_at);
                  const revoked = !!accessToken.revoked_at;
                  return (
                    <div
                      key={accessToken.token_hash}
                      className="rag-section"
                      style={{ opacity: expired || revoked ? 0.6 : 1 }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1rem',
                        paddingBottom: '1rem',
                        borderBottom: '1px solid var(--border-color)'
                      }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem' }}>Access Token</span>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          backgroundColor: revoked ? 'var(--danger-light)' : expired ? 'rgba(255, 193, 7, 0.1)' : 'rgba(74, 255, 74, 0.1)',
                          color: revoked ? 'var(--danger-color)' : expired ? '#ffc107' : 'var(--success-color)',
                        }}>
                          {revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Client:</span>
                          <span>{accessToken.client_name || accessToken.client_id}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Scope:</span>
                          <span>{accessToken.scope || 'None'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Created:</span>
                          <span>{formatDate(accessToken.created_at)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Expires:</span>
                          <span>{formatDate(accessToken.expires_at)}</span>
                        </div>
                        {accessToken.revoked_at && (
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Revoked:</span>
                            <span>{formatDate(accessToken.revoked_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Refresh Tokens ({tokens.refreshTokens.length})</h3>
            {tokens.refreshTokens.length === 0 ? (
              <div className="empty-state">
                <p>No refresh tokens found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {tokens.refreshTokens.map((refreshToken) => {
                  const expired = isExpired(refreshToken.expires_at);
                  const revoked = !!refreshToken.revoked_at;
                  return (
                    <div
                      key={refreshToken.token_hash}
                      className="rag-section"
                      style={{ opacity: expired || revoked ? 0.6 : 1 }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1rem',
                        paddingBottom: '1rem',
                        borderBottom: '1px solid var(--border-color)'
                      }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem' }}>Refresh Token</span>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          backgroundColor: revoked ? 'var(--danger-light)' : expired ? 'rgba(255, 193, 7, 0.1)' : 'rgba(74, 255, 74, 0.1)',
                          color: revoked ? 'var(--danger-color)' : expired ? '#ffc107' : 'var(--success-color)',
                        }}>
                          {revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Client:</span>
                          <span>{refreshToken.client_name || refreshToken.client_id}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Scope:</span>
                          <span>{refreshToken.scope || 'None'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Created:</span>
                          <span>{formatDate(refreshToken.created_at)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Expires:</span>
                          <span>{formatDate(refreshToken.expires_at)}</span>
                        </div>
                        {refreshToken.revoked_at && (
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '120px' }}>Revoked:</span>
                            <span>{formatDate(refreshToken.revoked_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
