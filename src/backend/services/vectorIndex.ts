import { databaseEmbeddingService } from './databaseEmbedding.js';
import { Chunk } from './chunking.js';

// Maintain backward compatibility with existing interfaces
export interface ChunkWithVector extends Chunk {
  vector: number[];
  contentHash: string;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  snippet: string;
}

// Helper function to convert filename to slug for database operations
function filenameToSlug(filename: string): string {
  return filename.replace(/\.md$/, '');
}

// Add or update chunks for a specific article
export async function upsertArticleChunks(
  filename: string,
  chunks: Chunk[]
): Promise<void> {
  const slug = filenameToSlug(filename);
  await databaseEmbeddingService.upsertArticleEmbeddingsBySlug(slug, chunks);
  console.log(`Indexed ${chunks.length} chunks for ${filename}`);
}

// Remove all chunks for a specific article
export async function deleteArticleChunks(filename: string): Promise<void> {
  const slug = filenameToSlug(filename);
  await databaseEmbeddingService.deleteArticleEmbeddingsBySlug(slug);
  console.log(`Deleted chunks for ${filename}`);
}

// Perform semantic search
export async function semanticSearch(query: string, k: number = 5): Promise<SearchResult[]> {
  const dbResults = await databaseEmbeddingService.semanticSearch(query, k);
  
  // Convert database results to legacy format (remove articleMetadata)
  return dbResults.map(result => ({
    chunk: result.chunk,
    score: result.score,
    snippet: result.snippet
  }));
}

// Hybrid search combining title and semantic search
export async function hybridSearch(query: string, k: number = 5): Promise<SearchResult[]> {
  const dbResults = await databaseEmbeddingService.hybridSearch(query, k);
  
  // Convert database results to legacy format (remove articleMetadata)
  return dbResults.map(result => ({
    chunk: result.chunk,
    score: result.score,
    snippet: result.snippet
  }));
}

// Rebuild the entire index from scratch
export async function rebuildIndex(): Promise<void> {
  await databaseEmbeddingService.rebuildIndex();
}

// Get index statistics
export async function getIndexStats(): Promise<{ totalChunks: number; totalArticles: number }> {
  const stats = await databaseEmbeddingService.getIndexStats();
  return {
    totalChunks: stats.totalChunks,
    totalArticles: stats.indexedArticles, // Use indexed articles for backward compatibility
  };
}

// Get detailed index status including unindexed files
export async function getDetailedIndexStats(): Promise<{
  totalChunks: number;
  indexedArticles: number;
  totalArticles: number;
  unindexedFiles: string[];
  indexedFiles: Array<{ filename: string; chunks: number }>;
}> {
  const stats = await databaseEmbeddingService.getIndexStats();
  
  // For backward compatibility, we need to provide filename-based information
  // This is a simplified implementation that doesn't provide detailed per-file stats
  // but maintains the interface
  
  return {
    totalChunks: stats.totalChunks,
    indexedArticles: stats.indexedArticles,
    totalArticles: stats.totalArticles,
    unindexedFiles: [], // Would require complex query to maintain exact compatibility
    indexedFiles: [], // Would require complex query to maintain exact compatibility
  };
}

// Index only unindexed articles
export async function indexUnindexedArticles(): Promise<{ indexed: number; failed: string[] }> {
  const result = await databaseEmbeddingService.indexUnindexedArticles();
  
  // Convert slugs back to filenames for backward compatibility
  const failedFilenames = result.failed.map(slug => `${slug}.md`);
  
  return {
    indexed: result.indexed,
    failed: failedFilenames
  };
}
