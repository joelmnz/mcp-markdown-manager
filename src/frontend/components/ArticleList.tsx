import React from 'react';

interface Article {
  filename: string;
  title: string;
  created: string;
}

interface ArticleListProps {
  articles: Article[];
  onArticleClick: (filename: string) => void;
}

export function ArticleList({ articles, onArticleClick }: ArticleListProps) {
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
    <div className="article-list">
      {articles.map((article) => (
        <div
          key={article.filename}
          className="article-item"
          onClick={() => onArticleClick(article.filename)}
        >
          <div className="article-item-header">
            <h3 className="article-item-title">{article.title}</h3>
            <span className="article-item-date">{formatDate(article.created)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
