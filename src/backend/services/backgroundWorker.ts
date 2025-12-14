import { database } from './database.js';
import { embeddingQueueService, EmbeddingTask } from './embeddingQueue.js';
import { DatabaseServiceError, DatabaseErrorType } from './databaseErrors.js';
import { databaseArticleService } from './databaseArticles.js';
import { databaseEmbeddingService } from './databaseEmbedding.js';
import { chunkMarkdown } from './chunking.js';
import { loggingService, LogLevel, LogCategory } from './logging.js';
import { performanceMetricsService, MetricType } from './performanceMetrics.js';
import { embeddingQueueConfigService, EmbeddingQueueConfig } from './embeddingQueueConfig.js';

// Worker statistics interface
export interface WorkerStats {
  isRunning: boolean;
  tasksProcessed: number;
  tasksSucceeded: number;
  tasksFailed: number;
  averageProcessingTime: number;
  lastProcessedAt?: Date;
}

// Background Worker Service interface
export interface BackgroundWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  processTask(task: EmbeddingTask): Promise<void>;
  getWorkerStats(): Promise<WorkerStats>;
}

class BackgroundWorkerService implements BackgroundWorker {
  private running = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private lastMetricsTime = Date.now();
  private tasksProcessedSinceLastMetrics = 0;
  private config!: EmbeddingQueueConfig;

  /**
   * Start the background worker
   */
  async start(): Promise<void> {
    if (this.running) {
      await loggingService.logWorkerEvent('start_attempted', { 
        isRunning: true,
        metadata: { reason: 'already_running' }
      });
      console.log('Background worker is already running');
      return;
    }

    try {
      // Load configuration
      this.config = embeddingQueueConfigService.getConfig();
      
      // Check if background processing is enabled
      if (!this.config.enabled) {
        console.log('Background embedding queue is disabled via configuration');
        return;
      }

      // Validate configuration
      const configStatus = embeddingQueueConfigService.getConfigStatus();
      if (!configStatus.isValid) {
        throw new Error(`Invalid embedding queue configuration: ${configStatus.errors.join(', ')}`);
      }

      // Log configuration warnings
      if (configStatus.warnings.length > 0) {
        console.warn('Embedding queue configuration warnings:');
        configStatus.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }

      // Update worker status in database
      await this.updateWorkerStatus(true);
      
      this.running = true;
      
      await loggingService.logWorkerEvent('started', { 
        isRunning: true,
        metadata: { 
          processingInterval: this.config.workerInterval,
          heartbeatInterval: this.config.heartbeatInterval,
          maxRetries: this.config.maxRetries,
          maxProcessingTime: this.config.maxProcessingTime
        }
      });
      console.log(`Background worker started with ${this.config.workerInterval}ms interval`);

      // Start the main processing loop
      this.processingInterval = setInterval(async () => {
        try {
          await this.processNextTask();
        } catch (error) {
          await loggingService.logWorkerEvent('processing_loop_error', { 
            error: error instanceof Error ? error : new Error('Unknown error'),
            metadata: { interval: this.config.workerInterval }
          });
          console.error('Error in worker processing loop:', error);
        }
      }, this.config.workerInterval);

      // Start heartbeat mechanism
      this.heartbeatInterval = setInterval(async () => {
        try {
          await this.sendHeartbeat();
        } catch (error) {
          await loggingService.logWorkerEvent('heartbeat_error', { 
            error: error instanceof Error ? error : new Error('Unknown error'),
            metadata: { interval: this.config.heartbeatInterval }
          });
          console.error('Error sending worker heartbeat:', error);
        }
      }, this.config.heartbeatInterval);

      // Start metrics collection
      this.metricsInterval = setInterval(async () => {
        try {
          await this.collectPerformanceMetrics();
        } catch (error) {
          await loggingService.logWorkerEvent('metrics_collection_error', { 
            error: error instanceof Error ? error : new Error('Unknown error'),
            metadata: { interval: this.config.metricsInterval }
          });
          console.error('Error collecting performance metrics:', error);
        }
      }, this.config.metricsInterval);

      // Clean up stuck tasks on startup if enabled
      if (this.config.stuckTaskCleanupEnabled) {
        const cleanedTasks = await this.cleanupStuckTasks();
        if (cleanedTasks > 0) {
          await loggingService.logWorkerEvent('startup_cleanup', { 
            metadata: { cleanedTasks, timeoutMinutes: this.config.maxProcessingTime / 60000 }
          });
        }
      }

    } catch (error) {
      this.running = false;
      await loggingService.logWorkerEvent('start_failed', { 
        error: error instanceof Error ? error : new Error('Unknown error')
      });
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to start background worker: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to start background worker. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Stop the background worker
   */
  async stop(): Promise<void> {
    if (!this.running) {
      await loggingService.logWorkerEvent('stop_attempted', { 
        isRunning: false,
        metadata: { reason: 'not_running' }
      });
      console.log('Background worker is not running');
      return;
    }

    try {
      this.running = false;

      // Clear intervals
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      }

      // Update worker status in database
      await this.updateWorkerStatus(false);
      
      await loggingService.logWorkerEvent('stopped', { 
        isRunning: false,
        metadata: { gracefulShutdown: true }
      });
      console.log('Background worker stopped');

    } catch (error) {
      await loggingService.logWorkerEvent('stop_failed', { 
        error: error instanceof Error ? error : new Error('Unknown error')
      });
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to stop background worker: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to stop background worker properly.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if the worker is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Process a single embedding task
   */
  async processTask(task: EmbeddingTask): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`Processing ${task.operation} task for article ${task.articleId} (${task.slug})`);
      
      // Log task start event
      await loggingService.logTaskEvent(task.id, 'processing_started', {
        articleId: task.articleId,
        operation: task.operation,
        attempt: task.attempts,
        metadata: { slug: task.slug, priority: task.priority }
      });

      // Process based on operation type
      switch (task.operation) {
        case 'create':
        case 'update':
          await this.processEmbeddingGeneration(task);
          break;
        case 'delete':
          await this.processEmbeddingDeletion(task);
          break;
        default:
          throw new Error(`Unknown operation type: ${task.operation}`);
      }

      const processingTime = Date.now() - startTime;
      
      // Log successful completion
      await loggingService.logTaskEvent(task.id, 'processing_completed', {
        articleId: task.articleId,
        operation: task.operation,
        duration: processingTime,
        metadata: { slug: task.slug, attempt: task.attempts }
      });

      // Record performance metrics
      await performanceMetricsService.recordTaskProcessingTime(task.id, processingTime, {
        articleId: task.articleId,
        operation: task.operation,
        success: true,
        metadata: { slug: task.slug, attempt: task.attempts }
      });

      console.log(`Task ${task.id} processed successfully in ${processingTime}ms`);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Log task failure
      await loggingService.logTaskEvent(task.id, 'processing_failed', {
        articleId: task.articleId,
        operation: task.operation,
        attempt: task.attempts,
        duration: processingTime,
        error: error instanceof Error ? error : new Error('Unknown error'),
        metadata: { slug: task.slug }
      });

      // Re-throw the error to be handled by the retry logic
      throw error;
    }
  }

