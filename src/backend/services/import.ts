import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';
import { databaseArticleService } from './databaseArticles.js';
import { database } from './database.js';

// Import-related interfaces
export interface ImportConflict {
  sourceFilename: string;
  existingTitle: string;
  newTitle: string;
  existingSlug: string;
  newSlug: string;
  type: 'title' | 'slug';
}

export interface ConflictResolution {
  sourceFilename: string;
  action: 'skip' | 'rename' | 'overwrite';
  newTitle?: string;
  newSlug?: string;
}

export interface ImportError {
  sourceFilename: string;
  error: string;
  type: 'parse' | 'validation' | 'database';
}

export interface ImportOptions {
  preserveFolderStructure?: boolean;
  conflictResolution?: 'skip' | 'rename' | 'overwrite';
  dryRun?: boolean;
  useFilenameAsSlug?: boolean; // Default: true - use filename without .md as slug
}

export interface ImportResult {
  imported: number;
  skipped: number;
  conflicts: ImportConflict[];
  errors: ImportError[];
}

export interface ValidationResult {
  valid: boolean;
  totalFiles: number;
  conflicts: ImportConflict[];
  errors: ImportError[];
}

export interface ParsedMarkdownFile {
  sourceFilename: string;
  title: string;
  content: string;
  folder: string;
  slug: string;
  created?: string;
  isPublic?: boolean;
}

/**
 * Parse frontmatter from markdown content
 * Reuses the same logic as the existing articles service
 */
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

/**
 * Extract title from markdown content (first # heading)
 */
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

/**
 * Generate slug from filename (without .md extension)
 */
