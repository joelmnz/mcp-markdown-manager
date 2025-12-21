# Migration Guide: File-Based to Database Backend

This guide provides detailed instructions for migrating from the file-based MCP Markdown Manager to the new PostgreSQL database backend.

## Overview

The migration process transforms your existing markdown files with YAML frontmatter into a structured database format while preserving all content and metadata.

### What Changes

**Before (File-Based)**:
- Articles stored as `.md` files with YAML frontmatter
- Version history in `.versions` directory
- Vector embeddings in `index.vectors.jsonl`
- Public markers as separate `.public` files

**After (Database Backend)**:
- Articles stored in PostgreSQL `articles` table
- Metadata in dedicated database fields
- Version history in `article_history` table
- Vector embeddings in `embeddings` table
- Clean markdown content without frontmatter

## Prerequisites

- Existing file-based MCP Markdown Manager installation
- Docker and Docker Compose
- Bun runtime environment
- At least 2GB free disk space for database

## Migration Steps

### Step 1: Preparation

#### 1.1 Create Comprehensive Backup

```bash
# Create timestamped backup directory
BACKUP_DIR="./migration-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup all data
cp -r ./data "$BACKUP_DIR/data"
cp .env "$BACKUP_DIR/env-backup" 2>/dev/null || echo "No .env file found"

# Backup Docker configuration if customized
cp docker-compose.yml "$BACKUP_DIR/" 2>/dev/null || true

echo "Backup created in: $BACKUP_DIR"
```

#### 1.2 Inventory Existing Data

```bash
# Count existing articles
find ./data -name "*.md" -type f | wc -l

# Check for version history
ls -la ./data/.versions/ 2>/dev/null || echo "No version history found"

# Check for vector index
ls -la ./data/index.vectors.jsonl 2>/dev/null || echo "No vector index found"

# Check for public markers
find ./data -name "*.public" -type f | wc -l
```

#### 1.3 Update Application Code

```bash
# Pull latest database-backend version
git pull origin main  # or appropriate branch

# Install new dependencies
bun install
```

### Step 2: Database Setup

#### 2.1 Configure Environment

```bash
# Copy new environment template
cp .env.example .env

# Edit .env with your configuration
# Required variables:
# - AUTH_TOKEN (keep your existing token)
# - DB_PASSWORD (set a secure password)
```

#### 2.2 Start Database

```bash
# Start PostgreSQL container
docker compose up -d postgres

# Wait for database to be ready
echo "Waiting for database to start..."
until docker compose exec postgres pg_isready -U article_user -d article_manager; do
  sleep 2
done
echo "Database is ready!"
```

#### 2.3 Initialize Database Schema

The application automatically initializes the database schema on startup. You can verify the setup with:

```bash
# Verify database health
bun run db:health

# Check database information
bun run db:info
```

Note: `bun run db:init` is available for manual schema updates but is not required for standard migration.

### Step 3: Migration Validation

#### 3.1 Validate Import

```bash
# Validate all files can be imported
bun run import validate ./data

# Get detailed preview
bun run import preview ./data --preserve-folders > migration-preview.txt

# Review the preview
less migration-preview.txt
```

#### 3.2 Check for Conflicts

```bash
# Get import statistics
bun run import stats ./data

# If conflicts exist, review them carefully
# Conflicts typically occur with:
# - Duplicate titles
# - Duplicate slugs (generated from filenames)
# - Invalid markdown syntax
```

### Step 4: Execute Migration

#### 4.1 Interactive Migration (Recommended)

```bash
# Start interactive migration
bun run import import ./data --conflict interactive --preserve-folders

# Follow prompts to resolve any conflicts
# Options for each conflict:
# - Skip: Leave existing article unchanged
# - Overwrite: Replace existing with imported version
# - Rename: Create new article with modified title/slug
```

#### 4.2 Automated Migration (For Large Datasets)

```bash
# Skip conflicts (safest for automation)
bun run import import ./data --conflict skip --preserve-folders --batch-size 50

# Or use dry-run first to see what would happen
bun run import import ./data --conflict skip --preserve-folders --dry-run
```

### Step 5: Verification

#### 5.1 Verify Database Content

```bash
# Check database health
bun run db:health

# Get database statistics
bun run db:info

# Validate data integrity
bun run db:validate
```

#### 5.2 Test Application

