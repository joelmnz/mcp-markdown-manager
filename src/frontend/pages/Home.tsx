import React, { useState, useEffect } from 'react';
import { ArticleList } from '../components/ArticleList';

interface Article {
  filename: string;
  title: string;
  created: string;
}

interface SearchResult {
  chunk: {
    filename: string;
    title: string;
    headingPath: string[];
    text: string;
  };
  score: number;
  snippet: string;
}

interface HomeProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function Home({ token, onNavigate }: HomeProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'title' | 'semantic'>('semantic');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    try {
      setLoading(true);
      setSearchResults([]);
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
      
      if (searchMode === 'semantic') {
        // Hybrid search (semantic + title boost)
        const response = await fetch(`/api/search?query=${encodeURIComponent(searchQuery)}&k=10&mode=hybrid`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setSearchResults(data);
          setArticles([]);
        } else {
          const errorData = await response.json();
          setError(errorData.error || 'Semantic search failed');
        }
      } else {
        // Title search
        const response = await fetch(`/api/articles?q=${encodeURIComponent(searchQuery)}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setArticles(data);
          setSearchResults([]);
        } else {
          setError('Search failed');
        }
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
        <div className="page-header-actions">
          <button 
            className="button"
            onClick={() => onNavigate('/rag-status')}
            title="View RAG index status"
          >
            🔍 RAG Status
          </button>
          <button 
            className="button button-primary"
            onClick={() => onNavigate('/new')}
          >
            + New Article
          </button>
        </div>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <div className="search-mode-toggle">
          <label>
            <input
              type="radio"
              value="title"
              checked={searchMode === 'title'}
              onChange={(e) => setSearchMode('title')}
            />
            Title Search
          </label>
          <label>
            <input
              type="radio"
              value="semantic"
              checked={searchMode === 'semantic'}
              onChange={(e) => setSearchMode('semantic')}
            />
            Semantic Search
          </label>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={searchMode === 'semantic' ? 'Search by meaning...' : 'Search articles...'}
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
      ) : searchResults.length > 0 ? (
        <div className="search-results">
          {searchResults.map((result, index) => (
            <div key={index} className="search-result-item" onClick={() => handleArticleClick(result.chunk.filename)}>
              <div className="search-result-header">
                <h3>{result.chunk.title}</h3>
                <span className="search-result-score">{(result.score * 100).toFixed(1)}%</span>
              </div>
              {result.chunk.headingPath.length > 0 && (
                <div className="search-result-path">
                  {result.chunk.headingPath.join(' > ')}
                </div>
              )}
              <p className="search-result-snippet">{result.snippet}</p>
            </div>
          ))}
        </div>
      ) : (
        <ArticleList articles={articles} onArticleClick={handleArticleClick} />
      )}
    </div>
  );
}
