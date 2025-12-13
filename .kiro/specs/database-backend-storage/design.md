# Design Document

## Overview

This design outlines the migration from file-based article storage to PostgreSQL database storage for the MCP Markdown Manager. The migration will replace the current filesystem-based approach with a robust database backend that separates metadata from content, enables hierarchical folder organization, maintains comprehensive version history, and enhances RAG capabilities through dedicated embedding storage.

The system will maintain full API compatibility while providing improved performance, data integrity, and scalability. A one-time import utility will migrate existing markdown files by extracting YAML frontmatter into database fields and storing clean markdown content separately.

## Architecture

### Current Architecture
- **File-based storage**: Articles stored as `.md` files with YAML frontmatter
- **Version history**: Stored in `.versions` directory with JSON manifests
- **Embeddings**: Stored in `index.vectors.jsonl` file
- **Public markers**: Separate `.public` files for public articles

### New Database Architecture
- **PostgreSQL database**: Centralized storage for all data
- **Normalized schema**: Separate tables for articles, history, and embeddings
- **Metadata fields**: Database columns for title, slug, dates, folder, etc.
- **Clean content**: Pure markdown stored without frontmatter
- **Referential integrity**: Foreign key relationships between tables

### Migration Strategy
1. **Database initialization**: Create schema and tables
2. **Import utility**: Parse existing files and populate database
3. **Service layer update**: Replace file operations with database queries
4. **API compatibility**: Maintain existing interfaces
5. **Cleanup**: Remove file-based storage after successful migration

## Components and Interfaces

### Database Schema

#### Articles Table
```sql
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  folder VARCHAR(500) DEFAULT '' NOT NULL,
  is_public BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

CREATE INDEX idx_articles_folder ON articles(folder);
CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_articles_updated_at ON articles(updated_at DESC);
CREATE INDEX idx_articles_title ON articles USING gin(to_tsvector('english', title));
```

#### Article History Table
```sql
CREATE TABLE article_history (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  folder VARCHAR(500) NOT NULL,
  message TEXT,
  content_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by VARCHAR(255),
  UNIQUE(article_id, version_id)
);

CREATE INDEX idx_article_history_article_id ON article_history(article_id);
CREATE INDEX idx_article_history_created_at ON article_history(created_at DESC);
```

#### Embeddings Table
```sql
CREATE TABLE embeddings (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  chunk_id VARCHAR(255) NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT[] DEFAULT '{}' NOT NULL,
  text_content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  vector VECTOR(512), -- Adjust dimension based on embedding model
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(article_id, chunk_index)
);

CREATE INDEX idx_embeddings_article_id ON embeddings(article_id);
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (vector vector_cosine_ops);
```

### Service Layer Components

#### Database Connection Service
```typescript
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

interface DatabaseService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
}
```

#### Article Service (Updated)
```typescript
interface DatabaseArticle {
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

interface ArticleService {
  listArticles(folder?: string): Promise<ArticleMetadata[]>;
  searchArticles(query: string, folder?: string): Promise<ArticleMetadata[]>;
  readArticle(slug: string): Promise<Article | null>;
  readArticleById(id: number): Promise<Article | null>;
  createArticle(title: string, content: string, folder?: string, message?: string): Promise<Article>;
  updateArticle(slug: string, title: string, content: string, folder?: string, message?: string): Promise<Article>;
  deleteArticle(slug: string): Promise<void>;
  moveArticle(slug: string, newFolder: string): Promise<Article>;
  setArticlePublic(slug: string, isPublic: boolean): Promise<void>;
}
```

#### Version History Service
```typescript
interface VersionHistoryService {
  listVersions(articleId: number): Promise<VersionMetadata[]>;
  getVersion(articleId: number, versionId: number): Promise<Article | null>;
  createVersion(articleId: number, title: string, content: string, folder: string, message?: string): Promise<void>;
  restoreVersion(articleId: number, versionId: number, message?: string): Promise<Article>;
  deleteVersions(articleId: number, versionIds?: number[]): Promise<void>;
}
```

#### Embedding Service (Updated)
```typescript
interface EmbeddingService {
  upsertArticleEmbeddings(articleId: number, chunks: Chunk[]): Promise<void>;
  deleteArticleEmbeddings(articleId: number): Promise<void>;
  semanticSearch(query: string, k?: number, folder?: string): Promise<SearchResult[]>;
  hybridSearch(query: string, k?: number, folder?: string): Promise<SearchResult[]>;
  rebuildIndex(): Promise<void>;
  getIndexStats(): Promise<IndexStats>;
}
```

