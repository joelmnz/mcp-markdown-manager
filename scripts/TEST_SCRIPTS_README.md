# Test Scripts Directory

This directory contains specialized test scripts for manual testing and integration testing of specific features.

## ⚠️ Important Note

**For regular testing, use the formal test suite:**
- `bun test` - Run all unit tests (no database required)
- `bun test:integration` - Run integration tests (requires database)
- `bun run precommit` - Full precommit suite

## Scripts in This Directory

### Integration & Manual Testing

These scripts are for manual testing and require a running server/database:

- **test-migration.ts** - Database migration testing
  - Tests schema migrations and database initialization
  - Requires: Database running (`bun run dc:db`)

- **test-server-integration.ts** - Server startup and health endpoint testing
  - Tests server initialization with different configurations
  - Requires: Available port for test server

### Embedding System Tests (Optional Feature)

Tests for the optional semantic search and embedding queue system:

- **test-embedding-queue.ts** - Embedding queue operations
- **test-embedding-queue-simple.ts** - Simplified queue tests
- **test-embedding-queue-config.ts** - Queue configuration validation
- **test-embedding-schema.ts** - Embedding database schema
- **test-bulk-embedding-operations.ts** - Bulk embedding processing
- **test-background-worker.ts** - Background worker testing
- **test-worker-task-processing.ts** - Worker task processing
- **test-mcp-embedding-integration.ts** - MCP embedding integration
- **test-checkpoint-summary.ts** - Embedding checkpoint functionality

### Feature-Specific Tests

- **test-folder-management.ts** - Folder hierarchy operations
- **test-list-folders.ts** - Folder listing functionality
- **test-list-folders-integration.ts** - Folder listing with database
- **test-import-logic.ts** - Article import logic
- **test-properties.ts** - Article properties handling
- **test-base-path-config.ts** - Base path configuration for subpath deployments
- **test-api-client-runtime.ts** - Frontend API client runtime config
- **test-api-compatibility.ts** - API compatibility testing
- **test-mcp-api-key-tracking.ts** - MCP API key tracking
- **test-mcp-tools-definition.ts** - MCP tools definition validation
- **test-service-worker.ts** - PWA service worker testing
- **test-logging-and-metrics.ts** - Logging and metrics collection
- **test-performance-load.ts** - Performance and load testing

## Migration Path

Many core functionality tests have been migrated to the formal test suite:

- ~~test-parsing.ts~~ → `test/unit/parsing.test.ts`
- ~~test-error-handling.ts~~ → `test/unit/validation.test.ts` + service tests
- ~~test-security-validation.ts~~ → `test/unit/validation.test.ts`
- ~~test-import.ts~~ → `test/unit/services/import.test.ts`

## When to Use These Scripts

Use these scripts when:
1. Testing optional features (embeddings, semantic search)
2. Debugging specific integration issues
3. Testing server startup behavior
4. Manual verification of feature-specific functionality

For automated testing and CI/CD, always use the formal test suite (`bun test`).
