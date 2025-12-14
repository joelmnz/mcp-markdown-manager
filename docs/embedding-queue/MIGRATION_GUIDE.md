# Background Embedding Queue - Migration Guide

## Overview

This guide covers migrating from synchronous embedding to the background queue system.

## Pre-Migration Checklist

- [ ] Database backup completed
- [ ] Application deployed with queue system
- [ ] Configuration verified
- [ ] Deployment readiness check passed

## Migration Process

### 1. Analyze Current State

```bash
bun scripts/embedding-migration.ts analyze
```

This will show:
- Total articles in system
- Articles with/without embeddings
- Estimated migration time

### 2. Test Migration (Dry Run)

```bash
bun scripts/embedding-migration.ts migrate --dry-run
```

This will:
- Show what would be migrated
- Identify potential issues
- Provide time estimates

### 3. Perform Migration

```bash
# Standard migration
bun scripts/embedding-migration.ts migrate

# Custom batch size and priority
bun scripts/embedding-migration.ts migrate --batch-size=100 --priority=high
```

### 4. Monitor Progress

```bash
# Real-time monitoring
bun scripts/queue-admin.ts monitor

# Check statistics
bun scripts/queue-admin.ts stats
```

## Migration Strategies

### Small Systems (< 1000 articles)

- Use default batch size (50)
- Run during normal hours
- Monitor completion in real-time

### Medium Systems (1000-10000 articles)

- Use larger batch size (100-200)
- Run during off-peak hours
- Implement progress monitoring
- Consider priority queuing

### Large Systems (> 10000 articles)

- Use large batch sizes (500+)
- Run during maintenance windows
- Implement staged migration
- Monitor system resources closely

## Post-Migration Verification

### 1. Verify Queue Health

```bash
bun scripts/queue-admin.ts health
```

### 2. Test Article Operations

1. Create new article
2. Verify immediate save
3. Check embedding task queued
4. Monitor task completion

### 3. Test Search Functionality

1. Search for existing content
2. Verify results include new articles
3. Test search performance

### 4. Monitor Performance

- Response times for article operations
- Queue processing speed
- System resource usage
- Error rates

## Rollback Procedures

### Immediate Rollback

If critical issues arise:

```bash
bun scripts/embedding-migration.ts rollback --confirm
```

This will:
- Stop background worker
- Cancel pending tasks
- Revert to synchronous mode

### Partial Rollback

For specific articles with issues:

```bash
# Identify problematic tasks
bun scripts/queue-admin.ts list failed

# Cancel specific tasks
bun scripts/queue-admin.ts debug <task-id>
```

## Troubleshooting Migration Issues

### Migration Stalls

**Symptoms:**
- Migration progress stops
- No new tasks being queued

**Solutions:**
1. Check system resources
2. Verify database connectivity
3. Restart migration with smaller batches

### High Error Rate During Migration

**Symptoms:**
- Many tasks failing during migration
- Consistent error patterns

**Solutions:**
1. Analyze error messages
2. Fix underlying issues
3. Retry failed tasks
4. Consider staged migration

### Performance Degradation

**Symptoms:**
- Slow application response
- High system resource usage

**Solutions:**
1. Reduce batch size
2. Increase worker interval
3. Schedule migration during off-peak hours
4. Monitor system resources

## Best Practices

### Before Migration

1. **Backup everything** - database, configuration, logs
2. **Test in staging** - run full migration test
3. **Plan timing** - choose low-traffic periods
4. **Prepare rollback** - have rollback plan ready

### During Migration

1. **Monitor actively** - watch progress and errors
2. **Check resources** - monitor CPU, memory, disk
3. **Be patient** - large migrations take time
4. **Document issues** - record any problems for future reference

### After Migration

1. **Verify functionality** - test all features
2. **Monitor performance** - watch for degradation
3. **Clean up** - remove old temporary data
4. **Update documentation** - record any changes made

## Recovery Scenarios

### Complete Migration Failure

1. Stop migration process
2. Rollback to synchronous mode
3. Analyze failure causes
4. Fix issues and retry

### Partial Migration Success

1. Identify successful vs failed articles
2. Retry failed articles only
3. Monitor for patterns in failures
4. Consider manual intervention for problematic articles

### Data Corruption

1. Stop all operations immediately
2. Restore from backup
3. Investigate corruption cause
4. Implement additional safeguards
5. Retry migration with fixes
