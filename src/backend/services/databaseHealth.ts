import { database } from './database.js';
import { databaseInit } from './databaseInit.js';
import { databaseConstraintService } from './databaseConstraints.js';
import { 
  handleDatabaseError, 
  DatabaseServiceError, 
  DatabaseErrorType, 
  logDatabaseError 
} from './databaseErrors.js';

/**
 * Database health monitoring and constraint validation service
 */
export class DatabaseHealthService {
  
  /**
   * Lightweight database health check that uses minimal connections
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    message: string;
    details: {
      connection: boolean;
      schema: boolean;
      constraints: boolean;
      performance: boolean;
      issues: string[];
      timestamp: string;
    };
  }> {
    const issues: string[] = [];
    let connectionHealthy = false;
    let schemaHealthy = false;
    let constraintsHealthy = true; // Skip constraint checks in basic health check
    let performanceHealthy = true;

    try {
      // Check database connection
      const connectionCheck = await databaseInit.healthCheck();
      connectionHealthy = connectionCheck.healthy;
      if (!connectionHealthy) {
        issues.push(`Connection: ${connectionCheck.message}`);
      }

      // Basic schema check with single query
      if (connectionHealthy) {
        try {
          await database.query('SELECT 1 FROM articles LIMIT 1');
          schemaHealthy = true;
        } catch (error) {
          const dbError = handleDatabaseError(error);
          issues.push(`Schema: ${dbError.userMessage}`);
          logDatabaseError(dbError, 'Schema Check');
        }
      }

      // Check performance metrics (no additional queries)
      if (connectionHealthy) {
        try {
          const poolStats = database.getPoolStats();
          if (poolStats) {
            // Check for potential performance issues
            const utilizationRatio = poolStats.totalCount > 0 ? 
              (poolStats.totalCount - poolStats.idleCount) / poolStats.totalCount : 0;
            
            if (utilizationRatio > 0.9) {
              issues.push(`Performance: High connection pool utilization (${Math.round(utilizationRatio * 100)}%)`);
              performanceHealthy = false;
            }
            
            if (poolStats.waitingCount > 5) {
              issues.push(`Performance: ${poolStats.waitingCount} connections waiting`);
              performanceHealthy = false;
            }
          }
        } catch (error) {
          // Don't fail health check for performance metrics
          console.warn('Unable to check performance metrics:', error);
        }
      }

      const overallHealthy = connectionHealthy && schemaHealthy;

      return {
        healthy: overallHealthy,
        message: overallHealthy ? 
          'Database is healthy' : 
          'Database has issues that need attention',
        details: {
          connection: connectionHealthy,
          schema: schemaHealthy,
          constraints: constraintsHealthy,
          performance: performanceHealthy,
          issues,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Health Check');
      
      return {
        healthy: false,
        message: 'Health check failed',
        details: {
          connection: false,
          schema: false,
          constraints: false,
          performance: false,
          issues: [`Health check error: ${dbError.userMessage}`],
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Validate and repair database constraints
   */
  async validateAndRepairConstraints(): Promise<{
    success: boolean;
    message: string;
    repaired: string[];
    remaining: string[];
  }> {
    const repaired: string[] = [];
    const remaining: string[] = [];

    try {
      // First, validate current constraint state
      const constraintCheck = await databaseConstraintService.validateConstraintEnforcement();
      
      if (constraintCheck.valid) {
        return {
          success: true,
          message: 'All database constraints are properly enforced',
          repaired: [],
          remaining: []
        };
      }

      // Attempt to repair constraint violations
      for (const issue of constraintCheck.issues) {
        try {
          if (issue.includes('duplicate slugs')) {
            await this.repairDuplicateSlugs();
            repaired.push('Fixed duplicate slugs');
          } else if (issue.includes('orphaned history records')) {
            await this.cleanupOrphanedHistory();
            repaired.push('Cleaned up orphaned history records');
          } else if (issue.includes('orphaned embedding records')) {
            await this.cleanupOrphanedEmbeddings();
            repaired.push('Cleaned up orphaned embedding records');
          } else if (issue.includes('null/empty titles')) {
            await this.fixNullTitles();
            repaired.push('Fixed null/empty titles');
          } else {
            remaining.push(issue);
          }
        } catch (error) {
          const dbError = handleDatabaseError(error);
          logDatabaseError(dbError, 'Constraint Repair');
          remaining.push(`Failed to repair: ${issue} - ${dbError.userMessage}`);
        }
      }

      return {
        success: remaining.length === 0,
        message: remaining.length === 0 ? 
          'All constraint violations have been repaired' : 
          'Some constraint violations could not be automatically repaired',
        repaired,
        remaining
      };

    } catch (error) {
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Constraint Validation and Repair');
      
      return {
        success: false,
        message: `Constraint validation and repair failed: ${dbError.userMessage}`,
        repaired,
        remaining: ['Validation process failed']
      };
    }
  }

