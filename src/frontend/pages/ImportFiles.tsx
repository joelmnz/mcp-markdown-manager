import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface ImportStatus {
  phase: 'idle' | 'scanning' | 'validating' | 'importing' | 'completed' | 'error';
  processed: number;
  total: number;
  currentFile?: string;
  dataDirAvailable: boolean;
  dataDir: string;
  result?: {
    imported?: number;
    skipped?: number;
    totalFiles?: number;
    conflicts?: any[];
    errors?: any[];
  };
  error?: string;
}

interface ImportFilesProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function ImportFiles({ token, onNavigate }: ImportFilesProps) {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStatus();
    const interval = setInterval(() => {
      if (status?.phase === 'importing' || status?.phase === 'validating') {
        loadStatus(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [status?.phase]);

  const loadStatus = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await apiClient.get('/api/import/status', token);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        setError('Failed to load import status');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleValidate = async () => {
    setLoading(true);
    try {
      const response = await apiClient.post('/api/import/validate', {}, token);
      if (response.ok) {
        await loadStatus();
      } else {
        const data = await response.json();
        setError(data.error || 'Validation failed');
      }
    } catch (err) {
      setError('Failed to start validation');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      const response = await apiClient.post('/api/import/start', {}, token);
      if (response.ok) {
        // Status update will be picked up by polling
        setStatus(prev => prev ? { ...prev, phase: 'importing' } : null);
      } else {
        const data = await response.json();
        setError(data.error || 'Import failed to start');
      }
    } catch (err) {
      setError('Failed to start import');
    }
  };

  if (loading && !status) {
    return <div className="loading">Loading import status...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!status?.dataDirAvailable) {
    return (
      <div className="import-container">
        <h2>Import from Disk</h2>
        <div className="warning-box">
          <p>Data directory not found at <code>{status?.dataDir}</code>.</p>
          <p>Please ensure you have mounted your data directory to the container.</p>
        </div>
        <button onClick={() => onNavigate('/')}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className="import-container">
      <div className="header-actions">
        <button className="back-button" onClick={() => onNavigate('/rag-status')}>
          ← Back to Status
        </button>
        <h2>Import from Disk</h2>
      </div>

      <div className="status-card">
        <p>Source Directory: <code>{status.dataDir}</code></p>
        <p>Status: <strong>{status.phase}</strong></p>
      </div>

      {status.phase === 'idle' && !status.result && (
        <div className="action-card">
          <p>Scan the directory to find markdown files available for import.</p>
          <button className="primary-button" onClick={handleValidate}>
            Scan Files
          </button>
        </div>
      )}

      {status.phase === 'validating' && (
        <div className="progress-card">
          <p>Scanning files...</p>
          <div className="spinner"></div>
        </div>
      )}

      {status.phase === 'idle' && status.result && (
        <div className="results-card">
          <h3>Scan Results</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <label>Total Files</label>
              <span>{status.result.totalFiles}</span>
            </div>
            <div className="stat-item">
              <label>Conflicts</label>
              <span>{status.result.conflicts?.length || 0}</span>
            </div>
            <div className="stat-item">
              <label>Errors</label>
              <span>{status.result.errors?.length || 0}</span>
            </div>
          </div>

          {status.result.conflicts && status.result.conflicts.length > 0 && (
            <div className="conflicts-list">
              <h4>Conflicts (will be skipped)</h4>
              <ul>
                {status.result.conflicts.slice(0, 5).map((c: any, i: number) => (
                  <li key={i}>{c.sourceFilename} (Title: {c.existingTitle})</li>
                ))}
                {status.result.conflicts.length > 5 && (
                  <li>...and {status.result.conflicts.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {status.result.errors && status.result.errors.length > 0 && (
            <div className="conflicts-list" style={{ borderLeft: '4px solid var(--danger-color)' }}>
              <h4 style={{ color: 'var(--danger-color)' }}>Errors</h4>
              <ul>
                {status.result.errors.map((e: any, i: number) => (
                  <li key={i}>
                    <strong>{e.sourceFilename}</strong>: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="actions">
            <button className="secondary-button" onClick={handleValidate}>
              Rescan
            </button>
            <button className="primary-button" onClick={handleImport}>
              Start Import
            </button>
          </div>
        </div>
      )}

      {status.phase === 'importing' && (
        <div className="progress-card">
          <h3>Importing...</h3>
          <progress value={status.processed} max={status.total}></progress>
          <p>{status.processed} / {status.total} files processed</p>
          {status.currentFile && <p className="current-file">Processing: {status.currentFile}</p>}
        </div>
      )}

      {status.phase === 'completed' && status.result && (
        <div className="completion-card">
          <h3>Import Completed</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <label>Imported</label>
              <span>{status.result.imported}</span>
            </div>
            <div className="stat-item">
              <label>Skipped</label>
              <span>{status.result.skipped}</span>
            </div>
            <div className="stat-item">
              <label>Errors</label>
              <span>{status.result.errors?.length || 0}</span>
            </div>
          </div>

          {status.result.errors && status.result.errors.length > 0 && (
            <div className="conflicts-list" style={{ borderLeft: '4px solid var(--danger-color)' }}>
              <h4 style={{ color: 'var(--danger-color)' }}>Errors</h4>
              <ul>
                {status.result.errors.map((e: any, i: number) => (
                  <li key={i}>
                    <strong>{e.sourceFilename}</strong>: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button className="primary-button" onClick={() => onNavigate('/')}>
            Go to Home
          </button>
        </div>
      )}
      
      {status.phase === 'error' && (
        <div className="error-card">
          <h3>Import Failed</h3>
          <p>{status.error}</p>
          <button onClick={handleValidate}>Try Again</button>
        </div>
      )}
    </div>
  );
}
