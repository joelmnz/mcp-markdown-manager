import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';

interface ImageRecord {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
  created_by?: string;
}

interface AuditResult {
  missingFiles: ImageRecord[];
  orphanedFiles: string[];
}

interface AdminImagesProps {
  token: string;
}

export function AdminImages({ token }: AdminImagesProps) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/images?limit=100', token);
      if (response.ok) {
        const data = await response.json();
        setImages(data.images);
      } else {
        setError('Failed to load images');
      }
    } catch (err) {
      setError('Error loading images');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiClient.delete(`/api/images/${filename}`, token);
      if (response.ok) {
        setImages(images.filter(img => img.filename !== filename));
      } else {
        setError('Failed to delete image');
      }
    } catch (err) {
      setError('Error deleting image');
    }
  };

  const handleAudit = async () => {
    try {
      setAuditing(true);
      setError('');
      const response = await apiClient.get('/api/admin/images/audit', token);
      if (response.ok) {
        const data = await response.json();
        setAuditResult(data);
      } else {
        setError('Failed to audit images');
      }
    } catch (err) {
      setError('Error auditing images');
    } finally {
      setAuditing(false);
    }
  };

  const handleCleanup = async () => {
    if (!auditResult?.orphanedFiles.length) return;

    if (!confirm(`Are you sure you want to delete ${auditResult.orphanedFiles.length} orphaned files?`)) {
      return;
    }

    try {
      setCleaning(true);
      const response = await apiClient.post('/api/admin/images/cleanup', {
        filenames: auditResult.orphanedFiles
      }, token);

      if (response.ok) {
        const data = await response.json();
        alert(`Successfully cleaned up ${data.count} files`);
        setAuditResult(null); // Clear audit result
        loadImages(); // Reload list
      } else {
        setError('Failed to cleanup images');
      }
    } catch (err) {
      setError('Error cleaning up images');
    } finally {
      setCleaning(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading && !images.length) {
    return <div className="page"><div className="loading">Loading images...</div></div>;
  }

  return (
    <div className="page">
      <h1>Image Administration</h1>

      {error && <div className="error-message">{error}</div>}

      <div className="admin-actions" style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button
          className="button"
          onClick={loadImages}
          disabled={loading}
        >
          Refresh List
        </button>
        <button
          className="button"
          onClick={handleAudit}
          disabled={auditing}
        >
          {auditing ? 'Auditing...' : 'Audit Images'}
        </button>
      </div>

      {auditResult && (
        <div className="audit-results" style={{ marginBottom: '30px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <h3>Audit Results</h3>

          <div className="audit-section">
            <h4>Missing Files (Database record exists, file missing)</h4>
            {auditResult.missingFiles.length === 0 ? (
              <p>No missing files found.</p>
            ) : (
              <ul>
                {auditResult.missingFiles.map(img => (
                  <li key={img.id}>{img.filename} ({img.original_name})</li>
                ))}
              </ul>
            )}
          </div>

          <div className="audit-section">
            <h4>Orphaned Files (File exists, no database record)</h4>
            {auditResult.orphanedFiles.length === 0 ? (
              <p>No orphaned files found.</p>
            ) : (
              <div>
                <ul>
                  {auditResult.orphanedFiles.map(file => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
                <button
                  className="button button-danger"
                  onClick={handleCleanup}
                  disabled={cleaning}
                  style={{ marginTop: '10px' }}
                >
                  {cleaning ? 'Cleaning...' : 'Delete All Orphans'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="image-list">
        <h3>All Images ({images.length})</h3>
        <div className="table-responsive">
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Preview</th>
                <th>Original Name</th>
                <th>Filename</th>
                <th>Size</th>
                <th>Type</th>
                <th>Uploaded</th>
                <th>By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {images.map(img => (
                <tr key={img.id}>
                  <td>
                    <a href={`/api/images/${img.filename}`} target="_blank" rel="noopener noreferrer">
                      <img
                        src={`/api/images/${img.filename}`}
                        alt={img.original_name}
                        style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }}
                      />
                    </a>
                  </td>
                  <td>{img.original_name}</td>
                  <td className="monospace">{img.filename}</td>
                  <td>{formatSize(img.size)}</td>
                  <td>{img.mime_type}</td>
                  <td>{formatDate(img.created_at)}</td>
                  <td>{img.created_by || '-'}</td>
                  <td>
                    <button
                      className="button button-small button-danger"
                      onClick={() => handleDelete(img.filename)}
                      title="Delete image"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
