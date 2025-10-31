import React, { useState, useEffect } from 'react';
import { MarkdownView } from './MarkdownView';

interface Article {
  filename: string;
  title: string;
  content: string;
  created: string;
  isPublic: boolean;
}

interface PublicArticleViewProps {
  slug: string;
  onNavigate: (path: string) => void;
}

export function PublicArticleView({ slug, onNavigate }: PublicArticleViewProps) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('auth_token');
    setIsAuthenticated(!!token);
    
    loadArticle();
  }, [slug]);

  const loadArticle = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/public-articles/${slug}`);

      if (response.ok) {
        const data = await response.json();
        setArticle(data);
      } else {
        setError('Article not found or not public');
      }
    } catch (err) {
      setError('Failed to load article');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="public-article-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="public-article-page">
        <div className="error-message">{error || 'Article not found'}</div>
      </div>
    );
  }

  return (
    <div className="public-article-page">
      {isAuthenticated && (
        <div className="public-article-edit-button">
          <button 
            className="button button-primary"
            onClick={() => onNavigate(`/article/${slug}`)}
          >
            Edit Article
          </button>
        </div>
      )}
      
      <article className="public-article-content">
        <h1 className="public-article-title">{article.title}</h1>
        <div className="markdown-content">
          <MarkdownView content={article.content} />
        </div>
      </article>
    </div>
  );
}
