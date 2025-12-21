# Requirements Document

## Introduction

This feature migrates the MCP Markdown Manager from file-based article storage to PostgreSQL database storage exclusively. The migration enhances metadata management by storing article metadata in dedicated database fields rather than YAML frontmatter, enables structured article organization through folders, maintains comprehensive version history, and improves RAG capabilities through dedicated embedding storage. The system will include an import utility to preserve existing markdown files during the one-time migration.

## Glossary

- **Article_Manager**: The MCP Markdown Manager application system
- **Database_Backend**: PostgreSQL database storage system replacing file-based storage
- **Article_History_Table**: Database table storing all versions of articles with timestamps
- **Embedding_Table**: Database table storing vector embeddings for semantic search
- **Import_Utility**: Feature allowing bulk import of existing markdown files from directories
- **Article_Folder**: Hierarchical organization field for structuring articles in folders
- **Migration_Service**: Component responsible for one-time data migration from files to database
- **RAG_System**: Retrieval-Augmented Generation system using stored embeddings
- **Article_Metadata_Fields**: Database fields storing title, slug, creation date, modification date, and other metadata
- **Pure_Markdown_Content**: Article body content without YAML frontmatter stored in database text field

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want to replace file-based storage with PostgreSQL database storage exclusively, so that I can benefit from enhanced metadata management and structured data organization.

#### Acceptance Criteria

1. WHEN the system starts THEN the Article_Manager SHALL connect to PostgreSQL and initialize required tables exclusively
2. WHEN articles are created or updated THEN the Database_Backend SHALL store metadata in Article_Metadata_Fields and Pure_Markdown_Content separately
3. WHEN the system queries articles THEN the Database_Backend SHALL return results from PostgreSQL without accessing filesystem
4. WHEN database operations fail THEN the Article_Manager SHALL handle errors gracefully and maintain system stability and provide messages to the UI so the user is aware of any failures
5. WHEN articles are retrieved THEN the Article_Manager SHALL reconstruct complete articles from database fields without frontmatter processing

### Requirement 2

**User Story:** As a content manager, I want to organize articles in folders, so that I can maintain structured storage as the article collection grows beyond flat file limitations.

#### Acceptance Criteria

1. WHEN creating an article THEN the Article_Manager SHALL accept an optional folder path for organization
2. WHEN listing articles THEN the Database_Backend SHALL support filtering by folder hierarchy
3. WHEN moving articles between folders THEN the Article_Manager SHALL update the folder field without data loss
4. WHILE maintaining folder structure THEN the Article_Manager SHALL preserve all existing article metadata and content
5. WHERE no folder is specified THEN the Article_Manager SHALL store articles in the root level e.g. the folder path '' and '/' are both valid for the root folder and sub folders are supported e.g. 'projects/my_first_project'

### Requirement 3

**User Story:** As a developer, I want comprehensive version history in a dedicated table, so that I can track all changes to articles over time with enhanced metadata.

#### Acceptance Criteria

1. WHEN an article is modified THEN the Database_Backend SHALL create a new entry in the Article_History_Table
2. WHEN storing version history THEN the Article_History_Table SHALL include timestamps, and change metadata but not the Embedding data; embeddings should only be kept for the current Article version.
3. WHEN querying article history THEN the Database_Backend SHALL return chronologically ordered version records
4. WHEN retrieving specific versions THEN the Article_Manager SHALL reconstruct the complete article state from history
5. WHILE preserving history THEN the Database_Backend SHALL maintain referential integrity between articles and versions
6. WHEN clearning Article history all history records for that article should be removed.

### Requirement 4

**User Story:** As an AI agent developer, I want embeddings stored in a dedicated table, so that I can enhance RAG scenarios with efficient vector search capabilities.

#### Acceptance Criteria

1. WHEN generating embeddings THEN the Database_Backend SHALL store them in the Embedding_Table with article and text chunk references
2. WHEN performing semantic search THEN the RAG_System SHALL query embeddings directly from the database
3. WHEN articles are updated THEN the Database_Backend SHALL regenerate and update corresponding embeddings
4. WHEN embeddings are queried THEN the Database_Backend SHALL return vector data with associated article metadata
5. WHERE semantic search is enabled THEN the Embedding_Table SHALL support efficient similarity queries
6. WHEN articles are deleted the embeddings should also be deleted for that article.

### Requirement 5

**User Story:** As a user with existing markdown files, I want a one-time import utility, so that I can migrate my current articles to the database without losing any content or metadata.

#### Acceptance Criteria

1. WHEN running the import utility THEN the Import_Utility SHALL scan the specified directory for markdown files `*.md`
2. WHEN importing files THEN the Migration_Service SHALL parse YAML frontmatter into Article_Metadata_Fields and store Pure_Markdown_Content separately
3. WHEN processing existing files THEN the Import_Utility SHALL extract metadata from frontmatter and remove it from article body content
4. IF duplicate articles are detected THEN the Import_Utility SHALL provide conflict resolution options such as article title rename
5. WHEN import completes THEN the Migration_Service SHALL verify all articles are accessible through the database backend with clean markdown content

### Requirement 6

**User Story:** As a system administrator, I want database schema management, so that I can deploy and maintain the PostgreSQL backend with proper migrations and indexing.

#### Acceptance Criteria

1. WHEN initializing the database THEN the Database_Backend SHALL create all required tables with proper schemas
2. WHEN deploying updates THEN the Migration_Service SHALL handle schema migrations without data loss
3. WHEN querying frequently THEN the Database_Backend SHALL use appropriate indexes for performance optimization
4. WHEN backing up data THEN the Database_Backend SHALL support standard PostgreSQL backup and restore procedures
5. WHERE database constraints exist THEN the Database_Backend SHALL enforce data integrity and referential constraints

### Requirement 7

**User Story:** As a developer, I want clean API compatibility after migration, so that existing MCP and web interfaces continue working seamlessly with database storage.

#### Acceptance Criteria

1. WHEN the database backend is active THEN the Article_Manager SHALL maintain identical API responses for all existing endpoints
2. WHEN serving articles to the frontend THEN the Article_Manager SHALL combine Article_Metadata_Fields with Pure_Markdown_Content transparently
3. WHEN processing article updates THEN the Article_Manager SHALL extract metadata from requests and store it in appropriate database fields
4. WHEN the MCP server queries articles THEN the Database_Backend SHALL provide the same interface as the previous file-based system
5. WHERE API consumers expect frontmatter THEN the Article_Manager SHALL reconstruct it dynamically from database fields when needed