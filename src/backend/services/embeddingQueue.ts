import { database } from './database.js';
import { DatabaseServiceError, DatabaseErrorType } from './databaseErrors.js';
import { loggingService, LogLevel, LogCategory } from './logging.js';
import { performanceMetricsService, MetricType } from './performanceMetrics.js';
import { embeddingQueueConfigService } from './embeddingQueueConfig.js';

// EmbeddingTask interface as defined in the design document
export interface EmbeddingTask {
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

// Queue statistics interface
export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

// Queue health status interface
export interface QueueHealth {
  isHealthy: boolean;
  totalTasks: number;
  oldestPendingTask?: Date;
  failedTasksLast24h: number;
  averageProcessingTime?: number;
  issues: string[];
}

// Bulk operation progress interface
export interface BulkOperationProgress {
  totalArticles: number;
  processedArticles: number;
  queuedTasks: number;
  skippedArticles: number;
  errors: string[];
}

// Bulk operation result interface
export interface BulkOperationResult {
  totalArticles: number;
  queuedTasks: number;
  skippedArticles: number;
  errors: string[];
  taskIds: string[];
}

// Bulk operation summary interface
export interface BulkOperationSummary {
  operationId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  processingTasks: number;
  successRate: number;
  averageProcessingTime?: number;
  errors: string[];
}

// Queue Manager Service interface
export interface QueueManager {
  enqueueTask(task: Omit<EmbeddingTask, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<string>;
  dequeueTask(): Promise<EmbeddingTask | null>;
  updateTaskStatus(taskId: string, status: EmbeddingTask['status'], errorMessage?: string): Promise<void>;
  getTaskStatus(taskId: string): Promise<EmbeddingTask | null>;
  getQueueStats(): Promise<QueueStats>;
  retryFailedTasks(): Promise<number>;
  clearCompletedTasks(olderThan?: Date): Promise<number>;
  clearFailedTasks(): Promise<number>;
  deleteTask(taskId: string): Promise<void>;
  getQueueHealth(): Promise<QueueHealth>;
  getDetailedQueueStats(): Promise<{
    stats: QueueStats;
    tasksByPriority: Record<string, number>;
    tasksByOperation: Record<string, number>;
    recentActivity: {
      tasksCompletedLast24h: number;
      tasksFailedLast24h: number;
      averageProcessingTime: number | null;
    };
    recentErrors: Array<{
      id: string;
      slug: string;
      operation: string;
      errorMessage: string;
      completedAt: Date;
    }>;
  }>;
  // Bulk operations
  identifyArticlesNeedingEmbedding(): Promise<Array<{
    articleId: number;
    slug: string;
    title: string;
    reason: 'missing_embedding' | 'failed_embedding' | 'no_completed_task';
    lastTaskStatus?: string;
    lastError?: string;
  }>>;
  queueBulkEmbeddingUpdate(
    priority?: 'high' | 'normal' | 'low',
    progressCallback?: (progress: BulkOperationProgress) => void
  ): Promise<BulkOperationResult>;
  // Bulk operation reporting
  getBulkOperationSummary(operationId: string): Promise<BulkOperationSummary | null>;
  listRecentBulkOperations(limit?: number): Promise<BulkOperationSummary[]>;
  getBulkOperationProgress(taskIds: string[]): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
    details: Array<{
      taskId: string;
      articleSlug: string;
      status: string;
      error?: string;
    }>;
  }>;
  resetAndReindexAll(priority?: 'high' | 'normal' | 'low'): Promise<BulkOperationResult>;
}

class EmbeddingQueueService implements QueueManager {
  
