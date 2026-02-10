import { database } from './database.js';
import { DatabaseServiceError, DatabaseErrorType } from './databaseErrors.js';

// Log levels for structured logging
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// Log categories for organizing log entries
export enum LogCategory {
  TASK_LIFECYCLE = 'task_lifecycle',
  WORKER_STATUS = 'worker_status',
  QUEUE_OPERATIONS = 'queue_operations',
  PERFORMANCE = 'performance',
  ERROR_HANDLING = 'error_handling',
  BULK_OPERATIONS = 'bulk_operations'
}

// Structured log entry interface
export interface LogEntry {
  id?: string;
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  taskId?: string;
  articleId?: number;
  operationId?: string;
  metadata?: Record<string, any>;
  duration?: number;
  error?: string;
  stackTrace?: string;
}

// Audit log query filters
export interface LogQueryFilters {
  level?: LogLevel;
  category?: LogCategory;
  taskId?: string;
  articleId?: number;
  operationId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// Log statistics interface
export interface LogStatistics {
  totalEntries: number;
  entriesByLevel: Record<LogLevel, number>;
  entriesByCategory: Record<LogCategory, number>;
  recentErrors: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

/**
 * Comprehensive logging service for embedding queue system
 * Provides structured logging with audit trail capabilities
 */
class LoggingService {
  private readonly MAX_LOG_RETENTION_DAYS = 90;
  private readonly CONSOLE_LOG_ENABLED = true;

  /**
   * Log a structured entry with automatic timestamp and metadata
   */
  async log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    options: {
      taskId?: string;
      articleId?: number;
      operationId?: string;
      metadata?: Record<string, any>;
      duration?: number;
      error?: Error;
    } = {}
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      taskId: options.taskId,
      articleId: options.articleId,
      operationId: options.operationId,
      metadata: options.metadata,
      duration: options.duration,
      error: options.error?.message,
      stackTrace: options.error?.stack
    };

    // Log to console if enabled
    if (this.CONSOLE_LOG_ENABLED) {
      this.logToConsole(entry);
    }

    // Store in database for audit trail
    try {
      await this.storeLogEntry(entry);
    } catch (error) {
      // Don't fail the operation if logging fails, but log to console
      console.error('Failed to store log entry:', error);
      console.error('Original log entry:', entry);
    }
  }

