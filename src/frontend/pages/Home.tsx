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
  const [searchMode, setSearchMode] = useState<'title' | 'semantic'>(() => {
    try {
      const saved = localStorage.getItem('search_mode');
      return saved === 'semantic' ? 'semantic' : 'title';
    } catch {
      return 'title';
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
        setArticles(data);
        setCurrentPage(1); // Reset to first page when loading all articles
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
          setCurrentPage(1); // Reset to first page on search
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
          setCurrentPage(1); // Reset to first page on search
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

  // Calculate pagination for articles
  const totalPages = Math.ceil(articles.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedArticles = articles.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const handleSearchModeChange = (mode: 'title' | 'semantic') => {
    setSearchMode(mode);
    try {
      localStorage.setItem('search_mode', mode);
    } catch {
      // Ignore localStorage errors
    }
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
              onChange={() => handleSearchModeChange('title')}
            />
            Title Search
          </label>
          <label>
            <input
              type="radio"
              value="semantic"
              checked={searchMode === 'semantic'}
              onChange={() => handleSearchModeChange('semantic')}
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
        <>
          <ArticleList articles={paginatedArticles} onArticleClick={handleArticleClick} />
          {articles.length > 0 && (
            <div className="pagination-controls">
              <div className="pagination-info">
                Showing {startIndex + 1}-{Math.min(endIndex, articles.length)} of {articles.length} articles
              </div>
              
              <div className="pagination-size-selector">
                <label>Items per page:</label>
                <select 
                  value={pageSize} 
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="page-size-select"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {totalPages > 1 && (
                <div className="pagination-buttons">
                  <button
                    className="button button-secondary"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  
                  <div className="page-numbers">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                      // Show first page, last page, current page, and pages around current
                      const showPage = 
                        page === 1 || 
                        page === totalPages || 
                        (page >= currentPage - 1 && page <= currentPage + 1);
                      
                      const showEllipsis = 
                        (page === currentPage - 2 && currentPage > 3) ||
                        (page === currentPage + 2 && currentPage < totalPages - 2);

                      if (showEllipsis) {
                        return <span key={page} className="page-ellipsis">...</span>;
                      }

                      if (!showPage) {
                        return null;
                      }

                      return (
                        <button
                          key={page}
                          className={`button page-number ${page === currentPage ? 'active' : ''}`}
                          onClick={() => handlePageChange(page)}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    className="button button-secondary"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
