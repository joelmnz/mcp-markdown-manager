import React, { useState, useEffect } from 'react';
import { lint } from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';
import { MarkdownView } from '../components/MarkdownView';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { apiClient } from '../utils/apiClient';

interface ArticleEditProps {
  filename?: string;
  token: string;
  onNavigate: (path: string) => void;
}

export function ArticleEdit({ filename, token, onNavigate }: ArticleEditProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linting, setLinting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const isNew = !filename;

  useEffect(() => {
    if (filename) {
      loadArticle();
    }
  }, [filename]);

  const loadArticle = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/articles/${filename}.md`, token);

      if (response.ok) {
        const data = await response.json();
        setTitle(data.title);
        setContent(data.content);
        setIsPublic(data.isPublic || false);
      } else {
        setError('Article not found');
      }
    } catch (err) {
      setError('Failed to load article');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const url = isNew ? '/api/articles' : `/api/articles/${filename}.md`;
      const data = { title, content };

      const response = isNew 
        ? await apiClient.post(url, data, token)
        : await apiClient.put(url, data, token);

      if (response.ok) {
        const data = await response.json();

        onNavigate(`/article/${data.filename.replace('.md', '')}`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save article');
      }
    } catch (err) {
      setError('Failed to save article');
    } finally {
      setSaving(false);
    }
  };

  const handlePublicToggle = async (newIsPublic: boolean, articleFilename?: string) => {
    const targetFilename = articleFilename || `${filename}.md`;

    try {
      const response = await apiClient.post(`/api/articles/${targetFilename}/public`, { isPublic: newIsPublic }, token);

      if (response.ok) {
        setIsPublic(newIsPublic);
      } else {
        setError('Failed to update public status');
      }
    } catch (err) {
      setError('Failed to update public status');
    }
  };

  // Generate slug from filename or title
  const getArticleSlug = (): string => {
    if (filename) {
      return filename;
    }
    // Generate slug from title for new articles
    const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
    // Fallback to 'untitled' if slug is empty
    return slug || 'untitled';
  };

  const handleCopyPublicLink = () => {
    const slug = getArticleSlug();
    const publicUrl = `${window.location.origin}/public-article/${slug}`;

    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(() => {
      setError('Failed to copy link');
    });
  };

  const navigateToPublicView = () => {
    const slug = getArticleSlug();
    onNavigate(`/public-article/${slug}`);
  };

  const handleLint = () => {
    try {
      setLinting(true);
      setError('');

      // Lint the markdown content
      const results = lint({
        strings: {
          content: content
        },
        config: {
          default: true
        }
      });

      // Check if there are any errors
      const errors = results.content;
      if (errors && errors.length > 0) {
        // Try to apply fixes to the content
        const fixed = applyFixes(content, errors);

        // Lint again to check if there are remaining errors
        const recheck = lint({
          strings: {
            content: fixed
          },
          config: {
            default: true
          }
        });

        const remainingErrors = recheck.content;
        if (remainingErrors && remainingErrors.length > 0) {
          // Show remaining errors - don't update content
          const errorMessages = remainingErrors.map((err: any) =>
            `Line ${err.lineNumber}: ${err.ruleDescription} (${err.ruleNames.join('/')})`
          ).join('\n');
          setError(`Linting errors found (cannot auto-fix):\n${errorMessages}`);
        } else {
          // All errors were fixed - update content
          setContent(fixed);
          setError('');
        }
      } else {
        // No errors found
        setError('');
      }
    } catch (err) {
      setError('Failed to lint markdown: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLinting(false);
    }
  };

  const handleConvertHtml = () => {
    try {
      setConverting(true);
      setError('');

      // Create a new TurndownService instance with GFM plugin for table support
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-'
      });

      // Add GFM plugin for table support
      turndownService.use(gfm);

      // Convert HTML to Markdown
      const markdown = turndownService.turndown(content);

      // Update content with converted markdown
      setContent(markdown);
      setError('');
    } catch (err) {
      setError('Failed to convert HTML: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="page">
      <div className="article-header">
        <button
          className="button button-secondary"
          onClick={() => onNavigate(isNew ? '/' : `/article/${filename}`)}
        >
          ← Cancel
        </button>
        <div className="article-actions">
          <button
            className="button"
            onClick={handleConvertHtml}
            disabled={converting || !content.trim()}
          >
            {converting ? 'Converting...' : 'Convert Html'}
          </button>
          <button
            className="button"
            onClick={handleLint}
            disabled={linting || !content.trim()}
          >
            {linting ? 'Linting...' : 'Lint'}
          </button>
          <button
            className="button button-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {!isNew && (
        <div className="public-sharing-section">
          <label className="public-toggle-label">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => handlePublicToggle(e.target.checked)}
              className="public-toggle-checkbox"
            />
            <span className="public-toggle-text" title="Allow public sharing of this article - No Save necessary">Allow Public Sharing</span>
          </label>

          {isPublic && (
            <div className="share-link-pill">
              <button
                className="share-link-button"
                onClick={navigateToPublicView}
                title="View public page"
              >
                🔗 Public Link
              </button>
              <button
                className="copy-link-button"
                onClick={handleCopyPublicLink}
                title="Copy link to clipboard"
              >
                {copySuccess ? '✓' : '📋'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="edit-container">
        <div className="edit-section">
          <label className="edit-label">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="edit-title-input"
          />

          <label className="edit-label">Content (Markdown)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your article in markdown..."
            className="edit-textarea"
          />
        </div>

        <div className="preview-section">
          <label className="edit-label">Preview</label>
          <div className="preview-content">
            <h1>{title || 'Untitled'}</h1>
            <div className="markdown-content">
              <MarkdownView content={content || '*No content yet*'} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