function generateSlugFromFilename(filename: string): string {
  const baseName = basename(filename, '.md');
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Recursively scan directory for markdown files
 */
async function scanMarkdownFiles(directoryPath: string, preserveFolderStructure: boolean = false): Promise<string[]> {
  const files: string[] = [];
  
  if (!existsSync(directoryPath)) {
    throw new Error(`Directory does not exist: ${directoryPath}`);
  }
  
  const entries = await readdir(directoryPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);
    
    if (entry.isDirectory()) {
      if (preserveFolderStructure) {
        // Recursively scan subdirectories
        const subFiles = await scanMarkdownFiles(fullPath, true);
        files.push(...subFiles);
      }
      // Skip directories if not preserving folder structure
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Parse a single markdown file and extract metadata
 */
async function parseMarkdownFile(
  filePath: string, 
  baseDirectory: string, 
  options: ImportOptions
): Promise<ParsedMarkdownFile> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseFrontmatter(content);
  
  // Extract title from frontmatter or content
  const title = parsed.title || extractTitle(parsed.body) || 'Untitled';
  
  // Generate slug from filename (preserving URL compatibility)
  const relativePath = filePath.replace(baseDirectory, '').replace(/^[/\\]/, '');
  const filename = basename(relativePath);
  const slug = options.useFilenameAsSlug !== false 
    ? generateSlugFromFilename(filename)
    : databaseArticleService.generateSlug(title);
  
  // Determine folder path
  let folder = '';
  if (options.preserveFolderStructure) {
    const dirPath = relativePath.replace(filename, '').replace(/[/\\]+$/, '');
    if (dirPath) {
      folder = dirPath.replace(/\\/g, '/'); // Normalize to forward slashes
    }
  }
  
  // Use creation date from frontmatter or file stats
  let created = parsed.created;
  if (!created) {
    const stats = await stat(filePath);
    created = stats.mtime.toISOString();
  }
  
  return {
    sourceFilename: filename,
    title,
    content: parsed.body,
    folder,
    slug,
    created,
    isPublic: false // Default to private
  };
}

/**
 * Check for conflicts with existing articles
 */
async function detectConflicts(parsedFiles: ParsedMarkdownFile[]): Promise<ImportConflict[]> {
  const conflicts: ImportConflict[] = [];
  
  for (const file of parsedFiles) {
    // Check for slug conflicts
    const existingArticle = await databaseArticleService.readArticle(file.slug);
    if (existingArticle) {
      conflicts.push({
        sourceFilename: file.sourceFilename,
        existingTitle: existingArticle.title,
        newTitle: file.title,
        existingSlug: existingArticle.slug,
        newSlug: file.slug,
        type: 'slug'
      });
    }
  }
  
  return conflicts;
}

/**
 * Progress callback for batch operations
 */
export interface ImportProgress {
  processed: number;
  total: number;
  currentFile: string;
  phase: 'scanning' | 'parsing' | 'importing';
}

export type ProgressCallback = (progress: ImportProgress) => void;

/**
 * Batch import configuration
 */
export interface BatchImportOptions extends ImportOptions {
  batchSize?: number; // Number of files to process in each batch
  progressCallback?: ProgressCallback;
  continueOnError?: boolean; // Whether to continue processing if individual files fail
}

/**
 * Import service for migrating markdown files to database
 */
export class ImportService {
  /**
   * Validate import without making changes
   */
  async validateImport(directoryPath: string, options: ImportOptions = {}): Promise<ValidationResult> {
    const errors: ImportError[] = [];
    
    try {
      // Scan for markdown files
      const files = await scanMarkdownFiles(directoryPath, options.preserveFolderStructure);
      
      // Parse all files
      const parsedFiles: ParsedMarkdownFile[] = [];
      for (const filePath of files) {
        try {
          const parsed = await parseMarkdownFile(filePath, directoryPath, options);
          parsedFiles.push(parsed);
        } catch (error) {
          errors.push({
            sourceFilename: basename(filePath),
            error: error instanceof Error ? error.message : 'Unknown parsing error',
            type: 'parse'
          });
        }
      }
      
      // Check for conflicts
      const conflicts = await detectConflicts(parsedFiles);
      
      return {
        valid: errors.length === 0 && conflicts.length === 0,
        totalFiles: files.length,
        conflicts,
        errors
      };
    } catch (error) {
      errors.push({
        sourceFilename: 'directory',
        error: error instanceof Error ? error.message : 'Unknown directory error',
        type: 'validation'
      });
      
      return {
        valid: false,
        totalFiles: 0,
        conflicts: [],
        errors
      };
    }
  }

  /**
   * Import markdown files from directory with batch processing
   */
  async importFromDirectory(directoryPath: string, options: BatchImportOptions = {}): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      conflicts: [],
      errors: []
    };
    
    try {
      // Scan for markdown files
      options.progressCallback?.({
        processed: 0,
        total: 0,
        currentFile: 'Scanning directory...',
        phase: 'scanning'
      });
      
      const files = await scanMarkdownFiles(directoryPath, options.preserveFolderStructure);
      
      // Parse all files with progress reporting
      options.progressCallback?.({
        processed: 0,
        total: files.length,
        currentFile: 'Starting file parsing...',
        phase: 'parsing'
      });
      
      const parsedFiles: ParsedMarkdownFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const filename = basename(filePath);
        
        options.progressCallback?.({
          processed: i,
          total: files.length,
          currentFile: filename,
          phase: 'parsing'
        });
        
        try {
          const parsed = await parseMarkdownFile(filePath, directoryPath, options);
          parsedFiles.push(parsed);
        } catch (error) {
          result.errors.push({
            sourceFilename: filename,
            error: error instanceof Error ? error.message : 'Unknown parsing error',
            type: 'parse'
          });
          
          if (!options.continueOnError) {
            throw error;
          }
        }
      }
      
      // Check for conflicts
      const conflicts = await detectConflicts(parsedFiles);
      result.conflicts = conflicts;
      
      // If dry run, return without importing
      if (options.dryRun) {
        return result;
      }
      
      // Process files in batches with transaction management
      const batchSize = options.batchSize || 50;
      const totalBatches = Math.ceil(parsedFiles.length / batchSize);
      
      options.progressCallback?.({
        processed: 0,
        total: parsedFiles.length,
        currentFile: 'Starting import...',
        phase: 'importing'
      });
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, parsedFiles.length);
        const batch = parsedFiles.slice(batchStart, batchEnd);
        
        // Process batch within a transaction
        await database.transaction(async (client) => {
          for (let i = 0; i < batch.length; i++) {
            const file = batch[i];
            const globalIndex = batchStart + i;
            
            options.progressCallback?.({
              processed: globalIndex,
              total: parsedFiles.length,
              currentFile: file.sourceFilename,
              phase: 'importing'
            });
            
            try {
              // Check if this file has conflicts
              const hasConflict = conflicts.some(c => c.sourceFilename === file.sourceFilename);
              
              if (hasConflict) {
                // Handle based on conflict resolution strategy
                if (options.conflictResolution === 'skip') {
                  result.skipped++;
                  continue;
                } else if (options.conflictResolution === 'overwrite') {
                  // Update existing article
                  await databaseArticleService.updateArticle(
                    file.slug,
                    file.title,
                    file.content,
                    file.folder,
                    `Imported from ${file.sourceFilename}`
                  );
                  result.imported++;
                } else {
                  // Default to skip for now - rename logic would need additional input
                  result.skipped++;
                  continue;
                }
              } else {
                // Create new article
                await databaseArticleService.createArticle(
                  file.title,
                  file.content,
                  file.folder,
                  `Imported from ${file.sourceFilename}`
                );
                result.imported++;
              }
            } catch (error) {
              result.errors.push({
                sourceFilename: file.sourceFilename,
                error: error instanceof Error ? error.message : 'Unknown database error',
                type: 'database'
              });
              
              if (!options.continueOnError) {
                throw error; // This will rollback the transaction
              }
            }
          }
        });
      }
      
      options.progressCallback?.({
        processed: parsedFiles.length,
        total: parsedFiles.length,
        currentFile: 'Import complete',
        phase: 'importing'
      });
      
      return result;
    } catch (error) {
      result.errors.push({
        sourceFilename: 'directory',
        error: error instanceof Error ? error.message : 'Unknown import error',
        type: 'validation'
      });
      
      return result;
    }
  }

  /**
   * Resolve conflicts with specific resolutions
   */
  async resolveConflicts(
    conflicts: ImportConflict[], 
    resolutions: ConflictResolution[]
  ): Promise<void> {
    // This method would be used in an interactive import process
    // For now, it's a placeholder for future implementation
    throw new Error('Conflict resolution not yet implemented');
  }

  /**
   * Import with automatic retry on transient failures
   */
  async importWithRetry(
    directoryPath: string, 
    options: BatchImportOptions = {},
    maxRetries: number = 3
  ): Promise<ImportResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.importFromDirectory(directoryPath, {
          ...options,
          continueOnError: true // Always continue on error for retry logic
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If all retries failed, return error result
    return {
      imported: 0,
      skipped: 0,
      conflicts: [],
      errors: [{
        sourceFilename: 'import',
        error: `Import failed after ${maxRetries} attempts: ${lastError?.message}`,
        type: 'database'
      }]
    };
  }

  /**
   * Import multiple directories in sequence
   */
  async importMultipleDirectories(
    directories: string[], 
    options: BatchImportOptions = {}
  ): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    
    for (let i = 0; i < directories.length; i++) {
      const directory = directories[i];
      
      // Update progress to include directory context
      const originalCallback = options.progressCallback;
      const directoryCallback: ProgressCallback = (progress) => {
        originalCallback?.({
          ...progress,
          currentFile: `[${i + 1}/${directories.length}] ${directory}: ${progress.currentFile}`
        });
      };
      
      const result = await this.importFromDirectory(directory, {
        ...options,
        progressCallback: directoryCallback
      });
      
      results.push(result);
      
      // Stop if there are critical errors and continueOnError is false
      if (!options.continueOnError && result.errors.length > 0) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Get detailed import preview with file-by-file analysis
   */
  async getDetailedImportPreview(directoryPath: string, options: ImportOptions = {}): Promise<{
    files: Array<{
      sourceFilename: string;
      title: string;
      slug: string;
      folder: string;
      hasConflict: boolean;
      conflictType?: 'slug' | 'title';
      parseError?: string;
    }>;
    summary: {
      totalFiles: number;
      validFiles: number;
      conflicts: number;
      errors: number;
    };
  }> {
    const files: Array<{
      sourceFilename: string;
      title: string;
      slug: string;
      folder: string;
      hasConflict: boolean;
      conflictType?: 'slug' | 'title';
      parseError?: string;
    }> = [];
    
    try {
      // Scan for markdown files
      const filePaths = await scanMarkdownFiles(directoryPath, options.preserveFolderStructure);
      
      // Parse all files
      const parsedFiles: ParsedMarkdownFile[] = [];
      for (const filePath of filePaths) {
        const filename = basename(filePath);
        try {
          const parsed = await parseMarkdownFile(filePath, directoryPath, options);
          parsedFiles.push(parsed);
          
          files.push({
            sourceFilename: filename,
            title: parsed.title,
            slug: parsed.slug,
            folder: parsed.folder,
            hasConflict: false
          });
        } catch (error) {
          files.push({
            sourceFilename: filename,
            title: 'Parse Error',
            slug: 'parse-error',
            folder: '',
            hasConflict: false,
            parseError: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // Check for conflicts
      const conflicts = await detectConflicts(parsedFiles);
      
      // Update files with conflict information
      for (const conflict of conflicts) {
        const fileIndex = files.findIndex(f => f.sourceFilename === conflict.sourceFilename);
        if (fileIndex >= 0) {
          files[fileIndex].hasConflict = true;
          files[fileIndex].conflictType = conflict.type;
        }
      }
      
      return {
        files,
        summary: {
          totalFiles: filePaths.length,
          validFiles: parsedFiles.length,
          conflicts: conflicts.length,
          errors: files.filter(f => f.parseError).length
        }
      };
    } catch (error) {
      return {
        files: [],
        summary: {
          totalFiles: 0,
          validFiles: 0,
          conflicts: 0,
          errors: 1
        }
      };
    }
  }

  /**
   * Get import statistics for a directory
   */
  async getImportStats(directoryPath: string, options: ImportOptions = {}): Promise<{
    totalFiles: number;
    validFiles: number;
    conflicts: number;
    errors: number;
  }> {
    const validation = await this.validateImport(directoryPath, options);
    
    return {
      totalFiles: validation.totalFiles,
      validFiles: validation.totalFiles - validation.errors.length,
      conflicts: validation.conflicts.length,
      errors: validation.errors.length
    };
  }
}

// Export singleton instance
export const importService = new ImportService();