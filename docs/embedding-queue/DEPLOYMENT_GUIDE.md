# Background Embedding Queue Deployment Guide

This guide covers deploying and configuring the background embedding queue system for asynchronous article embedding processing.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [Deployment Steps](#deployment-steps)
5. [Migration from Synchronous Embedding](#migration-from-synchronous-embedding)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

## Overview

The background embedding queue system processes article embeddings asynchronously to prevent UI blocking during article operations. Key benefits:

- **Non-blocking UI**: Article creation/updates return immediately
- **Reliable Processing**: Persistent queue with retry logic
- **Scalable**: Handles bulk operations efficiently
- **Fault Tolerant**: Embedding failures don't affect article operations
- **Monitorable**: Comprehensive logging and metrics

## Prerequisites

### System Requirements

- PostgreSQL 12+ with existing article database
- Background embedding queue tables (migration 002)
- Semantic search enabled (`SEMANTIC_SEARCH_ENABLED=true`)
- Embedding provider configured (Ollama or OpenAI)

### Database Schema

Ensure the embedding queue tables exist:

```bash
# Check if tables exist
bun scripts/database.ts verify

# Run migration if needed
bun scripts/migrations/002-embedding-queue.ts
```

Required tables:
- `embedding_tasks` - Task queue
- `embedding_worker_status` - Worker state tracking
- `embedding_audit_logs` - Comprehensive logging
- `performance_metrics` - Performance tracking

## Configuration

### Environment Variables

#### Required Configuration

```bash
# Enable semantic search and background processing
SEMANTIC_SEARCH_ENABLED=true

# Embedding provider (choose one)
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text

# OR for OpenAI
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=your-api-key
EMBEDDING_MODEL=text-embedding-3-small
```

#### Optional Queue Configuration

```bash
# Background worker settings
EMBEDDING_QUEUE_ENABLED=true              # Enable/disable queue (default: true)
EMBEDDING_WORKER_INTERVAL=5000            # Polling interval in ms (default: 5000)
EMBEDDING_MAX_RETRIES=3                   # Max retry attempts (default: 3)
EMBEDDING_RETRY_BACKOFF_BASE=1000         # Base delay for exponential backoff (default: 1000ms)
EMBEDDING_BATCH_SIZE=1                    # Tasks per batch (default: 1)
EMBEDDING_CLEANUP_INTERVAL=24             # Cleanup interval in hours (default: 24)
EMBEDDING_CLEANUP_RETENTION_DAYS=30       # Retention for completed tasks (default: 30)

# Performance tuning
EMBEDDING_WORKER_TIMEOUT=300000           # Task timeout in ms (default: 5 minutes)
EMBEDDING_CONCURRENT_WORKERS=1            # Number of workers (default: 1)
```

### Configuration Validation

```bash
# Verify configuration
bun scripts/test-embedding-queue-config.ts

# Test embedding provider connectivity
bun scripts/test-embedding-queue-simple.ts
```

## Deployment Steps

### 1. Pre-Deployment Checks

```bash
# Verify database schema
bun scripts/database.ts verify

# Check embedding provider connectivity
bun scripts/test-embedding-queue-simple.ts

# Validate configuration
bun scripts/test-embedding-queue-config.ts
```

### 2. Deploy Application

#### Docker Deployment

```bash
# Update environment variables in .env
SEMANTIC_SEARCH_ENABLED=true
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434

# Deploy with updated configuration
docker-compose down
docker-compose up -d

# Verify deployment
docker-compose logs -f article-manager
```

#### Manual Deployment

```bash
# Update environment
export SEMANTIC_SEARCH_ENABLED=true
export EMBEDDING_PROVIDER=ollama

# Restart application
bun run start
```

### 3. Verify Background Worker

```bash
# Check worker status
bun scripts/queue-admin.ts status

# Expected output:
# Worker Status: Running
# Queue Statistics:
#   Pending: 0
#   Processing: 0
#   Completed: X
#   Failed: 0
```

### 4. Test Queue Functionality

```bash
# Test basic queue operations
bun scripts/test-embedding-queue.ts

# Test with sample article
bun scripts/test-background-worker.ts
```

## Migration from Synchronous Embedding

If upgrading from synchronous embedding, existing articles need to be queued for background processing.

### 1. Identify Articles Needing Embeddings

```bash
# Check which articles need embeddings
bun scripts/migrations/003-embedding-migration.ts --dry-run
```

### 2. Queue Existing Articles

#### Interactive Migration (Recommended)

```bash
# Run migration with confirmation
bun scripts/migrations/003-embedding-migration.ts
```

#### Automated Migration

```bash
# Skip confirmation for automated deployment
bun scripts/migrations/003-embedding-migration.ts --yes --priority normal

# High priority for critical articles
bun scripts/migrations/003-embedding-migration.ts --yes --priority high --batch-size 25
```

#### Large Dataset Migration

```bash
# Process in smaller batches for large datasets
bun scripts/migrations/003-embedding-migration.ts --yes --batch-size 10 --priority low
```

### 3. Monitor Migration Progress

```bash
# Check queue status
bun scripts/queue-admin.ts status

# Monitor worker progress
bun scripts/queue-admin.ts health

# View recent activity
bun scripts/queue-admin.ts recent
```

### 4. Verify Migration Completion

```bash
# Check for remaining articles without embeddings
bun scripts/migrations/003-embedding-migration.ts --dry-run

# Verify search functionality
bun scripts/test-mcp-embedding-integration.ts
```

## Monitoring and Maintenance

### Queue Monitoring

#### Real-time Status

```bash
# Current queue status
bun scripts/queue-admin.ts status

# Detailed statistics
bun scripts/queue-admin.ts stats

# Worker health check
bun scripts/queue-admin.ts health
```

#### Performance Metrics

```bash
# Processing performance
bun scripts/queue-admin.ts metrics

# Recent activity
bun scripts/queue-admin.ts recent --limit 20

# Failed tasks analysis
bun scripts/queue-admin.ts failed
```

### Database Monitoring

```sql
-- Queue statistics
SELECT status, COUNT(*) as count 
FROM embedding_tasks 
GROUP BY status;

-- Recent activity (last 24 hours)
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as tasks_created,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM embedding_tasks 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

-- Average processing time
SELECT 
  AVG(EXTRACT(EPOCH FROM (completed_at - processed_at))) as avg_seconds
FROM embedding_tasks 
WHERE status = 'completed' 
  AND completed_at >= NOW() - INTERVAL '24 hours';
```

### Automated Maintenance

#### Daily Cleanup

```bash
# Add to crontab for daily cleanup
0 2 * * * cd /path/to/app && bun scripts/queue-admin.ts cleanup --days 30
```

#### Health Monitoring

```bash
# Add to monitoring system
*/5 * * * * cd /path/to/app && bun scripts/queue-admin.ts health --json | your-monitoring-system
```

### Log Management

#### Application Logs

```bash
# View embedding-related logs
docker-compose logs article-manager | grep -i embedding

# Filter by log level
docker-compose logs article-manager | grep -E "(ERROR|WARN)" | grep embedding
```

#### Audit Logs

```sql
-- Recent audit events
SELECT timestamp, level, category, message, metadata
FROM embedding_audit_logs 
WHERE timestamp >= NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;

-- Error analysis
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as error_count,
  array_agg(DISTINCT message) as error_types
FROM embedding_audit_logs 
WHERE level = 'error' 
  AND timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

## Troubleshooting

### Common Issues

#### Worker Not Starting

**Symptoms**: Queue status shows worker as stopped

**Diagnosis**:
```bash
# Check worker status
bun scripts/queue-admin.ts status

# Check application logs
docker-compose logs article-manager | grep -i worker
```

**Solutions**:
1. Verify `SEMANTIC_SEARCH_ENABLED=true`
2. Check embedding provider connectivity
3. Verify database connection
4. Restart application

#### Tasks Stuck in Processing

**Symptoms**: Tasks remain in "processing" status for extended periods

**Diagnosis**:
```bash
# Check for stuck tasks
bun scripts/queue-admin.ts stuck

# View processing tasks
SELECT id, slug, processed_at, 
       NOW() - processed_at as processing_duration
FROM embedding_tasks 
WHERE status = 'processing'
ORDER BY processed_at;
```

**Solutions**:
```bash
# Reset stuck tasks
bun scripts/queue-admin.ts reset-stuck

# Or manual reset
UPDATE embedding_tasks 
SET status = 'pending', processed_at = NULL
WHERE status = 'processing' 
  AND processed_at < NOW() - INTERVAL '30 minutes';
```

#### High Failure Rate

**Symptoms**: Many tasks failing with errors

**Diagnosis**:
```bash
# Analyze failed tasks
bun scripts/queue-admin.ts failed --details

# Check error patterns
SELECT error_message, COUNT(*) as count
FROM embedding_tasks 
WHERE status = 'failed'
GROUP BY error_message
ORDER BY count DESC;
```

**Solutions**:
1. Check embedding provider status
2. Verify API keys and configuration
3. Check network connectivity
4. Review error messages for patterns

#### Performance Issues

**Symptoms**: Slow processing, queue backup

**Diagnosis**:
```bash
# Check processing metrics
bun scripts/queue-admin.ts metrics

# Monitor system resources
docker stats article-manager
```

**Solutions**:
1. Adjust `EMBEDDING_WORKER_INTERVAL`
2. Increase `EMBEDDING_CONCURRENT_WORKERS` (if supported)
3. Optimize embedding provider settings
4. Check database performance

### Emergency Procedures

#### Stop All Processing

```bash
# Stop worker gracefully
bun scripts/queue-admin.ts stop

# Or force stop via database
UPDATE embedding_worker_status SET is_running = false;
```

#### Clear Queue

```bash
# Cancel all pending tasks
bun scripts/queue-admin.ts clear --confirm

# Or selective clearing
UPDATE embedding_tasks 
SET status = 'failed', 
    error_message = 'Cancelled by administrator'
WHERE status = 'pending';
```

#### Emergency Rollback

```bash
# Disable background processing
export SEMANTIC_SEARCH_ENABLED=false

# Restart application
docker-compose restart article-manager

# Verify synchronous mode
curl -H "Authorization: Bearer $AUTH_TOKEN" \
     http://localhost:5000/api/articles \
     -X POST \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","content":"Test content"}'
```

## Rollback Procedures

### Disable Background Processing

#### Temporary Disable

```bash
# Set environment variable
export EMBEDDING_QUEUE_ENABLED=false

# Restart application
docker-compose restart article-manager
```

#### Permanent Disable

```bash
# Update .env file
EMBEDDING_QUEUE_ENABLED=false

# Or disable semantic search entirely
SEMANTIC_SEARCH_ENABLED=false

# Redeploy
docker-compose down
docker-compose up -d
```

### Rollback Migration

```bash
# Cancel pending migration tasks
bun scripts/migrations/003-embedding-migration.ts rollback

# Verify rollback
bun scripts/queue-admin.ts status
```

### Complete System Rollback

If you need to completely remove the background embedding system:

#### 1. Stop Processing

```bash
# Stop worker
bun scripts/queue-admin.ts stop

# Disable in configuration
export SEMANTIC_SEARCH_ENABLED=false
```

#### 2. Clean Up Queue

```bash
# Clear all tasks
bun scripts/queue-admin.ts clear --confirm

# Or manual cleanup
DELETE FROM embedding_tasks;
DELETE FROM embedding_audit_logs;
DELETE FROM performance_metrics;
```

#### 3. Remove Tables (Optional)

```bash
# Run rollback migration
bun scripts/migrations/002-embedding-queue.ts rollback
```

#### 4. Restart Application

```bash
# Restart with synchronous embedding
docker-compose restart article-manager
```

## Performance Optimization

### Tuning Guidelines

#### Worker Configuration

```bash
# For high-throughput scenarios
EMBEDDING_WORKER_INTERVAL=1000           # Faster polling
EMBEDDING_BATCH_SIZE=5                   # Process multiple tasks
EMBEDDING_MAX_RETRIES=5                  # More retry attempts

# For resource-constrained environments
EMBEDDING_WORKER_INTERVAL=10000          # Slower polling
EMBEDDING_BATCH_SIZE=1                   # Single task processing
EMBEDDING_WORKER_TIMEOUT=600000          # Longer timeout
```

#### Database Optimization

```sql
-- Optimize queue queries
ANALYZE embedding_tasks;

-- Add custom indexes if needed
CREATE INDEX IF NOT EXISTS idx_embedding_tasks_custom 
ON embedding_tasks(status, priority, scheduled_at) 
WHERE status IN ('pending', 'processing');
```

#### Monitoring Optimization

```bash
# Reduce log retention for high-volume systems
EMBEDDING_CLEANUP_RETENTION_DAYS=7

# Increase cleanup frequency
EMBEDDING_CLEANUP_INTERVAL=6             # Every 6 hours
```

### Scaling Considerations

#### Horizontal Scaling

The current implementation supports single-worker processing. For horizontal scaling:

1. **Database-level coordination**: Multiple workers can coordinate through the database
2. **Load balancing**: Distribute workers across multiple application instances
3. **Queue partitioning**: Partition tasks by priority or article type

#### Vertical Scaling

1. **Increase worker resources**: More CPU/memory for embedding generation
2. **Optimize embedding provider**: Use faster models or local deployment
3. **Database tuning**: Optimize PostgreSQL for queue operations

This deployment guide provides comprehensive coverage of deploying, monitoring, and maintaining the background embedding queue system for production environments.