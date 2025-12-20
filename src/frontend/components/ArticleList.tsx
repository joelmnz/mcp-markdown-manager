import React from 'react';

interface Article {
  filename: string;
  title: string;
  folder?: string;
  created: string;
}

interface ArticleListProps {
  articles: Article[];
  onArticleClick: (filename: string) => void;
  selectedFolder?: string;
  onFolderSelect?: (folder: string) => void;
  availableFolders?: string[];
}

export function ArticleList({
  articles,
  onArticleClick,
  selectedFolder,
  onFolderSelect,
  availableFolders
}: ArticleListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (articles.length === 0) {
    return (
      <div className="empty-state">
        <p>No articles found</p>
      </div>
    );
  }

  return (
    <div className="article-list-container">
      {availableFolders && availableFolders.length > 0 && onFolderSelect && (
        <div className="folder-filter-container" style={{ marginBottom: '1rem' }}>
          <select
            value={selectedFolder || ''}
            onChange={(e) => onFolderSelect(e.target.value)}
            className="folder-select"
            style={{
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              minWidth: '200px'
            }}
          >
            <option value="">All Folders</option>
            {availableFolders.map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="article-list">
        {articles.map((article) => (
          <div
            key={article.filename}
            className="article-item"
            onClick={() => onArticleClick(article.filename)}
          >
            <div className="article-item-header">
              <div>
                <h3 className="article-item-title">{article.title}</h3>
                {article.folder && (
                  <span className="article-item-folder" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: '0.5rem', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                    📁 {article.folder}
                  </span>
                )}
              </div>
              <span className="article-item-date">{formatDate(article.created)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
