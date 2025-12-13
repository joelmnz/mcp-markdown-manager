# Scripts Directory

This directory contains various utility scripts for managing the Article Manager application and database.

## Database Management

### Core Database Scripts

- **`database.ts`** - Main database management CLI
  - Initialize, reset, verify database schema
  - Create manual backups and restore from backups
  - Health checks and data validation
  - Migration management

### Backup Automation Scripts

- **`backup-automation.sh`** - Linux/macOS automated backup script
  - Scheduled backups with retention policy
  - Compression and cleanup
  - Database connectivity verification
  - Usage: `./scripts/backup-automation.sh [backup|list|cleanup|verify]`

- **`backup-automation.ps1`** - Windows PowerShell backup script
  - Same functionality as bash version for Windows environments
  - Usage: `.\scripts\backup-automation.ps1 [-Command backup] [options]`

### Import and Migration

- **`import-articles.ts`** - Import existing markdown files to database
- **`setup-database.ts`** - Database setup and initialization

## Build and Development

- **`build-html.cjs`** - Generate HTML with hashed asset references
- **`watch-frontend.ts`** - Frontend development watcher
- **`generate-icons.cjs`** - Generate PWA icons

## Deployment

- **`deploy-production.sh`** - Linux/macOS production deployment
- **`deploy-production.ps1`** - Windows production deployment

## Testing and Utilities

- **`reindex.ts`** - Rebuild search indexes
- **`test-*.ts`** - Various testing utilities

## Usage Examples

### Database Operations

```bash
# Initialize database
bun scripts/database.ts init

# Create backup
bun scripts/database.ts backup

# Restore from backup
bun scripts/database.ts restore ./backups/backup-20241214_120000.sql

# Check health
bun scripts/database.ts health
```

### Automated Backups

```bash
# Linux/macOS
./scripts/backup-automation.sh backup
./scripts/backup-automation.sh list
./scripts/backup-automation.sh cleanup

# Windows
.\scripts\backup-automation.ps1 -Command backup
.\scripts\backup-automation.ps1 -Command list
.\scripts\backup-automation.ps1 -Command cleanup
```

### Import Data

```bash
# Import from directory
bun scripts/import-articles.ts import ./data

# Dry run import
bun scripts/import-articles.ts import ./data --dry-run
```

## Environment Variables

Most scripts use these environment variables:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` - Database connection
- `DB_PASSWORD` or `PGPASSWORD` - Database password
- `BACKUP_DIR` - Backup directory (default: ./backups)
- `RETENTION_DAYS` - Backup retention period (default: 30)

## Permissions

On Linux/macOS, ensure scripts are executable:

```bash
chmod +x scripts/*.sh
```

On Windows, you may need to adjust PowerShell execution policy:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```