  /**
   * Log task lifecycle events
   */
  async logTaskEvent(
    taskId: string,
    event: string,
    options: {
      articleId?: number;
      operation?: string;
      attempt?: number;
      duration?: number;
      error?: Error;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const level = options.error ? LogLevel.ERROR : LogLevel.INFO;
    const message = options.error 
      ? `Task ${event} failed: ${options.error.message}`
      : `Task ${event}`;

    await this.log(level, LogCategory.TASK_LIFECYCLE, message, {
      taskId,
      articleId: options.articleId,
      duration: options.duration,
      error: options.error,
      metadata: {
        event,
        operation: options.operation,
        attempt: options.attempt,
        ...options.metadata
      }
    });
  }

  /**
   * Log worker status changes
   */
  async logWorkerEvent(
    event: string,
    options: {
      isRunning?: boolean;
      tasksProcessed?: number;
      error?: Error;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const level = options.error ? LogLevel.ERROR : LogLevel.INFO;
    const message = options.error 
      ? `Worker ${event} failed: ${options.error.message}`
      : `Worker ${event}`;

    await this.log(level, LogCategory.WORKER_STATUS, message, {
      error: options.error,
      metadata: {
        event,
        isRunning: options.isRunning,
        tasksProcessed: options.tasksProcessed,
        ...options.metadata
      }
    });
  }

  /**
   * Log queue operations
   */
  async logQueueOperation(
    operation: string,
    options: {
      taskId?: string;
      articleId?: number;
      queueStats?: Record<string, number>;
      duration?: number;
      error?: Error;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const level = options.error ? LogLevel.ERROR : LogLevel.INFO;
    const message = options.error 
      ? `Queue ${operation} failed: ${options.error.message}`
      : `Queue ${operation}`;

    await this.log(level, LogCategory.QUEUE_OPERATIONS, message, {
      taskId: options.taskId,
      articleId: options.articleId,
      duration: options.duration,
      error: options.error,
      metadata: {
        operation,
        queueStats: options.queueStats,
        ...options.metadata
      }
    });
  }

  /**
   * Log performance metrics
   */
  async logPerformanceMetric(
    metric: string,
    value: number,
    options: {
      taskId?: string;
      operationId?: string;
      unit?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.log(LogLevel.INFO, LogCategory.PERFORMANCE, `Performance metric: ${metric} = ${value}${options.unit || ''}`, {
      taskId: options.taskId,
      operationId: options.operationId,
      duration: value,
      metadata: {
        metric,
        value,
        unit: options.unit,
        ...options.metadata
      }
    });
  }

  /**
   * Log bulk operation events
   */
  async logBulkOperation(
    event: string,
    operationId: string,
    options: {
      totalTasks?: number;
      completedTasks?: number;
      failedTasks?: number;
      duration?: number;
      error?: Error;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const level = options.error ? LogLevel.ERROR : LogLevel.INFO;
    const message = options.error 
      ? `Bulk operation ${event} failed: ${options.error.message}`
      : `Bulk operation ${event}`;

    await this.log(level, LogCategory.BULK_OPERATIONS, message, {
      operationId,
      duration: options.duration,
      error: options.error,
      metadata: {
        event,
        totalTasks: options.totalTasks,
        completedTasks: options.completedTasks,
        failedTasks: options.failedTasks,
        ...options.metadata
      }
    });
  }

  /**
   * Query audit logs with filters
   */
  async queryLogs(filters: LogQueryFilters = {}): Promise<LogEntry[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Build WHERE conditions
      if (filters.level) {
        conditions.push(`level = $${paramIndex}`);
        params.push(filters.level);
        paramIndex++;
      }

      if (filters.category) {
        conditions.push(`category = $${paramIndex}`);
        params.push(filters.category);
        paramIndex++;
      }

      if (filters.taskId) {
        conditions.push(`task_id = $${paramIndex}`);
        params.push(filters.taskId);
        paramIndex++;
      }

      if (filters.articleId) {
        conditions.push(`article_id = $${paramIndex}`);
        params.push(filters.articleId);
        paramIndex++;
      }

      if (filters.operationId) {
        conditions.push(`operation_id = $${paramIndex}`);
        params.push(filters.operationId);
        paramIndex++;
      }

      if (filters.startDate) {
        conditions.push(`timestamp >= $${paramIndex}`);
        params.push(filters.startDate);
        paramIndex++;
      }

      if (filters.endDate) {
        conditions.push(`timestamp <= $${paramIndex}`);
        params.push(filters.endDate);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      const query = `
        SELECT 
          id, timestamp, level, category, message, task_id, article_id, 
          operation_id, metadata, duration, error, stack_trace
        FROM embedding_audit_logs 
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await database.query(query, params);
      return result.rows.map(row => this.convertRowToLogEntry(row));

    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to query audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve audit logs. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get log statistics for monitoring
   */
  async getLogStatistics(days: number = 7): Promise<LogStatistics> {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [totalResult, levelResult, categoryResult, errorResult, rangeResult] = await Promise.all([
        // Total entries
        database.query(`
          SELECT COUNT(*) as total
          FROM embedding_audit_logs 
          WHERE timestamp >= $1
        `, [cutoffDate]),

        // Entries by level
        database.query(`
          SELECT level, COUNT(*) as count
          FROM embedding_audit_logs 
          WHERE timestamp >= $1
          GROUP BY level
        `, [cutoffDate]),

        // Entries by category
        database.query(`
          SELECT category, COUNT(*) as count
          FROM embedding_audit_logs 
          WHERE timestamp >= $1
          GROUP BY category
        `, [cutoffDate]),

        // Recent errors
        database.query(`
          SELECT COUNT(*) as count
          FROM embedding_audit_logs 
          WHERE level = 'error' AND timestamp >= $1
        `, [cutoffDate]),

        // Date range
        database.query(`
          SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest
          FROM embedding_audit_logs
        `)
      ]);

      const totalEntries = parseInt(totalResult.rows[0]?.total || '0', 10);

      // Process level breakdown
      const entriesByLevel: Record<LogLevel, number> = {
        [LogLevel.DEBUG]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.ERROR]: 0
      };
      for (const row of levelResult.rows) {
        entriesByLevel[row.level as LogLevel] = parseInt(row.count, 10);
      }

      // Process category breakdown
      const entriesByCategory: Record<LogCategory, number> = {
        [LogCategory.TASK_LIFECYCLE]: 0,
        [LogCategory.WORKER_STATUS]: 0,
        [LogCategory.QUEUE_OPERATIONS]: 0,
        [LogCategory.PERFORMANCE]: 0,
        [LogCategory.ERROR_HANDLING]: 0,
        [LogCategory.BULK_OPERATIONS]: 0
      };
      for (const row of categoryResult.rows) {
        entriesByCategory[row.category as LogCategory] = parseInt(row.count, 10);
      }

      const recentErrors = parseInt(errorResult.rows[0]?.count || '0', 10);
      const rangeRow = rangeResult.rows[0] || {};

      return {
        totalEntries,
        entriesByLevel,
        entriesByCategory,
        recentErrors,
        oldestEntry: rangeRow.oldest ? new Date(rangeRow.oldest) : undefined,
        newestEntry: rangeRow.newest ? new Date(rangeRow.newest) : undefined
      };

    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get log statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve log statistics. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clean up old log entries
   */
  async cleanupOldLogs(retentionDays: number = this.MAX_LOG_RETENTION_DAYS): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      const result = await database.query(`
        DELETE FROM embedding_audit_logs 
        WHERE timestamp < $1
      `, [cutoffDate]);

      return result.rowCount || 0;
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to cleanup old logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to cleanup old log entries. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Store log entry in database
   */
  private async storeLogEntry(entry: LogEntry): Promise<void> {
    try {
      await database.query(`
        INSERT INTO embedding_audit_logs (
          timestamp, level, category, message, task_id, article_id, 
          operation_id, metadata, duration, error, stack_trace
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        entry.timestamp,
        entry.level,
        entry.category,
        entry.message,
        entry.taskId || null,
        entry.articleId || null,
        entry.operationId || null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.duration || null,
        entry.error || null,
        entry.stackTrace || null
      ]);
    } catch (error) {
      // If the table doesn't exist, create it
      if (error instanceof Error && error.message.includes('does not exist')) {
        await this.createAuditLogTable();
        // Retry the insert
        await this.storeLogEntry(entry);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create audit log table if it doesn't exist
   */
  private async createAuditLogTable(): Promise<void> {
    // Create the table first
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS embedding_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
        category VARCHAR(50) NOT NULL CHECK (category IN (
          'task_lifecycle', 'worker_status', 'queue_operations', 
          'performance', 'error_handling', 'bulk_operations'
        )),
        message TEXT NOT NULL,
        task_id UUID,
        article_id INTEGER,
        operation_id VARCHAR(255),
        metadata JSONB,
        duration NUMERIC,
        error TEXT,
        stack_trace TEXT
      )
    `;

    await database.query(createTableSQL);

    // Create indexes separately
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON embedding_audit_logs(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_level ON embedding_audit_logs(level)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON embedding_audit_logs(category)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_task_id ON embedding_audit_logs(task_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_article_id ON embedding_audit_logs(article_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_operation_id ON embedding_audit_logs(operation_id)'
    ];

    for (const indexSQL of indexes) {
      await database.query(indexSQL);
    }
  }

  /**
   * Log to console with structured format
   */
  private logToConsole(entry: LogEntry): void {
    const levels: Record<string, number> = {
      'debug': 0,
      'info': 1,
      'warn': 2,
      'error': 3
    };

    const configLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
    const configWeight = levels[configLevel] ?? 1;
    const entryWeight = levels[entry.level] ?? 1;

    if (entryWeight < configWeight) {
      return;
    }

    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`;
    
    const contextInfo = [];
    if (entry.taskId) contextInfo.push(`task:${entry.taskId}`);
    if (entry.articleId) contextInfo.push(`article:${entry.articleId}`);
    if (entry.operationId) contextInfo.push(`op:${entry.operationId}`);
    if (entry.duration) contextInfo.push(`${entry.duration}ms`);
    
    const context = contextInfo.length > 0 ? ` (${contextInfo.join(', ')})` : '';
    const message = `${prefix} ${entry.message}${context}`;

    // Use appropriate console method based on log level
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message, entry.metadata || '');
        break;
      case LogLevel.INFO:
        console.log(message, entry.metadata || '');
        break;
      case LogLevel.WARN:
        console.warn(message, entry.metadata || '');
        break;
      case LogLevel.ERROR:
        console.error(message, entry.metadata || '');
        if (entry.stackTrace) {
          console.error('Stack trace:', entry.stackTrace);
        }
        break;
    }
  }

  /**
   * Convert database row to LogEntry interface
   */
  private convertRowToLogEntry(row: any): LogEntry {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      level: row.level as LogLevel,
      category: row.category as LogCategory,
      message: row.message,
      taskId: row.task_id || undefined,
      articleId: row.article_id || undefined,
      operationId: row.operation_id || undefined,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      duration: row.duration ? parseFloat(row.duration) : undefined,
      error: row.error || undefined,
      stackTrace: row.stack_trace || undefined
    };
  }
}

// Export singleton instance
export const loggingService = new LoggingService();

// Export convenience functions for common logging patterns
export const logTaskEvent = (taskId: string, event: string, options?: Parameters<typeof loggingService.logTaskEvent>[2]) => 
  loggingService.logTaskEvent(taskId, event, options);

export const logWorkerEvent = (event: string, options?: Parameters<typeof loggingService.logWorkerEvent>[1]) => 
  loggingService.logWorkerEvent(event, options);

export const logQueueOperation = (operation: string, options?: Parameters<typeof loggingService.logQueueOperation>[1]) => 
  loggingService.logQueueOperation(operation, options);

export const logPerformanceMetric = (metric: string, value: number, options?: Parameters<typeof loggingService.logPerformanceMetric>[2]) => 
  loggingService.logPerformanceMetric(metric, value, options);

export const logBulkOperation = (event: string, operationId: string, options?: Parameters<typeof loggingService.logBulkOperation>[2]) => 
  loggingService.logBulkOperation(event, operationId, options);