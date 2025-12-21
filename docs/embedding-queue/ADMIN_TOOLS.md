# Background Embedding Queue - Administrative Tools

## Overview

This document provides a comprehensive guide to the administrative tools available for managing the background embedding queue system.

## Available Tools

### 1. Queue Management Tool (`queue-admin.ts`)

The primary tool for day-to-day queue management and monitoring.

**Location:** `scripts/queue-admin.ts`

#### Key Features

- **Real-time monitoring** with live queue statistics
- **Task inspection** with detailed debugging information
- **Queue health checks** with automated issue detection
- **Task retry mechanisms** for failed operations
- **Cleanup utilities** for maintenance operations
- **Performance monitoring** with metrics and trends

#### Common Commands

```bash
# Monitor queue in real-time
bun scripts/queue-admin.ts monitor

# Check overall queue health
bun scripts/queue-admin.ts health

# View detailed statistics
bun scripts/queue-admin.ts stats

# List failed tasks for investigation
bun scripts/queue-admin.ts list failed 20

# Debug a specific problematic task
bun scripts/queue-admin.ts debug <task-id>

# Retry all failed tasks that haven't exceeded max attempts
bun scripts/queue-admin.ts retry-failed

# Clean up old completed tasks (older than 7 days)
bun scripts/queue-admin.ts cleanup 7

# Reset tasks stuck in processing state
bun scripts/queue-admin.ts cleanup-stuck 30
```

### 2. Migration and Deployment Tool (`embedding-migration.ts`)

Specialized tool for system deployment, migration, and rollback operations.

**Location:** `scripts/embedding-migration.ts`

#### Key Features

- **Migration analysis** to assess current system state
- **Automated migration** with batch processing and progress tracking
- **Deployment readiness checks** to verify system configuration
- **Rollback procedures** for emergency situations
- **Documentation generation** for deployment guides
- **Configuration backup and restore** for disaster recovery

#### Common Commands

```bash
# Analyze current embedding status
bun scripts/embedding-migration.ts analyze

# Check if system is ready for deployment
bun scripts/embedding-migration.ts deploy-check

# Perform dry-run migration to see what would happen
bun scripts/embedding-migration.ts migrate --dry-run

# Migrate existing articles with custom batch size
bun scripts/embedding-migration.ts migrate --batch-size=100 --priority=high

# Generate comprehensive deployment documentation
bun scripts/embedding-migration.ts generate-docs

# Backup current configuration
bun scripts/embedding-migration.ts backup-config

# Emergency rollback to synchronous mode
bun scripts/embedding-migration.ts rollback --confirm
```

### 3. Bulk Operations Tool (`bulk-embedding-admin.ts`)

Existing tool for bulk embedding operations, enhanced to work with the queue system.

**Location:** `scripts/bulk-embedding-admin.ts`

#### Key Features

- **Article identification** for embedding updates
- **Bulk queue operations** with progress tracking
- **Operation monitoring** with detailed progress reports
- **Batch processing** with configurable parameters

## Administrative Workflows

### Daily Operations

#### Morning Health Check
```bash
# Check overall system health
bun scripts/queue-admin.ts health

# Review overnight activity
bun scripts/queue-admin.ts stats

# Check for any failed tasks
bun scripts/queue-admin.ts list failed 10
```

#### Ongoing Monitoring
```bash
# Start real-time monitoring (leave running in terminal)
bun scripts/queue-admin.ts monitor 10

# Periodic health checks
bun scripts/queue-admin.ts health
```

#### End of Day Cleanup
```bash
# Clean up old completed tasks
bun scripts/queue-admin.ts cleanup 30

# Reset any stuck tasks
bun scripts/queue-admin.ts cleanup-stuck 60
```

### Weekly Maintenance

#### Performance Review
```bash
# Analyze queue performance trends
bun scripts/queue-admin.ts stats

# Review failed task patterns
bun scripts/queue-admin.ts list failed 50

# Check for articles with persistent issues
bun scripts/bulk-embedding-admin.ts identify
```

#### System Cleanup
```bash
# Clean up old completed tasks (keep 7 days)
bun scripts/queue-admin.ts cleanup 7

# Backup current configuration
bun scripts/embedding-migration.ts backup-config
```

### Emergency Procedures

#### High Failure Rate
```bash
# Investigate recent failures
bun scripts/queue-admin.ts list failed 20

# Debug specific problematic tasks
bun scripts/queue-admin.ts debug <task-id>

# Retry failed tasks after fixing issues
bun scripts/queue-admin.ts retry-failed
```

#### Queue Backup
```bash
# Check queue depth and health
bun scripts/queue-admin.ts health

# Monitor processing in real-time
bun scripts/queue-admin.ts monitor 5

# If queue is overwhelmed, consider temporary measures
# (reduce batch size, increase worker interval, etc.)
```

