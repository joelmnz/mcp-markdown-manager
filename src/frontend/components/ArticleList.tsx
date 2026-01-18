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
  onEditClick: (filename: string) => void;
}

export function ArticleList({
  articles,
  onArticleClick,
  onEditClick
}: ArticleListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleLinkClick = (e: React.MouseEvent, callback: () => void) => {
    if (e.ctrlKey || e.metaKey || e.button === 1) {
      // Allow default behavior (open in new tab)
      return;
    }
    e.preventDefault();
    callback();
  };

  if (articles.length === 0) {
    return (
      <div className="empty-state">
        <p>No articles found</p>
      </div>
    );
  }

  return (
    <div className="article-list">
      {articles.map((article) => (
        <div key={article.filename} className="article-item">
          <a
            href={`/article/${article.filename.replace('.md', '')}`}
            className="article-item-link"
            onClick={(e) => handleLinkClick(e, () => onArticleClick(article.filename))}
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
          </a>
          <a
            href={`/edit/${article.filename.replace('.md', '')}`}
            className="article-item-action"
            onClick={(e) => handleLinkClick(e, () => onEditClick(article.filename))}
            title="Edit article"
            aria-label={`Edit ${article.title}`}
          >
            ✏️
          </a>
        </div>
      ))}
    </div>
  );
}
