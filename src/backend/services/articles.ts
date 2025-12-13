import { databaseArticleService } from './databaseArticles.js';
import { databaseVersionHistoryService } from './databaseVersionHistory.js';
import { chunkMarkdown } from './chunking.js';
import { upsertArticleChunks, deleteArticleChunks } from './vectorIndex.js';

// Maintain backward compatibility with existing interfaces
export interface Article {
  filename: string;  // Will be slug + '.md' for compatibility
  title: string;
  content: string;
  created: string;
  isPublic: boolean;
}

export interface ArticleMetadata {
  filename: string;  // Will be slug + '.md' for compatibility
  title: string;
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

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

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
    created: dbArticle.created,
    isPublic: dbArticle.isPublic
  };
}

// Convert database article metadata to legacy ArticleMetadata interface
function convertToLegacyMetadata(dbMetadata: any): ArticleMetadata {
  return {
    filename: slugToFilename(dbMetadata.slug),
    title: dbMetadata.title,
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
export async function listArticles(): Promise<ArticleMetadata[]> {
  const dbArticles = await databaseArticleService.listArticles();
  return dbArticles.map(convertToLegacyMetadata);
}

// Search articles by title
export async function searchArticles(query: string): Promise<ArticleMetadata[]> {
  const dbArticles = await databaseArticleService.searchArticles(query);
  return dbArticles.map(convertToLegacyMetadata);
}

// Read a single article
export async function readArticle(filename: string): Promise<Article | null> {
  const slug = filenameToSlug(filename);
  const dbArticle = await databaseArticleService.readArticle(slug);
  return dbArticle ? convertToLegacyArticle(dbArticle) : null;
}

// Create a new article
export async function createArticle(title: string, content: string, message?: string): Promise<Article> {
  const cleanedContent = cleanMarkdownContent(content);
  
  // Create article in database
  const dbArticle = await databaseArticleService.createArticle(title, cleanedContent, '', message);
  
  // Create initial version snapshot
  const filename = slugToFilename(dbArticle.slug);
  await createVersionSnapshot(filename, title, cleanedContent, '', message || 'Initial version');
  
  // Index the article for semantic search if enabled
  if (SEMANTIC_SEARCH_ENABLED) {
    try {
      const chunks = chunkMarkdown(filename, title, cleanedContent, dbArticle.created, dbArticle.created);
      await upsertArticleChunks(filename, chunks);
    } catch (error) {
      console.error('Error indexing article:', error);
      // Don't fail the article creation if indexing fails
    }
  }
  
  return convertToLegacyArticle(dbArticle);
}

// Update an existing article
export async function updateArticle(filename: string, title: string, content: string, message?: string): Promise<Article> {
  const cleanedContent = cleanMarkdownContent(content);
  const slug = filenameToSlug(filename);
  
  // Get existing article to preserve creation date
  const existing = await databaseArticleService.readArticle(slug);
  if (!existing) {
    throw new Error(`Article ${filename} not found`);
  }
  
  // Update article in database (this handles slug changes automatically)
  const updatedArticle = await databaseArticleService.updateArticle(slug, title, cleanedContent, existing.folder, message);
  
  // Create version snapshot
  const newFilename = slugToFilename(updatedArticle.slug);
  await createVersionSnapshot(newFilename, title, cleanedContent, existing.folder, message || 'Updated article');
  
  // Handle search index updates
  if (SEMANTIC_SEARCH_ENABLED) {
    try {
      // If slug changed, delete old index entries
      if (filename !== newFilename) {
        await deleteArticleChunks(filename);
      }
      
      // Add/update index entries with new filename
      const chunks = chunkMarkdown(newFilename, title, cleanedContent, existing.created, updatedArticle.created);
      await upsertArticleChunks(newFilename, chunks);
    } catch (error) {
      console.error('Error re-indexing article:', error);
      // Don't fail the article update if indexing fails
    }
  }
  
  return convertToLegacyArticle(updatedArticle);
}

// Delete an article
export async function deleteArticle(filename: string): Promise<void> {
  const slug = filenameToSlug(filename);
  
  // Delete from database (this will cascade to version history and embeddings)
  await databaseArticleService.deleteArticle(slug);
  
  // Remove from vector index if semantic search is enabled
  if (SEMANTIC_SEARCH_ENABLED) {
    try {
      await deleteArticleChunks(filename);
    } catch (error) {
      console.error('Error removing article from index:', error);
      // Don't fail the deletion if index removal fails
    }
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
    created: dbVersion.created,
    isPublic: false // Version snapshots are not marked as public
  };
}

// Restore an article to a specific version
export async function restoreArticleVersion(filename: string, versionId: string, message?: string): Promise<Article> {
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
  
  // Re-index the article for semantic search if enabled
  if (SEMANTIC_SEARCH_ENABLED) {
    try {
      const chunks = chunkMarkdown(filename, restoredArticle.title, restoredArticle.content, restoredArticle.created, restoredArticle.created);
      await upsertArticleChunks(filename, chunks);
    } catch (error) {
      console.error('Error re-indexing article after restore:', error);
      // Don't fail the restore if indexing fails
    }
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
