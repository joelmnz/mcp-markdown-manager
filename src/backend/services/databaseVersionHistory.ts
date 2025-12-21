import { database } from './database.js';
import { createHash } from 'crypto';
import { databaseArticleService, Article } from './databaseArticles.js';
import { 
  handleDatabaseError, 
  DatabaseServiceError, 
  DatabaseErrorType, 
  logDatabaseError 
} from './databaseErrors.js';
import { databaseConstraintService } from './databaseConstraints.js';

// Database-specific version interfaces
export interface DatabaseVersionHistory {
  id: number;
  articleId: number;
  versionId: number;
  title: string;
  content: string;
  folder: string;
  message?: string;
  contentHash: string;
  createdAt: Date;
  createdBy?: string;
}

// Maintain compatibility with existing VersionMetadata interface
export interface VersionMetadata {
  versionId: number;
  createdAt: string;
  message?: string;
  hash: string;
  size: number;
  title: string;
  folder: string;
}

/**
 * Database-backed version history service
 */
export class DatabaseVersionHistoryService {
  /**
   * Calculate SHA256 hash of content
   */
  private calculateContentHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Convert database row to VersionMetadata interface
   */
  private dbRowToVersionMetadata(row: any): VersionMetadata {
    return {
      versionId: row.version_id,
      createdAt: row.created_at.toISOString(),
      message: row.message,
      hash: row.content_hash,
      size: Buffer.byteLength(row.content, 'utf-8'),
      title: row.title,
      folder: row.folder
    };
  }

  /**
   * Get the next version ID for an article
   */
  private async getNextVersionId(articleId: number): Promise<number> {
    const result = await database.query(
      'SELECT COALESCE(MAX(version_id), 0) + 1 as next_version FROM article_history WHERE article_id = $1',
      [articleId]
    );

    return result.rows[0].next_version;
  }

  /**
   * List all versions of an article
   */
  async listVersions(articleId: number): Promise<VersionMetadata[]> {
    const result = await database.query(
      `SELECT version_id, title, content, folder, message, content_hash, created_at, created_by
       FROM article_history 
       WHERE article_id = $1 
       ORDER BY version_id DESC`,
      [articleId]
    );

    return result.rows.map(row => this.dbRowToVersionMetadata(row));
  }