  /**
   * Get worker statistics from database
   */
  async getWorkerStats(): Promise<WorkerStats> {
    try {
      const result = await database.query(`
        SELECT 
          is_running,
          tasks_processed,
          tasks_succeeded,
          tasks_failed,
          started_at,
          last_heartbeat
        FROM embedding_worker_status 
        WHERE id = 1
      `);

      if (result.rows.length === 0) {
        // Initialize worker status if it doesn't exist
        await this.initializeWorkerStatus();
        return {
          isRunning: false,
          tasksProcessed: 0,
          tasksSucceeded: 0,
          tasksFailed: 0,
          averageProcessingTime: 0
        };
      }

      const row = result.rows[0];
      
      // Calculate average processing time from recent completed tasks
      const avgResult = await database.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (completed_at - processed_at))) as avg_seconds
        FROM embedding_tasks 
        WHERE status = 'completed' 
          AND completed_at >= NOW() - INTERVAL '24 hours'
          AND processed_at IS NOT NULL
      `);

      const averageProcessingTime = avgResult.rows[0]?.avg_seconds 
        ? parseFloat(avgResult.rows[0].avg_seconds) 
        : 0;

      return {
        isRunning: row.is_running,
        tasksProcessed: row.tasks_processed,
        tasksSucceeded: row.tasks_succeeded,
        tasksFailed: row.tasks_failed,
        averageProcessingTime,
        lastProcessedAt: row.last_heartbeat ? new Date(row.last_heartbeat) : undefined
      };

    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get worker statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve worker statistics. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Process the next available task from the queue
   */
  private async processNextTask(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const task = await embeddingQueueService.dequeueTask();
      if (!task) {
        // No tasks available - this is normal, no need to log
        return;
      }

      console.log(`Processing embedding task ${task.id} for article ${task.articleId}`);
      
      const startTime = Date.now();
      
      try {
        // Process the task
        await this.processTask(task);
        
        // Update task status to completed
        await embeddingQueueService.updateTaskStatus(task.id, 'completed');
        
        // Update worker statistics
        await this.incrementTaskCounter('succeeded');
        
        const processingTime = Date.now() - startTime;
        
        // Log successful task completion
        await loggingService.logTaskEvent(task.id, 'completed', {
          articleId: task.articleId,
          operation: task.operation,
          duration: processingTime,
          metadata: { slug: task.slug, totalAttempts: task.attempts }
        });

        // Record successful task processing metrics
        await performanceMetricsService.recordTaskProcessingTime(task.id, processingTime, {
          articleId: task.articleId,
          operation: task.operation,
          success: true,
          metadata: { slug: task.slug, totalAttempts: task.attempts }
        });

        // Track tasks processed for throughput calculation
        this.tasksProcessedSinceLastMetrics++;
        
        console.log(`Task ${task.id} completed successfully in ${processingTime}ms`);

      } catch (error) {
        console.error(`Task ${task.id} failed:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Handle retry logic with exponential backoff
        await this.handleTaskFailure(task, errorMessage);
        
