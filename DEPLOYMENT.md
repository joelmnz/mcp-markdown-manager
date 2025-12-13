# Deployment Guide

This guide covers deploying the Article Manager with database backend.

## Prerequisites

- PostgreSQL 12+ with vector extension support
- Node.js/Bun runtime environment
- Environment variables configured

## Environment Variables

Required environment variables:

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@host:port/database
# OR individual components:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=article_manager
DB_USER=article_user
DB_PASSWORD=secure_password
DB_SSL=false

# Application Configuration
AUTH_TOKEN=your-secure-auth-token
PORT=5000
NODE_ENV=production

# Optional Features
SEMANTIC_SEARCH_ENABLED=true
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
MCP_SERVER_ENABLED=true
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

If migrating from the previous file-based system:

### 1. Backup Existing Data

```bash
# Backup your data directory
cp -r ./data ./data-backup-$(date +%Y%m%d)
```

### 2. Validate Migration

```bash
# Check what will be imported
bun run import validate ./data

# Get detailed preview
bun run import preview ./data --preserve-folders
```

### 3. Run Migration

```bash
# Interactive migration (recommended)
bun run import import ./data --conflict interactive

# Or automated with conflict resolution
bun run import import ./data --conflict skip --preserve-folders
```

### 4. Verify Migration

```bash
# Check database health
bun run db:health

# Validate data integrity
bun run db:validate

# Check import statistics
bun run import stats ./data
```

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