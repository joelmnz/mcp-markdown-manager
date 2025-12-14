# Article Manager Deployment Guide

This guide covers the complete deployment process for the Article Manager with PostgreSQL database backend, including backup and restore procedures.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Development Deployment](#development-deployment)
4. [Production Deployment](#production-deployment)
5. [Database Management](#database-management)
6. [Backup and Restore](#backup-and-restore)
7. [Monitoring and Maintenance](#monitoring-and-maintenance)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Docker & Docker Compose**: For containerized deployment
- **Bun**: For local development and build processes
- **PostgreSQL Client Tools**: For database operations (pg_dump, pg_restore, psql)
- **Git**: For source code management

### System Requirements

**Minimum (Development):**
- 2 CPU cores
- 4 GB RAM
- 10 GB disk space

**Recommended (Production):**
- 1+ CPU cores
- 2+ GB RAM
- 50+ GB disk space (depending on data volume)
- SSD storage for database

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the project root:

```bash
# Authentication
AUTH_TOKEN=your-secure-auth-token-here

# Database Configuration
DB_PASSWORD=your-secure-database-password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=article_manager
DB_USER=article_user
DB_SSL=false

# Application Configuration
PORT=5000
NODE_ENV=production
MCP_SERVER_ENABLED=true
DATA_DIR=/data

# Database Pool Settings (Production)
DB_MAX_CONNECTIONS=50
DB_IDLE_TIMEOUT=60000
DB_CONNECTION_TIMEOUT=5000
DB_HEALTH_CHECK_INTERVAL=60000
DB_CONSTRAINT_REPAIR_ENABLED=true

# Backup Configuration
BACKUP_DIR=./backups
RETENTION_DAYS=30
COMPRESS_BACKUPS=true
BACKUP_PREFIX=article-manager

# Optional: Production Data Path
POSTGRES_DATA_PATH=./postgres-data
```

### Security Considerations

- **AUTH_TOKEN**: Use a strong, randomly generated token (minimum 32 characters)
- **DB_PASSWORD**: Use a complex password with mixed case, numbers, and symbols
- **File Permissions**: Ensure `.env` file has restricted permissions (600)
- **Network Security**: In production, avoid exposing database ports externally

## Development Deployment

### Quick Start

1. **Clone and Setup**:
   ```bash
   git clone <repository-url>
   cd article-manager
   bun install
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Environment**:
   ```bash
   # Start database only
   docker-compose up -d postgres
   
   # Initialize database
   bun run db:init
   
   # Start application in development mode
   bun run dev
   ```

4. **Access Application**:
   - Web UI: http://localhost:5000
   - Health Check: http://localhost:5000/health

### Development Commands

```bash
# Database operations
bun run db:init          # Initialize database schema
bun run db:health        # Check database health
bun run db:info          # Show database information
bun run db:backup        # Create manual backup
bun run db:restore <file> # Restore from backup

# Application
bun run dev              # Start development servers
bun run build            # Build frontend
bun run typecheck        # Type checking

# Import existing data
bun run import import ./data
```

## Production Deployment

### Automated Deployment (Recommended)

**Linux/macOS**:
```bash
# Set environment variables
export AUTH_TOKEN="your-secure-token"
export DB_PASSWORD="your-secure-password"

# Run deployment script
bun run deploy
```

**Windows**:
```powershell
# Set environment variables
$env:AUTH_TOKEN = "your-secure-token"
$env:DB_PASSWORD = "your-secure-password"

# Run deployment script
bun run deploy:windows
```

### Manual Production Deployment

1. **Prepare Environment**:
   ```bash
   # Build application
   bun install --frozen-lockfile
   bun run build
   
   # Create required directories
   mkdir -p backups logs postgres-data
   ```

2. **Start Production Services**:
   ```bash
   # Production deployment with optimized settings
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

3. **Initialize Database**:
   ```bash
   # Wait for database to be ready
   docker-compose exec postgres pg_isready -U article_user -d article_manager
   
   # Initialize schema
   bun run db:init
   
   # Verify health
   bun run db:health
   ```

4. **Import Existing Data** (if migrating):
   ```bash
   bun run import import ./data
   ```

### Production Configuration Files

The deployment uses multiple Docker Compose files:

- **docker-compose.yml**: Base configuration
- **docker-compose.prod.yml**: Production overrides with:
  - Optimized PostgreSQL settings
  - Resource limits and security options
  - Automated backup service
  - Optional monitoring

## Database Management

### Schema Operations

```bash
# Initialize database (first time setup)
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