#### System Rollback
```bash
# If critical issues arise, rollback to synchronous mode
bun scripts/embedding-migration.ts rollback --confirm

# This will:
# - Stop background worker
# - Cancel pending tasks
# - Revert to immediate embedding processing
```

## Troubleshooting Guide

### Common Issues and Solutions

#### Queue Not Processing
**Symptoms:** Tasks stuck in pending status
**Investigation:**
```bash
bun scripts/queue-admin.ts health
bun scripts/queue-admin.ts monitor
```
**Solutions:**
- Check if background worker is running
- Verify database connectivity
- Ensure EMBEDDING_QUEUE_ENABLED=true

#### High Failure Rate
**Symptoms:** Many tasks in failed status
**Investigation:**
```bash
bun scripts/queue-admin.ts list failed 10
bun scripts/queue-admin.ts debug <failing-task-id>
```
**Solutions:**
- Check embedding service availability
- Verify API credentials
- Review error patterns for systemic issues

#### Performance Issues
**Symptoms:** Slow task processing, growing queue
**Investigation:**
```bash
bun scripts/queue-admin.ts stats
bun scripts/queue-admin.ts monitor 5
```
**Solutions:**
- Monitor system resources
- Adjust worker interval
- Consider batch size optimization

### Diagnostic Commands

#### Quick Health Check
```bash
# One-command health overview
bun scripts/queue-admin.ts health && bun scripts/queue-admin.ts stats
```

#### Deep Dive Investigation
```bash
# Comprehensive system analysis
bun scripts/embedding-migration.ts analyze
bun scripts/queue-admin.ts health
bun scripts/queue-admin.ts list failed 20
bun scripts/bulk-embedding-admin.ts status
```

#### Performance Analysis
```bash
# Monitor queue performance over time
bun scripts/queue-admin.ts monitor 30  # 30-second intervals for detailed monitoring
```

## Best Practices

### Monitoring

1. **Set up regular health checks** - Run health checks at least daily
2. **Monitor queue depth** - Watch for unusual growth in pending tasks
3. **Track failure rates** - Investigate if failure rate exceeds 5%
4. **Review processing times** - Monitor for performance degradation

### Maintenance

1. **Regular cleanup** - Clean up completed tasks weekly
2. **Configuration backups** - Backup configuration before changes
3. **Documentation updates** - Keep deployment docs current
4. **Performance tuning** - Adjust parameters based on usage patterns

### Emergency Response

1. **Have rollback plan ready** - Know how to quickly revert to synchronous mode
2. **Monitor during deployments** - Watch queue health during system changes
3. **Document incidents** - Record issues and solutions for future reference
4. **Test recovery procedures** - Regularly verify rollback and recovery processes

## Integration with Monitoring Systems

### Log Analysis

The queue system generates structured logs that can be integrated with log analysis tools:

- Task lifecycle events (created, started, completed, failed)
- Performance metrics (processing times, queue depths)
- Error details with context for debugging

### Metrics Collection

Key metrics to monitor:

- **Queue depth** by status (pending, processing, completed, failed)
- **Processing times** (average, median, 95th percentile)
- **Failure rates** (overall and by error type)
- **Throughput** (tasks processed per hour/day)

### Alerting

Recommended alerts:

- Queue depth > 100 pending tasks
- Failure rate > 10% over 1 hour
- Tasks stuck in processing > 30 minutes
- No tasks processed in last 15 minutes (during business hours)

## Security Considerations

### Access Control

- Restrict administrative tool access to authorized personnel
- Use secure authentication for production systems
- Implement audit logging for administrative actions

### Data Protection

- Ensure queue task metadata doesn't contain sensitive information
- Implement proper backup encryption for configuration backups
- Monitor for unusual queue activity patterns

### Network Security

- Secure database connections with proper credentials
- Use encrypted connections for embedding service APIs
- Implement rate limiting to prevent queue flooding

## Performance Optimization

### Queue Configuration

Optimize based on system characteristics:

**High-volume systems:**
- Reduce worker interval (1-5 seconds)
- Increase batch size for bulk operations
- Monitor resource usage closely

**Low-volume systems:**
- Increase worker interval (10-30 seconds)
- Use smaller batch sizes
- Focus on reliability over speed

### Database Optimization

- Monitor queue table sizes and performance
- Implement regular cleanup of old completed tasks
- Consider table partitioning for very high-volume systems
- Ensure proper indexing on frequently queried columns

### Resource Management

- Monitor memory usage during bulk operations
- Watch CPU utilization during peak processing
- Ensure adequate disk space for queue operations
- Consider scaling embedding service for high throughput

## Conclusion

These administrative tools provide comprehensive management capabilities for the background embedding queue system. Regular use of these tools will help maintain system health, optimize performance, and quickly resolve any issues that arise.

For additional support or questions about specific scenarios not covered in this guide, refer to the troubleshooting documentation or system logs for detailed error information.