  /**
   * Add a new embedding task to the queue
   */
  async enqueueTask(task: Omit<EmbeddingTask, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<string> {
    const startTime = Date.now();
    
    try {
      const result = await database.query(`
        INSERT INTO embedding_tasks (
          article_id, slug, operation, priority, max_attempts, 
          scheduled_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        task.articleId,
        task.slug,
        task.operation,
        task.priority,
        task.maxAttempts,
        task.scheduledAt,
        task.metadata ? JSON.stringify(task.metadata) : null
      ]);

      if (result.rows.length === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.QUERY_ERROR,
          'Failed to create embedding task',
          'Unable to add task to queue. Please try again.'
        );
      }

      const taskId = result.rows[0].id;
      const duration = Date.now() - startTime;

      // Log successful task enqueue
      await loggingService.logQueueOperation('task_enqueued', {
        taskId,
        articleId: task.articleId,
        duration,
        metadata: {
          operation: task.operation,
          priority: task.priority,
          slug: task.slug,
          maxAttempts: task.maxAttempts
        }
      });

      return taskId;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log failed enqueue operation
      await loggingService.logQueueOperation('task_enqueue_failed', {
        articleId: task.articleId,
        duration,
        error: error instanceof Error ? error : new Error('Unknown error'),
        metadata: {
          operation: task.operation,
          priority: task.priority,
          slug: task.slug
        }
      });

      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to enqueue embedding task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to add task to queue. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get the next pending task from the queue (highest priority first, then FIFO)
   */
  async dequeueTask(): Promise<EmbeddingTask | null> {
    const startTime = Date.now();
    
    try {
      return await database.transaction(async (client) => {
        // Get the next task with row-level locking to prevent race conditions
        const result = await client.query(`
          SELECT id, article_id, slug, operation, priority, status, attempts, 
                 max_attempts, created_at, scheduled_at, processed_at, completed_at,
                 error_message, metadata
          FROM embedding_tasks 
          WHERE status = 'pending' 
            AND scheduled_at <= NOW()
          ORDER BY 
            CASE priority 
              WHEN 'high' THEN 1 
              WHEN 'normal' THEN 2 
              WHEN 'low' THEN 3 
            END,
            created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `);

        if (result.rows.length === 0) {
          // No tasks available - this is normal, don't log
          return null;
        }

        const taskRow = result.rows[0];

        // Mark the task as processing
        await client.query(`
          UPDATE embedding_tasks 
          SET status = 'processing', processed_at = NOW(), attempts = attempts + 1
          WHERE id = $1
        `, [taskRow.id]);

        const task = this.convertRowToTask(taskRow);
        const duration = Date.now() - startTime;

        // Log successful task dequeue
        await loggingService.logQueueOperation('task_dequeued', {
          taskId: task.id,
          articleId: task.articleId,
          duration,
          metadata: {
            operation: task.operation,
            priority: task.priority,
            slug: task.slug,
            attempt: task.attempts + 1, // +1 because we just incremented it
            waitTime: Date.now() - task.createdAt.getTime()
          }
        });

        // Convert database row to EmbeddingTask interface
        return task;
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log failed dequeue operation
      await loggingService.logQueueOperation('task_dequeue_failed', {
        duration,
        error: error instanceof Error ? error : new Error('Unknown error')
      });

      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to dequeue embedding task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve task from queue. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Update the status of an embedding task
   */
  async updateTaskStatus(taskId: string, status: EmbeddingTask['status'], errorMessage?: string): Promise<void> {
    try {
      const updateFields = ['status = $2'];
      const params: any[] = [taskId, status];
      let paramIndex = 3;

      // Add completion timestamp for completed/failed tasks
      if (status === 'completed' || status === 'failed') {
        updateFields.push(`completed_at = NOW()`);
      }

      // Add error message if provided
      if (errorMessage !== undefined) {
        updateFields.push(`error_message = $${paramIndex}`);
        params.push(errorMessage);
        paramIndex++;
      }

      const result = await database.query(`
        UPDATE embedding_tasks 
        SET ${updateFields.join(', ')}
        WHERE id = $1
      `, params);

      if (result.rowCount === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.NOT_FOUND,
          `Embedding task with ID ${taskId} not found`,
          'Task not found in queue.'
        );
      }
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to update task status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to update task status. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get the status of a specific embedding task
   */
  async getTaskStatus(taskId: string): Promise<EmbeddingTask | null> {
    try {
      const result = await database.query(`
        SELECT id, article_id, slug, operation, priority, status, attempts, 
               max_attempts, created_at, scheduled_at, processed_at, completed_at,
               error_message, metadata
        FROM embedding_tasks 
        WHERE id = $1
      `, [taskId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.convertRowToTask(result.rows[0]);
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get task status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve task status. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get queue statistics (counts by status)
   */
  async getQueueStats(): Promise<QueueStats> {
    try {
      const result = await database.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM embedding_tasks 
        GROUP BY status
      `);

      const stats: QueueStats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0
      };

      for (const row of result.rows) {
        const status = row.status as keyof Omit<QueueStats, 'total'>;
        const count = parseInt(row.count, 10);
        if (status in stats) {
          stats[status] = count;
          stats.total += count;
        }
      }

      return stats;
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get queue statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve queue statistics. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Retry failed tasks that haven't exceeded max attempts
   */
  async retryFailedTasks(): Promise<number> {
    try {
      const result = await database.query(`
        UPDATE embedding_tasks 
        SET status = 'pending', 
            scheduled_at = NOW() + INTERVAL '1 minute',
            error_message = NULL
        WHERE status = 'failed' 
          AND attempts < max_attempts
      `);

      return result.rowCount || 0;
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to retry failed tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retry failed tasks. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clean up old completed tasks
   */
  async clearCompletedTasks(olderThan?: Date): Promise<number> {
    try {
      const cutoffDate = olderThan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago by default
      
      const result = await database.query(`
        DELETE FROM embedding_tasks 
        WHERE status = 'completed' 
          AND completed_at < $1
      `, [cutoffDate]);

      return result.rowCount || 0;
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to clear completed tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to clear completed tasks. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get comprehensive queue health information
   */
  async getQueueHealth(): Promise<QueueHealth> {
    try {
      const [statsResult, oldestPendingResult, failedLast24hResult, avgProcessingResult] = await Promise.all([
        // Get basic stats
        this.getQueueStats(),
        
        // Get oldest pending task
        database.query(`
          SELECT created_at 
          FROM embedding_tasks 
          WHERE status = 'pending' 
          ORDER BY created_at ASC 
          LIMIT 1
        `),
        
        // Get failed tasks in last 24 hours
        database.query(`
          SELECT COUNT(*) as count
          FROM embedding_tasks 
          WHERE status = 'failed' 
            AND completed_at >= NOW() - INTERVAL '24 hours'
        `),
        
        // Get average processing time for completed tasks in last 24 hours
        database.query(`
          SELECT AVG(EXTRACT(EPOCH FROM (completed_at - processed_at))) as avg_seconds
          FROM embedding_tasks 
          WHERE status = 'completed' 
            AND completed_at >= NOW() - INTERVAL '24 hours'
            AND processed_at IS NOT NULL
        `)
      ]);

      const stats = statsResult;
      const oldestPending = oldestPendingResult.rows[0]?.created_at;
      const failedLast24h = parseInt(failedLast24hResult.rows[0]?.count || '0', 10);
      const avgProcessingSeconds = avgProcessingResult.rows[0]?.avg_seconds;

      const issues: string[] = [];
      
      // Check for health issues
      if (stats.pending > 100) {
        issues.push(`High number of pending tasks: ${stats.pending}`);
      }
      
      if (stats.processing > 10) {
        issues.push(`High number of processing tasks: ${stats.processing} (possible stuck tasks)`);
      }
      
      if (failedLast24h > 10) {
        issues.push(`High failure rate: ${failedLast24h} failed tasks in last 24 hours`);
      }
      
      if (oldestPending) {
        const ageHours = (Date.now() - new Date(oldestPending).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          issues.push(`Old pending tasks: oldest task is ${Math.round(ageHours)} hours old`);
        }
      }

      return {
        isHealthy: issues.length === 0,
        totalTasks: stats.total,
        oldestPendingTask: oldestPending ? new Date(oldestPending) : undefined,
        failedTasksLast24h: failedLast24h,
        averageProcessingTime: avgProcessingSeconds ? parseFloat(avgProcessingSeconds) : undefined,
        issues
      };
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get queue health: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve queue health information. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get detailed queue statistics with breakdowns
   */
  async getDetailedQueueStats(): Promise<{
    stats: QueueStats;
    tasksByPriority: Record<string, number>;
    tasksByOperation: Record<string, number>;
    recentActivity: {
      tasksCompletedLast24h: number;
      tasksFailedLast24h: number;
      averageProcessingTime: number | null;
    };
    recentErrors: Array<{
      id: string;
      slug: string;
      operation: string;
      errorMessage: string;
      completedAt: Date;
    }>;
  }> {
    try {
      const [stats, priorityResult, operationResult, recentActivityResult, recentErrorsResult] = await Promise.all([
        // Get basic stats
        this.getQueueStats(),
        
        // Get tasks by priority
        database.query(`
          SELECT priority, COUNT(*) as count
          FROM embedding_tasks 
          WHERE status IN ('pending', 'processing')
          GROUP BY priority
        `),
        
        // Get tasks by operation type
        database.query(`
          SELECT operation, COUNT(*) as count
          FROM embedding_tasks 
          WHERE status IN ('pending', 'processing')
          GROUP BY operation
        `),
        
        // Get recent activity metrics
        database.query(`
          SELECT 
            SUM(CASE WHEN status = 'completed' AND completed_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as completed_24h,
            SUM(CASE WHEN status = 'failed' AND completed_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as failed_24h,
            AVG(CASE 
              WHEN status = 'completed' 
                AND completed_at >= NOW() - INTERVAL '24 hours' 
                AND processed_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (completed_at - processed_at)) 
              ELSE NULL 
            END) as avg_processing_seconds
          FROM embedding_tasks
        `),

        // Get recent errors
        database.query(`
          SELECT id, slug, operation, error_message, completed_at
          FROM embedding_tasks
          WHERE status = 'failed'
          ORDER BY completed_at DESC
          LIMIT 10
        `)
      ]);

      // Process priority breakdown
      const tasksByPriority: Record<string, number> = { high: 0, normal: 0, low: 0 };
      for (const row of priorityResult.rows) {
        tasksByPriority[row.priority] = parseInt(row.count, 10);
      }

      // Process operation breakdown
      const tasksByOperation: Record<string, number> = { create: 0, update: 0, delete: 0 };
      for (const row of operationResult.rows) {
        tasksByOperation[row.operation] = parseInt(row.count, 10);
      }

      // Process recent activity
      const activityRow = recentActivityResult.rows[0] || {};
      const recentActivity = {
        tasksCompletedLast24h: parseInt(activityRow.completed_24h || '0', 10),
        tasksFailedLast24h: parseInt(activityRow.failed_24h || '0', 10),
        averageProcessingTime: activityRow.avg_processing_seconds ? parseFloat(activityRow.avg_processing_seconds) : null
      };

      // Process recent errors
      const recentErrors = recentErrorsResult.rows.map(row => ({
        id: row.id,
        slug: row.slug,
        operation: row.operation,
        errorMessage: row.error_message || 'Unknown error',
        completedAt: new Date(row.completed_at)
      }));

      return {
        stats,
        tasksByPriority,
        tasksByOperation,
        recentActivity,
        recentErrors
      };
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get detailed queue statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve detailed queue statistics. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete a specific task by ID
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      const result = await database.query(`
        DELETE FROM embedding_tasks
        WHERE id = $1
      `, [taskId]);

      if (result.rowCount === 0) {
        throw new DatabaseServiceError(
          DatabaseErrorType.NOT_FOUND,
          `Task with ID ${taskId} not found`,
          'Task not found.'
        );
      }
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        throw error;
      }
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to delete task. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clear all failed tasks
   */
  async clearFailedTasks(): Promise<number> {
    try {
      const result = await database.query(`
        DELETE FROM embedding_tasks
        WHERE status = 'failed'
      `);

      return result.rowCount || 0;
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to clear failed tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to clear failed tasks. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clean up stuck processing tasks (tasks that have been processing for too long)
   */
  async cleanupStuckTasks(timeoutMinutes: number = 30): Promise<number> {
    try {
      const result = await database.query(`
        UPDATE embedding_tasks 
        SET status = 'pending', 
            processed_at = NULL,
            error_message = 'Task was stuck in processing state and has been reset'
        WHERE status = 'processing' 
          AND processed_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
      `);

      return result.rowCount || 0;
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to cleanup stuck tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to cleanup stuck tasks. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get tasks by status with optional pagination
   */
  async getTasksByStatus(
    status: EmbeddingTask['status'], 
    limit: number = 50, 
    offset: number = 0
  ): Promise<EmbeddingTask[]> {
    try {
      const result = await database.query(`
        SELECT id, article_id, slug, operation, priority, status, attempts, 
               max_attempts, created_at, scheduled_at, processed_at, completed_at,
               error_message, metadata
        FROM embedding_tasks 
        WHERE status = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [status, limit, offset]);

      return result.rows.map(row => this.convertRowToTask(row));
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get tasks by status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve tasks. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get tasks for a specific article
   */
  async getTasksForArticle(articleId: number): Promise<EmbeddingTask[]> {
    try {
      const result = await database.query(`
        SELECT id, article_id, slug, operation, priority, status, attempts, 
               max_attempts, created_at, scheduled_at, processed_at, completed_at,
               error_message, metadata
        FROM embedding_tasks 
        WHERE article_id = $1
        ORDER BY created_at DESC
      `, [articleId]);

      return result.rows.map(row => this.convertRowToTask(row));
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get tasks for article: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve article tasks. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Identify articles that need embedding updates (missing or failed embeddings)
   */
  async identifyArticlesNeedingEmbedding(): Promise<Array<{
    articleId: number;
    slug: string;
    title: string;
    reason: 'missing_embedding' | 'failed_embedding' | 'no_completed_task';
    lastTaskStatus?: string;
    lastError?: string;
  }>> {
    try {
      // Query to find articles that need embedding updates
      const result = await database.query(`
        WITH article_task_status AS (
          SELECT 
            a.id as article_id,
            a.slug,
            a.title,
            et.status as last_task_status,
            et.error_message as last_error,
            et.created_at as last_task_created,
            ROW_NUMBER() OVER (PARTITION BY a.id ORDER BY et.created_at DESC) as rn
          FROM articles a
          LEFT JOIN embedding_tasks et ON a.id = et.article_id
        ),
        article_embedding_status AS (
          SELECT 
            article_id,
            slug,
            title,
            last_task_status,
            last_error,
            CASE 
              WHEN last_task_status IS NULL THEN 'no_completed_task'
              WHEN last_task_status = 'failed' THEN 'failed_embedding'
              WHEN last_task_status IN ('pending', 'processing') THEN 'processing'
              WHEN last_task_status = 'completed' THEN 'has_embedding'
              ELSE 'unknown'
            END as embedding_status
          FROM article_task_status
          WHERE rn = 1 OR rn IS NULL
        )
        SELECT 
          article_id,
          slug,
          title,
          embedding_status as reason,
          last_task_status,
          last_error
        FROM article_embedding_status
        WHERE embedding_status IN ('no_completed_task', 'failed_embedding')
        ORDER BY article_id
      `);

      return result.rows.map(row => ({
        articleId: row.article_id,
        slug: row.slug,
        title: row.title,
        reason: row.reason as 'missing_embedding' | 'failed_embedding' | 'no_completed_task',
        lastTaskStatus: row.last_task_status || undefined,
        lastError: row.last_error || undefined
      }));
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to identify articles needing embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to identify articles that need embedding updates. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Reset the queue and reindex all articles
   */
  async resetAndReindexAll(
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const operationId = `reindex_${Date.now()}`;
    
    try {
      // Log operation start
      await loggingService.logBulkOperation('started', operationId, {
        metadata: { priority, type: 'full_reindex' }
      });

      // 1. Delete all embeddings
      await database.query('DELETE FROM embeddings');
      
      // 2. Clear task history
      await database.query('DELETE FROM embedding_tasks');

      // 3. Get all articles
      const articlesResult = await database.query('SELECT id, slug, title FROM articles');
      const articles = articlesResult.rows;

      const result: BulkOperationResult = {
        totalArticles: articles.length,
        queuedTasks: 0,
        skippedArticles: 0,
        errors: [],
        taskIds: []
      };

      // 4. Queue tasks for all articles
      for (const article of articles) {
        try {
           const taskId = await this.enqueueTask({
              articleId: article.id,
              slug: article.slug,
              operation: 'create',
              priority,
              maxAttempts: 3,
              scheduledAt: new Date(),
              metadata: {
                title: article.title,
                reason: 'full_reindex',
                bulkOperationId: operationId
              }
            });

            result.queuedTasks++;
            result.taskIds.push(taskId);
        } catch (error) {
           const errorMessage = `Failed to queue task for article ${article.slug}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          result.errors.push(errorMessage);
          console.error(`Reindex error for article ${article.slug}:`, error);
        }
      }

      const duration = Date.now() - startTime;

      // Log completion
      await loggingService.logBulkOperation('completed', operationId, {
        totalTasks: result.totalArticles,
        completedTasks: result.queuedTasks,
        failedTasks: result.errors.length,
        duration,
        metadata: {
          priority,
          taskIds: result.taskIds
        }
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log failure
      await loggingService.logBulkOperation('failed', operationId, {
        duration,
        error: error instanceof Error ? error : new Error('Unknown error'),
        metadata: { priority }
      });

      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to reset and reindex: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to reset and reindex. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Queue bulk embedding update for all articles that need it
   */
  async queueBulkEmbeddingUpdate(
    priority: 'high' | 'normal' | 'low' = 'normal',
    progressCallback?: (progress: BulkOperationProgress) => void
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const operationId = `bulk_${Date.now()}`;
    
    try {
      // Log bulk operation start
      await loggingService.logBulkOperation('started', operationId, {
        metadata: { priority }
      });

      // Identify articles that need embedding updates
      const articlesNeedingUpdate = await this.identifyArticlesNeedingEmbedding();
      
      const result: BulkOperationResult = {
        totalArticles: articlesNeedingUpdate.length,
        queuedTasks: 0,
        skippedArticles: 0,
        errors: [],
        taskIds: []
      };

      // Initialize progress
      const progress: BulkOperationProgress = {
        totalArticles: articlesNeedingUpdate.length,
        processedArticles: 0,
        queuedTasks: 0,
        skippedArticles: 0,
        errors: []
      };

      // Report initial progress
      if (progressCallback) {
        progressCallback({ ...progress });
      }

      // Process each article
      for (const article of articlesNeedingUpdate) {
        try {
          // Check if there's already a pending or processing task for this article
          const existingTasks = await this.getTasksForArticle(article.articleId);
          const hasPendingTask = existingTasks.some(task => 
            task.status === 'pending' || task.status === 'processing'
          );

          if (hasPendingTask) {
            // Skip if there's already a pending/processing task
            result.skippedArticles++;
            progress.skippedArticles++;
            progress.processedArticles++;
          } else {
            // Queue new embedding task
            const taskId = await this.enqueueTask({
              articleId: article.articleId,
              slug: article.slug,
              operation: 'update',
              priority,
              maxAttempts: 3,
              scheduledAt: new Date(),
              metadata: {
                title: article.title,
                reason: 'bulk_update',
                originalReason: article.reason,
                bulkOperationId: operationId
              }
            });

            result.queuedTasks++;
            result.taskIds.push(taskId);
            progress.queuedTasks++;
            progress.processedArticles++;
          }

          // Report progress periodically
          if (progressCallback && progress.processedArticles % 10 === 0) {
            progressCallback({ ...progress });
          }

        } catch (error) {
          const errorMessage = `Failed to queue task for article ${article.slug}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          result.errors.push(errorMessage);
          progress.errors.push(errorMessage);
          progress.processedArticles++;

          // Continue processing other articles even if one fails
          console.error(`Bulk embedding update error for article ${article.slug}:`, error);
        }
      }

      // Report final progress
      if (progressCallback) {
        progressCallback({ ...progress });
      }

      const duration = Date.now() - startTime;

      // Log bulk operation completion
      await loggingService.logBulkOperation('completed', operationId, {
        totalTasks: result.totalArticles,
        completedTasks: result.queuedTasks,
        failedTasks: result.errors.length,
        duration,
        metadata: {
          priority,
          skippedArticles: result.skippedArticles,
          taskIds: result.taskIds
        }
      });

      // Record bulk operation performance metrics
      await performanceMetricsService.recordBulkOperationTime(duration, operationId, {
        totalTasks: result.totalArticles,
        successfulTasks: result.queuedTasks,
        metadata: {
          priority,
          skippedArticles: result.skippedArticles,
          errorCount: result.errors.length
        }
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log bulk operation failure
      await loggingService.logBulkOperation('failed', operationId, {
        duration,
        error: error instanceof Error ? error : new Error('Unknown error'),
        metadata: { priority }
      });

      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to queue bulk embedding update: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to queue bulk embedding update. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get summary of a bulk operation by operation ID
   */
  async getBulkOperationSummary(operationId: string): Promise<BulkOperationSummary | null> {
    try {
      // Find tasks belonging to this bulk operation
      const result = await database.query(`
        SELECT 
          id,
          status,
          created_at,
          completed_at,
          processed_at,
          error_message,
          metadata
        FROM embedding_tasks 
        WHERE metadata->>'bulkOperationId' = $1
        ORDER BY created_at ASC
      `, [operationId]);

      if (result.rows.length === 0) {
        return null;
      }

      const tasks = result.rows;
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const failedTasks = tasks.filter(t => t.status === 'failed').length;
      const pendingTasks = tasks.filter(t => t.status === 'pending').length;
      const processingTasks = tasks.filter(t => t.status === 'processing').length;

      const startedAt = new Date(tasks[0].created_at);
      const lastCompletedTask = tasks
        .filter(t => t.completed_at)
        .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0];
      
      const completedAt = (completedTasks + failedTasks === totalTasks && lastCompletedTask) 
        ? new Date(lastCompletedTask.completed_at) 
        : undefined;

      const status: 'running' | 'completed' | 'failed' = 
        completedAt ? 'completed' : 
        failedTasks > 0 && (completedTasks + failedTasks === totalTasks) ? 'failed' : 
        'running';

      const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      // Calculate average processing time for completed tasks
      const completedTasksWithTiming = tasks.filter(t => 
        t.status === 'completed' && t.processed_at && t.completed_at
      );
      
      let averageProcessingTime: number | undefined;
      if (completedTasksWithTiming.length > 0) {
        const totalProcessingTime = completedTasksWithTiming.reduce((sum, task) => {
          const processingTime = new Date(task.completed_at).getTime() - new Date(task.processed_at).getTime();
          return sum + processingTime;
        }, 0);
        averageProcessingTime = totalProcessingTime / completedTasksWithTiming.length / 1000; // Convert to seconds
      }

      // Collect error messages
      const errors = tasks
        .filter(t => t.error_message)
        .map(t => t.error_message)
        .filter((error, index, arr) => arr.indexOf(error) === index); // Remove duplicates

      return {
        operationId,
        startedAt,
        completedAt,
        status,
        totalTasks,
        completedTasks,
        failedTasks,
        pendingTasks,
        processingTasks,
        successRate,
        averageProcessingTime,
        errors
      };
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get bulk operation summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve bulk operation summary. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List recent bulk operations
   */
  async listRecentBulkOperations(limit: number = 10): Promise<BulkOperationSummary[]> {
    try {
      // Get distinct bulk operation IDs from recent tasks
      const operationIdsResult = await database.query(`
        SELECT DISTINCT metadata->>'bulkOperationId' as operation_id
        FROM embedding_tasks 
        WHERE metadata->>'bulkOperationId' IS NOT NULL
        ORDER BY MIN(created_at) DESC
        LIMIT $1
      `, [limit]);

      const summaries: BulkOperationSummary[] = [];

      for (const row of operationIdsResult.rows) {
        const summary = await this.getBulkOperationSummary(row.operation_id);
        if (summary) {
          summaries.push(summary);
        }
      }

      return summaries;
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to list recent bulk operations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve recent bulk operations. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get progress of a bulk operation by task IDs
   */
  async getBulkOperationProgress(taskIds: string[]): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
    details: Array<{
      taskId: string;
      articleSlug: string;
      status: string;
      error?: string;
    }>;
  }> {
    try {
      if (taskIds.length === 0) {
        return {
          total: 0,
          completed: 0,
          failed: 0,
          pending: 0,
          processing: 0,
          details: []
        };
      }

      // Create placeholders for the IN clause
      const placeholders = taskIds.map((_, index) => `$${index + 1}`).join(', ');
      
      const result = await database.query(`
        SELECT 
          id,
          slug,
          status,
          error_message
        FROM embedding_tasks 
        WHERE id IN (${placeholders})
        ORDER BY created_at ASC
      `, taskIds);

      const tasks = result.rows;
      const total = tasks.length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const failed = tasks.filter(t => t.status === 'failed').length;
      const pending = tasks.filter(t => t.status === 'pending').length;
      const processing = tasks.filter(t => t.status === 'processing').length;

      const details = tasks.map(task => ({
        taskId: task.id,
        articleSlug: task.slug,
        status: task.status,
        error: task.error_message || undefined
      }));

      return {
        total,
        completed,
        failed,
        pending,
        processing,
        details
      };
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get bulk operation progress: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve bulk operation progress. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Convert database row to EmbeddingTask interface
   */
  private convertRowToTask(row: any): EmbeddingTask {
    return {
      id: row.id,
      articleId: row.article_id,
      slug: row.slug,
      operation: row.operation,
      priority: row.priority,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      createdAt: new Date(row.created_at),
      scheduledAt: new Date(row.scheduled_at),
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      errorMessage: row.error_message || undefined,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined
    };
  }
}

// Export singleton instance
export const embeddingQueueService = new EmbeddingQueueService();