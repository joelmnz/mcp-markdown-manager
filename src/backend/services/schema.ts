import { database, getDatabaseConfig } from './database.js';

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
      await this.createEmbeddingTasksTable();
      await this.createEmbeddingWorkerStatusTable();
      await this.createAccessTokensTable();

      // Update schema with new columns
      await this.addNoRagColumn();

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
      
      // Configure vector extension
      const config = getDatabaseConfig();
      // Use double quotes for database name to handle special characters/case sensitivity
      await database.query(`ALTER DATABASE "${config.database}" SET vector.max_dimensions = 2048`);
      
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
        no_rag BOOLEAN DEFAULT FALSE NOT NULL,
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
   * Add no_rag column to articles table if it doesn't exist
   */
  private async addNoRagColumn(): Promise<void> {
    try {
      await database.query(`
        ALTER TABLE articles
        ADD COLUMN IF NOT EXISTS no_rag BOOLEAN DEFAULT FALSE NOT NULL
      `);
      
      // Verify column exists
      const result = await database.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'articles' AND column_name = 'no_rag'
      `);
      
      if (result.rows.length === 0) {
        throw new Error('Failed to create no_rag column: column verification failed');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('column verification failed')) {
        throw error;
      }
      console.warn('Failed to add no_rag column (might already exist or permission error):', error);
      throw new Error(`Schema initialization failed: unable to add no_rag column - ${error}`);
    }
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
          vector VECTOR(768),
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
   * Create the embedding tasks table for background queue
   */
  private async createEmbeddingTasksTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS embedding_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        slug VARCHAR(255) NOT NULL,
        operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
        priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        metadata JSONB
      )
    `;

    await database.query(createTableSQL);
    console.log('Embedding tasks table created/verified');
  }

  /**
   * Create the embedding worker status table
   */
  private async createEmbeddingWorkerStatusTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS embedding_worker_status (
        id INTEGER PRIMARY KEY DEFAULT 1,
        is_running BOOLEAN NOT NULL DEFAULT FALSE,
        last_heartbeat TIMESTAMP WITH TIME ZONE,
        tasks_processed INTEGER NOT NULL DEFAULT 0,
        tasks_succeeded INTEGER NOT NULL DEFAULT 0,
        tasks_failed INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE,
        
        CONSTRAINT single_worker CHECK (id = 1)
      )
    `;

    await database.query(createTableSQL);
    
    // Insert initial worker status record if it doesn't exist
    await database.query(`
      INSERT INTO embedding_worker_status (id, is_running) 
      VALUES (1, FALSE) 
      ON CONFLICT (id) DO NOTHING
    `);
    
    console.log('Embedding worker status table created/verified');
  }

  /**
   * Create the access tokens table for API key management
   */
  private async createAccessTokensTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS access_tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        scope VARCHAR(20) NOT NULL CHECK (scope IN ('read-only', 'write')),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP WITH TIME ZONE
      )
    `;

    await database.query(createTableSQL);
    console.log('Access tokens table created/verified');
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

      // Embedding tasks indexes
      'CREATE INDEX IF NOT EXISTS idx_embedding_tasks_status_priority ON embedding_tasks(status, priority, scheduled_at)',
      'CREATE INDEX IF NOT EXISTS idx_embedding_tasks_article_id ON embedding_tasks(article_id)',
      'CREATE INDEX IF NOT EXISTS idx_embedding_tasks_created_at ON embedding_tasks(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_embedding_tasks_status ON embedding_tasks(status)',

      // Access tokens indexes
      'CREATE INDEX IF NOT EXISTS idx_access_tokens_token ON access_tokens(token)',
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
        AND table_name IN ('articles', 'article_history', 'embeddings', 'embedding_tasks', 'embedding_worker_status', 'access_tokens')
      `);

      const expectedTables = ['articles', 'article_history', 'embeddings', 'embedding_tasks', 'embedding_worker_status', 'access_tokens'];
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
      'DROP TABLE IF EXISTS access_tokens CASCADE',
      'DROP TABLE IF EXISTS embedding_tasks CASCADE',
      'DROP TABLE IF EXISTS embedding_worker_status CASCADE',
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