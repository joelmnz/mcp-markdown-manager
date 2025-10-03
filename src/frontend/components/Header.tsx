import React, { useState } from 'react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onLogout: () => void;
}

export function Header({ theme, onThemeToggle, onLogout }: HeaderProps) {
  const [showInfo, setShowInfo] = useState(false);
  const apiBaseUrl = window.location.origin;
  
  const mcpConfig = {
    "mcpServers": {
      "article-manager": {
        "url": `${apiBaseUrl}/mcp`,
        "transport": {
          "type": "http",
          "headers": {
            "Authorization": "Bearer YOUR_AUTH_TOKEN_HERE"
          }
        }
      }
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        <a href="/" className="header-title">Article Manager</a>
        <div className="header-actions">
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
                <p>Connect AI agents using the Model Context Protocol (HTTP streaming):</p>
                <div className="info-code">
                  <pre>{JSON.stringify(mcpConfig, null, 2)}</pre>
                </div>
                <div className="info-detail">
                  <strong>Endpoint:</strong> <code>{apiBaseUrl}/mcp</code><br/>
                  <strong>Method:</strong> POST<br/>
                  <strong>Auth:</strong> Bearer Token (required)
                </div>
              </section>

              {/* MCP Tools */}
              <section className="info-section">
                <h3>🔧 Available MCP Tools</h3>
                <ul className="info-list">
                  <li><code>listArticles</code> - List all articles</li>
                  <li><code>searchArticles</code> - Search by title (query param)</li>
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
                  <span className="api-desc">Search articles</span>
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
                <p>All endpoints require Bearer token authentication:</p>
                <div className="info-code">
                  <pre>Authorization: Bearer YOUR_AUTH_TOKEN</pre>
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
