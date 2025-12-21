# Article Manager Deployment Guide

This guide covers the simplified deployment process for the Article Manager with PostgreSQL database backend.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Environment Configuration](#environment-configuration)
4. [Development Deployment](#development-deployment)
5. [Production Deployment](#production-deployment)
6. [Database Management](#database-management)
7. [Troubleshooting](#troubleshooting)

## Quick Start

For the fastest setup, you only need two environment variables:

1. **Clone and Setup**:
   ```bash
   git clone <repository-url>
   cd article-manager
   cp .env.example .env
   ```

2. **Configure Essential Variables**:
   ```bash
   # Edit .env file with only these two required variables:
   AUTH_TOKEN=your-secure-token-here
   DB_PASSWORD=your-secure-password-here
   ```

3. **Start Application**:
   ```bash
   docker-compose up -d
   ```

4. **Access Application**:
   - Web UI: http://localhost:5000
   - Health Check: http://localhost:5000/health

That's it! The application will start with sensible defaults for all other settings.

## Prerequisites

### Required Software

- **Docker & Docker Compose**: For containerized deployment
- **Bun**: For local development (optional)
- **Git**: For source code management

### System Requirements

**Minimum:**
- 1 CPU core
- 2 GB RAM
- 10 GB disk space

**Recommended (Production):**
- 2+ CPU cores
- 4+ GB RAM
- 50+ GB disk space (depending on data volume)

## Environment Configuration

### Essential Variables (Required)

Only two variables are required for basic setup:

```bash
# Authentication token for all interfaces
AUTH_TOKEN=your-secure-auth-token-here

# Database password
DB_PASSWORD=your-secure-database-password-here
```

### Optional Variables

All other settings have sensible defaults. Uncomment and modify in `.env` if needed:

```bash
# Application settings (defaults shown)
# PORT=5000
# NODE_ENV=production
# MCP_SERVER_ENABLED=true

# Database settings (defaults work for Docker setup)
# DB_HOST=postgres
# DB_PORT=5432
# DB_NAME=article_manager
# DB_USER=article_user

# Semantic search (disabled by default)
# SEMANTIC_SEARCH_ENABLED=false
# EMBEDDING_PROVIDER=ollama
# OLLAMA_BASE_URL=http://host.docker.internal:11434
```

### Security Considerations

- **AUTH_TOKEN**: Use a strong, randomly generated token (minimum 32 characters)
- **DB_PASSWORD**: Use a complex password with mixed case, numbers, and symbols
- **File Permissions**: Ensure `.env` file has restricted permissions (600)

## Development Deployment

### Local Development (without Docker)

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Start Database Only**:
   ```bash
   docker-compose up -d postgres
   ```

3. **Start Development Servers**:
   ```bash
   bun run dev
   ```
   Note: The application automatically initializes the database schema on startup.

### Development Commands

```bash
# Database operations
bun run db:health        # Check database health
bun run db:init          # Manually initialize/update schema
bun run db:backup        # Create manual backup

# Application
bun run dev              # Start development servers
bun run build            # Build frontend
bun run typecheck        # Type checking
```

## Production Deployment

### Simple Production Deployment

1. **Set Environment Variables**:
   ```bash
   # Create .env file with essential variables
   echo "AUTH_TOKEN=your-secure-token-here" > .env
   echo "DB_PASSWORD=your-secure-password-here" >> .env
   ```

2. **Start All Services**:
   ```bash
   docker-compose up -d
   ```

3. **Verify Deployment**:
   ```bash
   # Check service status
   docker-compose ps
   
   # Check application health
   curl http://localhost:5000/health
   ```

### Advanced Production Setup

For production environments requiring custom configuration:

1. **Copy and Customize Environment**:
   ```bash
   cp .env.example .env
   # Uncomment and modify advanced settings as needed
   ```

2. **Use Production Compose File** (if available):
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

## Database Management

### Schema Operations

Note: The application automatically initializes the schema on startup.

```bash
# Manually initialize/update schema
bun run db:init

# Verify schema integrity
bun run db:verify

# Get database information
bun run db:info

# Check database health
bun run db:health

# Reset database (WARNING: destroys all data)
bun run db:reset --confirm
```

### Migration Management

```bash
# Run pending migrations
bun run db:migrate

# Validate data integrity
bun run db:validate
```

### Connection Management

The application uses connection pooling with the following default settings:

- **Max Connections**: 50 (production), 20 (development)
- **Idle Timeout**: 60 seconds (production), 30 seconds (development)
- **Connection Timeout**: 5 seconds (production), 2 seconds (development)

## Backup and Restore

### Automated Backups

The production deployment includes automated daily backups at 2 AM:

```bash
# Check backup service status
docker-compose logs backup

# Manual backup using automation script
bun run db:backup:auto

# List existing backups
bun run db:backup:list

# Clean up old backups
bun run db:backup:cleanup
```

### Manual Backup Operations

```bash
# Create immediate backup
bun run db:backup

# Create backup with custom settings
RETENTION_DAYS=7 COMPRESS_BACKUPS=true bun run db:backup:auto

# Windows backup
bun run db:backup:auto:windows
```

### Restore Operations

```bash
# Restore from specific backup file
bun run db:restore ./backups/backup-20241214_120000.sql

# Using database script
bun scripts/database.ts restore ./backups/backup-20241214_120000.sql
```

### Backup Configuration

Environment variables for backup automation:

- **BACKUP_DIR**: Directory for backup files (default: ./backups)
- **RETENTION_DAYS**: Days to keep backups (default: 30)
- **COMPRESS_BACKUPS**: Enable compression (default: true)
- **BACKUP_PREFIX**: Filename prefix (default: article-manager)

### Backup Best Practices

1. **Regular Schedule**: Daily automated backups
2. **Retention Policy**: Keep 30 days of daily backups
3. **Compression**: Enable to save disk space
4. **Verification**: Regularly test restore procedures
5. **Off-site Storage**: Copy critical backups to external storage
6. **Monitoring**: Monitor backup service logs

## Monitoring and Maintenance

### Health Checks

```bash
# Application health
curl http://localhost:5000/health

# Database health
bun run db:health

# Container health
docker-compose ps
```

### Log Management

```bash
# View application logs
docker-compose logs -f article-manager

# View database logs
docker-compose logs -f postgres

# View backup service logs
docker-compose logs -f backup
```

### Performance Monitoring

Optional PostgreSQL metrics exporter (enable with monitoring profile):

```bash
# Start with monitoring
docker-compose --profile monitoring up -d

# Access metrics
curl http://localhost:9187/metrics
```

### Maintenance Tasks

**Weekly**:
- Review backup logs
- Check disk space usage
- Monitor application performance

**Monthly**:
- Update Docker images
- Review and clean old logs
- Test backup restore procedures
- Update security patches

**Quarterly**:
- Review and update configuration
- Performance optimization review
- Security audit

## Troubleshooting

### Common Issues

**Database Connection Errors**:
```bash
# Check database status
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test connection
bun run db:health
```

**Application Startup Issues**:
```bash
# Check application logs
docker-compose logs article-manager

# Verify environment variables
docker-compose exec article-manager env | grep DB_

# Test database connectivity from app container
docker-compose exec article-manager bun run db:health
```

**Backup Failures**:
```bash
# Check backup service logs
docker-compose logs backup

# Test manual backup
bun run db:backup

# Verify backup directory permissions
ls -la ./backups
```

### Recovery Procedures

**Database Corruption**:
1. Stop application: `docker-compose stop article-manager`
2. Create emergency backup: `bun run db:backup`
3. Restore from known good backup: `bun run db:restore <backup-file>`
4. Verify data integrity: `bun run db:validate`
5. Restart application: `docker-compose start article-manager`

**Complete System Recovery**:
1. Ensure backups are available
2. Redeploy infrastructure: `docker-compose down && docker-compose up -d`
3. Restore database: `bun run db:restore <latest-backup>`
4. Verify system health: `bun run db:health`
5. Test application functionality

### Performance Optimization

**Database Tuning**:
- Adjust PostgreSQL configuration in docker-compose.prod.yml
- Monitor query performance with pg_stat_statements
- Optimize indexes based on query patterns

**Application Tuning**:
- Adjust connection pool settings
- Monitor memory usage and adjust limits
- Enable application-level caching if needed

### Support and Debugging

**Enable Debug Logging**:
```bash
# Set debug environment
export LOG_LEVEL=debug

# Restart with debug logging
docker-compose restart article-manager
```

**Database Debugging**:
```bash
# Connect to database directly
docker-compose exec postgres psql -U article_user -d article_manager

# Check active connections
SELECT * FROM pg_stat_activity;

# Check database size
SELECT pg_size_pretty(pg_database_size('article_manager'));
```

For additional support, check the application logs and database logs for specific error messages.