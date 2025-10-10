import { readFile, writeFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { Chunk, calculateContentHash } from './chunking';
import { generateEmbedding, cosineSimilarity } from './embedding';

const DATA_DIR = process.env.DATA_DIR || '/data';
const INDEX_FILE = join(DATA_DIR, 'index.vectors.jsonl');

export interface ChunkWithVector extends Chunk {
  vector: number[];
  contentHash: string;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  snippet: string;
}

// Load all chunks from the index
async function loadIndex(): Promise<ChunkWithVector[]> {
  if (!existsSync(INDEX_FILE)) {
    return [];
  }
  
  try {
    const content = await readFile(INDEX_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error('Error loading index:', error);
    return [];
  }
}

// Save the entire index
async function saveIndex(chunks: ChunkWithVector[]): Promise<void> {
  const content = chunks.map(chunk => JSON.stringify(chunk)).join('\n');
  await writeFile(INDEX_FILE, content + '\n', 'utf-8');
}

// Add or update chunks for a specific article
export async function upsertArticleChunks(
  filename: string,
  chunks: Chunk[]
): Promise<void> {
  const allChunks = await loadIndex();
  
  // Remove existing chunks for this file
  const filteredChunks = allChunks.filter(c => c.filename !== filename);
  
  // Generate embeddings for new chunks
  const chunksWithVectors: ChunkWithVector[] = [];
  
  for (const chunk of chunks) {
    try {
      const vector = await generateEmbedding(chunk.text);
      const contentHash = calculateContentHash(chunk.text);
      
      chunksWithVectors.push({
        ...chunk,
        vector,
        contentHash,
      });
    } catch (error) {
      console.error(`Error embedding chunk ${chunk.id}:`, error);
      // Skip this chunk if embedding fails
    }
  }
  
  // Add new chunks and save
  const updatedChunks = [...filteredChunks, ...chunksWithVectors];
  await saveIndex(updatedChunks);
  
  console.log(`Indexed ${chunksWithVectors.length} chunks for ${filename}`);
}

// Remove all chunks for a specific article
export async function deleteArticleChunks(filename: string): Promise<void> {
  const allChunks = await loadIndex();
  const filteredChunks = allChunks.filter(c => c.filename !== filename);
  await saveIndex(filteredChunks);
  
  console.log(`Deleted chunks for ${filename}`);
}

// Perform semantic search
export async function semanticSearch(query: string, k: number = 5): Promise<SearchResult[]> {
  const allChunks = await loadIndex();
  
  if (allChunks.length === 0) {
    return [];
  }
  
  // Generate embedding for the query
  const queryVector = await generateEmbedding(query);
  
  // Calculate similarity for each chunk
  const results = allChunks.map(chunk => {
    const score = cosineSimilarity(queryVector, chunk.vector);
    const snippet = generateSnippet(chunk.text, 200);
    
    return {
      chunk: {
        id: chunk.id,
        filename: chunk.filename,
        title: chunk.title,
        headingPath: chunk.headingPath,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        created: chunk.created,
        modified: chunk.modified,
      },
      score,
      snippet,
    };
  });
  
  // Sort by score (descending) and return top k
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, k);
}

// Hybrid search combining title and semantic search
export async function hybridSearch(query: string, k: number = 5): Promise<SearchResult[]> {
  const { searchArticles } = await import('./articles');
  
  // Get semantic search results
  const semanticResults = await semanticSearch(query, k * 2);
  
  // Get title search results
  const titleMatches = await searchArticles(query);
  
  // Create a map to track boosted filenames from title matches
  const titleMatchBoost = new Map<string, number>();
  titleMatches.forEach((article, index) => {
    // Higher boost for earlier title matches
    const boost = 0.3 * (1 - index / titleMatches.length);
    titleMatchBoost.set(article.filename, boost);
  });
  
  // Boost semantic results that also match titles
  const boostedResults = semanticResults.map(result => {
    const boost = titleMatchBoost.get(result.chunk.filename) || 0;
    return {
      ...result,
      score: Math.min(1.0, result.score + boost), // Cap at 1.0
    };
  });
  
  // Re-sort by boosted scores
  boostedResults.sort((a, b) => b.score - a.score);
  
  // Return top k results
  return boostedResults.slice(0, k);
}

// Generate a snippet from text
function generateSnippet(text: string, maxLength: number): string {
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

// Rebuild the entire index from scratch
export async function rebuildIndex(): Promise<void> {
  const { listArticles, readArticle } = await import('./articles');
  const { chunkMarkdown } = await import('./chunking');
  
  console.log('Rebuilding vector index...');
  
  const articles = await listArticles();
  const allChunksWithVectors: ChunkWithVector[] = [];
  
  for (const article of articles) {
    console.log(`Processing ${article.filename}...`);
    
    const fullArticle = await readArticle(article.filename);
    if (!fullArticle) {
      console.log(`Skipping ${article.filename} - not found`);
      continue;
    }
    
    const chunks = chunkMarkdown(
      article.filename,
      article.title,
      fullArticle.content,
      article.created,
      article.modified
    );
    
    for (const chunk of chunks) {
      try {
        const vector = await generateEmbedding(chunk.text);
        const contentHash = calculateContentHash(chunk.text);
        
        allChunksWithVectors.push({
          ...chunk,
          vector,
          contentHash,
        });
      } catch (error) {
        console.error(`Error embedding chunk ${chunk.id}:`, error);
      }
    }
  }
  
  await saveIndex(allChunksWithVectors);
  console.log(`Rebuilt index with ${allChunksWithVectors.length} chunks from ${articles.length} articles`);
}

// Get index statistics
export async function getIndexStats(): Promise<{ totalChunks: number; totalArticles: number }> {
  const allChunks = await loadIndex();
  const uniqueFiles = new Set(allChunks.map(c => c.filename));
  
  return {
    totalChunks: allChunks.length,
    totalArticles: uniqueFiles.size,
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
  const { listArticles } = await import('./articles');
  
  const allChunks = await loadIndex();
  const allArticles = await listArticles();
  
  // Group chunks by filename
  const chunksByFile = new Map<string, number>();
  allChunks.forEach(chunk => {
    chunksByFile.set(chunk.filename, (chunksByFile.get(chunk.filename) || 0) + 1);
  });
  
  // Identify indexed and unindexed files
  const indexedFiles: Array<{ filename: string; chunks: number }> = [];
  const unindexedFiles: string[] = [];
  
  allArticles.forEach(article => {
    const chunkCount = chunksByFile.get(article.filename) || 0;
    if (chunkCount > 0) {
      indexedFiles.push({ filename: article.filename, chunks: chunkCount });
    } else {
      unindexedFiles.push(article.filename);
    }
  });
  
  return {
    totalChunks: allChunks.length,
    indexedArticles: indexedFiles.length,
    totalArticles: allArticles.length,
    unindexedFiles,
    indexedFiles,
  };
}

// Index only unindexed articles
export async function indexUnindexedArticles(): Promise<{ indexed: number; failed: string[] }> {
  const { listArticles, readArticle } = await import('./articles');
  const { chunkMarkdown } = await import('./chunking');
  
  console.log('Indexing unindexed articles...');
  
  const stats = await getDetailedIndexStats();
  const failed: string[] = [];
  let indexed = 0;
  
  for (const filename of stats.unindexedFiles) {
    try {
      console.log(`Indexing ${filename}...`);
      
      const allArticles = await listArticles();
      const article = allArticles.find(a => a.filename === filename);
      if (!article) {
        console.log(`Article ${filename} not found in list`);
        failed.push(filename);
        continue;
      }
      
      const fullArticle = await readArticle(filename);
      if (!fullArticle) {
        console.log(`Could not read ${filename}`);
        failed.push(filename);
        continue;
      }
      
      const chunks = chunkMarkdown(
        article.filename,
        article.title,
        fullArticle.content,
        article.created,
        article.modified
      );
      
      await upsertArticleChunks(filename, chunks);
      indexed++;
    } catch (error) {
      console.error(`Error indexing ${filename}:`, error);
      failed.push(filename);
    }
  }
  
  console.log(`Indexed ${indexed} articles, ${failed.length} failed`);
  return { indexed, failed };
}
