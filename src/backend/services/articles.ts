import { databaseArticleService } from './databaseArticles.js';
import { databaseVersionHistoryService } from './databaseVersionHistory.js';
import { chunkMarkdown } from './chunking.js';
import { upsertArticleChunks, deleteArticleChunks } from './vectorIndex.js';
import { embeddingQueueService } from './embeddingQueue.js';
import { embeddingQueueConfigService } from './embeddingQueueConfig.js';

// Maintain backward compatibility with existing interfaces
export interface Article {
  filename: string;  // Will be slug + '.md' for compatibility
  title: string;
  content: string;
  folder?: string;
  created: string;
  isPublic: boolean;
}

export interface ArticleMetadata {
  filename: string;  // Will be slug + '.md' for compatibility
  title: string;
  folder?: string;
  created: string;
  modified: string;
  isPublic: boolean;
}

export interface VersionMetadata {
  versionId: string;
  createdAt: string;
  message?: string;
  hash: string;
  size: number;
  filename: string;
}

export interface VersionManifest {
  versions: VersionMetadata[];
}

// Options interface for article operations
export interface ArticleServiceOptions {
  skipEmbedding?: boolean;
  embeddingPriority?: 'high' | 'normal' | 'low';
}

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

// Helper function to check if background embedding is enabled
function isBackgroundEmbeddingEnabled(): boolean {
  if (!SEMANTIC_SEARCH_ENABLED) return false;
  const config = embeddingQueueConfigService.getConfig();
  return config.enabled;
}

