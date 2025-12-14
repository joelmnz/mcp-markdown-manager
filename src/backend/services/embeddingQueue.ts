import { database } from './database.js';
import { DatabaseServiceError, DatabaseErrorType } from './databaseErrors.js';

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

// Queue Manager Service interface
export interface QueueManager {
  enqueueTask(task: Omit<EmbeddingTask, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<string>;
  dequeueTask(): Promise<EmbeddingTask | null>;
  updateTaskStatus(taskId: string, status: EmbeddingTask['status'], errorMessage?: string): Promise<void>;
  getTaskStatus(taskId: string): Promise<EmbeddingTask | null>;
  getQueueStats(): Promise<QueueStats>;
  retryFailedTasks(): Promise<number>;
  clearCompletedTasks(olderThan?: Date): Promise<number>;
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
  }>;
}

class EmbeddingQueueService implements QueueManager {
  
  /**
   * Add a new embedding task to the queue
   */
  async enqueueTask(task: Omit<EmbeddingTask, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<string> {
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

      return result.rows[0].id;
    } catch (error) {
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
          return null;
        }

        const taskRow = result.rows[0];

        // Mark the task as processing
        await client.query(`
          UPDATE embedding_tasks 
          SET status = 'processing', processed_at = NOW(), attempts = attempts + 1
          WHERE id = $1
        `, [taskRow.id]);

        // Convert database row to EmbeddingTask interface
        return this.convertRowToTask(taskRow);
      });
    } catch (error) {
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
  }> {
    try {
      const [stats, priorityResult, operationResult, recentActivityResult] = await Promise.all([
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

      return {
        stats,
        tasksByPriority,
        tasksByOperation,
        recentActivity
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