import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from '../components/MermaidDiagram';

interface Article {
  filename: string;
  title: string;
  content: string;
  created: string;
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

  useEffect(() => {
    loadArticle();
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
      } else {
        setError('Article not found');
      }
    } catch (err) {
      setError('Failed to load article');
    } finally {
      setLoading(false);
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
          <button 
            className="button"
            onClick={() => onNavigate(`/edit/${filename}`)}
          >
            Edit
          </button>
          <button 
            className="button button-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <article className="article-content">
        <h1>{article.title}</h1>
        <p className="article-date">{formatDate(article.created)}</p>
        <div className="markdown-content">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const language = match ? match[1] : '';
                const isInline = !className;
                
                if (!isInline && language === 'mermaid') {
                  return <MermaidDiagram chart={String(children).trim()} />;
                }
                
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {article.content}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
