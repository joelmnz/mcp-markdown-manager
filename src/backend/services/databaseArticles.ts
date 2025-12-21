import { database } from './database.js';
import { createHash } from 'crypto';
import {
  handleDatabaseError,
  DatabaseServiceError,
  DatabaseErrorType,
  retryDatabaseOperation,
  logDatabaseError
} from './databaseErrors.js';
import { databaseConstraintService } from './databaseConstraints.js';

// Database-specific interfaces that match the schema
export interface DatabaseArticle {
  id: number;
  title: string;
  slug: string;
  content: string;
  folder: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

// Maintain compatibility with existing Article interface
export interface Article {
  slug: string;
  title: string;
  content: string;
  folder: string;
  created: string;
  isPublic: boolean;
}

export interface ArticleMetadata {
  slug: string;
  title: string;
  folder: string;
  created: string;
  modified: string;
  isPublic: boolean;
}

/**
 * Database-backed article service that replaces file-based storage
 */
export class DatabaseArticleService {
  /**
   * Generate URL-friendly slug from title
   */
  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Validate slug format and uniqueness using constraint service
   */
  private async validateSlug(slug: string, excludeId?: number): Promise<void> {
    await databaseConstraintService.validateArticleData({
      slug,
      excludeId
    });
  }

  /**
   * Validate folder path format using constraint service
   */
  private async validateFolder(folder: string): Promise<void> {
    await databaseConstraintService.validateArticleData({ folder });
  }

  /**
   * Normalize folder path (convert '/' to empty string for root)
   */
  private normalizeFolder(folder?: string): string {
    if (!folder || folder === '/') {
      return '';
    }
    return folder;
  }

  /**
   * Convert database row to Article interface
   */
  private dbRowToArticle(row: any): Article {
    return {
      slug: row.slug,
      title: row.title,
      content: row.content,
      folder: row.folder,
      created: row.created_at.toISOString(),
      isPublic: row.is_public
    };
  }

  /**
   * Convert database row to ArticleMetadata interface
   */
  private dbRowToMetadata(row: any): ArticleMetadata {
    return {
      slug: row.slug,
      title: row.title,
      folder: row.folder,
      created: row.created_at.toISOString(),
      modified: row.updated_at.toISOString(),
      isPublic: row.is_public
    };
  }

  /**
   * List all articles with optional folder filtering (includes subfolders)
   */
  async listArticles(folder?: string): Promise<ArticleMetadata[]> {
    try {
      let query = `
        SELECT slug, title, folder, is_public, created_at, updated_at
        FROM articles
      `;
      const params: any[] = [];

      if (folder !== undefined) {
        const normalizedFolder = this.normalizeFolder(folder);
        await this.validateFolder(normalizedFolder);
        // Use LIKE pattern to include subfolders
        // e.g., 'projects' matches 'projects', 'projects/web-dev', 'projects/project-1', etc.
        if (normalizedFolder === '') {
          // Empty folder means root - show all articles
          query += ' WHERE folder = $1';
          params.push(normalizedFolder);
        } else {
          // Include the folder itself and all subfolders
          query += ' WHERE (folder = $1 OR folder LIKE $2)';
          params.push(normalizedFolder, `${normalizedFolder}/%`);
        }
      }

      query += ' ORDER BY updated_at DESC';

      const result = await database.query(query, params);
      return result.rows.map(row => this.dbRowToMetadata(row));
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'List Articles');
      throw dbError;
    }
  }

  /**
   * Search articles by title with optional folder filtering (includes subfolders)
   */
  async searchArticles(query: string, folder?: string): Promise<ArticleMetadata[]> {
    let sql = `
      SELECT slug, title, folder, is_public, created_at, updated_at
      FROM articles
      WHERE title ILIKE $1
    `;
    const params: any[] = [`%${query}%`];

    if (folder !== undefined) {
      const normalizedFolder = this.normalizeFolder(folder);
      // Use LIKE pattern to include subfolders
      // e.g., 'projects' matches 'projects', 'projects/web-dev', 'projects/project-1', etc.
      if (normalizedFolder === '') {
        // Empty folder means root - exact match only
        sql += ' AND folder = $2';
        params.push(normalizedFolder);
      } else {
        // Include the folder itself and all subfolders
        sql += ' AND (folder = $2 OR folder LIKE $3)';
        params.push(normalizedFolder, `${normalizedFolder}/%`);
      }
    }

    sql += ' ORDER BY updated_at DESC';

    const result = await database.query(sql, params);
    return result.rows.map(row => this.dbRowToMetadata(row));
  }

  /**
   * Read article by slug
   */
  async readArticle(slug: string): Promise<Article | null> {
    try {
      if (!slug || slug.trim().length === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Slug cannot be empty',
          'Article identifier cannot be empty.'
        );
      }

      const result = await database.query(
        'SELECT * FROM articles WHERE slug = $1',
        [slug]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.dbRowToArticle(result.rows[0]);
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Read Article');
      throw dbError;
    }
  }

