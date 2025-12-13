import { database } from './database.js';
import { 
  DatabaseServiceError, 
  DatabaseErrorType, 
  handleDatabaseError,
  logDatabaseError 
} from './databaseErrors.js';

/**
 * Database constraint validation and enforcement service
 */
export class DatabaseConstraintService {
  
  /**
   * Validate article data before database operations
   */
  async validateArticleData(data: {
    title?: string;
    slug?: string;
    content?: string;
    folder?: string;
    excludeId?: number;
  }): Promise<void> {
    const { title, slug, content, folder, excludeId } = data;

    // Title validation
    if (title !== undefined) {
      this.validateTitle(title);
    }

    // Slug validation
    if (slug !== undefined) {
      this.validateSlugFormat(slug);
      await this.validateSlugUniqueness(slug, excludeId);
    }

    // Content validation
    if (content !== undefined) {
      this.validateContent(content);
    }

    // Folder validation
    if (folder !== undefined) {
      this.validateFolderPath(folder);
    }
  }

  /**
   * Validate title constraints
   */
  private validateTitle(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Title cannot be empty',
        'Article title is required and cannot be empty.'
      );
    }

    if (title.length > 500) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Title exceeds maximum length of 500 characters',
        'Article title is too long. Please use a shorter title (maximum 500 characters).'
      );
    }

    // Check for potentially problematic characters
    if (title.includes('\0')) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Title contains null characters',
        'Article title contains invalid characters.'
      );
    }
  }

  /**
   * Validate slug format constraints
   */
  private validateSlugFormat(slug: string): void {
    if (!slug || slug.trim().length === 0) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Slug cannot be empty',
        'Article URL identifier cannot be empty.'
      );
    }

    if (slug.length > 255) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Slug exceeds maximum length of 255 characters',
        'Article URL identifier is too long. Please use a shorter title.'
      );
    }

    // Validate slug format (lowercase letters, numbers, hyphens only)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Slug contains invalid characters',
        'Article URL identifier can only contain lowercase letters, numbers, and hyphens.'
      );
    }

    // Additional slug constraints
    if (slug.startsWith('-') || slug.endsWith('-')) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Slug cannot start or end with hyphens',
        'Article URL identifier cannot start or end with hyphens.'
      );
    }

    if (slug.includes('--')) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Slug cannot contain consecutive hyphens',
        'Article URL identifier cannot contain consecutive hyphens.'
      );
    }

    // Reserved slugs that might conflict with system routes
    const reservedSlugs = [
      'api', 'admin', 'public', 'static', 'assets', 'health', 'status',
      'login', 'logout', 'auth', 'mcp', 'search', 'new', 'edit', 'delete'
    ];

    if (reservedSlugs.includes(slug)) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        `Slug '${slug}' is reserved`,
        `The title '${slug}' is reserved and cannot be used. Please choose a different title.`
      );
    }
  }

  /**
   * Validate slug uniqueness constraint
   */
  private async validateSlugUniqueness(slug: string, excludeId?: number): Promise<void> {
    try {
      let query = 'SELECT id, title FROM articles WHERE slug = $1';
      const params: any[] = [slug];

      if (excludeId) {
        query += ' AND id != $2';
        params.push(excludeId);
      }

      const result = await database.query(query, params);
      
      if (result.rows.length > 0) {
        const existingTitle = result.rows[0].title;
        throw new DatabaseServiceError(
          DatabaseErrorType.CONSTRAINT_VIOLATION,
          `Article with slug '${slug}' already exists`,
          `An article titled '${existingTitle}' already uses this URL identifier. Please choose a different title.`
        );
      }
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Slug Uniqueness Check');
      throw dbError;
    }
  }

  /**
   * Validate content constraints
   */
  private validateContent(content: string): void {
    if (!content || content.trim().length === 0) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Content cannot be empty',
        'Article content is required and cannot be empty.'
      );
    }

    // Check for null characters
    if (content.includes('\0')) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Content contains null characters',
        'Article content contains invalid characters.'
      );
    }

    // Reasonable content length limit (10MB)
    const maxContentLength = 10 * 1024 * 1024; // 10MB
    if (content.length > maxContentLength) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Content exceeds maximum length',
        'Article content is too large. Please reduce the content size.'
      );
    }
  }

  /**
   * Validate folder path constraints
   */
  private validateFolderPath(folder: string): void {
    if (folder.length > 500) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Folder path exceeds maximum length of 500 characters',
        'Folder path is too long. Please use a shorter folder name.'
      );
    }

    // Allow empty string for root folder
    if (folder === '' || folder === '/') {
      return;
    }

    // Validate folder path format
    if (!/^[a-zA-Z0-9_/-]+$/.test(folder)) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Folder path contains invalid characters',
        'Folder path can only contain letters, numbers, underscores, hyphens, and forward slashes.'
      );
    }

    // Ensure no double slashes, leading/trailing slashes, or invalid patterns
    if (folder.includes('//')) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Folder path contains consecutive slashes',
        'Folder path cannot contain consecutive forward slashes.'
      );
    }

    if (folder.startsWith('/') || folder.endsWith('/')) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Folder path cannot start or end with slashes',
        'Folder path cannot start or end with forward slashes.'
      );
    }

    // Check for invalid folder names
    const pathParts = folder.split('/');
    for (const part of pathParts) {
      if (part === '' || part === '.' || part === '..') {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Folder path contains invalid directory names',
          'Folder path cannot contain empty parts, "." or ".." directory names.'
        );
      }

      if (part.length > 100) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Individual folder name exceeds maximum length',
          'Individual folder names cannot exceed 100 characters.'
        );
      }
    }

    // Check folder depth (reasonable limit)
    if (pathParts.length > 10) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Folder path exceeds maximum depth',
        'Folder path is too deep. Please use fewer nested folders (maximum 10 levels).'
      );
    }
  }

  /**
   * Validate version history data
   */
  async validateVersionData(data: {
    articleId?: number;
    versionId?: number;
    title?: string;
    content?: string;
    folder?: string;
    message?: string;
  }): Promise<void> {
    const { articleId, versionId, title, content, folder, message } = data;

    // Article ID validation
    if (articleId !== undefined) {
      await this.validateArticleExists(articleId);
    }

    // Version ID validation
    if (versionId !== undefined) {
      this.validateVersionId(versionId);
    }

    // Title, content, and folder validation (reuse article validation)
    if (title !== undefined) {
      this.validateTitle(title);
    }

    if (content !== undefined) {
      this.validateContent(content);
    }

    if (folder !== undefined) {
      this.validateFolderPath(folder);
    }

    // Message validation
    if (message !== undefined && message.length > 1000) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Version message exceeds maximum length',
        'Version message is too long. Please use a shorter message (maximum 1000 characters).'
      );
    }
  }

  /**
   * Validate that an article exists
   */
  private async validateArticleExists(articleId: number): Promise<void> {
    try {
      if (!Number.isInteger(articleId) || articleId <= 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Invalid article ID',
          'Article identifier is invalid.'
        );
      }

      const result = await database.query(
        'SELECT id FROM articles WHERE id = $1',
        [articleId]
      );

      if (result.rows.length === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.NOT_FOUND,
          `Article with ID ${articleId} not found`,
          'The specified article does not exist.'
        );
      }
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Article Existence Check');
      throw dbError;
    }
  }

  /**
   * Validate version ID format
   */
  private validateVersionId(versionId: number): void {
    if (!Number.isInteger(versionId) || versionId <= 0) {
      throw new DatabaseServiceError(
        DatabaseErrorType.VALIDATION_ERROR,
        'Invalid version ID',
        'Version identifier must be a positive integer.'
      );
    }
  }

  /**
   * Validate embedding data
   */
  async validateEmbeddingData(data: {
    articleId?: number;
    chunkId?: string;
    chunkIndex?: number;
    textContent?: string;
    vector?: number[];
  }): Promise<void> {
    const { articleId, chunkId, chunkIndex, textContent, vector } = data;

    // Article ID validation
    if (articleId !== undefined) {
      await this.validateArticleExists(articleId);
    }

    // Chunk ID validation
    if (chunkId !== undefined) {
      if (!chunkId || chunkId.trim().length === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Chunk ID cannot be empty',
          'Embedding chunk identifier cannot be empty.'
        );
      }

      if (chunkId.length > 255) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Chunk ID exceeds maximum length',
          'Embedding chunk identifier is too long.'
        );
      }
    }

    // Chunk index validation
    if (chunkIndex !== undefined) {
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Invalid chunk index',
          'Embedding chunk index must be a non-negative integer.'
        );
      }
    }

    // Text content validation
    if (textContent !== undefined) {
      if (!textContent || textContent.trim().length === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Text content cannot be empty',
          'Embedding text content cannot be empty.'
        );
      }

      if (textContent.length > 10000) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Text content exceeds maximum length',
          'Embedding text content is too long for processing.'
        );
      }
    }

    // Vector validation
    if (vector !== undefined) {
      if (!Array.isArray(vector)) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Vector must be an array',
          'Embedding vector must be a valid array of numbers.'
        );
      }

      if (vector.length === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Vector cannot be empty',
          'Embedding vector cannot be empty.'
        );
      }

      // Check vector dimensions (common embedding sizes)
      const validDimensions = [384, 512, 768, 1024, 1536, 3072];
      if (!validDimensions.includes(vector.length)) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          `Invalid vector dimension: ${vector.length}`,
          'Embedding vector has an unsupported dimension size.'
        );
      }

      // Validate vector values
      for (let i = 0; i < vector.length; i++) {
        if (typeof vector[i] !== 'number' || !isFinite(vector[i])) {
          throw new DatabaseServiceError(
            DatabaseErrorType.VALIDATION_ERROR,
            'Vector contains invalid values',
            'Embedding vector contains invalid numeric values.'
          );
        }
      }
    }
  }

  /**
   * Check referential integrity for article deletion
   */
  async validateArticleDeletion(articleId: number): Promise<void> {
    try {
      // Check if article exists
      await this.validateArticleExists(articleId);

      // Check for dependent records that would be affected
      const checks = await Promise.all([
        database.query('SELECT COUNT(*) as count FROM article_history WHERE article_id = $1', [articleId]),
        database.query('SELECT COUNT(*) as count FROM embeddings WHERE article_id = $1', [articleId])
      ]);

      const historyCount = parseInt(checks[0].rows[0].count);
      const embeddingCount = parseInt(checks[1].rows[0].count);

      // Log what will be deleted (for audit purposes)
      if (historyCount > 0 || embeddingCount > 0) {
        console.log(`Article deletion will cascade to ${historyCount} history records and ${embeddingCount} embeddings`);
      }

    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Article Deletion Validation');
      throw dbError;
    }
  }

  /**
   * Validate database constraints are properly enforced
   */
  async validateConstraintEnforcement(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check unique constraints
      const duplicateSlugs = await database.query(`
        SELECT slug, COUNT(*) as count 
        FROM articles 
        GROUP BY slug 
        HAVING COUNT(*) > 1
      `);

      if (duplicateSlugs.rows.length > 0) {
        issues.push(`Found ${duplicateSlugs.rows.length} duplicate slugs`);
      }

      // Check foreign key constraints
      const orphanedHistory = await database.query(`
        SELECT COUNT(*) as count 
        FROM article_history ah 
        LEFT JOIN articles a ON ah.article_id = a.id 
        WHERE a.id IS NULL
      `);

      if (parseInt(orphanedHistory.rows[0].count) > 0) {
        issues.push(`Found ${orphanedHistory.rows[0].count} orphaned history records`);
      }

      const orphanedEmbeddings = await database.query(`
        SELECT COUNT(*) as count 
        FROM embeddings e 
        LEFT JOIN articles a ON e.article_id = a.id 
        WHERE a.id IS NULL
      `);

      if (parseInt(orphanedEmbeddings.rows[0].count) > 0) {
        issues.push(`Found ${orphanedEmbeddings.rows[0].count} orphaned embedding records`);
      }

      // Check not null constraints
      const nullTitles = await database.query(`
        SELECT COUNT(*) as count 
        FROM articles 
        WHERE title IS NULL OR title = ''
      `);

      if (parseInt(nullTitles.rows[0].count) > 0) {
        issues.push(`Found ${nullTitles.rows[0].count} articles with null/empty titles`);
      }

      return {
        valid: issues.length === 0,
        issues
      };

    } catch (error) {
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Constraint Validation');
      issues.push(`Constraint validation failed: ${dbError.message}`);
      
      return {
        valid: false,
        issues
      };
    }
  }
}

// Export singleton instance
export const databaseConstraintService = new DatabaseConstraintService();