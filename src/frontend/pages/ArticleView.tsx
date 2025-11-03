import React, { useState, useEffect } from 'react';
import { MarkdownView } from '../components/MarkdownView';

interface Article {
  filename: string;
  title: string;
  content: string;
  created: string;
}

interface VersionMetadata {
  versionId: string;
  createdAt: string;
  message?: string;
  hash: string;
  size: number;
  filename: string;
}

interface ArticleViewProps {
  filename: string;
  token: string;
  onNavigate: (path: string) => void;
}

export function ArticleView({ filename, token, onNavigate }: ArticleViewProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [versions, setVersions] = useState<VersionMetadata[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1); // -1 means current version
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadArticle();
    loadVersions();
  }, [filename]);

  const loadArticle = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/articles/${filename}.md`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setArticle(data);
        setCurrentVersionIndex(-1); // Reset to current version
      } else {
        setError('Article not found');
      }
    } catch (err) {
      setError('Failed to load article');
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async () => {
    try {
      const response = await fetch(`/api/articles/${filename}.md/versions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setVersions(data);
      }
    } catch (err) {
      console.error('Failed to load versions:', err);
    }
  };

  const loadVersion = async (versionId: string, index: number) => {
    try {
      setLoadingVersion(true);
      const response = await fetch(`/api/articles/${filename}.md/versions/${versionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setArticle(data);
        setCurrentVersionIndex(index);
      } else {
        setError('Failed to load version');
      }
    } catch (err) {
      setError('Failed to load version');
    } finally {
      setLoadingVersion(false);
    }
  };

  const handleNavigateBack = () => {
    if (currentVersionIndex === -1) {
      // At current version, go to first historical version (newest in history)
      if (versions.length > 0) {
        loadVersion(versions[0].versionId, 0);
      }
    } else if (currentVersionIndex < versions.length - 1) {
      // Navigate to next older version (higher index since sorted newest first)
      loadVersion(versions[currentVersionIndex + 1].versionId, currentVersionIndex + 1);
    }
  };

  const handleNavigateForward = () => {
    if (currentVersionIndex === 0) {
      // At newest historical version, go back to current version
      loadArticle();
    } else if (currentVersionIndex > 0) {
      // Navigate to next newer version (lower index since sorted newest first)
      loadVersion(versions[currentVersionIndex - 1].versionId, currentVersionIndex - 1);
    }
  };

  const handleRestore = async () => {
    if (currentVersionIndex === -1) return;

    const currentVersion = versions[currentVersionIndex];
    if (!confirm(`Are you sure you want to restore to ${currentVersion.versionId}?`)) {
      return;
    }

    try {
      setRestoring(true);
      const response = await fetch(`/api/articles/${filename}.md/versions/${currentVersion.versionId}/restore`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Restored from ${currentVersion.versionId}`
        })
      });

      if (response.ok) {
        // Reload article and versions
        await loadArticle();
        await loadVersions();
      } else {
        setError('Failed to restore version');
      }
    } catch (err) {
      setError('Failed to restore version');
    } finally {
      setRestoring(false);
    }
  };

  const handleDeleteVersions = async () => {
    if (!confirm('Are you sure you want to delete all version history? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/articles/${filename}.md/versions`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setVersions([]);
        setCurrentVersionIndex(-1);
        loadArticle();
      } else {
        setError('Failed to delete versions');
      }
    } catch (err) {
      setError('Failed to delete versions');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this article?')) {
      return;
    }

    try {
      setDeleting(true);
      const response = await fetch(`/api/articles/${filename}.md`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        onNavigate('/');
      } else {
        setError('Failed to delete article');
      }
    } catch (err) {
      setError('Failed to delete article');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isViewingHistory = currentVersionIndex !== -1;
  const canNavigateBack = currentVersionIndex === -1 ? versions.length > 0 : currentVersionIndex < versions.length - 1;
  const canNavigateForward = currentVersionIndex > -1;
  const currentVersion = currentVersionIndex >= 0 ? versions[currentVersionIndex] : null;

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  if (error || !article) {
    return (
      <div className="page">
        <div className="error-message">{error || 'Article not found'}</div>
        <button className="button" onClick={() => onNavigate('/')}>
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="article-header">
        <button className="button button-secondary" onClick={() => onNavigate('/')}>
          ← Back
        </button>
        <div className="article-actions">
          {versions.length > 0 && (
            <>
              <button 
                className="button button-secondary"
                onClick={handleNavigateBack}
                disabled={!canNavigateBack || loadingVersion}
                title="View older version"
              >
                ← Older
              </button>
              <button 
                className="button button-secondary"
                onClick={handleNavigateForward}
                disabled={!canNavigateForward || loadingVersion}
                title="View newer version"
              >
                Newer →
              </button>
            </>
          )}
          {isViewingHistory && (
            <button 
              className="button button-primary"
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? 'Restoring...' : 'Restore This Version'}
            </button>
          )}
          {!isViewingHistory && (
            <>
              <button 
                className="button"
                onClick={() => onNavigate(`/edit/${filename}`)}
              >
                Edit
              </button>
              {versions.length > 0 && (
                <button 
                  className="button button-secondary"
                  onClick={handleDeleteVersions}
                >
                  Clear History
                </button>
              )}
              <button 
                className="button button-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </>
          )}
        </div>
      </div>

      <article className="article-content">
        <div className="article-item-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 className="article-item-title">{article.title}</h1>
            {isViewingHistory && currentVersion && (
              <span className="version-pill" title={currentVersion.message || ''}>
                {currentVersion.versionId}
              </span>
            )}
          </div>
          <span className="article-item-date">
            {formatDate(article.created)}
            {isViewingHistory && currentVersion && (
              <> • Version from {formatDate(currentVersion.createdAt)}</>
            )}
          </span>
        </div>
        {isViewingHistory && currentVersion?.message && (
          <div className="version-message">
            Version message: {currentVersion.message}
          </div>
        )}
        <div className="markdown-content">
          <MarkdownView content={article.content} />
        </div>
      </article>
    </div>
  );
}
