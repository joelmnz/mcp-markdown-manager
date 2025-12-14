# Design Document

## Overview

The background embedding queue system implements asynchronous processing of vector embedding generation to prevent UI blocking during article operations. The system separates article persistence from embedding generation, ensuring immediate user feedback while maintaining semantic search capabilities through a reliable background task queue.

## Architecture

The system follows a producer-consumer pattern where article operations (create/update) act as producers that queue embedding tasks, while a background worker processes these tasks asynchronously. The architecture maintains the existing monolithic design while adding queue management capabilities.

### Core Components

1. **Queue Manager**: Manages task lifecycle and persistence
2. **Background Worker**: Processes embedding tasks asynchronously  
3. **Task Scheduler**: Handles retry logic and task prioritization
4. **Status Tracker**: Monitors task progress and provides observability

## Components and Interfaces

### Queue Manager Service

```typescript
interface EmbeddingTask {
  id: string;
  articleId: number;
  slug: string;
  operation: 'create' | 'update' | 'delete';
  priority: 'high' | 'normal' | 'low';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

interface QueueManager {
  enqueueTask(task: Omit<EmbeddingTask, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<string>;
  dequeueTask(): Promise<EmbeddingTask | null>;
  updateTaskStatus(taskId: string, status: EmbeddingTask['status'], errorMessage?: string): Promise<void>;
  getTaskStatus(taskId: string): Promise<EmbeddingTask | null>;
  getQueueStats(): Promise<QueueStats>;
  retryFailedTasks(): Promise<number>;
  clearCompletedTasks(olderThan?: Date): Promise<number>;
}
```

### Background Worker Service

```typescript
interface BackgroundWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  processTask(task: EmbeddingTask): Promise<void>;
  getWorkerStats(): Promise<WorkerStats>;
}

interface WorkerStats {
  isRunning: boolean;
  tasksProcessed: number;
  tasksSucceeded: number;
  tasksFailed: number;
  averageProcessingTime: number;
  lastProcessedAt?: Date;
}
```

### Enhanced Article Service Interface

The existing article service will be enhanced to support background embedding:

```typescript
interface ArticleServiceOptions {
  skipEmbedding?: boolean;
  embeddingPriority?: 'high' | 'normal' | 'low';
}

// Enhanced methods
createArticle(title: string, content: string, message?: string, options?: ArticleServiceOptions): Promise<Article>;
updateArticle(filename: string, title: string, content: string, message?: string, options?: ArticleServiceOptions): Promise<Article>;
```

## Data Models

### Database Schema Extensions

```sql
-- Embedding task queue table
CREATE TABLE embedding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  slug VARCHAR(255) NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB,
  
  INDEX idx_embedding_tasks_status_priority (status, priority, scheduled_at),
  INDEX idx_embedding_tasks_article_id (article_id),
  INDEX idx_embedding_tasks_created_at (created_at)
);

-- Worker status tracking table
CREATE TABLE embedding_worker_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_running BOOLEAN NOT NULL DEFAULT FALSE,
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  tasks_processed INTEGER NOT NULL DEFAULT 0,
  tasks_succeeded INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT single_worker CHECK (id = 1)
);
```

### Task Priority System

- **High Priority**: User-initiated bulk operations, failed task retries
- **Normal Priority**: Regular article create/update operations  
- **Low Priority**: Background maintenance, bulk reindexing

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Property 1: Article persistence precedes task queuing
*For any* article creation or update operation, the article data should be persisted to the database before the corresponding embedding task is added to the queue
**Validates: Requirements 1.1, 1.2**

Property 2: Immediate response without embedding wait
*For any* article operation that triggers embedding, the system should return success to the client without waiting for embedding task completion
**Validates: Requirements 1.3, 1.4, 4.1, 4.2**

Property 3: Embedding failure isolation
*For any* embedding task failure, the article data should remain accessible and modifiable in the database without being affected by the embedding failure
**Validates: Requirements 1.5**

Property 4: Task persistence across restarts
*For any* embedding task in the queue, the task should remain in the queue and be processable after a system restart
**Validates: Requirements 2.1, 2.4**

Property 5: Sequential task processing
*For any* set of embedding tasks in the queue, tasks should be processed one at a time without concurrent execution
**Validates: Requirements 2.2**

Property 6: Retry with exponential backoff
*For any* failed embedding task, the system should retry the task up to 3 times with exponentially increasing delays between attempts
**Validates: Requirements 2.3**

Property 7: Status tracking throughout lifecycle
*For any* embedding task, the task status should be updated in the database at each stage of processing (pending → processing → completed/failed)
**Validates: Requirements 2.5, 3.4**

Property 8: Bulk operation completeness
*For any* bulk embedding update operation, all articles identified as needing embedding updates should have corresponding tasks queued
**Validates: Requirements 3.1, 3.2**

