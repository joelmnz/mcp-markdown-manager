import React, { useState } from 'react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
}

export function Header({ theme, onThemeToggle, onLogout, onNavigate }: HeaderProps) {
  const [showInfo, setShowInfo] = useState(false);
  const apiBaseUrl = window.location.origin;
  
  const mcpConfigAgentZero = {
    "mcpServers": {
      "mcp-markdown-manager": {
        "url": `${apiBaseUrl}/mcp`,
        "description": "Markdown article manager for research and notes",
        "type": "streaming-http",
        "headers": {
          "Authorization": "Bearer YOUR_AUTH_TOKEN_HERE",
          "X-Custom-Header": "agent-zero"
        },
        "disabled": false
      }
    }
  };

  const mcpConfigVSCode = {
    "servers": {
      "mcp-markdown-manager": {
        "url": `${apiBaseUrl}/mcp`,
        "description": "Markdown article manager for research and notes",
        "type": "http",
        "headers": {
          "Authorization": "Bearer YOUR_AUTH_TOKEN_HERE"
        }
      }
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        <a href="/" className="header-title">
          <span className="title-desktop">MCP Markdown Manager</span>
          <span className="title-mobile">Md</span>
        </a>
        <div className="header-actions">
          <button onClick={() => onNavigate('/rag-status')} className="icon-button" title="RAG Status">
            🔍
          </button>
          <button onClick={() => onNavigate('/settings')} className="icon-button" title="Settings">
            ⚙️
          </button>
          <button onClick={() => setShowInfo(!showInfo)} className="icon-button" title="API & MCP Info">
            ℹ️
          </button>
          <button onClick={onThemeToggle} className="icon-button" title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={onLogout} className="icon-button" title="Logout">
            🚪
          </button>
        </div>
      </div>
      
      {showInfo && (
        <>
          <div className="info-overlay" onClick={() => setShowInfo(false)} />
          <div className="info-popup">
            <div className="info-header">
              <h2>API & MCP Documentation</h2>
              <button onClick={() => setShowInfo(false)} className="info-close">✕</button>
            </div>
            
            <div className="info-content">
              {/* MCP Server Configuration */}
              <section className="info-section">
                <h3>🤖 MCP Server Configuration</h3>
                <p>Connect AI agents using the Model Context Protocol (Streamable HTTP):</p>
                
                <p><strong>For <a href="https://github.com/agent0ai/agent-zero">Agent Zero</a>:</strong></p>
                <div className="info-code">
                  <pre>{JSON.stringify(mcpConfigAgentZero, null, 2)}</pre>
                </div>
                
                <p><strong>For <a href="https://code.visualstudio.com/docs/copilot/customization/mcp-servers">VS Code</a>:</strong></p>
                <div className="info-code">
                  <pre>{JSON.stringify(mcpConfigVSCode, null, 2)}</pre>
                </div>
                
                <div className="info-detail">
                  <strong>Endpoint:</strong> <code>{apiBaseUrl}/mcp</code><br/>
                  <strong>Transport:</strong> MCP Streamable HTTP (POST/GET/DELETE)<br/>
                  <strong>Auth:</strong> Bearer Token (required in headers)<br/>
                  <strong>Session Management:</strong> Automatic via <code>mcp-session-id</code> header
                </div>
              </section>

              {/* MCP Tools */}
              <section className="info-section">
                <h3>🔧 Available MCP Tools</h3>
                <ul className="info-list">
                  <li><code>listArticles</code> - List all articles</li>
                  <li><code>searchArticles</code> - Search by title (query param)</li>
                  <li><code>semanticSearch</code> - Semantic search with embeddings (query, k params)</li>
                  <li><code>readArticle</code> - Read article (filename param)</li>
                  <li><code>createArticle</code> - Create article (title, content params)</li>
                  <li><code>updateArticle</code> - Update article (filename, title, content params)</li>
                  <li><code>deleteArticle</code> - Delete article (filename param)</li>
                </ul>
              </section>

              {/* REST API */}
              <section className="info-section">
                <h3>🌐 REST API Endpoints</h3>
                <div className="api-endpoint">
                  <div className="api-method get">GET</div>
                  <code>{apiBaseUrl}/api/articles</code>
                  <span className="api-desc">List all articles</span>
                </div>
                <div className="api-endpoint">
                  <div className="api-method get">GET</div>
                  <code>{apiBaseUrl}/api/articles?q=search</code>
                  <span className="api-desc">Search articles by title</span>
                </div>
                <div className="api-endpoint">
                  <div className="api-method get">GET</div>
                  <code>{apiBaseUrl}/api/search?query=...&k=5</code>
                  <span className="api-desc">Semantic search (RAG)</span>
                </div>
                <div className="api-endpoint">
                  <div className="api-method get">GET</div>
                  <code>{apiBaseUrl}/api/articles/:filename</code>
                  <span className="api-desc">Read article</span>
                </div>
                <div className="api-endpoint">
                  <div className="api-method post">POST</div>
                  <code>{apiBaseUrl}/api/articles</code>
                  <span className="api-desc">Create article</span>
                </div>
                <div className="api-endpoint">
                  <div className="api-method put">PUT</div>
                  <code>{apiBaseUrl}/api/articles/:filename</code>
                  <span className="api-desc">Update article</span>
                </div>
                <div className="api-endpoint">
                  <div className="api-method delete">DELETE</div>
                  <code>{apiBaseUrl}/api/articles/:filename</code>
                  <span className="api-desc">Delete article</span>
                </div>
              </section>

              {/* Authentication */}
              <section className="info-section">
                <h3>🔐 Authentication</h3>
                <p>All endpoints support two authentication methods:</p>
                
                <h4>Bearer Token (Simple)</h4>
                <p>Direct token authentication for scripts and MCP clients:</p>
                <div className="info-code">
                  <pre>Authorization: Bearer YOUR_AUTH_TOKEN</pre>
                </div>
                
                <h4>OAuth 2.0 with PKCE (Claude Web)</h4>
                <p>For <a href="https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noopener noreferrer">Claude Web custom connectors</a>, OAuth 2.0 is available when <code>OAUTH_ENABLED=true</code>.</p>
                
                <div className="info-detail">
                  <strong>OAuth Endpoints:</strong><br/>
                  <code>POST {apiBaseUrl}/oauth/register</code> - Dynamic Client Registration<br/>
                  <code>GET {apiBaseUrl}/oauth/authorize</code> - Authorization (with PKCE)<br/>
                  <code>POST {apiBaseUrl}/oauth/token</code> - Token Exchange<br/>
                  <code>POST {apiBaseUrl}/oauth/revoke</code> - Token Revocation
                </div>
              </section>

              {/* Claude Web Integration */}
              <section className="info-section">
                <h3>🌐 Claude Web Integration</h3>
                <p>Connect this MCP server to Claude as a custom connector:</p>
                <ol className="info-list">
                  <li>Deploy with <code>OAUTH_ENABLED=true</code> and a public HTTPS URL</li>
                  <li>In Claude Web → Settings → Custom Connectors → Add New</li>
                  <li>Enter Server URL: <code>{apiBaseUrl}/mcp</code></li>
                  <li>Click "Connect" - OAuth flow handles authentication automatically</li>
                  <li>Approve access on the consent screen</li>
                </ol>
                <div className="info-detail">
                  <strong>Requirements:</strong><br/>
                  • HTTPS (required for OAuth)<br/>
                  • <code>OAUTH_ENABLED=true</code> in environment<br/>
                  • <code>OAUTH_JWT_SECRET</code> configured<br/>
                  • Claude Pro/Team/Enterprise account
                </div>
              </section>

              {/* Request Examples */}
              <section className="info-section">
                <h3>📝 Request Examples</h3>
                <div className="example-block">
                  <h4>Create Article (REST)</h4>
                  <div className="info-code">
                    <pre>{`curl -X POST ${apiBaseUrl}/api/articles \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"New Article","content":"# Content"}'`}</pre>
                  </div>
                </div>
                <div className="example-block">
                  <h4>List Articles (MCP)</h4>
                  <div className="info-code">
                    <pre>{`{
  "method": "tools/call",
  "params": {
    "name": "listArticles",
    "arguments": {}
  }
}`}</pre>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
