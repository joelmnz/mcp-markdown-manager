import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

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
        <button 
          className="button button-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
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
              <ReactMarkdown>{content || '*No content yet*'}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
