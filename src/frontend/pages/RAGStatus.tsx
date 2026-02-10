import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface RAGStatusData {
  enabled: boolean;
  totalChunks: number;
  indexedArticles: number;
  totalArticles: number;
  noRagArticles: number;
  unindexedFiles: string[];
  message?: string;
}

interface QueueError {
  id: string;
  slug: string;
  operation: string;
  errorMessage: string;
  completedAt: string;
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
  recentErrors?: QueueError[];
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
        setIndexMessage(data.message || `Successfully queued ${data.queuedTasks} articles for reindexing`);
        
        // Force reload queue status immediately
        await loadQueueStatus(false);
        
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Optional: show a small toast or visual feedback
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleDeleteError = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this error record?')) {
      return;
    }

    try {
      const response = await apiClient.delete(`/api/queue/tasks/${taskId}`, token);
      if (response.ok) {
        loadQueueStatus(false);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete task');
      }
    } catch (err) {
      console.error('Error deleting task:', err);
      setError('Failed to delete task');
    }
  };

  const handleClearAllErrors = async () => {
    if (!confirm('Are you sure you want to clear ALL failed tasks? This cannot be undone.')) {
      return;
    }

    try {
      const response = await apiClient.delete('/api/queue/tasks/failed', token);
      if (response.ok) {
        loadQueueStatus(false);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to clear errors');
      }
    } catch (err) {
      console.error('Error clearing errors:', err);
      setError('Failed to clear errors');
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

          <div className="rag-stat-card">
            <div className="rag-stat-value">{status.noRagArticles}</div>
            <div className="rag-stat-label">No RAG Articles</div>
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

            {/* Recent Errors Section */}
            {queueStatus.recentErrors && queueStatus.recentErrors.length > 0 && (
              <div className="rag-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ marginBottom: 0 }}>Recent Errors</h2>
                  <button
                    className="button button-danger"
                    onClick={handleClearAllErrors}
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                  >
                    🗑️ Clear All Errors
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="tokens-table" style={{ fontSize: '0.9rem' }}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Article</th>
                        <th>Operation</th>
                        <th style={{ width: '40%' }}>Error</th>
                        <th style={{ width: '100px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueStatus.recentErrors.map(error => (
                        <tr key={error.id}>
                          <td>{new Date(error.completedAt).toLocaleString()}</td>
                          <td>{error.slug}</td>
                          <td>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--bg-tertiary)',
                              fontSize: '0.8rem'
                            }}>
                              {error.operation}
                            </span>
                          </td>
                          <td style={{
                            fontFamily: 'monospace',
                            color: 'var(--danger-color)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                            {error.errorMessage}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button
                                className="icon-button"
                                onClick={() => copyToClipboard(error.errorMessage)}
                                title="Copy error message"
                                aria-label="Copy error message"
                              >
                                📋
                              </button>
                              <button
                                className="icon-button"
                                onClick={() => handleDeleteError(error.id)}
                                title="Delete error"
                                aria-label="Delete error"
                                style={{ color: 'var(--danger-color)' }}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
      </div>
    </div>
  );
}
