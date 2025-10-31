import { readdir, readFile, writeFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { chunkMarkdown } from './chunking';
import { upsertArticleChunks, deleteArticleChunks } from './vectorIndex';

export interface Article {
  filename: string;
  title: string;
  content: string;
  created: string;
  isPublic: boolean;
}

export interface ArticleMetadata {
  filename: string;
  title: string;
  created: string;
  // Filesystem last modified time, used for sorting in listings
  modified: string;
  isPublic: boolean;
}

const DATA_DIR = process.env.DATA_DIR || '/data';
const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

// Clean markdown content by trimming leading newlines and whitespace
// Returns cleaned content or throws error if empty
function cleanMarkdownContent(content: string): string {
  // Trim leading newlines and carriage returns
  const cleaned = content.replace(/^[\n\r]+/, '');
  
  // Check if content is empty after cleaning
  if (!cleaned.trim()) {
    throw new Error('Content cannot be empty');
  }
  
  return cleaned;
}

// Parse frontmatter from markdown content
function parseFrontmatter(content: string): { title?: string; created?: string; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { body: content };
  }
  
  const frontmatter = match[1];
  // Remove leading newlines from body to prevent accumulation
  const body = match[2].replace(/^[\n\r]+/, '');
  const result: { title?: string; created?: string; body: string } = { body };
  
  frontmatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    if (key === 'title') result.title = value;
    if (key === 'created') result.created = value;
  });
  
  return result;
}

// Extract title from markdown content (first # heading)
function extractTitle(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }
  return 'Untitled';
}

// Generate URL-friendly filename from title
export function generateFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim() + '.md';
}

// Check if article is public
export async function isArticlePublic(filename: string): Promise<boolean> {
  const publicFilepath = join(DATA_DIR, `${filename}.public`);
  return existsSync(publicFilepath);
}

// Toggle public state
export async function setArticlePublic(filename: string, isPublic: boolean): Promise<void> {
  const publicFilepath = join(DATA_DIR, `${filename}.public`);
  
  if (isPublic) {
    // Create marker file if it doesn't exist
    if (!existsSync(publicFilepath)) {
      await writeFile(publicFilepath, '', 'utf-8');
    }
  } else {
    // Remove marker file if it exists
    if (existsSync(publicFilepath)) {
      await unlink(publicFilepath);
    }
  }
}

// Get article by slug (for public access)
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  // Slug is the filename without .md extension
  const filename = `${slug}.md`;
  
  // Check if file exists first
  const filepath = join(DATA_DIR, filename);
  if (!existsSync(filepath)) {
    return null;
  }
  
  const article = await readArticle(filename);
  
  if (!article) {
    return null;
  }
  
  // Only return if article is public
  if (!article.isPublic) {
    return null;
  }
  
  return article;
}

// Create frontmatter string
function createFrontmatter(title: string, created: string): string {
  return `---\ntitle: ${title}\ncreated: ${created}\n---\n\n`;
}

// List all articles with metadata
export async function listArticles(): Promise<ArticleMetadata[]> {
  if (!existsSync(DATA_DIR)) {
    return [];
  }
  
  const files = await readdir(DATA_DIR);
  const mdFiles = files.filter(f => f.endsWith('.md'));
  
  const articles: ArticleMetadata[] = [];
  
  for (const filename of mdFiles) {
    const filepath = join(DATA_DIR, filename);
    // Always read filesystem mtime for reliable "last updated" sorting
    const stats = await stat(filepath);
    const modified = stats.mtime.toISOString();

    const content = await readFile(filepath, 'utf-8');
    const parsed = parseFrontmatter(content);

    // Preserve authored creation date when present; otherwise fall back to modified
    const created = parsed.created || modified;

    const title = parsed.title || extractTitle(parsed.body);
    
    // Check public status
    const isPublic = await isArticlePublic(filename);
    
    articles.push({
      filename,
      title,
      created,
      modified,
      isPublic
    });
  }
  
  // Sort by last modified date (newest first) to reflect most recently updated files in UI
  articles.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  
  return articles;
}

// Search articles by title
export async function searchArticles(query: string): Promise<ArticleMetadata[]> {
  const allArticles = await listArticles();
  const lowerQuery = query.toLowerCase();
  
  return allArticles.filter(article => 
    article.title.toLowerCase().includes(lowerQuery)
  );
}

// Read a single article
export async function readArticle(filename: string): Promise<Article | null> {
  const filepath = join(DATA_DIR, filename);
  
  if (!existsSync(filepath)) {
    return null;
  }
  
  const content = await readFile(filepath, 'utf-8');
  const parsed = parseFrontmatter(content);
  
  let created = parsed.created;
  if (!created) {
    const stats = await stat(filepath);
    // Align with listArticles: use last modified time when no frontmatter date
    created = stats.mtime.toISOString();
  }
  
  const title = parsed.title || extractTitle(parsed.body);
  
  // Check public status
  const isPublic = await isArticlePublic(filename);
  
  return {
    filename,
    title,
    content: parsed.body,
    created,
    isPublic
  };
}

