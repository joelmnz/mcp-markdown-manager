# Deployment Guide

This guide covers deploying the MCP Markdown Manager with PostgreSQL database backend, including migration from file-based storage.

## Prerequisites

- PostgreSQL 12+ with pgvector extension support
- Docker and Docker Compose (recommended)
- Bun runtime environment (for local development)
- Environment variables configured

## Environment Variables

### Required Variables

```bash
# Authentication
AUTH_TOKEN=your-secure-auth-token

# Database Configuration
DB_PASSWORD=your-secure-database-password
```

### Complete Configuration

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=article_manager
DB_USER=article_user
DB_PASSWORD=secure_password
DB_SSL=false
DB_MAX_CONNECTIONS=20
DATABASE_URL=postgresql://article_user:secure_password@localhost:5432/article_manager

# Application Configuration
AUTH_TOKEN=your-secure-auth-token
PORT=5000
NODE_ENV=production
MCP_SERVER_ENABLED=true
DATA_DIR=/data

# Database Pool Settings
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000
DB_HEALTH_CHECK_INTERVAL=30000
DB_CONSTRAINT_REPAIR_ENABLED=true

# Optional Features
SEMANTIC_SEARCH_ENABLED=false
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_API_KEY=

# Backup Configuration
BACKUP_DIR=./backups
RETENTION_DAYS=30
COMPRESS_BACKUPS=true
```

## Database Setup

### 1. Create Database

```sql
CREATE DATABASE article_manager;
CREATE USER article_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE article_manager TO article_user;
```

### 2. Install Extensions

```sql
-- Connect to the database first
\c article_manager

-- Install required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 3. Initialize Schema

```bash
# Automated setup (recommended)
bun run setup --env=production

# Or manual setup
bun run db:init
bun run db:verify
```

## Migration from File-Based Storage

If migrating from the previous file-based system, follow this comprehensive guide:

### Pre-Migration Steps

#### 1. Backup Existing Data

```bash
# Create timestamped backup
cp -r ./data ./data-backup-$(date +%Y%m%d-%H%M%S)

# Backup version history if it exists
if [ -d "./data/.versions" ]; then
  cp -r ./data/.versions ./versions-backup-$(date +%Y%m%d-%H%M%S)
fi

# Backup vector index if it exists
if [ -f "./data/index.vectors.jsonl" ]; then
  cp ./data/index.vectors.jsonl ./vectors-backup-$(date +%Y%m%d-%H%M%S).jsonl
fi
```

#### 2. Validate Migration Readiness

```bash
# Check what will be imported
bun run import validate ./data

# Get detailed preview with folder structure
bun run import preview ./data --preserve-folders

# Check for potential conflicts
bun run import stats ./data
```

### Migration Process

#### 3. Database Setup

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for database to be ready
docker-compose exec postgres pg_isready -U article_user -d article_manager

# Initialize database schema
bun run db:init

# Verify database health
bun run db:health
```

#### 4. Import Articles

**Interactive Migration (Recommended)**:
```bash
# Import with interactive conflict resolution
bun run import import ./data --conflict interactive --preserve-folders
```

**Automated Migration**:
```bash
# Skip conflicts (safest for automated deployment)
bun run import import ./data --conflict skip --preserve-folders

# Or overwrite conflicts (use with caution)
bun run import import ./data --conflict overwrite --preserve-folders
```

**Batch Processing for Large Datasets**:
```bash
# Process in smaller batches
bun run import import ./data --conflict skip --preserve-folders --batch-size 25
```

#### 5. Verify Migration

```bash
# Check database health and connectivity
bun run db:health

# Get database information and statistics
bun run db:info

# Validate data integrity
bun run db:validate

# Check import results
bun run import stats ./data
```

### Post-Migration Steps

#### 6. Rebuild Semantic Search Index (if enabled)

```bash
# Rebuild vector embeddings for all articles
bun run reindex
```

#### 7. Test Application Functionality

```bash
# Start the application
bun run start

# Test key endpoints
curl -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:5000/health
curl -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:5000/api/articles
```

#### 8. Cleanup (Optional)

After verifying successful migration:

```bash
# Remove old file-based data (keep backups!)
# rm -rf ./data  # Only after confirming migration success

# Clean up old vector index
# rm -f ./data/index.vectors.jsonl  # If migration successful
```

### Migration Troubleshooting

#### Common Issues

**Database Connection Errors**:
```bash
# Check PostgreSQL status
docker-compose ps postgres
docker-compose logs postgres

# Test connection manually
psql postgresql://article_user:$DB_PASSWORD@localhost:5432/article_manager
```

**Import Conflicts**:
```bash
# Review conflicts in detail
bun run import preview ./data --preserve-folders

# Handle conflicts manually
bun run import import ./data --conflict interactive
```

**Performance Issues**:
```bash
# Use smaller batch sizes
bun run import import ./data --batch-size 10

