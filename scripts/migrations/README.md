# Database Migrations

This directory contains database migration scripts for the MCP Markdown Manager.

## Available Migrations

### Migration 002: Background Embedding Queue
**File:** `002-embedding-queue.ts`
**Description:** Adds database tables and infrastructure for the background embedding queue system.

**Tables Created:**
- `embedding_tasks` - Task queue for embedding processing
- `embedding_worker_status` - Worker state tracking
- `embedding_audit_logs` - Comprehensive audit logging
- `performance_metrics` - Performance tracking and metrics

**Usage:**
```bash
# Run migration
bun scripts/migrations/002-embedding-queue.ts

# Rollback migration
bun scripts/migrations/002-embedding-queue.ts rollback
```

### Migration 003: Embedding Migration for Existing Articles
**File:** `003-embedding-migration.ts`
**Description:** Identifies existing articles without embeddings and queues them for background processing.

**Usage:**
```bash
# Preview what would be migrated
bun scripts/migrations/003-embedding-migration.ts --dry-run

# Run migration with confirmation
bun scripts/migrations/003-embedding-migration.ts

# Run migration without confirmation
bun scripts/migrations/003-embedding-migration.ts --yes

# Run with custom settings
bun scripts/migrations/003-embedding-migration.ts --batch-size 25 --priority high

# Rollback migration (cancel pending tasks)
bun scripts/migrations/003-embedding-migration.ts rollback
```

**Options:**
- `--dry-run` - Show what would be done without making changes
- `--yes` - Skip confirmation prompts
- `--batch-size <n>` - Process articles in batches of n (default: 50)
- `--priority <level>` - Set task priority: high, normal, low (default: normal)

## Migration Template

Use `migration-template.ts` as a starting point for new migrations:

```bash
# Copy template
cp scripts/migrations/migration-template.ts scripts/migrations/004-new-feature.ts

# Edit the new migration
# - Update version number
# - Add description
# - Implement apply() and rollback() methods
```

## Running Migrations

### Individual Migrations

```bash
# Run specific migration
bun scripts/migrations/002-embedding-queue.ts

# Rollback specific migration
bun scripts/migrations/002-embedding-queue.ts rollback
```

### Automated Deployment

Use the deployment script for complete setup:

```bash
# Deploy embedding queue system
bun scripts/deploy-embedding-queue.ts --env production

# Deploy with dry run
bun scripts/deploy-embedding-queue.ts --dry-run

# Rollback deployment
bun scripts/deploy-embedding-queue.ts rollback
```

## Migration Best Practices

### Before Running Migrations

1. **Backup Database:**
   ```bash
   bun run db:backup
   ```

2. **Test in Development:**
   ```bash
   bun scripts/migrations/XXX-migration.ts --dry-run
   ```

3. **Verify Prerequisites:**
   ```bash
   bun run db:health
   bun run db:verify
   ```

### During Migration

1. **Monitor Progress:**
   ```bash
   # For embedding migration
   bun scripts/queue-admin.ts status
   ```

2. **Check for Errors:**
   ```bash
   # View application logs
   docker-compose logs -f article-manager
   ```

### After Migration

1. **Verify Success:**
   ```bash
   bun run db:verify
   bun run db:validate
   ```

2. **Test Functionality:**
   ```bash
   bun scripts/test-api-compatibility.ts
   ```

3. **Monitor Performance:**
   ```bash
   bun scripts/queue-admin.ts health
   ```

## Troubleshooting

### Migration Fails

1. **Check Prerequisites:**
   - Database connection
   - Required environment variables
   - Sufficient permissions

2. **Review Error Messages:**
   - Check console output
   - Review application logs
   - Check database logs

3. **Rollback if Necessary:**
   ```bash
   bun scripts/migrations/XXX-migration.ts rollback
   ```

### Partial Migration

If a migration partially completes:

1. **Check Database State:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_name LIKE 'embedding_%';
   ```

2. **Manual Cleanup if Needed:**
   ```bash
   # Use rollback to clean up
   bun scripts/migrations/002-embedding-queue.ts rollback
   ```

3. **Re-run Migration:**
   ```bash
   bun scripts/migrations/002-embedding-queue.ts
   ```

### Performance Issues

For large datasets:

1. **Use Smaller Batches:**
   ```bash
   bun scripts/migrations/003-embedding-migration.ts --batch-size 10
   ```

2. **Run During Off-Peak Hours:**
   ```bash
   # Schedule for low-traffic periods
   ```

3. **Monitor System Resources:**
   ```bash
   docker stats
   ```

## Migration History

| Version | Description | Date | Status |
|---------|-------------|------|--------|
| 002 | Background Embedding Queue | 2024-12-14 | ✅ Available |
| 003 | Embedding Migration | 2024-12-14 | ✅ Available |

## Creating New Migrations

1. **Copy Template:**
   ```bash
   cp scripts/migrations/migration-template.ts scripts/migrations/004-new-feature.ts
   ```

2. **Update Migration:**
   - Increment version number
   - Add descriptive name
   - Implement `apply()` method
   - Implement `rollback()` method

3. **Test Migration:**
   ```bash
   bun scripts/migrations/004-new-feature.ts --dry-run
   ```

4. **Document Migration:**
   - Update this README
   - Add to migration history table
   - Document any special requirements

## Support

For migration issues:

1. **Check Documentation:**
   - [Deployment Guide](../../docs/DEPLOYMENT_GUIDE.md)
   - [Embedding Queue Deployment](../../docs/embedding-queue/DEPLOYMENT_GUIDE.md)
   - [Troubleshooting Guide](../../docs/embedding-queue/TROUBLESHOOTING.md)

2. **Review Logs:**
   ```bash
   docker-compose logs article-manager
   ```

3. **Check Database Health:**
   ```bash
   bun run db:health
   bun run db:info
   ```