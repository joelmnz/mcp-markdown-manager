# Background Embedding Queue - Troubleshooting Guide

## Common Issues

### Queue Not Processing Tasks

**Symptoms:**
- Tasks remain in "pending" status
- No tasks move to "processing"

**Causes & Solutions:**

1. **Worker not running**
   ```bash
   # Check worker status
   bun scripts/queue-admin.ts health
   
   # Restart application to start worker
   ```

2. **Database connection issues**
   ```bash
   # Test database connectivity
   bun scripts/test-embedding-queue.ts
   ```

3. **Configuration disabled**
   ```bash
   # Check if queue is enabled
   echo $EMBEDDING_QUEUE_ENABLED
   ```

### High Failure Rate

**Symptoms:**
- Many tasks in "failed" status
- Repeated error messages in logs

**Diagnosis:**
```bash
# Check failed tasks
bun scripts/queue-admin.ts list failed 10

# Debug specific task
bun scripts/queue-admin.ts debug <task-id>
```

**Common Causes:**

1. **Embedding service unavailable**
   - Check embedding service status
   - Verify API credentials
   - Test network connectivity

2. **Resource exhaustion**
   - Check memory usage
   - Monitor CPU utilization
   - Verify disk space

3. **Invalid article content**
   - Check for malformed markdown
   - Verify character encoding
   - Test with simple content

### Stuck Processing Tasks

**Symptoms:**
- Tasks stuck in "processing" status for hours
- Worker appears unresponsive

**Solution:**
```bash
# Reset stuck tasks
bun scripts/queue-admin.ts cleanup-stuck 30

# Check for system resource issues
```

### Queue Growing Too Large

**Symptoms:**
- Thousands of pending tasks
- System performance degradation

**Immediate Actions:**
```bash
# Check queue health
bun scripts/queue-admin.ts health

# Monitor queue in real-time
bun scripts/queue-admin.ts monitor
```

**Long-term Solutions:**
- Increase worker processing speed
- Add multiple worker instances
- Optimize embedding generation
- Implement queue prioritization

## Diagnostic Commands

### Queue Status
```bash
# Overall statistics
bun scripts/queue-admin.ts stats

# Health check with recommendations
bun scripts/queue-admin.ts health

# Real-time monitoring
bun scripts/queue-admin.ts monitor 10
```

### Task Investigation
```bash
# List recent failed tasks
bun scripts/queue-admin.ts list failed 20

# Inspect specific task
bun scripts/queue-admin.ts inspect <task-id>

# Debug with detailed analysis
bun scripts/queue-admin.ts debug <task-id>

# Show all tasks for an article
bun scripts/queue-admin.ts article <article-id>
```

### Recovery Operations
```bash
# Retry specific failed task
bun scripts/queue-admin.ts retry <task-id>

# Retry all failed tasks
bun scripts/queue-admin.ts retry-failed

# Clean up old completed tasks
bun scripts/queue-admin.ts cleanup 7

# Reset stuck processing tasks
bun scripts/queue-admin.ts cleanup-stuck 30
```

## Performance Issues

### Slow Task Processing

1. **Check embedding service performance**
2. **Monitor database query performance**
3. **Verify network latency**
4. **Review system resource usage**

### Memory Leaks

1. **Monitor worker memory usage over time**
2. **Check for unclosed database connections**
3. **Review task metadata size**
4. **Implement periodic worker restarts**

### Database Performance

1. **Monitor queue table sizes**
2. **Check index usage**
3. **Implement regular cleanup**
4. **Consider table partitioning for high volume**

## Emergency Procedures

### Complete Queue Reset

⚠️ **WARNING: This will cancel all pending tasks**

```bash
# Stop worker (restart application)
# Clear all pending tasks
UPDATE embedding_tasks SET status = 'failed', 
  error_message = 'Emergency reset' 
  WHERE status IN ('pending', 'processing');
```

### Rollback to Synchronous Mode

```bash
# Perform emergency rollback
bun scripts/embedding-migration.ts rollback --confirm
```

### Data Recovery

```bash
# Backup current queue state
pg_dump -t embedding_tasks -t embedding_worker_status > queue_backup.sql

# Restore from backup if needed
psql < queue_backup.sql
```

## Getting Help

1. **Check application logs** for detailed error messages
2. **Run diagnostic commands** to gather system state
3. **Review configuration** for common misconfigurations
4. **Test with minimal examples** to isolate issues
5. **Monitor system resources** during problem periods