// Create a new article
export async function createArticle(title: string, content: string): Promise<Article> {
  // Clean content and validate it's not empty
  const cleanedContent = cleanMarkdownContent(content);
  
  const filename = generateFilename(title);
  const filepath = join(DATA_DIR, filename);
  
  if (existsSync(filepath)) {
    throw new Error(`Article with filename ${filename} already exists`);
  }
  
  const created = new Date().toISOString();
  const fullContent = createFrontmatter(title, created) + cleanedContent;
  
  await writeFile(filepath, fullContent, 'utf-8');
  
  // Index the article for semantic search if enabled
  if (SEMANTIC_SEARCH_ENABLED) {
    try {
      const stats = await stat(filepath);
      const modified = stats.mtime.toISOString();
      const chunks = chunkMarkdown(filename, title, cleanedContent, created, modified);
      await upsertArticleChunks(filename, chunks);
    } catch (error) {
      console.error('Error indexing article:', error);
      // Don't fail the article creation if indexing fails
    }
  }
  
  return {
    filename,
    title,
    content: cleanedContent,
    created,
    isPublic: false
  };
}

// Update an existing article
export async function updateArticle(filename: string, title: string, content: string): Promise<Article> {
  // Clean content and validate it's not empty
  const cleanedContent = cleanMarkdownContent(content);
  
  const filepath = join(DATA_DIR, filename);
  
  if (!existsSync(filepath)) {
    throw new Error(`Article ${filename} not found`);
  }
  
  // Read existing article to preserve creation date and public status
  const existing = await readArticle(filename);
  if (!existing) {
    throw new Error(`Article ${filename} not found`);
  }
  
  // Generate new filename from new title
  const newFilename = generateFilename(title);
  const newFilepath = join(DATA_DIR, newFilename);
  
  // Check if filename has changed
  if (filename !== newFilename) {
    // Check if new filename already exists
    if (existsSync(newFilepath)) {
      throw new Error(`Article with filename ${newFilename} already exists`);
    }
    
    // Rename the article file
    const fullContent = createFrontmatter(title, existing.created) + cleanedContent;
    await writeFile(newFilepath, fullContent, 'utf-8');
    await unlink(filepath);
    
    // Sync .public marker file if article was public
    if (existing.isPublic) {
      const oldPublicPath = join(DATA_DIR, `${filename}.public`);
      const newPublicPath = join(DATA_DIR, `${newFilename}.public`);
      
      if (existsSync(oldPublicPath)) {
        await writeFile(newPublicPath, '', 'utf-8');
        await unlink(oldPublicPath);
      }
    }
    
    // Update search index with new filename
    if (SEMANTIC_SEARCH_ENABLED) {
      try {
        // Delete old index entries
        await deleteArticleChunks(filename);
        
        // Add new index entries
        const stats = await stat(newFilepath);
        const modified = stats.mtime.toISOString();
        const chunks = chunkMarkdown(newFilename, title, cleanedContent, existing.created, modified);
        await upsertArticleChunks(newFilename, chunks);
      } catch (error) {
        console.error('Error re-indexing article:', error);
        // Don't fail the article update if indexing fails
      }
    }
    
    return {
      filename: newFilename,
      title,
      content: cleanedContent,
      created: existing.created,
      isPublic: existing.isPublic
    };
  }
  
  // Just update content if filename hasn't changed
  const fullContent = createFrontmatter(title, existing.created) + cleanedContent;
  await writeFile(filepath, fullContent, 'utf-8');
  
  // Re-index the article for semantic search if enabled
  if (SEMANTIC_SEARCH_ENABLED) {
    try {
      const stats = await stat(filepath);
      const modified = stats.mtime.toISOString();
      const chunks = chunkMarkdown(filename, title, cleanedContent, existing.created, modified);
      await upsertArticleChunks(filename, chunks);
    } catch (error) {
      console.error('Error re-indexing article:', error);
      // Don't fail the article update if indexing fails
    }
  }
  
  return {
    filename,
    title,
    content: cleanedContent,
    created: existing.created,
    isPublic: existing.isPublic
  };
}

// Delete an article
export async function deleteArticle(filename: string): Promise<void> {
  const filepath = join(DATA_DIR, filename);
  
  if (!existsSync(filepath)) {
    throw new Error(`Article ${filename} not found`);
  }
  
  await unlink(filepath);
  
  // Remove .public marker file if it exists
  const publicFilepath = join(DATA_DIR, `${filename}.public`);
  if (existsSync(publicFilepath)) {
    await unlink(publicFilepath);
  }
  
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