  /**
   * Repair duplicate slugs by adding numeric suffixes
   */
  private async repairDuplicateSlugs(): Promise<void> {
    const duplicates = await database.query(`
      SELECT slug, array_agg(id ORDER BY created_at) as ids
      FROM articles 
      GROUP BY slug 
      HAVING COUNT(*) > 1
    `);

    for (const duplicate of duplicates.rows) {
      const ids = duplicate.ids;
      const baseSlug = duplicate.slug;
      
      // Keep the first article with original slug, rename others
      for (let i = 1; i < ids.length; i++) {
        const newSlug = `${baseSlug}-${i}`;
        await database.query(
          'UPDATE articles SET slug = $1 WHERE id = $2',
          [newSlug, ids[i]]
        );
      }
    }
  }

  /**
   * Clean up orphaned history records
   */
  private async cleanupOrphanedHistory(): Promise<void> {
    await database.query(`
      DELETE FROM article_history 
      WHERE article_id NOT IN (SELECT id FROM articles)
    `);
  }

  /**
   * Clean up orphaned embedding records
   */
  private async cleanupOrphanedEmbeddings(): Promise<void> {
    await database.query(`
      DELETE FROM embeddings 
      WHERE article_id NOT IN (SELECT id FROM articles)
    `);
  }

  /**
   * Fix null or empty titles
   */
  private async fixNullTitles(): Promise<void> {
    await database.query(`
      UPDATE articles 
      SET title = 'Untitled Article' 
      WHERE title IS NULL OR title = ''
    `);
  }

  /**
   * Get database statistics for monitoring
   */
  async getDatabaseStats(): Promise<{
    articles: { total: number; public: number; private: number };
    versions: { total: number; averagePerArticle: number };
    embeddings: { total: number; indexed: number };
    storage: { totalSize: string; averageArticleSize: string };
  }> {
    try {
      const [articleStats, versionStats, embeddingStats, storageStats] = await Promise.all([
        database.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE is_public = true) as public,
            COUNT(*) FILTER (WHERE is_public = false) as private
          FROM articles
        `),
        database.query(`
          SELECT 
            COUNT(*) as total,
            COALESCE(AVG(version_count), 0) as average_per_article
          FROM (
            SELECT article_id, COUNT(*) as version_count
            FROM article_history
            GROUP BY article_id
          ) version_counts
        `),
        database.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT article_id) as indexed
          FROM embeddings
        `),
        database.query(`
          SELECT 
            pg_size_pretty(SUM(LENGTH(content))) as total_size,
            pg_size_pretty(AVG(LENGTH(content))::bigint) as average_size
          FROM articles
        `)
      ]);

      return {
        articles: {
          total: parseInt(articleStats.rows[0].total),
          public: parseInt(articleStats.rows[0].public),
          private: parseInt(articleStats.rows[0].private)
        },
        versions: {
          total: parseInt(versionStats.rows[0].total),
          averagePerArticle: parseFloat(versionStats.rows[0].average_per_article)
        },
        embeddings: {
          total: parseInt(embeddingStats.rows[0].total),
          indexed: parseInt(embeddingStats.rows[0].indexed)
        },
        storage: {
          totalSize: storageStats.rows[0].total_size || '0 bytes',
          averageArticleSize: storageStats.rows[0].average_size || '0 bytes'
        }
      };
    } catch (error) {
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Database Stats');
      throw dbError;
    }
  }
}

// Export singleton instance
export const databaseHealthService = new DatabaseHealthService();