  /**
   * Read article by database ID
   */
  async readArticleById(id: number): Promise<Article | null> {
    const result = await database.query(
      'SELECT * FROM articles WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.dbRowToArticle(result.rows[0]);
  }

  /**
   * Get article ID by slug (internal helper)
   */
  async getArticleId(slug: string): Promise<number | null> {
    const result = await database.query(
      'SELECT id FROM articles WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].id;
  }

  /**
   * Create a new article
   */
  async createArticle(
    title: string,
    content: string,
    folder?: string,
    message?: string
  ): Promise<Article> {
    try {
      const normalizedFolder = this.normalizeFolder(folder);
      const slug = this.generateSlug(title);

      // Comprehensive validation using constraint service
      await databaseConstraintService.validateArticleData({
        title,
        slug,
        content,
        folder: normalizedFolder
      });

      const now = new Date();

      const result = await database.query(
        `INSERT INTO articles (title, slug, content, folder, is_public, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [title.trim(), slug, content.trim(), normalizedFolder, false, now, now]
      );

      return this.dbRowToArticle(result.rows[0]);
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Create Article');
      throw dbError;
    }
  }

  /**
   * Update an existing article
   */
  async updateArticle(
    slug: string,
    title: string,
    content: string,
    folder?: string,
    message?: string
  ): Promise<Article> {
    // Validate inputs
    if (!title || title.trim().length === 0) {
      throw new Error('Title cannot be empty');
    }

    if (!content || content.trim().length === 0) {
      throw new Error('Content cannot be empty');
    }

    const normalizedFolder = this.normalizeFolder(folder);
    this.validateFolder(normalizedFolder);

    // Get existing article
    const existingArticle = await this.readArticle(slug);
    if (!existingArticle) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    const articleId = await this.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    // Generate new slug from title
    const newSlug = this.generateSlug(title);

    // Validate new slug if it's different
    if (newSlug !== slug) {
      await this.validateSlug(newSlug, articleId);
    }

    const now = new Date();

    const result = await database.query(
      `UPDATE articles 
       SET title = $1, slug = $2, content = $3, folder = $4, updated_at = $5
       WHERE id = $6
       RETURNING *`,
      [title, newSlug, content, normalizedFolder, now, articleId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Failed to update article with slug '${slug}'`);
    }

    return this.dbRowToArticle(result.rows[0]);
  }

  /**
   * Delete an article
   */
  async deleteArticle(slug: string): Promise<void> {
    try {
      if (!slug || slug.trim().length === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          'Slug cannot be empty',
          'Article identifier cannot be empty.'
        );
      }

      // Get article ID for constraint validation
      const articleId = await this.getArticleId(slug);
      if (!articleId) {
        throw new DatabaseServiceError(
          DatabaseErrorType.NOT_FOUND,
          `Article with slug '${slug}' not found`,
          'The article you are trying to delete does not exist.'
        );
      }

      // Validate deletion constraints (check referential integrity)
      await databaseConstraintService.validateArticleDeletion(articleId);

      const result = await database.query(
        'DELETE FROM articles WHERE slug = $1',
        [slug]
      );

      if (result.rowCount === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.NOT_FOUND,
          `Article with slug '${slug}' not found`,
          'The article you are trying to delete does not exist.'
        );
      }
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Delete Article');
      throw dbError;
    }
  }

  /**
   * Move article to a different folder
   */
  async moveArticle(slug: string, newFolder: string): Promise<Article> {
    const normalizedFolder = this.normalizeFolder(newFolder);
    this.validateFolder(normalizedFolder);

    const now = new Date();

    const result = await database.query(
      `UPDATE articles 
       SET folder = $1, updated_at = $2
       WHERE slug = $3
       RETURNING *`,
      [normalizedFolder, now, slug]
    );

    if (result.rows.length === 0) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    return this.dbRowToArticle(result.rows[0]);
  }

  /**
   * Set article public status
   */
  async setArticlePublic(slug: string, isPublic: boolean): Promise<void> {
    const now = new Date();

    const result = await database.query(
      `UPDATE articles 
       SET is_public = $1, updated_at = $2
       WHERE slug = $3`,
      [isPublic, now, slug]
    );

    if (result.rowCount === 0) {
      throw new Error(`Article with slug '${slug}' not found`);
    }
  }

  /**
   * Get article by slug (for public access) - only returns if public
   */
  async getPublicArticle(slug: string): Promise<Article | null> {
    const result = await database.query(
      'SELECT * FROM articles WHERE slug = $1 AND is_public = true',
      [slug]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.dbRowToArticle(result.rows[0]);
  }

  /**
   * List articles in a specific folder (including subfolders)
   */
  async listArticlesInFolder(folderPath: string, includeSubfolders: boolean = false): Promise<ArticleMetadata[]> {
    const normalizedFolder = this.normalizeFolder(folderPath);

    let query: string;
    let params: any[];

    if (includeSubfolders) {
      // Include articles in subfolders using LIKE pattern
      query = `
        SELECT slug, title, folder, is_public, created_at, updated_at
        FROM articles
        WHERE folder LIKE $1
        ORDER BY updated_at DESC
      `;
      params = [normalizedFolder === '' ? '%' : `${normalizedFolder}%`];
    } else {
      // Exact folder match
      query = `
        SELECT slug, title, folder, is_public, created_at, updated_at
        FROM articles
        WHERE folder = $1
        ORDER BY updated_at DESC
      `;
      params = [normalizedFolder];
    }

    const result = await database.query(query, params);
    return result.rows.map(row => this.dbRowToMetadata(row));
  }

  /**
   * Get folder hierarchy (list all unique folder paths)
   */
  async getFolderHierarchy(): Promise<string[]> {
    const result = await database.query(
      `SELECT DISTINCT folder 
       FROM articles 
       WHERE folder != '' 
       ORDER BY folder`
    );

    return result.rows.map(row => row.folder);
  }
}

// Export singleton instance
export const databaseArticleService = new DatabaseArticleService();