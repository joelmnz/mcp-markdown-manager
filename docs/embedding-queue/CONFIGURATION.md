# Background Embedding Queue - Configuration Reference

## Environment Variables

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_QUEUE_ENABLED` | `true` | Enable/disable background embedding queue |
| `EMBEDDING_QUEUE_WORKER_INTERVAL` | `5000` | Worker polling interval in milliseconds |
| `EMBEDDING_QUEUE_MAX_RETRIES` | `3` | Maximum retry attempts for failed tasks |
| `EMBEDDING_QUEUE_BATCH_SIZE` | `1` | Number of tasks to process per batch |

### Advanced Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_QUEUE_CLEANUP_INTERVAL` | `86400000` | Cleanup interval in milliseconds (24h) |
| `EMBEDDING_QUEUE_RETENTION_DAYS` | `30` | Days to retain completed tasks |
| `EMBEDDING_QUEUE_STUCK_TIMEOUT` | `1800000` | Timeout for stuck tasks in milliseconds (30m) |

## Database Configuration

The queue system requires two additional tables:

- `embedding_tasks`: Stores queue tasks and their status
- `embedding_worker_status`: Tracks worker state and statistics

## Performance Tuning

### Worker Interval

- **Low traffic**: 10-30 seconds (reduces CPU usage)
- **Medium traffic**: 5-10 seconds (balanced)
- **High traffic**: 1-5 seconds (responsive)

### Batch Size

- **Single processing**: 1 (prevents resource contention)
- **Bulk operations**: 5-10 (faster bulk processing)

### Retry Configuration

- **Transient errors**: 3-5 retries with exponential backoff
- **Persistent errors**: 1-2 retries to avoid infinite loops

## Monitoring Configuration

### Health Check Thresholds

- **Queue depth warning**: > 100 pending tasks
- **Processing timeout**: > 30 minutes
- **Failure rate alert**: > 10 failures per hour

### Metrics Collection

Enable performance metrics collection:

```bash
EMBEDDING_QUEUE_METRICS_ENABLED=true
EMBEDDING_QUEUE_METRICS_INTERVAL=60000  # 1 minute
```

## Security Configuration

### Access Control

- Restrict queue management commands to administrators
- Implement rate limiting for queue operations
- Monitor for unusual queue activity patterns

### Data Protection

- Encrypt sensitive metadata in queue tasks
- Implement audit logging for queue operations
- Regular backup of queue state for disaster recovery