// Helper function to safely handle embedding operations without affecting article CRUD
async function safelyHandleEmbeddingOperation(
  operation: () => Promise<void>,
  operationName: string
): Promise<void> {
  try {
    // Check if embedding queue service is available
    if (!embeddingQueueService) {
      console.warn(`Embedding queue service not available for ${operationName}`);
      return;
    }

    await operation();
  } catch (error) {
    // Log the error but don't throw it to ensure embedding failures don't affect article operations
    console.error(`Error in ${operationName}:`, error);

    // In production, you might want to send this to a monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Could integrate with monitoring service here
      console.error(`Production embedding error in ${operationName}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        operation: operationName
      });
    }

    // Additional safety: if this is a database connection error, we should be extra careful
    if (error instanceof Error && error.message.includes('database')) {
      console.warn(`Database-related embedding error in ${operationName}, article operation will continue normally`);
    }
  }
}

// Helper functions for backward compatibility

// Convert slug to filename format (slug + '.md')
function slugToFilename(slug: string): string {
  return `${slug}.md`;
}

// Convert filename to slug (remove '.md' extension)
function filenameToSlug(filename: string): string {
  return filename.replace(/\.md$/, '');
}

// Convert database article to legacy Article interface
function convertToLegacyArticle(dbArticle: any): Article {
  return {
    filename: slugToFilename(dbArticle.slug),
    title: dbArticle.title,
    content: dbArticle.content,
    folder: dbArticle.folder,
    created: dbArticle.created,
    isPublic: dbArticle.isPublic
  };
}

// Convert database article metadata to legacy ArticleMetadata interface
function convertToLegacyMetadata(dbMetadata: any): ArticleMetadata {
  return {
    filename: slugToFilename(dbMetadata.slug),
    title: dbMetadata.title,
    folder: dbMetadata.folder,
    created: dbMetadata.created,
    modified: dbMetadata.modified,
    isPublic: dbMetadata.isPublic
  };
}

// Clean markdown content by trimming leading newlines and whitespace
function cleanMarkdownContent(content: string): string {
  const cleaned = content.replace(/^[\n\r]+/, '');

  if (!cleaned.trim()) {
    throw new Error('Content cannot be empty');
  }

  return cleaned;
}

// Generate URL-friendly filename from title (for backward compatibility)
export function generateFilename(title: string): string {
  const slug = databaseArticleService.generateSlug(title);
  return slugToFilename(slug);
}

// Check if article is public (backward compatibility)
export async function isArticlePublic(filename: string): Promise<boolean> {
  const slug = filenameToSlug(filename);
  const article = await databaseArticleService.readArticle(slug);
  return article ? article.isPublic : false;
}

// Toggle public state (backward compatibility)
export async function setArticlePublic(filename: string, isPublic: boolean): Promise<void> {
  const slug = filenameToSlug(filename);
  await databaseArticleService.setArticlePublic(slug, isPublic);
}

// Get article by slug (for public access)
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const dbArticle = await databaseArticleService.getPublicArticle(slug);
  return dbArticle ? convertToLegacyArticle(dbArticle) : null;
}

// Helper function to create version snapshot using database service
async function createVersionSnapshot(
  filename: string,
  title: string,
  content: string,
  folder: string,
  message?: string
): Promise<void> {
  const slug = filenameToSlug(filename);
  const articleId = await databaseArticleService.getArticleId(slug);

  if (articleId) {
    await databaseVersionHistoryService.createVersion(
      articleId,
      title,
      content,
      folder,
      message
    );
  }
}

// List all articles with metadata
export async function listArticles(folder?: string): Promise<ArticleMetadata[]> {
  const dbArticles = await databaseArticleService.listArticles(folder);
  return dbArticles.map(convertToLegacyMetadata);
}

// Get all available folders
export async function getFolders(): Promise<string[]> {
  return await databaseArticleService.getFolderHierarchy();
}

// Rename a folder
export async function renameFolder(oldFolderName: string, newFolderName: string): Promise<{ updatedCount: number }> {
  return await databaseArticleService.renameFolder(oldFolderName, newFolderName);
}

// Delete a folder
export async function deleteFolder(folderName: string): Promise<{ updatedCount: number }> {
  return await databaseArticleService.deleteFolder(folderName);
}

// Search articles by title
export async function searchArticles(query: string, folder?: string): Promise<ArticleMetadata[]> {
  const dbArticles = await databaseArticleService.searchArticles(query, folder);
  return dbArticles.map(convertToLegacyMetadata);
}

// Read a single article
export async function readArticle(filename: string): Promise<Article | null> {
  const slug = filenameToSlug(filename);
  const dbArticle = await databaseArticleService.readArticle(slug);
  return dbArticle ? convertToLegacyArticle(dbArticle) : null;
}

// Create a new article
export async function createArticle(title: string, content: string, folder: string = '', message?: string, options?: ArticleServiceOptions): Promise<Article> {
  const cleanedContent = cleanMarkdownContent(content);

  // Create article in database first (ensures article persistence precedes task queuing)
  const dbArticle = await databaseArticleService.createArticle(title, cleanedContent, folder, message);

  // Create initial version snapshot
  const filename = slugToFilename(dbArticle.slug);
  await createVersionSnapshot(filename, title, cleanedContent, folder, message || 'Initial version');

  // Handle embedding generation with failure isolation
  if (isBackgroundEmbeddingEnabled() && !options?.skipEmbedding) {
    await safelyHandleEmbeddingOperation(async () => {
      // Get article ID for task queuing
      const articleId = await databaseArticleService.getArticleId(dbArticle.slug);

      if (articleId) {
        // Queue embedding task for background processing
        const config = embeddingQueueConfigService.getConfig();
        await embeddingQueueService.enqueueTask({
          articleId,
          slug: dbArticle.slug,
          operation: 'create',
          priority: options?.embeddingPriority || 'normal',
          maxAttempts: config.maxRetries,
          scheduledAt: new Date(),
          metadata: {
            filename,
            title,
            contentLength: cleanedContent.length
          }
        });
      }
    }, 'article creation embedding task queuing');
  }

  return convertToLegacyArticle(dbArticle);
}

// Update an existing article
export async function updateArticle(filename: string, title: string, content: string, folder?: string, message?: string, options?: ArticleServiceOptions): Promise<Article> {
  const cleanedContent = cleanMarkdownContent(content);
  const slug = filenameToSlug(filename);

  // Get existing article to preserve creation date
  const existing = await databaseArticleService.readArticle(slug);
  if (!existing) {
    throw new Error(`Article ${filename} not found`);
  }

  // Use existing folder if not provided
  const targetFolder = folder !== undefined ? folder : existing.folder;

  // Update article in database first (this handles slug changes automatically)
  const updatedArticle = await databaseArticleService.updateArticle(slug, title, cleanedContent, targetFolder, message);

  // Create version snapshot
  const newFilename = slugToFilename(updatedArticle.slug);
  await createVersionSnapshot(newFilename, title, cleanedContent, targetFolder, message || 'Updated article');

  // Handle embedding updates with failure isolation
  if (isBackgroundEmbeddingEnabled() && !options?.skipEmbedding) {
    await safelyHandleEmbeddingOperation(async () => {
      // Get article ID for task queuing
      const articleId = await databaseArticleService.getArticleId(updatedArticle.slug);

      if (articleId) {
        // If slug changed, queue a delete task for the old slug first
        if (filename !== newFilename) {
          const oldSlug = filenameToSlug(filename);
          const config = embeddingQueueConfigService.getConfig();
          await embeddingQueueService.enqueueTask({
            articleId,
            slug: oldSlug,
            operation: 'delete',
            priority: options?.embeddingPriority || 'normal',
            maxAttempts: config.maxRetries,
            scheduledAt: new Date(),
            metadata: {
              filename,
              reason: 'slug_change_cleanup'
            }
          });
        }

        // Queue embedding update task for background processing
        const config = embeddingQueueConfigService.getConfig();
        await embeddingQueueService.enqueueTask({
          articleId,
          slug: updatedArticle.slug,
          operation: 'update',
          priority: options?.embeddingPriority || 'normal',
          maxAttempts: config.maxRetries,
          scheduledAt: new Date(),
          metadata: {
            filename: newFilename,
            title,
            contentLength: cleanedContent.length,
            slugChanged: filename !== newFilename
          }
        });
      }
    }, 'article update embedding task queuing');
  }

  return convertToLegacyArticle(updatedArticle);
}

// Delete an article
export async function deleteArticle(filename: string, options?: ArticleServiceOptions): Promise<void> {
  const slug = filenameToSlug(filename);

  // Get article ID before deletion for embedding cleanup
  let articleId: number | null = null;
  if (isBackgroundEmbeddingEnabled() && !options?.skipEmbedding) {
    try {
      articleId = await databaseArticleService.getArticleId(slug);
    } catch (error) {
      console.error('Error getting article ID for embedding cleanup:', error);
      // Continue with deletion even if we can't get the ID
    }
  }

  // Delete from database first (this will cascade to version history and embeddings)
  await databaseArticleService.deleteArticle(slug);

  // Queue embedding cleanup task with failure isolation
  if (isBackgroundEmbeddingEnabled() && !options?.skipEmbedding && articleId) {
    await safelyHandleEmbeddingOperation(async () => {
      const config = embeddingQueueConfigService.getConfig();
      await embeddingQueueService.enqueueTask({
        articleId,
        slug,
        operation: 'delete',
        priority: options?.embeddingPriority || 'normal',
        maxAttempts: config.maxRetries,
        scheduledAt: new Date(),
        metadata: {
          filename,
          reason: 'article_deletion'
        }
      });
    }, 'article deletion embedding cleanup task queuing');
  }
}

// List all versions of an article
export async function listArticleVersions(filename: string): Promise<VersionMetadata[]> {
  const slug = filenameToSlug(filename);
  const articleId = await databaseArticleService.getArticleId(slug);

  if (!articleId) {
    throw new Error(`Article ${filename} not found`);
  }

  const dbVersions = await databaseVersionHistoryService.listVersions(articleId);

  // Convert to legacy format
  return dbVersions.map(v => ({
    versionId: `v${v.versionId}`,
    createdAt: v.createdAt,
    message: v.message,
    hash: v.hash,
    size: v.size,
    filename: `v${v.versionId}.md`
  }));
}

// Get a specific version of an article
export async function getArticleVersion(filename: string, versionId: string): Promise<Article | null> {
  const slug = filenameToSlug(filename);
  const articleId = await databaseArticleService.getArticleId(slug);

  if (!articleId) {
    throw new Error(`Article ${filename} not found`);
  }

  // Extract numeric version ID (remove 'v' prefix)
  const numericVersionId = parseInt(versionId.replace(/^v/, ''), 10);
  if (isNaN(numericVersionId)) {
    return null;
  }

  const dbVersion = await databaseVersionHistoryService.getVersion(articleId, numericVersionId);

  if (!dbVersion) {
    return null;
  }

  return {
    filename,
    title: dbVersion.title,
    content: dbVersion.content,
    folder: dbVersion.folder,
    created: dbVersion.created,
    isPublic: false // Version snapshots are not marked as public
  };
}

// Restore an article to a specific version
export async function restoreArticleVersion(filename: string, versionId: string, message?: string, options?: ArticleServiceOptions): Promise<Article> {
  const slug = filenameToSlug(filename);
  const articleId = await databaseArticleService.getArticleId(slug);

  if (!articleId) {
    throw new Error(`Article ${filename} not found`);
  }

  // Extract numeric version ID (remove 'v' prefix)
  const numericVersionId = parseInt(versionId.replace(/^v/, ''), 10);
  if (isNaN(numericVersionId)) {
    throw new Error(`Invalid version ID: ${versionId}`);
  }

  // Restore using database service
  const restoredArticle = await databaseVersionHistoryService.restoreVersion(
    articleId,
    numericVersionId,
    message || `Restore to ${versionId}`
  );

  // Queue embedding update task with failure isolation
  if (isBackgroundEmbeddingEnabled() && !options?.skipEmbedding) {
    await safelyHandleEmbeddingOperation(async () => {
      const config = embeddingQueueConfigService.getConfig();
      await embeddingQueueService.enqueueTask({
        articleId,
        slug: restoredArticle.slug,
        operation: 'update',
        priority: options?.embeddingPriority || 'normal',
        maxAttempts: config.maxRetries,
        scheduledAt: new Date(),
        metadata: {
          filename,
          title: restoredArticle.title,
          contentLength: restoredArticle.content.length,
          reason: 'version_restore',
          restoredFromVersion: versionId
        }
      });
    }, 'article version restore embedding task queuing');
  }

  return convertToLegacyArticle(restoredArticle);
}

// Delete specific versions or all versions of an article
export async function deleteArticleVersions(filename: string, versionIds?: string[]): Promise<void> {
  const slug = filenameToSlug(filename);
  const articleId = await databaseArticleService.getArticleId(slug);

  if (!articleId) {
    throw new Error(`Article ${filename} not found`);
  }

  if (!versionIds || versionIds.length === 0) {
    // Delete all versions
    await databaseVersionHistoryService.deleteAllVersions(articleId);
    return;
  }

  // Convert version IDs to numeric format (remove 'v' prefix)
  const numericVersionIds = versionIds
    .map(id => parseInt(id.replace(/^v/, ''), 10))
    .filter(id => !isNaN(id));

  if (numericVersionIds.length > 0) {
    await databaseVersionHistoryService.deleteVersions(articleId, numericVersionIds);
  }
}

// Get embedding status for an article (for monitoring and debugging)
export async function getArticleEmbeddingStatus(filename: string): Promise<{
  hasEmbeddings: boolean;
  pendingTasks: number;
  failedTasks: number;
  lastTaskStatus?: string;
  lastError?: string;
} | null> {
  if (!isBackgroundEmbeddingEnabled()) {
    return null;
  }

  try {
    const slug = filenameToSlug(filename);
    const articleId = await databaseArticleService.getArticleId(slug);

    if (!articleId) {
      return null;
    }

    // Get embedding tasks for this article
    const tasks = await embeddingQueueService.getTasksForArticle(articleId);

    const pendingTasks = tasks.filter(t => t.status === 'pending').length;
    const failedTasks = tasks.filter(t => t.status === 'failed').length;
    const lastTask = tasks[0]; // Most recent task

    return {
      hasEmbeddings: tasks.some(t => t.status === 'completed'),
      pendingTasks,
      failedTasks,
      lastTaskStatus: lastTask?.status,
      lastError: lastTask?.errorMessage
    };
  } catch (error) {
    console.error('Error getting article embedding status:', error);
    return null;
  }
}

// Retry failed embedding tasks for an article
export async function retryArticleEmbedding(filename: string, priority: 'high' | 'normal' | 'low' = 'high'): Promise<boolean> {
  if (!isBackgroundEmbeddingEnabled()) {
    return false;
  }

  try {
    const slug = filenameToSlug(filename);
    const articleId = await databaseArticleService.getArticleId(slug);
    const article = await databaseArticleService.readArticle(slug);

    if (!articleId || !article) {
      return false;
    }

    // Queue a new embedding task with high priority
    const config = embeddingQueueConfigService.getConfig();
    await embeddingQueueService.enqueueTask({
      articleId,
      slug: article.slug,
      operation: 'update',
      priority,
      maxAttempts: config.maxRetries,
      scheduledAt: new Date(),
      metadata: {
        filename,
        title: article.title,
        contentLength: article.content.length,
        reason: 'manual_retry'
      }
    });

    return true;
  } catch (error) {
    console.error('Error retrying article embedding:', error);
    return false;
  }
}

// Bulk embedding operations

// Get articles that need embedding updates
export async function getArticlesNeedingEmbedding(): Promise<Array<{
  filename: string;
  slug: string;
  title: string;
  reason: 'missing_embedding' | 'failed_embedding' | 'no_completed_task';
  lastTaskStatus?: string;
  lastError?: string;
}>> {
  if (!isBackgroundEmbeddingEnabled()) {
    return [];
  }

  try {
    const articles = await embeddingQueueService.identifyArticlesNeedingEmbedding();
    return articles.map(article => ({
      filename: slugToFilename(article.slug),
      slug: article.slug,
      title: article.title,
      reason: article.reason,
      lastTaskStatus: article.lastTaskStatus,
      lastError: article.lastError
    }));
  } catch (error) {
    console.error('Error getting articles needing embedding:', error);
    return [];
  }
}

// Queue bulk embedding update for all articles that need it
export async function queueBulkEmbeddingUpdate(
  priority: 'high' | 'normal' | 'low' = 'normal',
  progressCallback?: (progress: {
    totalArticles: number;
    processedArticles: number;
    queuedTasks: number;
    skippedArticles: number;
    errors: string[];
  }) => void
): Promise<{
  totalArticles: number;
  queuedTasks: number;
  skippedArticles: number;
  errors: string[];
  taskIds: string[];
} | null> {
  if (!isBackgroundEmbeddingEnabled()) {
    return null;
  }

  try {
    return await embeddingQueueService.queueBulkEmbeddingUpdate(priority, progressCallback);
  } catch (error) {
    console.error('Error queuing bulk embedding update:', error);
    return null;
  }
}

// Get bulk operation summary
export async function getBulkOperationSummary(operationId: string): Promise<{
  operationId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  processingTasks: number;
  successRate: number;
  averageProcessingTime?: number;
  errors: string[];
} | null> {
  if (!isBackgroundEmbeddingEnabled()) {
    return null;
  }

  try {
    return await embeddingQueueService.getBulkOperationSummary(operationId);
  } catch (error) {
    console.error('Error getting bulk operation summary:', error);
    return null;
  }
}

// List recent bulk operations
export async function listRecentBulkOperations(limit: number = 10): Promise<Array<{
  operationId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  processingTasks: number;
  successRate: number;
  averageProcessingTime?: number;
  errors: string[];
}>> {
  if (!isBackgroundEmbeddingEnabled()) {
    return [];
  }

  try {
    return await embeddingQueueService.listRecentBulkOperations(limit);
  } catch (error) {
    console.error('Error listing recent bulk operations:', error);
    return [];
  }
}
