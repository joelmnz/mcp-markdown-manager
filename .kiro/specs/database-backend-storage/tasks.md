# Implementation Plan

- [x] 1. Set up database infrastructure and schema
  - Install PostgreSQL dependencies (pg, @types/pg)
  - Create database connection service with connection pooling
  - Implement database schema initialization with all required tables
  - Add database configuration environment variables
  - _Requirements: 1.1, 6.1_

- [ ]* 1.1 Write property test for database initialization
  - **Property 1: Database initialization consistency**
  - **Validates: Requirements 1.1, 6.1**

- [x] 2. Implement core database services

- [x] 2.1 Create database article service
  - Implement DatabaseArticleService with CRUD operations using PostgreSQL
  - Add slug generation and validation logic
  - Implement folder hierarchy support
  - _Requirements: 1.2, 2.1, 2.2, 2.5_

- [ ]* 2.2 Write property test for metadata separation
  - **Property 1: Metadata separation consistency**
  - **Validates: Requirements 1.2, 1.5, 7.2, 7.3**

- [ ]* 2.3 Write property test for database-only operations
  - **Property 2: Database-only operations**
  - **Validates: Requirements 1.3**

- [ ]* 2.4 Write property test for folder hierarchy management
  - **Property 4: Folder hierarchy management**
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [x] 2.5 Create version history service
  - Implement version creation and management with numeric version IDs
  - Add version retrieval and restoration functionality
  - Implement version cleanup operations
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ]* 2.6 Write property test for version history lifecycle
  - **Property 5: Version history lifecycle**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

- [x] 2.7 Create database embedding service
  - Implement embedding storage and retrieval using PostgreSQL with vector extension
  - Add semantic search functionality with database queries
  - Implement embedding lifecycle management (create, update, delete)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ]* 2.8 Write property test for embedding lifecycle management
  - **Property 6: Embedding lifecycle management**
  - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 3. Implement import utility for migration

- [x] 3.1 Create markdown file import service
  - Implement directory scanning for *.md files
  - Add frontmatter parsing and metadata extraction
  - Create conflict detection and resolution logic
  - Use filename (without .md) as slug for URL compatibility
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 3.2 Write property test for import frontmatter processing
  - **Property 7: Import frontmatter processing**
  - **Validates: Requirements 5.2, 5.3, 5.5**

- [x] 3.3 Implement batch import operations
  - Add batch processing for large datasets
  - Implement transaction management for import operations
  - Add progress reporting and error handling
  - _Requirements: 5.1, 5.4, 5.5_

- [x] 4. Update existing services to use database backend

- [x] 4.1 Replace file-based article service
  - Update articles.ts to use DatabaseArticleService
  - Maintain existing API interface for backward compatibility
  - Remove file system operations and replace with database queries
  - _Requirements: 1.3, 7.1, 7.4_

- [ ]* 4.2 Write property test for API compatibility preservation
  - **Property 9: API compatibility preservation**
  - **Validates: Requirements 7.1, 7.4, 7.5**

- [x] 4.3 Update embedding and search services
  - Replace vectorIndex.ts file operations with database operations
  - Update chunking service to work with database article IDs
  - Maintain existing search API interfaces
  - _Requirements: 4.2, 4.3, 7.1_

- [x] 4.4 Update MCP server implementation
  - Modify MCP server to use database services
  - Ensure all MCP tools continue to work with database backend
  - Maintain existing MCP API responses and behavior
  - _Requirements: 7.4_

- [x] 5. Add error handling and validation

- [x] 5.1 Implement database error handling
  - Add connection error handling with graceful degradation
  - Implement transaction rollback on failures
  - Add user-friendly error messages for UI
  - _Requirements: 1.4_

- [ ]* 5.2 Write property test for error handling stability
  - **Property 3: Error handling stability**
  - **Validates: Requirements 1.4**

- [x] 5.3 Add database constraint enforcement
  - Implement referential integrity validation
  - Add data validation for slugs, folders, and content
  - Handle constraint violations appropriately
  - _Requirements: 6.5_

- [ ]* 5.4 Write property test for database constraint enforcement
  - **Property 8: Database constraint enforcement**
  - **Validates: Requirements 6.5**

- [x] 6. Create migration command and utilities

- [x] 6.1 Create import command line utility
  - Add CLI command for importing existing markdown files
  - Implement dry-run mode for import validation
  - Add conflict resolution options and user prompts
  - _Requirements: 5.1, 5.4_

- [x] 6.2 Add database migration scripts
  - Create database setup and teardown scripts
  - Add schema migration utilities for future updates
  - Implement data validation and verification tools
  - _Requirements: 6.1, 6.2_

- [x] 7. Update configuration and environment

- [x] 7.1 Add database configuration
  - Add database connection environment variables
  - Update Docker configuration for PostgreSQL
  - Add database health checks to server startup
  - _Requirements: 1.1, 6.1_

- [x] 7.2 Update build and deployment scripts
  - Modify Docker Compose to include PostgreSQL service
  - Update production deployment configuration
  - Add database backup and restore procedures
  - _Requirements: 6.4_

- [x] 8. Integration and compatibility testing

- [x] 8.1 Test API endpoint compatibility
  - Verify all existing API endpoints return identical responses
  - Test public article access and authentication
  - Validate MCP server functionality with database backend
  - _Requirements: 7.1, 7.4_

- [ ]* 8.2 Write integration tests for end-to-end workflows
  - Test complete article lifecycle (create, read, update, delete)
  - Test version history operations
  - Test import and search functionality
  - _Requirements: 1.2, 3.1, 5.5_

- [ ] 8.3 Performance and load testing
  - Test database performance with large datasets
  - Validate embedding search performance
  - Test concurrent operations and connection pooling
  - _Requirements: 6.3_

- [x] 9. Documentation and cleanup

- [x] 9.1 Update API documentation
  - Document new database configuration options
  - Update import utility documentation
  - Add migration guide for existing installations
  - _Requirements: 5.1, 6.1_

- [x] 9.2 Clean up legacy file-based code
  - Remove unused file system operations
  - Clean up version history file management code
  - Remove vector index file operations
  - _Requirements: 1.3_

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.