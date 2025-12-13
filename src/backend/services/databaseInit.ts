import { database, getDatabaseConfig } from './database.js';
import { schemaService } from './schema.js';
import { 
  handleDatabaseError, 
  DatabaseServiceError, 
  DatabaseErrorType, 
  retryDatabaseOperation,
  logDatabaseError 
} from './databaseErrors.js';

/**
 * Database initialization service for server startup
 */
export class DatabaseInitService {
  private initialized = false;

  /**
   * Initialize database connection and schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Database already initialized');
      return;
    }

    try {
      console.log('Starting database initialization...');

      // Get configuration from environment with validation
      const config = getDatabaseConfig();
      console.log(`Connecting to database: ${config.host}:${config.port}/${config.database}`);

      // Connect to database with retry logic
      await retryDatabaseOperation(async () => {
        await database.connect(config);
      });

      // Initialize schema with retry logic
      await retryDatabaseOperation(async () => {
        await schemaService.initializeSchema();
      });

      // Verify schema
      const isValid = await schemaService.verifySchema();
      if (!isValid) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Schema verification failed',
          'Database schema is not properly configured. Please check your database setup.'
        );
      }

      this.initialized = true;
      console.log('Database initialization completed successfully');

      // Log schema info
      try {
        const schemaInfo = await schemaService.getSchemaInfo();
        console.log('Database schema info:', {
          tables: schemaInfo.tables.length,
          extensions: schemaInfo.extensions.map((ext: any) => ext.extname),
          poolStats: schemaInfo.poolStats,
        });
      } catch (infoError) {
        // Don't fail initialization if we can't get schema info
        console.warn('Could not retrieve schema info:', infoError);
      }

    } catch (error) {
      // Ensure we clean up on failure
      this.initialized = false;
      
      if (error instanceof DatabaseServiceError) {
        logDatabaseError(error, 'Initialization');
        throw error;
      }
      
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Initialization');
      
      throw new DatabaseServiceError(
        DatabaseErrorType.CONNECTION_ERROR,
        `Failed to initialize database: ${dbError.message}`,
        'Unable to initialize the database. Please check your database configuration and ensure the database server is running.',
        dbError.originalError
      );
    }
  }

  /**
   * Gracefully shutdown database connections
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      console.log('Shutting down database connections...');
      await database.disconnect();
      this.initialized = false;
      console.log('Database shutdown completed');
    } catch (error) {
      console.error('Error during database shutdown:', error);
    }
  }

  /**
   * Check if database is initialized and healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string; details?: any }> {
    try {
      if (!this.initialized) {
        return { 
          healthy: false, 
          message: 'Database not initialized. Please restart the application.' 
        };
      }

      if (!database.isConnected()) {
        return { 
          healthy: false, 
          message: 'Database connection lost. Please check your database server.' 
        };
      }

      // Test query with timeout
      await database.query('SELECT 1');

      // Get pool stats
      const poolStats = database.getPoolStats();

      return {
        healthy: true,
        message: 'Database is healthy',
        details: {
          poolStats,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Health Check');
      
      return {
        healthy: false,
        message: dbError.userMessage,
        details: {
          errorType: dbError.type,
          timestamp: new Date().toISOString(),
        }
      };
    }
  }

  /**
   * Reset database (drop and recreate schema)
   * WARNING: This will delete all data!
   */
  async reset(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Database not initialized');
    }

    console.log('WARNING: Resetting database - all data will be lost!');
    
    try {
      await schemaService.dropSchema();
      await schemaService.initializeSchema();
      
      const isValid = await schemaService.verifySchema();
      if (!isValid) {
        throw new Error('Schema verification failed after reset');
      }

      console.log('Database reset completed successfully');
    } catch (error) {
      console.error('Database reset failed:', error);
      throw new Error(`Failed to reset database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export const databaseInit = new DatabaseInitService();