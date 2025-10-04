import React, { useState, useEffect } from 'react';
import { lint } from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';
import { MarkdownView } from '../components/MarkdownView';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

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
  const isNew = !filename;

  useEffect(() => {
    if (filename) {
      loadArticle();
    }
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
        setTitle(data.title);
        setContent(data.content);
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
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, content })
      });

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
