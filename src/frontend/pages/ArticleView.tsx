import React, { useState, useEffect, useRef } from 'react';
import { MarkdownView } from '../components/MarkdownView';
import { useFullscreen } from '../hooks/useFullscreen';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { apiClient } from '../utils/apiClient';
import { getRuntimeConfig } from '../utils/runtimeConfig';

interface Article {
  filename: string;
  title: string;
  content: string;
  created: string;
  isPublic: boolean;
  modifiedBy?: string;
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
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyTtsFeedback, setCopyTtsFeedback] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsCopying, setTtsCopying] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const articleContentRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const { toggleFullscreen, wakeLockActive } = useFullscreen();
  const ttsEnabled = getRuntimeConfig().ttsEnabled;

  // Update document title when article is loaded
  useDocumentTitle(article?.title);

  const loadArticle = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/articles/${filename}.md`, token);

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
      const response = await apiClient.get(`/api/articles/${filename}.md/versions`, token);

      if (response.ok) {
        const data = await response.json();
        setVersions(data);
      }
    } catch (err) {
      console.error('Failed to load versions:', err);
    }
  };

  useEffect(() => {
    loadArticle();
    loadVersions();
  }, [filename]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const loadVersion = async (versionId: string, index: number) => {
    try {
      setLoadingVersion(true);
      const response = await apiClient.get(`/api/articles/${filename}.md/versions/${versionId}`, token);

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
      const response = await apiClient.put(`/api/articles/${filename}.md/versions/${currentVersion.versionId}/restore`, {
        message: `Restored from ${currentVersion.versionId}`
      }, token);

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
      const response = await apiClient.delete(`/api/articles/${filename}.md/versions`, token);

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
      const response = await apiClient.delete(`/api/articles/${filename}.md`, token);

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

  const handleCopySlug = async () => {
    if (!article) return;

    // Format: "Read article 'Article Title' (filename.md)"
    const copyText = `Read article '${article.title}' (${filename}.md)`;

    try {
      await navigator.clipboard.writeText(copyText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const clearAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setIsPlayingTts(false);
  };

  const handleCopyForTts = async () => {
    if (!article) return;

    try {
      setTtsCopying(true);
      setTtsError('');

      const response = await apiClient.post('/api/tts/preprocess', {
        content: article.content
      }, token);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to prepare article text for TTS');
      }

      const data = await response.json();
      await navigator.clipboard.writeText(data.text);
      setCopyTtsFeedback(true);
      setTimeout(() => setCopyTtsFeedback(false), 2000);
    } catch (err) {
      setTtsError(err instanceof Error ? err.message : 'Failed to prepare article text for TTS');
    } finally {
      setTtsCopying(false);
    }
  };

  const handleStopTts = () => {
    clearAudioPlayback();
  };

  const handleReadArticle = async () => {
    if (!article) return;

    try {
      setTtsLoading(true);
      setTtsError('');
      clearAudioPlayback();

      const response = await apiClient.post('/api/tts/audio', {
        content: article.content
      }, token);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate audio');
      }

      const audioBlob = await response.blob();
      if (!audioBlob.size) {
        throw new Error('Speech service returned empty audio');
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioUrlRef.current = audioUrl;
      audioRef.current = audio;

      audio.onended = () => {
        clearAudioPlayback();
      };

      audio.onerror = () => {
        setTtsError('Audio playback failed');
        clearAudioPlayback();
      };

      await audio.play();
      setIsPlayingTts(true);
    } catch (err) {
      clearAudioPlayback();
      setTtsError(err instanceof Error ? err.message : 'Failed to play audio');
    } finally {
      setTtsLoading(false);
    }
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="button button-secondary" onClick={() => onNavigate('/')}>
            ← Back
          </button>
          <button
            className="button button-secondary"
            onClick={handleCopySlug}
            title={`Copy article reference '${article.title}' (${filename}.md)`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {copyFeedback ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
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

      <article className="article-content" ref={articleContentRef}>
        <div className="article-item-header">
          <div className="article-header-with-version">
            <h1 className="article-item-title">{article.title}</h1>
            {isViewingHistory && currentVersion && (
              <span className="version-pill" title={currentVersion.message || ''}>
                {currentVersion.versionId}
              </span>
            )}
          </div>
          <div className="article-meta-controls">
            {ttsEnabled && (
              <>
                <button
                  className="button button-secondary"
                  onClick={handleCopyForTts}
                  disabled={ttsCopying || ttsLoading}
                  title="Copy speech-ready text"
                >
                  {copyTtsFeedback ? '✓ TTS Copied!' : ttsCopying ? 'Preparing...' : 'Copy for TTS'}
                </button>
                {isPlayingTts ? (
                  <button
                    className="button button-secondary"
                    onClick={handleStopTts}
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    className="button button-secondary"
                    onClick={handleReadArticle}
                    disabled={ttsLoading}
                  >
                    {ttsLoading ? 'Reading...' : 'Read'}
                  </button>
                )}
              </>
            )}
            {article.isPublic && !isViewingHistory && (
              <a
                href={`/public-article/${filename}`}
                className="public-link"
                title="View public page"
              >
                Public 🔗
              </a>
            )}
            <button
              className="icon-button fullscreen-button"
              onClick={() => articleContentRef.current && toggleFullscreen(articleContentRef.current)}
              title="Fullscreen"
            >
              Fullscreen 🖥️
            </button>
            {wakeLockActive && (
              <span title="Screen wake lock active" className="wake-lock-indicator">
                🔆
              </span>
            )}
            <span className="article-item-date">
              {formatDate(article.created)}
              {isViewingHistory && currentVersion && (
                <> • Version from {formatDate(currentVersion.createdAt)}</>
              )}
              {!isViewingHistory && article.modifiedBy && (
                <> • Edited by {article.modifiedBy}</>
              )}
            </span>
          </div>
          {ttsError && (
            <div className="error-message" style={{ marginTop: '8px' }}>
              {ttsError}
            </div>
          )}
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