# Monitor database performance
bun run db:info
```

#### Rollback Procedure

If migration fails and you need to rollback:

1. **Stop the application**:
   ```bash
   docker-compose down
   ```

2. **Restore file-based data**:
   ```bash
   rm -rf ./data
   cp -r ./data-backup-YYYYMMDD-HHMMSS ./data
   ```

3. **Switch to file-based version**:
   ```bash
   git checkout file-based-version  # If using version control
   ```

4. **Restart with file-based system**:
   ```bash
   bun run start
   ```

### Migration Best Practices

1. **Always backup before migration**
2. **Test migration on a copy of production data first**
3. **Use interactive conflict resolution for important data**
4. **Validate migration results thoroughly**
5. **Keep backups until migration is fully verified**
6. **Plan for downtime during migration**
7. **Have a rollback plan ready**

## Production Deployment

### Automated Deployment (Recommended)

The easiest way to deploy is using the automated deployment scripts:

**Linux/macOS:**
```bash
# Set required environment variables
export AUTH_TOKEN="your-secure-token"
export DB_PASSWORD="your-secure-db-password"

# Run automated deployment
bun run deploy
```

**Windows:**
```powershell
# Set required environment variables
$env:AUTH_TOKEN="your-secure-token"
$env:DB_PASSWORD="your-secure-db-password"

# Run automated deployment
bun run deploy:windows
```

The automated deployment script will:
- Build the application
- Start PostgreSQL with proper configuration
- Initialize the database schema
- Start the full application stack
- Perform health checks
- Display deployment summary

### Manual Docker Deployment

If you prefer manual control:

1. **Build the application:**
   ```bash
   bun run build
   ```

2. **Start with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

3. **Initialize database:**
   ```bash
   bun run db:init
   bun run db:health
   ```

### Manual Deployment

1. **Install dependencies:**
   ```bash
   bun install --production
   ```

2. **Build frontend:**
   ```bash
   bun run build
   ```

3. **Set up database:**
   ```bash
   bun run setup --env=production
   ```

4. **Start the server:**
   ```bash
   bun run start
   ```

## Backup and Recovery

### Docker Configuration Enhancements

The Docker Compose configuration includes several production optimizations:

**PostgreSQL Optimizations:**
- Vector extension preloaded for better performance
- Optimized memory settings (shared_buffers, effective_cache_size)
- Automatic extension initialization on first startup
- Enhanced health checks with proper retry logic

**Application Container:**
- Multi-stage build for smaller image size
- Non-root user for security
- Comprehensive health checks
- Proper dependency management

**Volume Management:**
- Persistent PostgreSQL data storage
- Backup directory mounting
- Proper permission handling

### Creating Backups

```bash
# Create database backup using CLI tool
bun run db:backup

# Manual backup with pg_dump
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# Automated backup with Docker
docker-compose exec postgres pg_dump -U article_user article_manager > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restoring from Backup

```bash
# Using the CLI tool
bun run db:restore ./backups/backup-20241214-120000.sql

# Manual restore
psql $DATABASE_URL < backup-20241214-120000.sql
```

## Monitoring and Maintenance

### Health Checks

```bash
# Check database health
bun run db:health

# Validate data integrity
bun run db:validate

# Get database information
bun run db:info
```

### Performance Monitoring

- Monitor connection pool usage
- Check query performance with `EXPLAIN ANALYZE`
- Monitor disk usage for embeddings table
- Set up alerts for connection failures

### Regular Maintenance

```bash
# Weekly database validation
bun run db:validate

# Monthly backup
bun run db:backup

# Reindex embeddings if needed (after bulk imports)
bun run reindex
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check PostgreSQL is running
   - Verify connection parameters
   - Check firewall settings

2. **Schema Verification Failed**
   - Run `bun run db:verify` for details
   - Check database permissions
   - Ensure extensions are installed

3. **Import Conflicts**
   - Use `--conflict interactive` for manual resolution
   - Check for duplicate slugs or titles
   - Validate markdown syntax

4. **Performance Issues**
   - Check connection pool settings
   - Monitor query performance
   - Consider adding indexes for custom queries

### Getting Help

- Check logs for detailed error messages
- Use `bun run db:info` to inspect database state
- Run `bun run db:validate` to check data integrity
- Review the migration logs for import issues

## Security Considerations

- Use strong passwords for database users
- Enable SSL for database connections in production
- Regularly update dependencies
- Monitor for unauthorized access
- Backup encryption for sensitive data

## Rollback Procedures

If you need to rollback to file-based storage:

1. **Stop the application**
2. **Restore from file backup:**
   ```bash
   rm -rf ./data
   cp -r ./data-backup ./data
   ```
3. **Switch to file-based branch/version**
4. **Restart application**

For database rollbacks:

1. **Restore from database backup:**
   ```bash
   bun run db:restore ./backups/backup-before-migration.sql
   ```
2. **Verify restoration:**
   ```bash
   bun run db:validate
   ```