  /**
   * List versions by article slug
   */
  async listVersionsBySlug(slug: string): Promise<VersionMetadata[]> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    return this.listVersions(articleId);
  }

  /**
   * Get a specific version of an article
   */
  async getVersion(articleId: number, versionId: number): Promise<Article | null> {
    const result = await database.query(
      `SELECT ah.*, a.slug 
       FROM article_history ah
       JOIN articles a ON ah.article_id = a.id
       WHERE ah.article_id = $1 AND ah.version_id = $2`,
      [articleId, versionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      slug: row.slug,
      title: row.title,
      content: row.content,
      folder: row.folder,
      created: row.created_at.toISOString(),
      isPublic: false // Version snapshots are not public
    };
  }

  /**
   * Get version by article slug and version ID
   */
  async getVersionBySlug(slug: string, versionId: number): Promise<Article | null> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    return this.getVersion(articleId, versionId);
  }

  /**
   * Create a new version entry
   */
  async createVersion(
    articleId: number,
    title: string,
    content: string,
    folder: string,
    message?: string,
    createdBy?: string
  ): Promise<void> {
    try {
      // Validate version data using constraint service
      await databaseConstraintService.validateVersionData({
        articleId,
        title,
        content,
        folder,
        message
      });

      // Get next version ID
      const versionId = await getNextVersionId(articleId);
      
      // Calculate content hash
      const contentHash = this.calculateContentHash(content);
      
      const now = new Date();

      await database.query(
        `INSERT INTO article_history (article_id, version_id, title, content, folder, message, content_hash, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [articleId, versionId, title, content, folder, message, contentHash, now, createdBy]
      );
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Create Version');
      throw dbError;
    }
  }

  /**
   * Create version by article slug
   */
  async createVersionBySlug(
    slug: string,
    title: string,
    content: string,
    folder: string,
    message?: string,
    createdBy?: string
  ): Promise<void> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    await this.createVersion(articleId, title, content, folder, message, createdBy);
  }

  /**
   * Create version from current article state
   */
  async createVersionFromCurrent(articleId: number, message?: string, createdBy?: string): Promise<void> {
    // Get current article state
    const article = await databaseArticleService.readArticleById(articleId);
    if (!article) {
      throw new Error(`Article with ID ${articleId} not found`);
    }

    await this.createVersion(
      articleId,
      article.title,
      article.content,
      article.folder,
      message,
      createdBy
    );
  }

  /**
   * Create version from current article state by slug
   */
  async createVersionFromCurrentBySlug(slug: string, message?: string, createdBy?: string): Promise<void> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    await this.createVersionFromCurrent(articleId, message, createdBy);
  }

  /**
   * Restore an article to a specific version
   */
  async restoreVersion(
    articleId: number,
    versionId: number,
    message?: string,
    createdBy?: string
  ): Promise<Article> {
    // Get the version to restore
    const versionArticle = await this.getVersion(articleId, versionId);
    if (!versionArticle) {
      throw new Error(`Version ${versionId} not found for article ID ${articleId}`);
    }

    // Create a snapshot of current state before restoring
    await this.createVersionFromCurrent(articleId, message || `Restore to version ${versionId}`, createdBy);

    // Get current article to preserve slug and creation date
    const currentArticle = await databaseArticleService.readArticleById(articleId);
    if (!currentArticle) {
      throw new Error(`Article with ID ${articleId} not found`);
    }

    // Update the article with version content
    const restoredArticle = await databaseArticleService.updateArticle(
      currentArticle.slug,
      versionArticle.title,
      versionArticle.content,
      versionArticle.folder,
      message
    );

    return restoredArticle;
  }

  /**
   * Restore version by article slug
   */
  async restoreVersionBySlug(
    slug: string,
    versionId: number,
    message?: string,
    createdBy?: string
  ): Promise<Article> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    return this.restoreVersion(articleId, versionId, message, createdBy);
  }

  /**
   * Delete specific versions of an article
   */
  async deleteVersions(articleId: number, versionIds: number[]): Promise<void> {
    if (versionIds.length === 0) {
      return;
    }

    // Create placeholders for the IN clause
    const placeholders = versionIds.map((_, index) => `$${index + 2}`).join(', ');
    
    const result = await database.query(
      `DELETE FROM article_history 
       WHERE article_id = $1 AND version_id IN (${placeholders})`,
      [articleId, ...versionIds]
    );

    console.log(`Deleted ${result.rowCount} versions for article ID ${articleId}`);
  }

  /**
   * Delete versions by article slug
   */
  async deleteVersionsBySlug(slug: string, versionIds: number[]): Promise<void> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    await this.deleteVersions(articleId, versionIds);
  }

  /**
   * Delete all versions of an article
   */
  async deleteAllVersions(articleId: number): Promise<void> {
    const result = await database.query(
      'DELETE FROM article_history WHERE article_id = $1',
      [articleId]
    );

    console.log(`Deleted ${result.rowCount} versions for article ID ${articleId}`);
  }

  /**
   * Delete all versions by article slug
   */
  async deleteAllVersionsBySlug(slug: string): Promise<void> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    await this.deleteAllVersions(articleId);
  }

  /**
   * Get version statistics for an article
   */
  async getVersionStats(articleId: number): Promise<{
    totalVersions: number;
    oldestVersion: Date | null;
    newestVersion: Date | null;
    totalSize: number;
  }> {
    const result = await database.query(
      `SELECT 
         COUNT(*) as total_versions,
         MIN(created_at) as oldest_version,
         MAX(created_at) as newest_version,
         SUM(LENGTH(content)) as total_size
       FROM article_history 
       WHERE article_id = $1`,
      [articleId]
    );

    const row = result.rows[0];
    return {
      totalVersions: parseInt(row.total_versions, 10),
      oldestVersion: row.oldest_version,
      newestVersion: row.newest_version,
      totalSize: parseInt(row.total_size || '0', 10)
    };
  }

  /**
   * Get version statistics by article slug
   */
  async getVersionStatsBySlug(slug: string): Promise<{
    totalVersions: number;
    oldestVersion: Date | null;
    newestVersion: Date | null;
    totalSize: number;
  }> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    return this.getVersionStats(articleId);
  }

  /**
   * Clean up old versions (keep only the most recent N versions)
   */
  async cleanupOldVersions(articleId: number, keepCount: number): Promise<number> {
    if (keepCount <= 0) {
      throw new Error('Keep count must be greater than 0');
    }

    // Get versions to delete (all except the most recent keepCount)
    const result = await database.query(
      `SELECT version_id 
       FROM article_history 
       WHERE article_id = $1 
       ORDER BY version_id DESC 
       OFFSET $2`,
      [articleId, keepCount]
    );

    if (result.rows.length === 0) {
      return 0; // No versions to delete
    }

    const versionIdsToDelete = result.rows.map(row => row.version_id);
    await this.deleteVersions(articleId, versionIdsToDelete);

    return versionIdsToDelete.length;
  }

  /**
   * Clean up old versions by article slug
   */
  async cleanupOldVersionsBySlug(slug: string, keepCount: number): Promise<number> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    return this.cleanupOldVersions(articleId, keepCount);
  }
}

// Fix the missing function reference
async function getNextVersionId(articleId: number): Promise<number> {
  const result = await database.query(
    'SELECT COALESCE(MAX(version_id), 0) + 1 as next_version FROM article_history WHERE article_id = $1',
    [articleId]
  );

  return result.rows[0].next_version;
}

// Export singleton instance
export const databaseVersionHistoryService = new DatabaseVersionHistoryService();