# Background Embedding Queue Rollback Procedures

This document provides comprehensive rollback procedures for the background embedding queue system, covering various scenarios from temporary disabling to complete system removal.

## Table of Contents

1. [Overview](#overview)
2. [Rollback Scenarios](#rollback-scenarios)
3. [Emergency Procedures](#emergency-procedures)
4. [Gradual Rollback](#gradual-rollback)
5. [Complete System Removal](#complete-system-removal)
6. [Data Recovery](#data-recovery)
7. [Verification Procedures](#verification-procedures)
8. [Prevention and Best Practices](#prevention-and-best-practices)

## Overview

### When to Rollback

Consider rollback in these situations:

- **Performance Issues**: Queue causing system slowdown
- **Data Corruption**: Embedding tasks corrupting article data
- **Provider Issues**: Embedding service unavailable or unreliable
- **Resource Constraints**: System running out of resources
- **Migration Problems**: Issues during deployment or migration
- **Business Requirements**: Need to revert to synchronous processing

### Rollback Types

1. **Temporary Disable**: Stop processing without removing infrastructure
2. **Configuration Rollback**: Revert to previous configuration
3. **Migration Rollback**: Undo recent migration changes
4. **Partial Rollback**: Remove specific components while keeping others
5. **Complete Removal**: Full system rollback to pre-queue state

## Rollback Scenarios

### Scenario 1: Temporary Queue Disable

**Use Case**: Temporarily stop background processing due to performance issues

#### Quick Disable

```bash
# Method 1: Environment variable
export EMBEDDING_QUEUE_ENABLED=false
docker-compose restart article-manager

# Method 2: Database flag
bun scripts/queue-admin.ts stop

# Method 3: Configuration update
echo "EMBEDDING_QUEUE_ENABLED=false" >> .env
docker-compose restart article-manager
```

#### Verification

```bash
# Check worker status
bun scripts/queue-admin.ts status
# Expected: Worker Status: Stopped

# Test article creation (should work synchronously)
curl -H "Authorization: Bearer $AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -X POST http://localhost:5000/api/articles \
     -d '{"title":"Test Sync","content":"Test content"}'
```

#### Re-enable

```bash
# Re-enable queue
export EMBEDDING_QUEUE_ENABLED=true
docker-compose restart article-manager

# Verify worker restart
bun scripts/queue-admin.ts status
```

### Scenario 2: Configuration Rollback

**Use Case**: Revert to previous working configuration

#### Backup Current Configuration

```bash
# Backup current environment
cp .env .env.backup.$(date +%Y%m%d-%H%M%S)

# Backup current queue state
bun scripts/queue-admin.ts export > queue-state-backup.json
```

#### Restore Previous Configuration

```bash
# Restore from backup
cp .env.backup.20241214-120000 .env

# Or restore specific settings
cat > .env.patch << EOF
EMBEDDING_WORKER_INTERVAL=5000
EMBEDDING_MAX_RETRIES=3
EMBEDDING_BATCH_SIZE=1
EOF

# Apply configuration
docker-compose down
docker-compose up -d
```

#### Verify Rollback

```bash
# Check configuration
docker-compose exec article-manager env | grep EMBEDDING

# Test functionality
bun scripts/test-embedding-queue-config.ts
```

### Scenario 3: Migration Rollback

**Use Case**: Undo recent embedding migration

#### Cancel Pending Migration Tasks

```bash
# Use migration rollback command
bun scripts/migrations/003-embedding-migration.ts rollback

# Or manual cancellation
bun scripts/queue-admin.ts clear --status pending --reason migration
```

#### Verify Migration Rollback

```bash
# Check for remaining migration tasks
SELECT COUNT(*) FROM embedding_tasks 
WHERE metadata->>'reason' = 'migration' 
  AND status IN ('pending', 'processing');

# Should return 0
```

### Scenario 4: Provider Rollback

**Use Case**: Switch back to previous embedding provider

#### Switch Provider

```bash
# From OpenAI back to Ollama
export EMBEDDING_PROVIDER=ollama
export OLLAMA_BASE_URL=http://localhost:11434
unset OPENAI_API_KEY

# Or from Ollama back to OpenAI
export EMBEDDING_PROVIDER=openai
export OPENAI_API_KEY=your-api-key
unset OLLAMA_BASE_URL

# Restart application
docker-compose restart article-manager
```

#### Clear Provider-Specific Tasks

```bash
# Clear tasks that might be provider-specific
UPDATE embedding_tasks 
SET status = 'failed',
    error_message = 'Provider rollback - task cancelled'
WHERE status = 'pending' 
  AND created_at >= NOW() - INTERVAL '1 hour';
```

## Emergency Procedures

### Emergency Stop

**Use Case**: Immediate halt of all embedding processing

#### Immediate Actions

```bash
# 1. Stop worker immediately
bun scripts/queue-admin.ts emergency-stop

# 2. Disable at database level
UPDATE embedding_worker_status SET is_running = false;

# 3. Kill processing tasks
UPDATE embedding_tasks 
SET status = 'failed',
    error_message = 'Emergency stop initiated',
    completed_at = NOW()
WHERE status = 'processing';

# 4. Disable in environment
export SEMANTIC_SEARCH_ENABLED=false
docker-compose restart article-manager
```

#### Verify Emergency Stop

```bash
# Check no tasks are processing
SELECT COUNT(*) FROM embedding_tasks WHERE status = 'processing';
# Should return 0

# Check worker is stopped
bun scripts/queue-admin.ts status
# Should show: Worker Status: Stopped
```

### Data Corruption Recovery

**Use Case**: Embedding process corrupted article data

#### Immediate Isolation

```bash
# 1. Stop all processing
bun scripts/queue-admin.ts emergency-stop

# 2. Identify affected articles
SELECT DISTINCT article_id, slug 
FROM embedding_tasks 
WHERE status = 'processing' 
  AND processed_at >= NOW() - INTERVAL '1 hour';

# 3. Mark articles for review
UPDATE articles 
SET metadata = COALESCE(metadata, '{}')::jsonb || '{"needs_review": true}'::jsonb
WHERE id IN (SELECT DISTINCT article_id FROM embedding_tasks WHERE status = 'processing');
```

#### Data Recovery

```bash
# 1. Restore from backup if available
bun run db:restore ./backups/backup-before-corruption.sql

# 2. Or restore individual articles from version history
SELECT title, content FROM article_versions 
WHERE article_id = ? 
ORDER BY created_at DESC 
LIMIT 1;
```

### Resource Exhaustion Recovery

**Use Case**: Queue consuming too many system resources

#### Resource Relief

```bash
# 1. Reduce worker frequency
export EMBEDDING_WORKER_INTERVAL=30000  # 30 seconds

# 2. Reduce batch size
export EMBEDDING_BATCH_SIZE=1

# 3. Increase timeout
export EMBEDDING_WORKER_TIMEOUT=600000  # 10 minutes

# 4. Clear low-priority tasks
UPDATE embedding_tasks 
SET status = 'failed',
    error_message = 'Resource conservation - low priority task cancelled'
WHERE status = 'pending' 
  AND priority = 'low';

# 5. Restart with new settings
docker-compose restart article-manager
```

## Gradual Rollback

### Phase 1: Stop New Tasks

```bash
# Prevent new tasks from being queued
export EMBEDDING_QUEUE_ENABLED=false

# Let existing tasks complete
bun scripts/queue-admin.ts status
# Monitor until pending/processing = 0
```

### Phase 2: Clear Remaining Tasks

```bash
# Clear any remaining pending tasks
bun scripts/queue-admin.ts clear --status pending --confirm

# Wait for processing tasks to complete or timeout
bun scripts/queue-admin.ts wait-for-completion --timeout 300
```

### Phase 3: Disable System

```bash
# Disable semantic search entirely
export SEMANTIC_SEARCH_ENABLED=false

# Restart application
docker-compose restart article-manager
```

### Phase 4: Verify Synchronous Operation

```bash
# Test article operations work synchronously
bun scripts/test-api-compatibility.ts

# Verify no background processing
bun scripts/queue-admin.ts status
# Should show: System disabled
```

## Complete System Removal

### Step 1: Data Backup

```bash
# Backup queue data
pg_dump -t embedding_tasks -t embedding_audit_logs -t performance_metrics \
        $DATABASE_URL > embedding-queue-backup.sql

# Backup application data
bun run db:backup
```

### Step 2: Stop All Processing

```bash
# Stop worker and clear queue
bun scripts/queue-admin.ts emergency-stop
bun scripts/queue-admin.ts clear --all --confirm
```

### Step 3: Remove Configuration

```bash
# Remove queue-related environment variables
sed -i '/EMBEDDING_QUEUE/d' .env
sed -i '/EMBEDDING_WORKER/d' .env
sed -i '/EMBEDDING_MAX_RETRIES/d' .env
sed -i '/EMBEDDING_BATCH_SIZE/d' .env

# Disable semantic search
echo "SEMANTIC_SEARCH_ENABLED=false" >> .env
```

### Step 4: Remove Database Tables

```bash
# Run rollback migration
bun scripts/migrations/002-embedding-queue.ts rollback

# Verify tables removed
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'embedding_%';
# Should return no rows
```

### Step 5: Clean Application Code

```bash
# Remove queue-related imports (if needed)
# This step depends on your deployment strategy
# You may need to deploy a version without queue code
```

### Step 6: Restart and Verify

```bash
# Restart application
docker-compose down
docker-compose up -d

# Verify synchronous operation
bun scripts/test-api-compatibility.ts

# Test article creation
curl -H "Authorization: Bearer $AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -X POST http://localhost:5000/api/articles \
     -d '{"title":"Post-Rollback Test","content":"Testing synchronous operation"}'
```

## Data Recovery

### Recover Queue State

```bash
# Restore queue tables from backup
psql $DATABASE_URL < embedding-queue-backup.sql

# Restore worker status
INSERT INTO embedding_worker_status (id, is_running) 
VALUES (1, false) 
ON CONFLICT (id) DO UPDATE SET is_running = false;
```

### Recover Article Data

```bash
# Restore articles from backup
bun run db:restore ./backups/articles-backup.sql

# Or restore from version history
SELECT a.id, a.slug, av.title, av.content
FROM articles a
JOIN article_versions av ON a.id = av.article_id
WHERE av.version_number = (
  SELECT MAX(version_number) 
  FROM article_versions av2 
  WHERE av2.article_id = a.id
);
```

### Recover Embeddings

```bash
# If embeddings were corrupted, regenerate
bun scripts/reindex

# Or restore from backup if available
psql $DATABASE_URL < embeddings-backup.sql
```

## Verification Procedures

### Post-Rollback Verification

#### System Health

```bash
# Check application health
curl http://localhost:5000/health

# Check database connectivity
bun run db:health

# Verify no queue components
bun scripts/queue-admin.ts status 2>/dev/null || echo "Queue system not available (expected)"
```

#### Functional Testing

```bash
# Test article CRUD operations
bun scripts/test-api-compatibility.ts

# Test search functionality (if still enabled)
curl -H "Authorization: Bearer $AUTH_TOKEN" \
     -X POST http://localhost:5000/api/search \
     -H "Content-Type: application/json" \
     -d '{"query":"test","k":5}'

# Test MCP operations
bun scripts/test-mcp-tools-definition.ts
```

#### Performance Testing

```bash
# Test response times
time curl -H "Authorization: Bearer $AUTH_TOKEN" \
          -X POST http://localhost:5000/api/articles \
          -H "Content-Type: application/json" \
          -d '{"title":"Performance Test","content":"Testing response time"}'

# Should complete quickly without queue processing
```

### Rollback Success Criteria

- [ ] Application starts successfully
- [ ] Article CRUD operations work
- [ ] No background processing occurs
- [ ] Response times are acceptable
- [ ] No queue-related errors in logs
- [ ] Database integrity maintained
- [ ] Search functionality works (if enabled)
- [ ] MCP server operates correctly

## Prevention and Best Practices

### Pre-Deployment Testing

```bash
# Always test in staging first
export NODE_ENV=staging
bun scripts/test-embedding-queue.ts

# Load testing
bun scripts/test-performance-load.ts

# Rollback testing
bun scripts/test-rollback-procedures.ts
```

### Monitoring Setup

```bash
# Set up monitoring before deployment
bun scripts/setup-monitoring.ts

# Configure alerts
bun scripts/configure-alerts.ts --queue-health --performance
```

### Backup Strategy

```bash
# Automated backups before changes
bun scripts/backup-automation.ts --pre-deployment

# Configuration versioning
git tag -a "pre-queue-deployment" -m "Before embedding queue deployment"
```

### Rollback Planning

```bash
# Document rollback procedures
bun scripts/generate-rollback-plan.ts > rollback-plan.md

# Test rollback procedures
bun scripts/test-rollback-procedures.ts --dry-run
```

### Communication Plan

1. **Stakeholder Notification**: Inform users of potential downtime
2. **Status Updates**: Regular updates during rollback process
3. **Post-Rollback Communication**: Confirm system restoration
4. **Lessons Learned**: Document issues and improvements

This comprehensive rollback guide ensures you can safely and effectively revert the background embedding queue system in any scenario while maintaining data integrity and system functionality.