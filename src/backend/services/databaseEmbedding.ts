import { database } from './database.js';
import { databaseArticleService, ArticleMetadata } from './databaseArticles.js';
import { generateEmbedding, cosineSimilarity } from './embedding.js';
import { chunkMarkdown, Chunk, calculateContentHash } from './chunking.js';
import { createHash } from 'crypto';
import {
  handleDatabaseError,
  DatabaseServiceError,
  DatabaseErrorType,
  logDatabaseError
} from './databaseErrors.js';
import { databaseConstraintService } from './databaseConstraints.js';

// Database-specific embedding interfaces
export interface DatabaseEmbedding {
  id: number;
  articleId: number;
  chunkId: string;
  chunkIndex: number;
  headingPath: string[];
  textContent: string;
  contentHash: string;
  vector: number[] | null;
  createdAt: Date;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  snippet: string;
  articleMetadata: ArticleMetadata;
}

export interface IndexStats {
  totalChunks: number;
  totalArticles: number;
  indexedArticles: number;
  unindexedArticles: number;
}

/**
 * Database-backed embedding service for semantic search
 */
export class DatabaseEmbeddingService {
  /**
   * Check if vector extension is available
   */
  private async hasVectorExtension(): Promise<boolean> {
    try {
      const result = await database.query(`
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      `);
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if vector column exists in embeddings table
   */
  private async hasVectorColumn(): Promise<boolean> {
    try {
      const result = await database.query(`
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'embeddings' AND column_name = 'vector'
      `);
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Store or update embeddings for an article
   */
  async upsertArticleEmbeddings(articleId: number, chunks: Chunk[]): Promise<void> {
    try {
      const hasVector = await this.hasVectorExtension() && await this.hasVectorColumn();

      // Delete existing embeddings for this article
      await this.deleteArticleEmbeddings(articleId);

      // Insert new embeddings
      for (const chunk of chunks) {
        try {
          // Validate embedding data using constraint service
          await databaseConstraintService.validateEmbeddingData({
            articleId,
            chunkId: chunk.id,
            chunkIndex: chunk.chunkIndex,
            textContent: chunk.text
          });

          // Generate embedding
          const vector = await generateEmbedding(chunk.text);
          const contentHash = calculateContentHash(chunk.text);

          // Additional vector validation
          await databaseConstraintService.validateEmbeddingData({
            vector
          });

          if (hasVector) {
            // Use native vector type
            await database.query(
              `INSERT INTO embeddings (article_id, chunk_id, chunk_index, heading_path, text_content, content_hash, vector, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                articleId,
                chunk.id,
                chunk.chunkIndex,
                chunk.headingPath,
                chunk.text,
                contentHash,
                `[${vector.join(',')}]`, // PostgreSQL vector format
                new Date()
              ]
            );
          } else {
            // Fallback to JSONB storage
            await database.query(
              `INSERT INTO embeddings (article_id, chunk_id, chunk_index, heading_path, text_content, content_hash, vector_data, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                articleId,
                chunk.id,
                chunk.chunkIndex,
                chunk.headingPath,
                chunk.text,
                contentHash,
                JSON.stringify(vector),
                new Date()
              ]
            );
          }
        } catch (error) {
          if (error instanceof DatabaseServiceError) {
            logDatabaseError(error, `Embedding Chunk ${chunk.id}`);
            throw error; // Don't continue if validation fails
          }

          const dbError = handleDatabaseError(error);
          logDatabaseError(dbError, `Embedding Chunk ${chunk.id}`);
          console.error(`Error storing embedding for chunk ${chunk.id}:`, dbError.message);
          // Continue with other chunks for non-validation errors
        }
      }

      console.log(`Stored ${chunks.length} embeddings for article ID ${articleId}`);
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      const dbError = handleDatabaseError(error);
      logDatabaseError(dbError, 'Upsert Article Embeddings');
      throw dbError;
    }
  }

  /**
   * Store embeddings by article slug
   */
  async upsertArticleEmbeddingsBySlug(slug: string, chunks: Chunk[]): Promise<void> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    await this.upsertArticleEmbeddings(articleId, chunks);
  }

  /**
   * Delete all embeddings for an article
   */
  async deleteArticleEmbeddings(articleId: number): Promise<void> {
    const result = await database.query(
      'DELETE FROM embeddings WHERE article_id = $1',
      [articleId]
    );

    console.log(`Deleted ${result.rowCount} embeddings for article ID ${articleId}`);
  }

  /**
   * Delete embeddings by article slug
   */
  async deleteArticleEmbeddingsBySlug(slug: string): Promise<void> {
    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    await this.deleteArticleEmbeddings(articleId);
  }

  /**
   * Generate snippet from text
   */
  private generateSnippet(text: string, maxLength: number = 200): string {
    if (text.length <= maxLength) {
      return text;
    }

    const snippet = text.substring(0, maxLength);
    const lastSpace = snippet.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.8) {
      return snippet.substring(0, lastSpace) + '...';
    }

    return snippet + '...';
  }

  /**
   * Perform semantic search using database vector operations
   */
  async semanticSearch(query: string, k: number = 5, folder?: string): Promise<SearchResult[]> {
    const hasVector = await this.hasVectorExtension() && await this.hasVectorColumn();

    // Generate query embedding
    const queryVector = await generateEmbedding(query);

    let sql: string;
    let params: any[];

    if (hasVector) {
      // Use native vector similarity search
      sql = `
        SELECT 
          e.chunk_id, e.chunk_index, e.heading_path, e.text_content, e.created_at,
          a.slug, a.title, a.folder, a.is_public, a.created_at as article_created, a.updated_at,
          (e.vector <=> $1::vector) as distance
        FROM embeddings e
        JOIN articles a ON e.article_id = a.id
      `;
      params = [`[${queryVector.join(',')}]`];

      if (folder !== undefined && folder !== null && folder !== '') {
        const normalizedFolder = folder === '/' ? '' : folder;
        // Note: For consistency with listArticles, we could use LIKE here for subfolders,
        // but for now we'll stick to exact match or subfolders if we want to be consistent.
        // The user specifically asked for "" and "/" handling.
        if (folder === '/') {
          sql += ' WHERE a.folder = $2';
          params.push('');
        } else {
          // Include the folder itself and all subfolders to match listArticles behavior
          // Use ILIKE for case-insensitive matching
          sql += ' WHERE (a.folder ILIKE $2 OR a.folder ILIKE $3)';
          params.push(normalizedFolder, `${normalizedFolder}/%`);
        }
      }

      sql += ' ORDER BY e.vector <=> $1::vector LIMIT $' + (params.length + 1);
      params.push(k * 2); // Get more results for deduplication
    } else {
      // Fallback: retrieve all embeddings and calculate similarity in memory
      sql = `
        SELECT 
          e.chunk_id, e.chunk_index, e.heading_path, e.text_content, e.vector_data, e.created_at,
          a.slug, a.title, a.folder, a.is_public, a.created_at as article_created, a.updated_at
        FROM embeddings e
        JOIN articles a ON e.article_id = a.id
      `;
      params = [];

      if (folder !== undefined && folder !== null && folder !== '') {
        const normalizedFolder = folder === '/' ? '' : folder;
        if (folder === '/') {
          sql += ' WHERE a.folder = $1';
          params.push('');
        } else {
          // Include the folder itself and all subfolders
          // Use ILIKE for case-insensitive matching
          sql += ' WHERE (a.folder ILIKE $1 OR a.folder ILIKE $2)';
          params.push(normalizedFolder, `${normalizedFolder}/%`);
        }
      }
    }

    const result = await database.query(sql, params);

    let searchResults: SearchResult[];

    if (hasVector) {
      // Convert distance to similarity score (1 - distance for cosine distance)
      searchResults = result.rows.map(row => ({
        chunk: {
          id: row.chunk_id,
          filename: `${row.slug}.md`, // Maintain compatibility with filename-based interface
          title: row.title,
          headingPath: row.heading_path,
          chunkIndex: row.chunk_index,
          text: row.text_content,
          created: row.article_created.toISOString(),
          modified: row.updated_at.toISOString()
        },
        score: Math.max(0, 1 - row.distance), // Convert distance to similarity
        snippet: this.generateSnippet(row.text_content),
        articleMetadata: {
          slug: row.slug,
          title: row.title,
          folder: row.folder,
          created: row.article_created.toISOString(),
          modified: row.updated_at.toISOString(),
          isPublic: row.is_public
        }
      }));
    } else {
      // Calculate similarity in memory
      const resultsWithScores = result.rows.map(row => {
        const vector = JSON.parse(row.vector_data);
        const score = cosineSimilarity(queryVector, vector);

        return {
          chunk: {
            id: row.chunk_id,
            filename: `${row.slug}.md`,
            title: row.title,
            headingPath: row.heading_path,
            chunkIndex: row.chunk_index,
            text: row.text_content,
            created: row.article_created.toISOString(),
            modified: row.updated_at.toISOString()
          },
          score,
          snippet: this.generateSnippet(row.text_content),
          articleMetadata: {
            slug: row.slug,
            title: row.title,
            folder: row.folder,
            created: row.article_created.toISOString(),
            modified: row.updated_at.toISOString(),
            isPublic: row.is_public
          }
        };
      });

      // Sort by score and take top results
      resultsWithScores.sort((a, b) => b.score - a.score);
      searchResults = resultsWithScores.slice(0, k * 2);
    }

    // Deduplicate by article (keep highest scoring chunk per article)
    const bestBySlug = new Map<string, SearchResult>();

    for (const result of searchResults) {
      const slug = result.articleMetadata.slug;
      const existing = bestBySlug.get(slug);

      if (!existing || result.score > existing.score) {
        bestBySlug.set(slug, result);
      }
    }

    // Return top k unique articles, sorted by score
    return Array.from(bestBySlug.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /**
   * Hybrid search combining title search and semantic search
   */
  async hybridSearch(query: string, k: number = 5, folder?: string): Promise<SearchResult[]> {
    // Get semantic search results
    const semanticResults = await this.semanticSearch(query, k * 2, folder);

    // Get title search results
    const titleMatches = await databaseArticleService.searchArticles(query, folder);

    // Create boost map for title matches
    const titleMatchBoost = new Map<string, number>();
    titleMatches.forEach((article, index) => {
      const boost = 0.3 * (1 - index / titleMatches.length);
      titleMatchBoost.set(article.slug, boost);
    });

    // Boost semantic results that also match titles
    const boostedResults = semanticResults.map(result => {
      const boost = titleMatchBoost.get(result.articleMetadata.slug) || 0;
      return {
        ...result,
        score: Math.min(1.0, result.score + boost)
      };
    });

    // Re-sort by boosted scores
    boostedResults.sort((a, b) => b.score - a.score);

    return boostedResults.slice(0, k);
  }

  /**
   * Rebuild the entire embedding index
   */
  async rebuildIndex(): Promise<void> {
    console.log('Rebuilding embedding index...');

    // Get all articles
    const articles = await databaseArticleService.listArticles();
    let processed = 0;
    let failed = 0;

    for (const articleMeta of articles) {
      try {
        console.log(`Processing ${articleMeta.slug}...`);

        // Read full article
        const article = await databaseArticleService.readArticle(articleMeta.slug);
        if (!article) {
          console.log(`Skipping ${articleMeta.slug} - not found`);
          failed++;
          continue;
        }

        // Get article ID
        const articleId = await databaseArticleService.getArticleId(articleMeta.slug);
        if (!articleId) {
          console.log(`Skipping ${articleMeta.slug} - ID not found`);
          failed++;
          continue;
        }

        // Generate chunks
        const chunks = chunkMarkdown(
          `${article.slug}.md`, // Maintain filename compatibility
          article.title,
          article.content,
          article.created,
          articleMeta.modified
        );

        // Store embeddings
        await this.upsertArticleEmbeddings(articleId, chunks);
        processed++;

      } catch (error) {
        console.error(`Error processing ${articleMeta.slug}:`, error);
        failed++;
      }
    }

    console.log(`Rebuilt index: ${processed} articles processed, ${failed} failed`);
  }

  /**
   * Get embedding index statistics
   */
  async getIndexStats(): Promise<IndexStats> {
    // Get total chunks
    const chunksResult = await database.query('SELECT COUNT(*) as count FROM embeddings');
    const totalChunks = parseInt(chunksResult.rows[0].count, 10);

    // Get total articles
    const articlesResult = await database.query('SELECT COUNT(*) as count FROM articles');
    const totalArticles = parseInt(articlesResult.rows[0].count, 10);

    // Get indexed articles (articles that have embeddings)
    const indexedResult = await database.query(`
      SELECT COUNT(DISTINCT article_id) as count 
      FROM embeddings
    `);
    const indexedArticles = parseInt(indexedResult.rows[0].count, 10);

    const unindexedArticles = totalArticles - indexedArticles;

    return {
      totalChunks,
      totalArticles,
      indexedArticles,
      unindexedArticles
    };
  }

  /**
   * Get detailed statistics including lists of files
   */
  async getDetailedStats(): Promise<{
    unindexedSlugs: string[];
  }> {
    // Get unindexed slugs
    const unindexedResult = await database.query(`
      SELECT a.slug
      FROM articles a
      LEFT JOIN embeddings e ON a.id = e.article_id
      WHERE e.id IS NULL
    `);
    const unindexedSlugs = unindexedResult.rows.map(row => row.slug);

    return {
      unindexedSlugs
    };
  }

  /**
   * Index unindexed articles only
   */
  async indexUnindexedArticles(): Promise<{ indexed: number; failed: string[] }> {
    console.log('Indexing unindexed articles...');

    // Get articles that don't have embeddings
    const result = await database.query(`
      SELECT a.id, a.slug, a.title, a.content, a.folder, a.created_at, a.updated_at
      FROM articles a
      LEFT JOIN embeddings e ON a.id = e.article_id
      WHERE e.article_id IS NULL
    `);

    const unindexedArticles = result.rows;
    const failed: string[] = [];
    let indexed = 0;

    for (const row of unindexedArticles) {
      try {
        console.log(`Indexing ${row.slug}...`);

        // Generate chunks
        const chunks = chunkMarkdown(
          `${row.slug}.md`,
          row.title,
          row.content,
          row.created_at.toISOString(),
          row.updated_at.toISOString()
        );

        // Store embeddings
        await this.upsertArticleEmbeddings(row.id, chunks);
        indexed++;

      } catch (error) {
        console.error(`Error indexing ${row.slug}:`, error);
        failed.push(row.slug);
      }
    }

    console.log(`Indexed ${indexed} articles, ${failed.length} failed`);
    return { indexed, failed };
  }

  /**
   * Update embeddings for a specific article (called after article updates)
   */
  async updateArticleEmbeddings(slug: string): Promise<void> {
    const article = await databaseArticleService.readArticle(slug);
    if (!article) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    const articleId = await databaseArticleService.getArticleId(slug);
    if (!articleId) {
      throw new Error(`Article with slug '${slug}' not found`);
    }

    // Get article metadata for modified date
    const articles = await databaseArticleService.listArticles();
    const articleMeta = articles.find(a => a.slug === slug);
    if (!articleMeta) {
      throw new Error(`Article metadata for slug '${slug}' not found`);
    }

    // Generate new chunks
    const chunks = chunkMarkdown(
      `${article.slug}.md`,
      article.title,
      article.content,
      article.created,
      articleMeta.modified
    );

    // Update embeddings
    await this.upsertArticleEmbeddings(articleId, chunks);
  }
}

// Export singleton instance
export const databaseEmbeddingService = new DatabaseEmbeddingService();