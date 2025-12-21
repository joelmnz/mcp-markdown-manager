import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { 
  handleDatabaseError, 
  DatabaseServiceError, 
  DatabaseErrorType, 
  retryDatabaseOperation,
  logDatabaseError 
} from './databaseErrors.js';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface DatabaseClient {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  release(): void;
}

class DatabaseService {
  private pool: Pool | null = null;
  private config: DatabaseConfig | null = null;

  /**
   * Initialize the database connection pool
   */
  async connect(config: DatabaseConfig): Promise<void> {
    if (this.pool) {
      await this.disconnect();
    }

    this.config = config;
    
    try {
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl,
        max: config.maxConnections || 50,
        idleTimeoutMillis: config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
      });

      // Set up error handlers for the pool
      this.pool.on('error', (err) => {
        const dbError = handleDatabaseError(err);
        logDatabaseError(dbError, 'Pool Error');
        console.error('Unexpected error on idle client', err);
      });

      // Test the connection with retry
      await retryDatabaseOperation(async () => {
        const client = await this.pool!.connect();
        try {
          await client.query('SELECT NOW()');
          console.log('Database connection established successfully');
        } finally {
          client.release();
        }
      });

    } catch (error) {
      // Clean up on connection failure
      if (this.pool) {
        await this.pool.end().catch(() => {});
        this.pool = null;
      }
      
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Connection');
      throw new DatabaseServiceError(
        DatabaseErrorType.CONNECTION_ERROR,
        `Database connection failed: ${dbError.message}`,
        'Unable to connect to the database. Please check your database configuration and try again.',
        dbError.originalError
      );
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        console.log('Database connection closed');
      } catch (error) {
        const dbError = handleDatabaseError(error);
        logDatabaseError(dbError, 'Disconnect');
        console.warn('Error during database disconnect:', dbError.message);
      } finally {
        this.pool = null;
        this.config = null;
      }
    }
  }

  /**
   * Execute a query with optional parameters
   */
  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new DatabaseServiceError(
        DatabaseErrorType.CONNECTION_ERROR,
        'Database not connected. Call connect() first.',
        'Database connection is not available. Please try again.'
      );
    }

    try {
      const result = await this.pool.query<T>(text, params);
      return result;
    } catch (error) {
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Query');
      throw dbError;
    }
  }

  /**
   * Execute a transaction with a callback function
   */
  async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new DatabaseServiceError(
        DatabaseErrorType.CONNECTION_ERROR,
        'Database not connected. Call connect() first.',
        'Database connection is not available. Please try again.'
      );
    }

    let client: PoolClient | null = null;
    let transactionStarted = false;
    
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;
      
      const wrappedClient: DatabaseClient = {
        query: <U extends QueryResultRow = any>(text: string, params?: any[]) => {
          try {
            return client!.query<U>(text, params);
          } catch (error) {
            const dbError = handleDatabaseError(error);
            logDatabaseError(dbError, 'Transaction Query');
            throw dbError;
          }
        },
        release: () => client!.release()
      };

      const result = await callback(wrappedClient);
      await client.query('COMMIT');
      transactionStarted = false;
      return result;
    } catch (error) {
      // Attempt to rollback if transaction was started
      if (client && transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          const rollbackDbError = handleDatabaseError(rollbackError);
          logDatabaseError(rollbackDbError, 'Transaction Rollback');
          console.error('Failed to rollback transaction:', rollbackDbError.message);
        }
      }
      
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Transaction');
      
      // Enhance transaction errors with more context
      if (dbError.type === DatabaseErrorType.UNKNOWN_ERROR) {
        throw new DatabaseServiceError(
          DatabaseErrorType.TRANSACTION_ERROR,
          `Transaction failed: ${dbError.message}`,
          'The operation could not be completed due to a conflict. Please try again.',
          dbError.originalError
        );
      }
      
      throw dbError;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Get a client from the pool for manual transaction management
   */
  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new DatabaseServiceError(
        DatabaseErrorType.CONNECTION_ERROR,
        'Database not connected. Call connect() first.',
        'Database connection is not available. Please try again.'
      );
    }
    
    try {
      return await this.pool.connect();
    } catch (error) {
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Get Client');
      throw dbError;
    }
  }

  /**
   * Check if the database is connected
   */
  isConnected(): boolean {
    return this.pool !== null;
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

// Export singleton instance
export const database = new DatabaseService();

/**
 * Get database configuration from environment variables
 */
export function getDatabaseConfig(): DatabaseConfig {
  const config: DatabaseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'article_manager',
    user: process.env.DB_USER || 'article_user',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10),
  };

  // Validate required configuration
  if (!config.password) {
    throw new Error('DB_PASSWORD environment variable is required');
  }

  return config;
}