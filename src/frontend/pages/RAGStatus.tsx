import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface RAGStatusData {
  enabled: boolean;
  totalChunks: number;
  indexedArticles: number;
  totalArticles: number;
  unindexedFiles: string[];
  indexedFiles: Array<{ filename: string; chunks: number }>;
  message?: string;
}

interface RAGStatusProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function RAGStatus({ token, onNavigate }: RAGStatusProps) {
  const [status, setStatus] = useState<RAGStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState('');

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiClient.get('/api/rag/status', token);

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        setError('Failed to load RAG status');
      }
    } catch (err) {
      setError('Failed to load RAG status');
    } finally {
      setLoading(false);
    }
  };

  const handleReindexAll = async () => {
    if (!confirm('This will rebuild the entire index. This may take several minutes. Continue?')) {
      return;
    }

    try {
      setIndexing(true);
      setIndexMessage('Rebuilding index...');
      setError('');
      
      const response = await apiClient.post('/api/rag/reindex', undefined, token);

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setIndexMessage(`Successfully indexed ${data.indexedArticles} articles with ${data.totalChunks} chunks`);
        setTimeout(() => setIndexMessage(''), 5000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to rebuild index');
      }
    } catch (err) {
      setError('Failed to rebuild index');
    } finally {
      setIndexing(false);
    }
  };

  const handleIndexUnindexed = async () => {
    if (!status || status.unindexedFiles.length === 0) {
      return;
    }

    if (!confirm(`This will index ${status.unindexedFiles.length} unindexed articles. Continue?`)) {
      return;
    }

    try {
      setIndexing(true);
      setIndexMessage('Indexing unindexed articles...');
      setError('');
      
      const response = await apiClient.post('/api/rag/index-unindexed', undefined, token);

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setIndexMessage(`Successfully indexed ${data.indexed} articles. ${data.failed.length} failed.`);
        if (data.failed.length > 0) {
          setError(`Failed to index: ${data.failed.join(', ')}`);
        }
        setTimeout(() => setIndexMessage(''), 5000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to index articles');
      }
    } catch (err) {
      setError('Failed to index articles');
    } finally {
      setIndexing(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="loading">Loading RAG status...</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="page">
        <div className="error-message">{error || 'Failed to load status'}</div>
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>RAG Status</h1>
          <button className="button" onClick={() => onNavigate('/')}>
            ← Back to Articles
          </button>
        </div>
        <div className="rag-status-disabled">
          <p>Semantic search is not enabled.</p>
          <p>To enable, set <code>SEMANTIC_SEARCH_ENABLED=true</code> in your environment.</p>
        </div>
      </div>
    );
  }

  const indexedPercentage = status.totalArticles > 0 
    ? Math.round((status.indexedArticles / status.totalArticles) * 100)
    : 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1>RAG Status</h1>
        <button className="button" onClick={() => onNavigate('/')}>
          ← Back to Articles
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {indexMessage && <div className="success-message">{indexMessage}</div>}

      <div className="rag-status-container">
        <div className="rag-stats-grid">
          <div className="rag-stat-card">
            <div className="rag-stat-value">{status.totalChunks}</div>
            <div className="rag-stat-label">Total Chunks</div>
          </div>
          
          <div className="rag-stat-card">
            <div className="rag-stat-value">{status.indexedArticles} / {status.totalArticles}</div>
            <div className="rag-stat-label">Indexed Articles</div>
          </div>
          
          <div className="rag-stat-card">
            <div className="rag-stat-value">{indexedPercentage}%</div>
            <div className="rag-stat-label">Index Coverage</div>
          </div>
          
          <div className="rag-stat-card">
            <div className="rag-stat-value">{status.unindexedFiles.length}</div>
            <div className="rag-stat-label">Unindexed Files</div>
          </div>
        </div>

        <div className="rag-actions">
          <button
            className="button button-primary"
            onClick={handleReindexAll}
            disabled={indexing}
          >
            {indexing ? 'Indexing...' : '🔄 Re-index All Articles'}
          </button>
          
          <button
            className="button button-secondary"
            onClick={handleIndexUnindexed}
            disabled={indexing || status.unindexedFiles.length === 0}
          >
            {indexing ? 'Indexing...' : `📝 Index Unindexed (${status.unindexedFiles.length})`}
          </button>
        </div>

        {status.unindexedFiles.length > 0 && (
          <div className="rag-section">
            <h2>Unindexed Articles</h2>
            <div className="rag-file-list">
              {status.unindexedFiles.map(filename => (
                <div key={filename} className="rag-file-item unindexed">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{filename}</span>
                  <span className="file-status">Not indexed</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {status.indexedFiles.length > 0 && (
          <div className="rag-section">
            <h2>Indexed Articles</h2>
            <div className="rag-file-list">
              {status.indexedFiles.map(file => (
                <div key={file.filename} className="rag-file-item indexed">
                  <span className="file-icon">✓</span>
                  <span className="file-name">{file.filename}</span>
                  <span className="file-chunks">{file.chunks} chunks</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
