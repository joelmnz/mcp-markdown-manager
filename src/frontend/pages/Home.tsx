import React, { useState, useEffect } from 'react';
import { ArticleList } from '../components/ArticleList';

interface Article {
  filename: string;
  title: string;
  created: string;
}

interface HomeProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function Home({ token, onNavigate }: HomeProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/articles', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setArticles(data.slice(0, 10)); // Last 10 articles
      } else {
        setError('Failed to load articles');
      }
    } catch (err) {
      setError('Failed to load articles');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadArticles();
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/articles?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setArticles(data);
      } else {
        setError('Search failed');
      }
    } catch (err) {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleArticleClick = (filename: string) => {
    onNavigate(`/article/${filename.replace('.md', '')}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Articles</h1>
        <button 
          className="button button-primary"
          onClick={() => onNavigate('/new')}
        >
          + New Article
        </button>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search articles..."
          className="search-input"
        />
        <button type="submit" className="button">Search</button>
        {searchQuery && (
          <button 
            type="button" 
            className="button button-secondary"
            onClick={() => {
              setSearchQuery('');
              loadArticles();
            }}
          >
            Clear
          </button>
        )}
      </form>

      {error && <div className="error-message">{error}</div>}
      
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <ArticleList articles={articles} onArticleClick={handleArticleClick} />
      )}
    </div>
  );
}
