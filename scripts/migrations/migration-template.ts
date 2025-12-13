/**
 * Migration Template
 * 
 * Copy this template to create new migrations.
 * Add the migration object to the migrations array in scripts/database.ts
 */

import { database } from '../../src/backend/services/database.js';

export const migrationTemplate = {
  version: 999, // Replace with next sequential version number
  description: 'Description of what this migration does',
  
  async apply() {
    // Add your migration logic here
    // Example:
    // await database.query('ALTER TABLE articles ADD COLUMN new_field TEXT');
    // await database.query('CREATE INDEX idx_articles_new_field ON articles(new_field)');
    
    console.log('  Migration logic executed');
  }
};

// Example migrations for reference:

export const exampleMigrations = [
  {
    version: 2,
    description: 'Add tags support to articles',
    async apply() {
      await database.query('ALTER TABLE articles ADD COLUMN tags TEXT[] DEFAULT \'{}\'');
      await database.query('CREATE INDEX idx_articles_tags ON articles USING gin(tags)');
    }
  },
  
  {
    version: 3,
    description: 'Add full-text search index',
    async apply() {
      await database.query(`
        CREATE INDEX idx_articles_content_search 
        ON articles USING gin(to_tsvector('english', title || ' ' || content))
      `);
    }
  },
  
  {
    version: 4,
    description: 'Add article statistics table',
    async apply() {
      await database.query(`
        CREATE TABLE article_stats (
          id SERIAL PRIMARY KEY,
          article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
          view_count INTEGER DEFAULT 0,
          last_viewed TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(article_id)
        )
      `);
      
      await database.query('CREATE INDEX idx_article_stats_article_id ON article_stats(article_id)');
      await database.query('CREATE INDEX idx_article_stats_view_count ON article_stats(view_count DESC)');
    }
  }
];