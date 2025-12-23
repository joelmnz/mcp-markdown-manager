import React, { useState, useEffect, useRef } from 'react';
import { MarkdownView } from './MarkdownView';
import { useFullscreen } from '../hooks/useFullscreen';
import { apiClient } from '../utils/apiClient';

interface Article {
  filename: string;
  title: string;
  content: string;
  created: string;
  isPublic: boolean;
  isDeleted?: boolean;
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
  const articleContentRef = useRef<HTMLElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('auth_token');
    setIsAuthenticated(!!token);
    
    loadArticle();
  }, [slug]);

  const loadArticle = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/public-articles/${slug}`);

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
      {/* Deleted Article Warning Banner */}
      {article.isDeleted && (
        <div style={{ 
          backgroundColor: '#f8d7da', 
          border: '1px solid #f5c6cb', 
          borderRadius: '4px', 
          padding: '1rem', 
          margin: '1rem 0',
          color: '#721c24',
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <strong> This article has been deleted and may be removed permanently soon.</strong>
        </div>
      )}
      
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
      
      <article className="public-article-content" ref={articleContentRef}>
        <div className="public-article-header">
          <h1 className="public-article-title">{article.title}</h1>
          <button
            className="icon-button fullscreen-button"
            onClick={() => articleContentRef.current && toggleFullscreen(articleContentRef.current)}
            title="Fullscreen"
          >
            [ ]
          </button>
        </div>
        <div className="markdown-content">
          <MarkdownView content={article.content} />
        </div>
      </article>
    </div>
  );
}
