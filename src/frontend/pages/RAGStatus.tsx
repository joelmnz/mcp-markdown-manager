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

interface QueueStatusData {
  enabled: boolean;
  stats: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  };
  tasksByPriority: Record<string, number>;
  tasksByOperation: Record<string, number>;
  recentActivity: {
    tasksCompletedLast24h: number;
    tasksFailedLast24h: number;
    averageProcessingTime: number | null;
  };
  health: {
    isHealthy: boolean;
    totalTasks: number;
    oldestPendingTask?: string;
    failedTasksLast24h: number;
    averageProcessingTime?: number;
    issues: string[];
  };
  message?: string;
  error?: string;
}

interface RAGStatusProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function RAGStatus({ token, onNavigate }: RAGStatusProps) {
  const [status, setStatus] = useState<RAGStatusData | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState('');
  const [importStatus, setImportStatus] = useState<{ dataDirAvailable: boolean } | null>(null);

  useEffect(() => {
    loadStatus();
    // Poll for queue updates every 5 seconds if there are pending operations
    const intervalId = setInterval(() => {
      if (queueStatus && (queueStatus.stats.pending > 0 || queueStatus.stats.processing > 0)) {
        loadQueueStatus(false); // Silent update
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [queueStatus?.stats?.pending, queueStatus?.stats?.processing]);

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    await Promise.all([loadIndexStatus(), loadQueueStatus(true), loadImportStatus()]);
    setLoading(false);
  };

  const loadImportStatus = async () => {
    try {
      const response = await apiClient.get('/api/import/status', token);
      if (response.ok) {
        const data = await response.json();
        setImportStatus(data);
      }
    } catch (err) {
      console.error('Failed to load import status:', err);
    }
  };

  const loadIndexStatus = async () => {
    try {
      const response = await apiClient.get('/api/rag/status', token);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        console.error('Failed to load RAG status');
      }
    } catch (err) {
      console.error('Failed to load RAG status:', err);
    }
  };

  const loadQueueStatus = async (showLoading: boolean) => {
    try {
      const response = await apiClient.get('/api/queue/status', token);
      if (response.ok) {
        const data = await response.json();
        setQueueStatus(data);
      } else {
        console.error('Failed to load Queue status');
      }
    } catch (err) {
      console.error('Failed to load Queue status:', err);
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
        <div style={{ display: 'flex', gap: '1rem' }}>
          {importStatus?.dataDirAvailable && (
            <button className="button" onClick={() => onNavigate('/import-files')} style={{ backgroundColor: 'var(--text-secondary)' }}>
              Import from Disk
            </button>
          )}
          <button className="button" onClick={() => onNavigate('/')}>
            ← Back to Articles
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {indexMessage && <div className="success-message">{indexMessage}</div>}

      <div className="rag-status-container">
        {/* Index Statistics Section */}
        <h2 style={{ marginTop: 0 }}>Index Statistics</h2>
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

        {/* Queue Statistics Section */}
        {queueStatus && queueStatus.enabled && (
          <>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              Embedding Queue
              {queueStatus?.health?.isHealthy ? (
                <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '12px', background: '#dacfec', color: '#5b21b6' }}>Healthy</span>
              ) : (
                <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '12px', background: '#fee2e2', color: '#991b1b' }}>Issues Detected</span>
              )}
            </h2>

            {queueStatus.health && queueStatus.health.issues.length > 0 && (
              <div className="error-message" style={{ margin: '0 0 1rem 0' }}>
                <strong>Health Issues:</strong>
                <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
                  {queueStatus.health.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rag-stats-grid">
              <div className="rag-stat-card">
                <div className="rag-stat-value">{queueStatus.stats.pending}</div>
                <div className="rag-stat-label">Pending Tasks</div>
              </div>

              <div className="rag-stat-card">
                <div className="rag-stat-value">{queueStatus.stats.processing}</div>
                <div className="rag-stat-label">Processing</div>
              </div>

              <div className="rag-stat-card">
                <div className="rag-stat-value">{queueStatus.stats.failed}</div>
                <div className="rag-stat-label">Failed Tasks</div>
              </div>

              <div className="rag-stat-card">
                <div className="rag-stat-value">{queueStatus.recentActivity.tasksCompletedLast24h}</div>
                <div className="rag-stat-label">Completed (24h)</div>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px' }}>
                <h3>By Priority</h3>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div>High: <strong>{queueStatus.tasksByPriority.high || 0}</strong></div>
                  <div>Normal: <strong>{queueStatus.tasksByPriority.normal || 0}</strong></div>
                  <div>Low: <strong>{queueStatus.tasksByPriority.low || 0}</strong></div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px' }}>
                <h3>Performance</h3>
                <div>Avg processing time (24h): <strong>{queueStatus.recentActivity.averageProcessingTime
                  ? `${queueStatus.recentActivity.averageProcessingTime.toFixed(2)}s`
                  : 'N/A'}</strong>
                </div>
              </div>
            </div>
          </>
        )}

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