#### Import Service
```typescript
interface ImportService {
  importFromDirectory(directoryPath: string, options?: ImportOptions): Promise<ImportResult>;
  validateImport(directoryPath: string): Promise<ValidationResult>;
  resolveConflicts(conflicts: ImportConflict[], resolutions: ConflictResolution[]): Promise<void>;
}

interface ImportOptions {
  preserveFolderStructure?: boolean;
  conflictResolution?: 'skip' | 'rename' | 'overwrite';
  dryRun?: boolean;
}

interface ImportResult {
  imported: number;
  skipped: number;
  conflicts: ImportConflict[];
  errors: ImportError[];
}
```

## Data Models

### Core Data Models

#### Article Model (Updated)
```typescript
interface Article {
  slug: string;
  title: string;
  content: string;
  folder: string;
  created: string;
  isPublic: boolean;
}

interface ArticleMetadata {
  slug: string;
  title: string;
  folder: string;
  created: string;
  modified: string;
  isPublic: boolean;
}
```

#### Version Model (Updated)
```typescript
interface VersionMetadata {
  versionId: number;
  createdAt: string;
  message?: string;
  hash: string;
  size: number;
  title: string;
  folder: string;
}
```

#### Embedding Model (Updated)
```typescript
interface DatabaseChunk extends Chunk {
  articleId: number;
  vector: number[];
  contentHash: string;
}

interface SearchResult {
  chunk: Chunk;
  score: number;
  snippet: string;
  articleMetadata: ArticleMetadata;
}
```

### Migration Models

