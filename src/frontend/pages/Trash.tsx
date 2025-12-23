import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { buildRouteUrl } from '../utils/urlBuilder';

interface TrashArticle {
  filename: string;
  title: string;
  folder?: string;
  deletedAt?: string;
  slug: string;
}

export function Trash() {
  const [articles, setArticles] = useState<TrashArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/trash');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load trash');
      }
      const data = await response.json();
      setArticles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const handleRestore = async (filename: string, title: string) => {
    if (!confirm(`Are you sure you want to restore "${title}"?`)) {
      return;
    }

    try {
      const response = await apiClient.post(`/api/articles/${filename}/restore`, {});
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to restore article');
      }
      
      setSuccessMessage(`Successfully restored "${title}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // Reload trash after restore
      await loadTrash();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore article');
    }
  };

  const handlePermanentDelete = async (filename: string, title: string) => {
    if (!confirm(`⚠️ PERMANENT DELETE\n\nAre you sure you want to permanently delete "${title}"?\n\nThis action CANNOT be undone!`)) {
      return;
    }

    try {
      const response = await apiClient.delete(`/api/articles/${filename}/permanent`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete article');
      }
      
      setSuccessMessage(`Permanently deleted "${title}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // Reload trash after deletion
      await loadTrash();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete article');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="page-container">
        <h1>🗑️ Trash</h1>
        <div className="loading">Loading trash...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1>🗑️ Trash</h1>
      
      {error && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="success-message" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px', color: '#155724' }}>
          {successMessage}
        </div>
      )}

      {articles.length === 0 ? (
        <div className="empty-state">
          <p>Trash is empty</p>
          <p style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>
            Deleted articles will appear here and can be restored or permanently deleted.
          </p>
        </div>
      ) : (
        <div className="trash-container">
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            {articles.length} {articles.length === 1 ? 'article' : 'articles'} in trash
          </p>
          
          <div className="trash-table">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Title</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Original Folder</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Deleted Date</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.filename} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <strong>{article.title}</strong>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                      {article.folder || '/'}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                      {formatDate(article.deletedAt)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleRestore(article.filename, article.title)}
                          className="btn btn-primary"
                          style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                        >
                          ↻ Restore
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(article.filename, article.title)}
                          className="btn btn-danger"
                          style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                        >
                          ✕ Delete Permanently
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
    </div>
  );
}
