import { readdir, readFile, writeFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export interface Article {
  filename: string;
  title: string;
  content: string;
  created: string;
}

export interface ArticleMetadata {
  filename: string;
  title: string;
  created: string;
}

const DATA_DIR = process.env.DATA_DIR || '/data';

// Parse frontmatter from markdown content
function parseFrontmatter(content: string): { title?: string; created?: string; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { body: content };
  }
  
  const frontmatter = match[1];
  const body = match[2];
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
    const content = await readFile(filepath, 'utf-8');
    const parsed = parseFrontmatter(content);
    
    let created = parsed.created;
    if (!created) {
      const stats = await stat(filepath);
      created = stats.birthtime.toISOString();
    }
    
    const title = parsed.title || extractTitle(parsed.body);
    
    articles.push({
      filename,
      title,
      created
    });
  }
  
  // Sort by creation date (newest first)
  articles.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  
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
    created = stats.birthtime.toISOString();
  }
  
  const title = parsed.title || extractTitle(parsed.body);
  
  return {
    filename,
    title,
    content: parsed.body,
    created
  };
}

// Create a new article
export async function createArticle(title: string, content: string): Promise<Article> {
  const filename = generateFilename(title);
  const filepath = join(DATA_DIR, filename);
  
  if (existsSync(filepath)) {
    throw new Error(`Article with filename ${filename} already exists`);
  }
  
  const created = new Date().toISOString();
  const fullContent = createFrontmatter(title, created) + content;
  
  await writeFile(filepath, fullContent, 'utf-8');
  
  return {
    filename,
    title,
    content,
    created
  };
}

// Update an existing article
export async function updateArticle(filename: string, title: string, content: string): Promise<Article> {
  const filepath = join(DATA_DIR, filename);
  
  if (!existsSync(filepath)) {
    throw new Error(`Article ${filename} not found`);
  }
  
  // Read existing article to preserve creation date
  const existing = await readArticle(filename);
  if (!existing) {
    throw new Error(`Article ${filename} not found`);
  }
  
  const fullContent = createFrontmatter(title, existing.created) + content;
  await writeFile(filepath, fullContent, 'utf-8');
  
  return {
    filename,
    title,
    content,
    created: existing.created
  };
}

// Delete an article
export async function deleteArticle(filename: string): Promise<void> {
  const filepath = join(DATA_DIR, filename);
  
  if (!existsSync(filepath)) {
    throw new Error(`Article ${filename} not found`);
  }
  
  await unlink(filepath);
}
