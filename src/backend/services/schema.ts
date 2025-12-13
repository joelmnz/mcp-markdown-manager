import { database } from './database.js';

/**
 * Database schema initialization and migration service
 */
export class SchemaService {
  /**
   * Initialize all database tables and indexes
   */
  async initializeSchema(): Promise<void> {
    console.log('Initializing database schema...');

    try {
      // Create extensions first
      await this.createExtensions();
      
      // Create tables in dependency order
      await this.createArticlesTable();
      await this.createArticleHistoryTable();
      await this.createEmbeddingsTable();
      
      // Create indexes for performance
      await this.createIndexes();
      
      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw new Error(`Schema initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create required PostgreSQL extensions
   */
  private async createExtensions(): Promise<void> {
    console.log('Creating database extensions...');
    
    // Create vector extension for embeddings (if available)
    try {
      await database.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('Vector extension created/verified');
    } catch (error) {
      console.warn('Vector extension not available - semantic search will be disabled');
    }

    // Create pg_trgm extension for full-text search
    try {
      await database.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('pg_trgm extension created/verified');
    } catch (error) {
      console.warn('pg_trgm extension not available - full-text search may be limited');
    }
  }

  /**
   * Create the articles table
   */
  private async createArticlesTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        content TEXT NOT NULL,
        folder VARCHAR(500) DEFAULT '' NOT NULL,
        is_public BOOLEAN DEFAULT FALSE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255),
        updated_by VARCHAR(255)
      )
    `;

    await database.query(createTableSQL);
    console.log('Articles table created/verified');
  }

  /**
   * Create the article history table
   */
  private async createArticleHistoryTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS article_history (
        id SERIAL PRIMARY KEY,
        article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        version_id INTEGER NOT NULL,
        title VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        folder VARCHAR(500) NOT NULL,
        message TEXT,
        content_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255),
        UNIQUE(article_id, version_id)
      )
    `;

    await database.query(createTableSQL);
    console.log('Article history table created/verified');
  }

  /**
   * Create the embeddings table
   */
  private async createEmbeddingsTable(): Promise<void> {
    // Check if vector extension is available
    const extensionCheck = await database.query(`
      SELECT 1 FROM pg_extension WHERE extname = 'vector'
    `);

    const hasVectorExtension = extensionCheck.rows.length > 0;

    let createTableSQL: string;

    if (hasVectorExtension) {
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS embeddings (
          id SERIAL PRIMARY KEY,
          article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
          chunk_id VARCHAR(255) NOT NULL,
          chunk_index INTEGER NOT NULL,
          heading_path TEXT[] DEFAULT '{}' NOT NULL,
          text_content TEXT NOT NULL,
          content_hash VARCHAR(64) NOT NULL,
          vector VECTOR(512),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          UNIQUE(article_id, chunk_index)
        )
      `;
    } else {
      // Fallback without vector type
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS embeddings (
          id SERIAL PRIMARY KEY,
          article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
          chunk_id VARCHAR(255) NOT NULL,
          chunk_index INTEGER NOT NULL,
          heading_path TEXT[] DEFAULT '{}' NOT NULL,
          text_content TEXT NOT NULL,
          content_hash VARCHAR(64) NOT NULL,
          vector_data JSONB,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          UNIQUE(article_id, chunk_index)
        )
      `;
    }

    await database.query(createTableSQL);
    console.log('Embeddings table created/verified');
  }

  /**
   * Create database indexes for performance
   */
  private async createIndexes(): Promise<void> {
    console.log('Creating database indexes...');

    const indexes = [
      // Articles table indexes
      'CREATE INDEX IF NOT EXISTS idx_articles_folder ON articles(folder)',
      'CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)',
      'CREATE INDEX IF NOT EXISTS idx_articles_updated_at ON articles(updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_articles_title ON articles USING gin(to_tsvector(\'english\', title))',
      'CREATE INDEX IF NOT EXISTS idx_articles_is_public ON articles(is_public)',

      // Article history indexes
      'CREATE INDEX IF NOT EXISTS idx_article_history_article_id ON article_history(article_id)',
      'CREATE INDEX IF NOT EXISTS idx_article_history_created_at ON article_history(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_article_history_version_id ON article_history(article_id, version_id)',

      // Embeddings indexes
      'CREATE INDEX IF NOT EXISTS idx_embeddings_article_id ON embeddings(article_id)',
      'CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id)',
    ];

    // Add vector index if extension is available
    const extensionCheck = await database.query(`
      SELECT 1 FROM pg_extension WHERE extname = 'vector'
    `);

    if (extensionCheck.rows.length > 0) {
      // Check if vector column exists
      const columnCheck = await database.query(`
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'embeddings' AND column_name = 'vector'
      `);

      if (columnCheck.rows.length > 0) {
        indexes.push('CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING ivfflat (vector vector_cosine_ops)');
      }
    }

    // Execute all index creation queries
    for (const indexSQL of indexes) {
      try {
        await database.query(indexSQL);
      } catch (error) {
        console.warn(`Failed to create index: ${indexSQL}`, error);
        // Continue with other indexes even if one fails
      }
    }

    console.log('Database indexes created/verified');
  }

  /**
   * Check if the schema is properly initialized
   */
  async verifySchema(): Promise<boolean> {
    try {
      // Check if all required tables exist
      const tableCheck = await database.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('articles', 'article_history', 'embeddings')
      `);

      const expectedTables = ['articles', 'article_history', 'embeddings'];
      const existingTables = tableCheck.rows.map(row => row.table_name);
      
      const allTablesExist = expectedTables.every(table => existingTables.includes(table));
      
      if (!allTablesExist) {
        console.error('Missing required tables:', expectedTables.filter(table => !existingTables.includes(table)));
        return false;
      }

      console.log('Schema verification passed');
      return true;
    } catch (error) {
      console.error('Schema verification failed:', error);
      return false;
    }
  }

  /**
   * Drop all tables (for testing/reset purposes)
   */
  async dropSchema(): Promise<void> {
    console.log('Dropping database schema...');
    
    const dropQueries = [
      'DROP TABLE IF EXISTS embeddings CASCADE',
      'DROP TABLE IF EXISTS article_history CASCADE',
      'DROP TABLE IF EXISTS articles CASCADE',
    ];

    for (const query of dropQueries) {
      await database.query(query);
    }

    console.log('Database schema dropped');
  }

  /**
   * Get schema information
   */
  async getSchemaInfo(): Promise<any> {
    const tables = await database.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const extensions = await database.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname IN ('vector', 'pg_trgm')
    `);

    return {
      tables: tables.rows,
      extensions: extensions.rows,
      poolStats: database.getPoolStats(),
    };
  }
}

// Export singleton instance
export const schemaService = new SchemaService();