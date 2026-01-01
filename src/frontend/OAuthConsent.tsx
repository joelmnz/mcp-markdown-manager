import React, { useState, useEffect } from 'react';

interface ConsentPageProps {
  clientId: string;
  clientName?: string;
  scope?: string;
  redirectUri: string;
  state?: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

/**
 * OAuth Consent Page
 * Displays authorization request details and allows user to approve or deny
 */
export function OAuthConsentPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<ConsentPageProps | null>(null);

  useEffect(() => {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);

    const clientId = urlParams.get('client_id');
    const redirectUri = urlParams.get('redirect_uri');
    const responseType = urlParams.get('response_type');
    const codeChallenge = urlParams.get('code_challenge');
    const codeChallengeMethod = urlParams.get('code_challenge_method');

    if (!clientId || !redirectUri || !responseType || !codeChallenge || !codeChallengeMethod) {
      setError('Missing required OAuth parameters');
      return;
    }

    setParams({
      clientId,
      clientName: urlParams.get('client_name') || undefined,
      scope: urlParams.get('scope') || undefined,
      redirectUri,
      state: urlParams.get('state') || undefined,
      responseType,
      codeChallenge,
      codeChallengeMethod,
    });
  }, []);

  const handleApprove = async () => {
    if (!params) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('response_type', params.responseType);
      formData.append('client_id', params.clientId);
      formData.append('redirect_uri', params.redirectUri);
      formData.append('code_challenge', params.codeChallenge);
      formData.append('code_challenge_method', params.codeChallengeMethod);
      if (params.scope) formData.append('scope', params.scope);
      if (params.state) formData.append('state', params.state);

      const response = await fetch('/oauth/authorize/approve', {
        method: 'POST',
        body: formData,
      });

      if (response.redirected) {
        window.location.href = response.url;
      } else if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setError(errorData.error_description || errorData.error || 'Authorization failed');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed');
      setLoading(false);
    }
  };

  const handleDeny = () => {
    if (!params) return;

    // Redirect back with error
    const url = new URL(params.redirectUri);
    url.searchParams.set('error', 'access_denied');
    url.searchParams.set('error_description', 'User denied authorization');
    if (params.state) url.searchParams.set('state', params.state);
    window.location.href = url.toString();
  };

  if (error && !params) {
    return (
      <div className="consent-container">
        <div className="consent-card">
          <div className="consent-header">
            <h1>Authorization Error</h1>
          </div>
          <div className="consent-body">
            <p className="error-message">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!params) {
    return (
      <div className="consent-container">
        <div className="consent-card">
          <div className="consent-header">
            <h1>Loading...</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="consent-container">
      <div className="consent-card">
        <div className="consent-header">
          <h1>Authorize Access</h1>
          <p className="consent-subtitle">
            {params.clientName || params.clientId} would like to access your account
          </p>
        </div>

        <div className="consent-body">
          <div className="consent-info">
            <h2>Authorization Request</h2>
            <div className="consent-details">
              <div className="consent-detail">
                <span className="label">Application:</span>
                <span className="value">{params.clientName || params.clientId}</span>
              </div>
              <div className="consent-detail">
                <span className="label">Client ID:</span>
                <span className="value code">{params.clientId}</span>
              </div>
              {params.scope && (
                <div className="consent-detail">
                  <span className="label">Requested Permissions:</span>
                  <span className="value">{params.scope}</span>
                </div>
              )}
            </div>
          </div>

          <div className="consent-permissions">
            <h3>This application will be able to:</h3>
            <ul>
              <li>Access your articles</li>
              <li>Create, update, and delete articles</li>
              <li>Search and list your content</li>
            </ul>
          </div>

          {error && (
            <div className="error-banner">
              <p>{error}</p>
            </div>
          )}

          <div className="consent-actions">
            <button
              className="btn btn-secondary"
              onClick={handleDeny}
              disabled={loading}
            >
              Deny
            </button>
            <button
              className="btn btn-primary"
              onClick={handleApprove}
              disabled={loading}
            >
              {loading ? 'Authorizing...' : 'Authorize'}
            </button>
          </div>
        </div>

        <div className="consent-footer">
          <p>
            By authorizing this application, you grant it access to your MCP Markdown Manager.
            You can revoke this access at any time.
          </p>
        </div>
      </div>

      <style>{`
        .consent-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .consent-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 100%;
          overflow: hidden;
        }

        .consent-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }

        .consent-header h1 {
          margin: 0 0 10px 0;
          font-size: 24px;
          font-weight: 600;
        }

        .consent-subtitle {
          margin: 0;
          opacity: 0.9;
          font-size: 14px;
        }

        .consent-body {
          padding: 30px;
        }

        .consent-info h2 {
          margin: 0 0 15px 0;
          font-size: 18px;
          color: #333;
        }

        .consent-details {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }

        .consent-detail {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .consent-detail:last-child {
          margin-bottom: 0;
        }

        .consent-detail .label {
          font-weight: 600;
          color: #666;
        }

        .consent-detail .value {
          color: #333;
        }

        .consent-detail .value.code {
          font-family: monospace;
          font-size: 12px;
        }

        .consent-permissions {
          margin-bottom: 20px;
        }

        .consent-permissions h3 {
          margin: 0 0 10px 0;
          font-size: 16px;
          color: #333;
        }

        .consent-permissions ul {
          margin: 0;
          padding-left: 20px;
        }

        .consent-permissions li {
          margin-bottom: 5px;
          color: #666;
        }

        .error-banner {
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          padding: 12px;
          margin-bottom: 20px;
        }

        .error-banner p {
          margin: 0;
          color: #c00;
          font-size: 14px;
        }

        .error-message {
          color: #c00;
          font-size: 16px;
        }

        .consent-actions {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }

        .btn {
          flex: 1;
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .btn-secondary {
          background: #e0e0e0;
          color: #666;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #d0d0d0;
        }

        .consent-footer {
          background: #f8f9fa;
          padding: 20px 30px;
          border-top: 1px solid #e0e0e0;
        }

        .consent-footer p {
          margin: 0;
          font-size: 12px;
          color: #666;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