        // Update worker statistics
        await this.incrementTaskCounter('failed');
      }

    } catch (error) {
      await loggingService.log(
        LogLevel.ERROR, 
        LogCategory.ERROR_HANDLING, 
        'Error in task processing loop', 
        { error: error instanceof Error ? error : new Error('Unknown error') }
      );
      console.error('Error processing task:', error);
    }
  }

  /**
   * Send heartbeat to update last_heartbeat timestamp
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      await database.query(`
        UPDATE embedding_worker_status 
        SET last_heartbeat = NOW() 
        WHERE id = 1
      `);
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }

  /**
   * Update worker running status in database
   */
  private async updateWorkerStatus(isRunning: boolean): Promise<void> {
    try {
      const result = await database.query(`
        UPDATE embedding_worker_status 
        SET is_running = $1, 
            started_at = CASE WHEN $1 THEN NOW() ELSE started_at END,
            last_heartbeat = NOW()
        WHERE id = 1
      `, [isRunning]);

      if (result.rowCount === 0) {
        // Initialize if record doesn't exist
        await this.initializeWorkerStatus();
        await this.updateWorkerStatus(isRunning);
      }
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to update worker status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to update worker status in database.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Initialize worker status record if it doesn't exist
   */
  private async initializeWorkerStatus(): Promise<void> {
    try {
      await database.query(`
        INSERT INTO embedding_worker_status (id, is_running) 
        VALUES (1, FALSE) 
        ON CONFLICT (id) DO NOTHING
      `);
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to initialize worker status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to initialize worker status in database.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Increment task counter in worker statistics
   */
  private async incrementTaskCounter(type: 'succeeded' | 'failed'): Promise<void> {
    try {
      const column = type === 'succeeded' ? 'tasks_succeeded' : 'tasks_failed';
      await database.query(`
        UPDATE embedding_worker_status 
        SET tasks_processed = tasks_processed + 1,
            ${column} = ${column} + 1
        WHERE id = 1
      `);
    } catch (error) {
      console.error(`Failed to increment ${type} counter:`, error);
    }
  }

  /**
   * Clean up tasks that are stuck in processing state
   */
  private async cleanupStuckTasks(): Promise<number> {
    try {
      const timeoutSeconds = this.config.maxProcessingTime / 1000;
      const result = await database.query(`
        UPDATE embedding_tasks 
        SET status = 'pending', 
            processed_at = NULL,
            error_message = 'Task was stuck in processing state and has been reset on worker startup'
        WHERE status = 'processing' 
          AND processed_at < NOW() - INTERVAL '${timeoutSeconds} seconds'
      `);

      const cleanedCount = result.rowCount || 0;
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} stuck tasks on worker startup`);
      }
      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup stuck tasks:', error);
      return 0;
    }
  }

  /**
   * Process embedding generation for create/update operations
   */
  private async processEmbeddingGeneration(task: EmbeddingTask): Promise<void> {
    const embeddingStartTime = Date.now();
    
    try {
      console.log(`Generating embeddings for article ${task.articleId} (${task.slug})`);
      
      // 1. Fetch article content from database
      const dbQueryStart = Date.now();
      const article = await databaseArticleService.readArticle(task.slug);
      if (!article) {
        throw new Error(`Article with slug '${task.slug}' not found`);
      }

      // Get article metadata for timestamps
      const articles = await databaseArticleService.listArticles();
      const articleMeta = articles.find(a => a.slug === task.slug);
      if (!articleMeta) {
        throw new Error(`Article metadata for slug '${task.slug}' not found`);
      }
      
      const dbQueryTime = Date.now() - dbQueryStart;
      await performanceMetricsService.recordDatabaseQueryTime(dbQueryTime, {
        queryType: 'article_fetch',
        taskId: task.id,
        metadata: { slug: task.slug }
      });

      // 2. Generate chunks for embedding
      const chunkingStart = Date.now();
      const chunks = chunkMarkdown(
        `${article.slug}.md`, // Maintain filename compatibility
        article.title,
        article.content,
        article.created,
        articleMeta.modified
      );
      const chunkingTime = Date.now() - chunkingStart;

      console.log(`Generated ${chunks.length} chunks for article ${task.slug}`);

      // 3. Store embeddings in the database using the existing service
      const embeddingStoreStart = Date.now();
      await databaseEmbeddingService.upsertArticleEmbeddingsBySlug(task.slug, chunks);
      const embeddingStoreTime = Date.now() - embeddingStoreStart;
      
      await performanceMetricsService.recordDatabaseQueryTime(embeddingStoreTime, {
        queryType: 'embedding_store',
        taskId: task.id,
        metadata: { slug: task.slug, chunkCount: chunks.length }
      });

      const totalEmbeddingTime = Date.now() - embeddingStartTime;
      
      // Record embedding generation performance metrics
      await performanceMetricsService.recordEmbeddingGenerationTime(totalEmbeddingTime, {
        taskId: task.id,
        articleId: task.articleId,
        chunkCount: chunks.length,
        metadata: {
          slug: task.slug,
          chunkingTimeMs: chunkingTime,
          dbQueryTimeMs: dbQueryTime,
          embeddingStoreTimeMs: embeddingStoreTime
        }
      });

      console.log(`Successfully stored embeddings for article ${task.slug}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to generate embeddings for article ${task.articleId}:`, errorMessage);
      
      // Record failed embedding generation time
      const totalEmbeddingTime = Date.now() - embeddingStartTime;
      await performanceMetricsService.recordEmbeddingGenerationTime(totalEmbeddingTime, {
        taskId: task.id,
        articleId: task.articleId,
        metadata: {
          slug: task.slug,
          success: false,
          error: errorMessage
        }
      });
      
      // Re-throw with more context
      throw new Error(`Embedding generation failed: ${errorMessage}`);
    }
  }

  /**
   * Process embedding deletion for delete operations
   */
  private async processEmbeddingDeletion(task: EmbeddingTask): Promise<void> {
    try {
      console.log(`Deleting embeddings for article ${task.articleId} (${task.slug})`);
      
      // 1. Remove embeddings from database using the existing service
      await databaseEmbeddingService.deleteArticleEmbeddingsBySlug(task.slug);

      console.log(`Successfully deleted embeddings for article ${task.slug}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to delete embeddings for article ${task.articleId}:`, errorMessage);
      
      // Re-throw with more context
      throw new Error(`Embedding deletion failed: ${errorMessage}`);
    }
  }

  /**
   * Handle task failure with retry logic and exponential backoff
   */
  private async handleTaskFailure(task: EmbeddingTask, errorMessage: string): Promise<void> {
    try {
      // Check if we should retry or mark as permanently failed
      const maxAttempts = this.config.maxRetries;
      if (task.attempts >= maxAttempts) {
        // Permanently failed - no more retries
        await embeddingQueueService.updateTaskStatus(task.id, 'failed', errorMessage);
        
        // Log permanent failure
        await loggingService.logTaskEvent(task.id, 'permanently_failed', {
          articleId: task.articleId,
          operation: task.operation,
          attempt: task.attempts,
          error: new Error(errorMessage),
          metadata: { 
            finalAttempt: task.attempts,
            maxAttempts: task.maxAttempts,
            slug: task.slug
          }
        });
        
        console.log(`Task ${task.id} permanently failed after ${task.attempts} attempts: ${errorMessage}`);
        
      } else {
        // Schedule retry with exponential backoff
        const baseDelayMs = this.config.retryBackoffBase;
        const retryDelayMs = baseDelayMs * Math.pow(2, task.attempts); // exponential backoff
        const scheduledAt = new Date(Date.now() + retryDelayMs);
        
        // Reset task to pending status with new scheduled time
        await database.query(`
          UPDATE embedding_tasks 
          SET status = 'pending', 
              scheduled_at = $2,
              error_message = $3,
              processed_at = NULL
          WHERE id = $1
        `, [task.id, scheduledAt, errorMessage]);
        
        // Log retry scheduling
        await loggingService.logTaskEvent(task.id, 'retry_scheduled', {
          articleId: task.articleId,
          operation: task.operation,
          attempt: task.attempts,
          metadata: {
            maxAttempts,
            retryDelayMs,
            scheduledAt: scheduledAt.toISOString(),
            error: errorMessage,
            slug: task.slug
          }
        });
        
        console.log(`Task ${task.id} scheduled for retry in ${retryDelayMs}ms (attempt ${task.attempts + 1}/${maxAttempts})`);
      }
      
    } catch (error) {
      console.error(`Failed to handle task failure for task ${task.id}:`, error);
      
      // If we can't update the task status, log the error but don't throw
      // This prevents the worker from crashing due to database issues
      await loggingService.log(
        LogLevel.ERROR,
        LogCategory.ERROR_HANDLING,
        'Failed to handle task failure',
        {
          taskId: task.id,
          articleId: task.articleId,
          error: error instanceof Error ? error : new Error('Unknown error'),
          metadata: {
            originalError: errorMessage,
            operation: task.operation,
            attempt: task.attempts
          }
        }
      );
    }
  }

  /**
   * Collect and record performance metrics
   */
  private async collectPerformanceMetrics(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const currentTime = Date.now();
      const timeSinceLastMetrics = currentTime - this.lastMetricsTime;

      // Record queue throughput
      if (this.tasksProcessedSinceLastMetrics > 0) {
        await performanceMetricsService.recordQueueThroughput(
          this.tasksProcessedSinceLastMetrics,
          timeSinceLastMetrics,
          {
            metadata: {
              intervalMs: timeSinceLastMetrics,
              workerRunning: this.running
            }
          }
        );
      }

      // Get current queue statistics
      const queueStats = await embeddingQueueService.getQueueStats();
      
      // Record queue depth
      await performanceMetricsService.recordQueueDepth(queueStats.pending + queueStats.processing, {
        metadata: {
          pending: queueStats.pending,
          processing: queueStats.processing,
          completed: queueStats.completed,
          failed: queueStats.failed
        }
      });

      // Calculate and record worker utilization
      // Utilization = (time spent processing) / (total time)
      // For simplicity, we'll estimate based on whether we processed any tasks
      const utilizationPercent = this.tasksProcessedSinceLastMetrics > 0 ? 
        Math.min(100, (this.tasksProcessedSinceLastMetrics / (timeSinceLastMetrics / this.config.workerInterval)) * 100) : 0;
      
      await performanceMetricsService.recordWorkerUtilization(utilizationPercent, {
        metadata: {
          tasksProcessed: this.tasksProcessedSinceLastMetrics,
          intervalMs: timeSinceLastMetrics,
          processingIntervalMs: this.config.workerInterval
        }
      });

      // Calculate and record error rate
      if (queueStats.total > 0) {
        const errorRate = (queueStats.failed / queueStats.total) * 100;
        await performanceMetricsService.recordErrorRate(errorRate, {
          metadata: {
            totalTasks: queueStats.total,
            failedTasks: queueStats.failed,
            successfulTasks: queueStats.completed
          }
        });
      }

      // Reset counters
      this.tasksProcessedSinceLastMetrics = 0;
      this.lastMetricsTime = currentTime;

    } catch (error) {
      console.error('Failed to collect performance metrics:', error);
    }
  }

}

// Export singleton instance
export const backgroundWorkerService = new BackgroundWorkerService();