Property 9: Search availability during processing
*For any* search operation, results should be returned based on available embeddings without blocking on pending embedding tasks
**Validates: Requirements 4.3**

Property 10: Search index consistency after completion
*For any* completed embedding task, the generated embeddings should be available in subsequent search operations
**Validates: Requirements 4.4**

Property 11: Comprehensive audit logging
*For any* embedding task operation (creation, status change, completion), corresponding log entries should be created with timestamps
**Validates: Requirements 5.1, 5.5**

Property 12: Accurate queue statistics
*For any* queue statistics query, the returned counts should accurately reflect the current number of tasks in each status (pending, processing, completed, failed)
**Validates: Requirements 5.2**

<function_calls>
<invoke name="prework">
<parameter name="featureName">background-embedding-queue

## Error Handling

### Task Failure Management

1. **Retry Strategy**: Failed tasks are automatically retried up to 3 times with exponential backoff (1s, 2s, 4s)
2. **Permanent Failure**: Tasks exceeding max attempts are marked as permanently failed with detailed error logging
3. **Graceful Degradation**: Article operations continue normally even when embedding tasks fail
4. **Manual Recovery**: Failed tasks can be manually retried through administrative commands

### System Recovery

1. **Queue Persistence**: All tasks are stored in the database to survive system restarts
2. **Worker Recovery**: Background worker automatically resumes processing pending tasks on startup
3. **Orphaned Task Cleanup**: Tasks stuck in "processing" state are reset to "pending" on startup
4. **Data Consistency**: Article data remains consistent regardless of embedding task status

### Error Categories

- **Transient Errors**: Network timeouts, temporary service unavailability (retryable)
- **Configuration Errors**: Missing API keys, invalid model names (requires manual intervention)
- **Data Errors**: Malformed content, encoding issues (logged for investigation)
- **Resource Errors**: Memory exhaustion, disk space (system-level intervention required)

## Testing Strategy

### Unit Testing Approach

Unit tests will focus on individual components and their specific behaviors:

- **Queue Manager**: Task creation, status updates, queue operations
- **Background Worker**: Task processing logic, error handling, worker lifecycle
- **Enhanced Article Service**: Integration with queue system, option handling
- **Database Operations**: Task persistence, status tracking, cleanup operations

### Property-Based Testing Approach

Property-based tests will verify universal behaviors across all valid inputs using **fast-check** for TypeScript. Each property-based test will run a minimum of 100 iterations to ensure comprehensive coverage.

Property tests will be tagged with comments explicitly referencing the correctness properties:
- **Feature: background-embedding-queue, Property 1**: Article persistence precedes task queuing
- **Feature: background-embedding-queue, Property 2**: Immediate response without embedding wait
- And so forth for each correctness property

### Integration Testing

Integration tests will verify end-to-end workflows:

- Article creation → task queuing → background processing → embedding storage
- System restart scenarios with pending tasks
- Bulk operations with progress tracking
- Error scenarios and recovery mechanisms

### Performance Testing

Performance tests will validate system behavior under load:

- Queue throughput with multiple concurrent article operations
- Memory usage during bulk embedding operations  
- Response time consistency during background processing
- Database performance with large task queues

## Implementation Notes

### Database Considerations

1. **Indexing Strategy**: Composite indexes on (status, priority, scheduled_at) for efficient task retrieval
2. **Cleanup Strategy**: Periodic cleanup of completed tasks older than 30 days
3. **Monitoring**: Database triggers for task status change notifications
4. **Partitioning**: Consider table partitioning for high-volume deployments

### Configuration Options

```typescript
interface EmbeddingQueueConfig {
  enabled: boolean;                    // Enable/disable background processing
  workerInterval: number;              // Polling interval in milliseconds (default: 5000)
  maxRetries: number;                  // Maximum retry attempts (default: 3)
  retryBackoffBase: number;           // Base delay for exponential backoff (default: 1000)
  batchSize: number;                  // Tasks to process per batch (default: 1)
  cleanupInterval: number;            // Cleanup interval in hours (default: 24)
  cleanupRetentionDays: number;       // Retention period for completed tasks (default: 30)
}
```

### Monitoring and Observability

1. **Metrics Collection**: Task processing rates, success/failure ratios, queue depth
2. **Health Checks**: Worker status, queue connectivity, embedding service availability
3. **Alerting**: Queue backup, repeated failures, worker downtime
4. **Dashboard**: Real-time queue statistics, processing trends, error rates

### Migration Strategy

1. **Backward Compatibility**: Existing embedding functionality continues to work during migration
2. **Gradual Rollout**: Feature flag to enable background processing per environment
3. **Data Migration**: Existing articles without embeddings are queued for background processing
4. **Rollback Plan**: Ability to disable background processing and revert to synchronous mode