#### Import Models
```typescript
interface ImportConflict {
  sourceFilename: string;
  existingTitle: string;
  newTitle: string;
  existingSlug: string;
  newSlug: string;
  type: 'title' | 'slug';
}

interface ConflictResolution {
  sourceFilename: string;
  action: 'skip' | 'rename' | 'overwrite';
  newTitle?: string;
  newSlug?: string;
}

interface ImportError {
  sourceFilename: string;
  error: string;
  type: 'parse' | 'validation' | 'database';
}

interface ImportOptions {
  preserveFolderStructure?: boolean;
  conflictResolution?: 'skip' | 'rename' | 'overwrite';
  dryRun?: boolean;
  useFilenameAsSlug?: boolean; // Default: true - use filename without .md as slug
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After reviewing all testable acceptance criteria, the following properties have been identified and consolidated to eliminate redundancy:

**Consolidated Properties:**
- Properties 1.2, 1.5, 7.2, and 7.3 all relate to metadata separation and can be combined into a comprehensive metadata handling property
- Properties 2.1, 2.2, 2.3, 2.4, and 2.5 can be consolidated into folder management properties
- Properties 3.1, 3.2, 3.3, 3.4, 3.5, and 3.6 can be grouped into version history properties
- Properties 4.1, 4.2, 4.3, 4.4, 4.5, and 4.6 can be consolidated into embedding lifecycle properties
- Properties 5.2, 5.3, and 5.5 can be combined into import processing properties

### Core Properties

**Property 1: Metadata separation consistency**
*For any* article operation (create, update, retrieve), the system should store metadata in dedicated database fields and content as pure markdown, and when reconstructing articles, should combine these fields without any frontmatter processing
**Validates: Requirements 1.2, 1.5, 7.2, 7.3**

**Property 2: Database-only operations**
*For any* article query or operation, the system should interact exclusively with the PostgreSQL database without accessing the filesystem
**Validates: Requirements 1.3**

**Property 3: Error handling stability**
*For any* database operation failure, the system should return appropriate error messages and maintain system stability without crashing
**Validates: Requirements 1.4**

**Property 4: Folder hierarchy management**
*For any* article with a folder path, the system should support creation, filtering, and movement operations while preserving all other article data and defaulting to root level when no folder is specified
**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

**Property 5: Version history lifecycle**
*For any* article modification, the system should create history entries with proper timestamps and metadata, maintain chronological ordering, support version reconstruction, preserve referential integrity, and allow complete history cleanup
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

**Property 6: Embedding lifecycle management**
*For any* article with semantic search enabled, the system should store embeddings with proper references, support database-based similarity queries, regenerate embeddings on updates, and clean up embeddings when articles are deleted
**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

**Property 7: Import frontmatter processing**
*For any* markdown file with YAML frontmatter, the import process should extract metadata into database fields, use the filename (without .md extension) as the slug to preserve URL compatibility, remove frontmatter from content, and ensure imported articles are accessible with clean markdown
**Validates: Requirements 5.2, 5.3, 5.5**

**Property 8: Database constraint enforcement**
*For any* database operation that violates constraints, the system should properly enforce referential integrity and data validation rules
**Validates: Requirements 6.5**

**Property 9: API compatibility preservation**
*For any* existing API endpoint, the database backend should return identical response structures and data as the previous file-based system, using slug as the primary identifier and including dynamic frontmatter reconstruction when needed
**Validates: Requirements 7.1, 7.4, 7.5**

## Error Handling

### Database Connection Errors
- **Connection failures**: Graceful degradation with clear error messages
- **Transaction rollbacks**: Automatic rollback on operation failures
- **Connection pooling**: Proper connection management and cleanup
- **Timeout handling**: Configurable timeouts with appropriate error responses

### Data Validation Errors
- **Schema validation**: Enforce data types and constraints at the database level
- **Business rule validation**: Validate folder paths, filenames, and content requirements
- **Conflict resolution**: Handle duplicate filenames, slugs, and titles appropriately
- **Input sanitization**: Prevent SQL injection and validate user inputs

### Migration Errors
- **Import failures**: Detailed error reporting for failed file imports
- **Partial migrations**: Support for resuming interrupted migrations
- **Rollback capability**: Ability to revert to file-based storage if needed
- **Validation checks**: Pre-migration validation to identify potential issues

### Performance Considerations
- **Query optimization**: Use appropriate indexes and query patterns
- **Batch operations**: Efficient bulk operations for imports and updates
- **Connection pooling**: Manage database connections efficiently
- **Caching strategies**: Cache frequently accessed data when appropriate

## Testing Strategy

### Dual Testing Approach

The testing strategy employs both unit testing and property-based testing to ensure comprehensive coverage:

**Unit Testing:**
- Specific examples demonstrating correct behavior
- Integration points between database and service layers
- Error conditions and edge cases
- API endpoint compatibility verification

**Property-Based Testing:**
- Universal properties that should hold across all inputs
- Database constraint enforcement
- Data integrity preservation
- API response consistency

**Property-Based Testing Configuration:**
- **Library**: fast-check for TypeScript/JavaScript property-based testing
- **Iterations**: Minimum 100 iterations per property test to ensure thorough coverage
- **Test Tagging**: Each property-based test must include a comment with the format: `**Feature: database-backend-storage, Property {number}: {property_text}**`
- **Property Implementation**: Each correctness property must be implemented by a single property-based test

### Database Testing Strategy

**Test Database Setup:**
- Isolated test database for each test suite
- Database schema initialization before tests
- Transaction rollback after each test for isolation
- Test data factories for generating realistic test data

**Integration Testing:**
- End-to-end API testing with real database
- Migration testing with sample markdown files
- Performance testing for large datasets
- Concurrent operation testing

**Mock Strategy:**
- Mock external dependencies (embedding services, file system)
- Use real database for service layer tests
- Mock database only for unit tests of pure functions
- Integration tests use test database instances

### Test Data Management

**Test Fixtures:**
- Sample markdown files with various frontmatter configurations
- Articles with different folder structures
- Version history scenarios
- Embedding test data

**Data Generators:**
- Random article content generators
- Folder path generators
- Frontmatter generators
- Conflict scenario generators

## Implementation Notes

### Database Setup Requirements

**PostgreSQL Extensions:**
```sql
-- Required for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Required for full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Environment Variables:**
```bash
# Database connection
DATABASE_URL=postgresql://user:password@localhost:5432/article_manager
DB_HOST=localhost
DB_PORT=5432
DB_NAME=article_manager
DB_USER=article_user
DB_PASSWORD=secure_password
DB_SSL=false

# Migration settings
IMPORT_BATCH_SIZE=100
MIGRATION_TIMEOUT=300000

# Embedding settings (existing)
SEMANTIC_SEARCH_ENABLED=true
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
```

### Migration Considerations

**Backward Compatibility:**
- Maintain existing API interfaces during transition
- Use original filename (without .md extension) as slug to preserve URL paths
- Support gradual migration with feature flags
- Preserve existing MCP server functionality
- Maintain public article access patterns

**Performance Optimization:**
- Batch import operations for large datasets
- Use database transactions for consistency
- Implement connection pooling for concurrent access
- Add appropriate indexes for common query patterns

**Data Integrity:**
- Validate all imported data before database insertion
- Implement comprehensive error logging
- Support migration rollback procedures
- Verify data consistency after migration

### Security Considerations

**Database Security:**
- Use parameterized queries to prevent SQL injection
- Implement proper database user permissions
- Encrypt sensitive configuration data
- Use connection pooling with authentication

**Data Protection:**
- Maintain existing authentication mechanisms
- Preserve article privacy settings
- Implement audit logging for data changes
- Secure backup and restore procedures