```bash
# Start the application
bun run start

# In another terminal, test API endpoints
AUTH_TOKEN="your-token-here"

# Test health endpoint
curl http://localhost:5000/health

# Test article listing
curl -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:5000/api/articles

# Test article reading
curl -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:5000/api/articles/your-article-slug
```

#### 5.3 Verify Web Interface

1. Open http://localhost:5000 in your browser
2. Login with your AUTH_TOKEN
3. Verify articles are displayed correctly
4. Test search functionality
5. Test article creation and editing

### Step 6: Semantic Search Migration (If Enabled)

#### 6.1 Rebuild Vector Index

```bash
# If you had semantic search enabled, rebuild the index
bun run reindex

# This will:
# - Process all articles in the database
# - Generate new embeddings
# - Store them in the embeddings table
```

#### 6.2 Test Semantic Search

```bash
# Test semantic search API
curl -H "Authorization: Bearer $AUTH_TOKEN" \
  "http://localhost:5000/api/search?query=your+search+terms&k=5"
```

### Step 7: Production Deployment

#### 7.1 Production Configuration

```bash
# Update environment for production
export NODE_ENV=production
export DB_MAX_CONNECTIONS=50
export DB_IDLE_TIMEOUT=60000

# Use production Docker Compose
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### 7.2 Setup Automated Backups

```bash
# Run a backup manually to verify it works
bun run db:backup:auto

# To automate, add to crontab (e.g., every day at 2 AM)
# 0 2 * * * cd /path/to/app && PGPASSWORD=your-password ./scripts/backup-automation.sh backup

# Verify backup files
ls -la ./backups/
```

## Troubleshooting

### Common Migration Issues

#### Database Connection Errors

```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Verify environment variables
echo $DB_PASSWORD
echo $DB_HOST

# Test manual connection
psql postgresql://article_user:$DB_PASSWORD@localhost:5432/article_manager
```

#### Import Failures

```bash
# Check for file permission issues
ls -la ./data/

# Validate individual files
bun run import validate ./data/specific-file.md

# Check for encoding issues
file ./data/*.md | grep -v "UTF-8"
```

#### Performance Issues

```bash
# Use smaller batch sizes
bun run import import ./data --batch-size 10

# Monitor database performance
docker stats mcp-markdown-postgres

# Check database connections
bun run db:info
```

### Recovery Procedures

#### Partial Migration Failure

```bash
# Check what was imported
bun run db:info

# Continue migration from where it left off
bun run import import ./data --conflict skip --preserve-folders
```

#### Complete Rollback

```bash
# Stop all services
docker-compose down

# Restore from backup
rm -rf ./data
cp -r "$BACKUP_DIR/data" ./data

# Restore environment
cp "$BACKUP_DIR/env-backup" .env

# Switch back to file-based version (if needed)
git checkout file-based-branch

# Restart with file-based system
bun run start
```

## Post-Migration Cleanup

### After Successful Migration

#### 7.1 Archive Old Data

```bash
# Move old data to archive (don't delete immediately)
mkdir -p ./archive
mv ./data/.versions ./archive/ 2>/dev/null || true
mv ./data/index.vectors.jsonl ./archive/ 2>/dev/null || true
find ./data -name "*.public" -exec mv {} ./archive/ \; 2>/dev/null || true
```

#### 7.2 Update Documentation

- Update any deployment scripts
- Update monitoring configurations
- Update backup procedures
- Inform users of new database requirements

#### 7.3 Monitor Performance

```bash
# Set up regular health checks
echo "0 */6 * * * cd /path/to/app && bun run db:health" | crontab -

# Monitor database size
bun run db:info

# Monitor backup success
ls -la ./backups/
```

## Migration Checklist

- [ ] Created comprehensive backup
- [ ] Inventoried existing data
- [ ] Updated application code
- [ ] Configured environment variables
- [ ] Started and initialized database
- [ ] Validated import readiness
- [ ] Executed migration (interactive or automated)
- [ ] Verified database content
- [ ] Tested application functionality
- [ ] Rebuilt semantic search index (if applicable)
- [ ] Configured production deployment
- [ ] Set up automated backups
- [ ] Archived old data
- [ ] Updated documentation
- [ ] Monitored performance

## Support

If you encounter issues during migration:

1. Check the troubleshooting section above
2. Review application and database logs
3. Verify environment configuration
4. Test with a smaller subset of data
5. Consider reaching out for support with specific error messages

Remember: Always keep your backups until you're completely satisfied with the migration results!