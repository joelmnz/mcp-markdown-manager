import { database } from './database.js';
import { DatabaseServiceError, DatabaseErrorType } from './databaseErrors.js';
import { loggingService } from './logging.js';

// Performance metric types
export enum MetricType {
  TASK_PROCESSING_TIME = 'task_processing_time',
  QUEUE_THROUGHPUT = 'queue_throughput',
  WORKER_UTILIZATION = 'worker_utilization',
  ERROR_RATE = 'error_rate',
  QUEUE_DEPTH = 'queue_depth',
  EMBEDDING_GENERATION_TIME = 'embedding_generation_time',
  DATABASE_QUERY_TIME = 'database_query_time',
  BULK_OPERATION_TIME = 'bulk_operation_time'
}

// Metric data point interface
export interface MetricDataPoint {
  id?: string;
  timestamp: Date;
  metricType: MetricType;
  value: number;
  unit: string;
  taskId?: string;
  articleId?: number;
  operationId?: string;
  metadata?: Record<string, any>;
}

// Aggregated metric statistics
export interface MetricStatistics {
  metricType: MetricType;
  count: number;
  min: number;
  max: number;
  average: number;
  median: number;
  p95: number;
  p99: number;
  unit: string;
  timeRange: {
    start: Date;
    end: Date;
  };
}

// Performance summary interface
export interface PerformanceSummary {
  timeRange: {
    start: Date;
    end: Date;
  };
  taskMetrics: {
    totalProcessed: number;
    averageProcessingTime: number;
    successRate: number;
    throughputPerHour: number;
  };
  queueMetrics: {
    averageDepth: number;
    maxDepth: number;
    averageWaitTime: number;
  };
  workerMetrics: {
    utilization: number;
    averageTasksPerHour: number;
    errorRate: number;
  };
  systemMetrics: {
    averageDatabaseQueryTime: number;
    averageEmbeddingTime: number;
  };
}

// Query filters for metrics
export interface MetricQueryFilters {
  metricType?: MetricType;
  startDate?: Date;
  endDate?: Date;
  taskId?: string;
  articleId?: number;
  operationId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Performance metrics tracking service for embedding queue system
 * Collects, stores, and analyzes performance data
 */
class PerformanceMetricsService {
  private readonly MAX_METRIC_RETENTION_DAYS = 30;

  /**
   * Record a performance metric data point
   */
  async recordMetric(
    metricType: MetricType,
    value: number,
    unit: string,
    options: {
      taskId?: string;
      articleId?: number;
      operationId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const dataPoint: MetricDataPoint = {
      timestamp: new Date(),
      metricType,
      value,
      unit,
      taskId: options.taskId,
      articleId: options.articleId,
      operationId: options.operationId,
      metadata: options.metadata
    };

    try {
      await this.storeMetricDataPoint(dataPoint);
      
      // Also log as performance metric for audit trail
      await loggingService.logPerformanceMetric(metricType, value, {
        taskId: options.taskId,
        operationId: options.operationId,
        unit,
        metadata: options.metadata
      });

    } catch (error) {
      // Don't fail the operation if metrics recording fails
      console.error('Failed to record performance metric:', error);
    }
  }

  /**
   * Record task processing time
   */
  async recordTaskProcessingTime(
    taskId: string,
    processingTimeMs: number,
    options: {
      articleId?: number;
      operation?: string;
      success?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.recordMetric(
      MetricType.TASK_PROCESSING_TIME,
      processingTimeMs,
      'ms',
      {
        taskId,
        articleId: options.articleId,
        metadata: {
          operation: options.operation,
          success: options.success,
          ...options.metadata
        }
      }
    );
  }

  /**
   * Record queue throughput (tasks processed per time period)
   */
  async recordQueueThroughput(
    tasksProcessed: number,
    timePeriodMs: number,
    options: {
      operationId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const throughputPerHour = (tasksProcessed / timePeriodMs) * (60 * 60 * 1000);
    
    await this.recordMetric(
      MetricType.QUEUE_THROUGHPUT,
      throughputPerHour,
      'tasks/hour',
      {
        operationId: options.operationId,
        metadata: {
          tasksProcessed,
          timePeriodMs,
          ...options.metadata
        }
      }
    );
  }

  /**
   * Record worker utilization percentage
   */
  async recordWorkerUtilization(
    utilizationPercent: number,
    options: {
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.recordMetric(
      MetricType.WORKER_UTILIZATION,
      utilizationPercent,
      'percent',
      {
        metadata: options.metadata
      }
    );
  }

  /**
   * Record error rate
   */
  async recordErrorRate(
    errorRate: number,
    options: {
      operationId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.recordMetric(
      MetricType.ERROR_RATE,
      errorRate,
      'percent',
      {
        operationId: options.operationId,
        metadata: options.metadata
      }
    );
  }

  /**
   * Record current queue depth
   */
  async recordQueueDepth(
    queueDepth: number,
    options: {
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.recordMetric(
      MetricType.QUEUE_DEPTH,
      queueDepth,
      'tasks',
      {
        metadata: options.metadata
      }
    );
  }

  /**
   * Record embedding generation time
   */
  async recordEmbeddingGenerationTime(
    generationTimeMs: number,
    options: {
      taskId?: string;
      articleId?: number;
      chunkCount?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.recordMetric(
      MetricType.EMBEDDING_GENERATION_TIME,
      generationTimeMs,
      'ms',
      {
        taskId: options.taskId,
        articleId: options.articleId,
        metadata: {
          chunkCount: options.chunkCount,
          ...options.metadata
        }
      }
    );
  }

  /**
   * Record database query time
   */
  async recordDatabaseQueryTime(
    queryTimeMs: number,
    options: {
      queryType?: string;
      taskId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.recordMetric(
      MetricType.DATABASE_QUERY_TIME,
      queryTimeMs,
      'ms',
      {
        taskId: options.taskId,
        metadata: {
          queryType: options.queryType,
          ...options.metadata
        }
      }
    );
  }

  /**
   * Record bulk operation time
   */
  async recordBulkOperationTime(
    operationTimeMs: number,
    operationId: string,
    options: {
      totalTasks?: number;
      successfulTasks?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.recordMetric(
      MetricType.BULK_OPERATION_TIME,
      operationTimeMs,
      'ms',
      {
        operationId,
        metadata: {
          totalTasks: options.totalTasks,
          successfulTasks: options.successfulTasks,
          ...options.metadata
        }
      }
    );
  }

  /**
   * Get metric statistics for a specific metric type and time range
   */
  async getMetricStatistics(
    metricType: MetricType,
    startDate: Date,
    endDate: Date
  ): Promise<MetricStatistics | null> {
    try {
      const result = await database.query(`
        SELECT 
          COUNT(*) as count,
          MIN(value) as min,
          MAX(value) as max,
          AVG(value) as average,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99,
          unit
        FROM performance_metrics 
        WHERE metric_type = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
        GROUP BY unit
      `, [metricType, startDate, endDate]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        metricType,
        count: parseInt(row.count, 10),
        min: parseFloat(row.min),
        max: parseFloat(row.max),
        average: parseFloat(row.average),
        median: parseFloat(row.median),
        p95: parseFloat(row.p95),
        p99: parseFloat(row.p99),
        unit: row.unit,
        timeRange: { start: startDate, end: endDate }
      };

    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get metric statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve metric statistics. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get comprehensive performance summary for a time range
   */
  async getPerformanceSummary(
    startDate: Date,
    endDate: Date
  ): Promise<PerformanceSummary> {
    try {
      const [taskStats, queueStats, workerStats, systemStats] = await Promise.all([
        this.getTaskMetrics(startDate, endDate),
        this.getQueueMetrics(startDate, endDate),
        this.getWorkerMetrics(startDate, endDate),
        this.getSystemMetrics(startDate, endDate)
      ]);

      return {
        timeRange: { start: startDate, end: endDate },
        taskMetrics: taskStats,
        queueMetrics: queueStats,
        workerMetrics: workerStats,
        systemMetrics: systemStats
      };

    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to get performance summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve performance summary. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Query metric data points with filters
   */
  async queryMetrics(filters: MetricQueryFilters = {}): Promise<MetricDataPoint[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.metricType) {
        conditions.push(`metric_type = $${paramIndex}`);
        params.push(filters.metricType);
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

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      const query = `
        SELECT 
          id, timestamp, metric_type, value, unit, task_id, article_id, 
          operation_id, metadata
        FROM performance_metrics 
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await database.query(query, params);
      return result.rows.map(row => this.convertRowToMetricDataPoint(row));

    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to query metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to retrieve metrics. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clean up old metric data points
   */
  async cleanupOldMetrics(retentionDays: number = this.MAX_METRIC_RETENTION_DAYS): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      const result = await database.query(`
        DELETE FROM performance_metrics 
        WHERE timestamp < $1
      `, [cutoffDate]);

      return result.rowCount || 0;
    } catch (error) {
      throw new DatabaseServiceError(
        DatabaseErrorType.QUERY_ERROR,
        `Failed to cleanup old metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to cleanup old metrics. Please try again.',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Store metric data point in database
   */
  private async storeMetricDataPoint(dataPoint: MetricDataPoint): Promise<void> {
    try {
      await database.query(`
        INSERT INTO performance_metrics (
          timestamp, metric_type, value, unit, task_id, article_id, 
          operation_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        dataPoint.timestamp,
        dataPoint.metricType,
        dataPoint.value,
        dataPoint.unit,
        dataPoint.taskId || null,
        dataPoint.articleId || null,
        dataPoint.operationId || null,
        dataPoint.metadata ? JSON.stringify(dataPoint.metadata) : null
      ]);
    } catch (error) {
      // If the table doesn't exist, create it
      if (error instanceof Error && error.message.includes('does not exist')) {
        await this.createPerformanceMetricsTable();
        // Retry the insert
        await this.storeMetricDataPoint(dataPoint);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create performance metrics table if it doesn't exist
   */
  private async createPerformanceMetricsTable(): Promise<void> {
    // Create the table first
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        metric_type VARCHAR(50) NOT NULL,
        value NUMERIC NOT NULL,
        unit VARCHAR(20) NOT NULL,
        task_id UUID,
        article_id INTEGER,
        operation_id VARCHAR(255),
        metadata JSONB
      )
    `;

    await database.query(createTableSQL);

    // Create indexes separately
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_type ON performance_metrics(metric_type)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_task_id ON performance_metrics(task_id)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_article_id ON performance_metrics(article_id)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_operation_id ON performance_metrics(operation_id)',
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_type_timestamp ON performance_metrics(metric_type, timestamp)'
    ];

    for (const indexSQL of indexes) {
      await database.query(indexSQL);
    }
  }

  /**
   * Get task-related metrics
   */
  private async getTaskMetrics(startDate: Date, endDate: Date): Promise<PerformanceSummary['taskMetrics']> {
    const [processingStats, successStats] = await Promise.all([
      database.query(`
        SELECT 
          COUNT(*) as total_processed,
          AVG(value) as avg_processing_time
        FROM performance_metrics 
        WHERE metric_type = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
      `, [MetricType.TASK_PROCESSING_TIME, startDate, endDate]),

      database.query(`
        SELECT 
          COUNT(*) as total_tasks,
          SUM(CASE WHEN metadata->>'success' = 'true' THEN 1 ELSE 0 END) as successful_tasks
        FROM performance_metrics 
        WHERE metric_type = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
          AND metadata->>'success' IS NOT NULL
      `, [MetricType.TASK_PROCESSING_TIME, startDate, endDate])
    ]);

    const processingRow = processingStats.rows[0] || {};
    const successRow = successStats.rows[0] || {};
    
    const totalProcessed = parseInt(processingRow.total_processed || '0', 10);
    const averageProcessingTime = parseFloat(processingRow.avg_processing_time || '0');
    const totalTasks = parseInt(successRow.total_tasks || '0', 10);
    const successfulTasks = parseInt(successRow.successful_tasks || '0', 10);
    const successRate = totalTasks > 0 ? (successfulTasks / totalTasks) * 100 : 0;
    
    const timePeriodHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    const throughputPerHour = timePeriodHours > 0 ? totalProcessed / timePeriodHours : 0;

    return {
      totalProcessed,
      averageProcessingTime,
      successRate,
      throughputPerHour
    };
  }

  /**
   * Get queue-related metrics
   */
  private async getQueueMetrics(startDate: Date, endDate: Date): Promise<PerformanceSummary['queueMetrics']> {
    const result = await database.query(`
      SELECT 
        AVG(value) as avg_depth,
        MAX(value) as max_depth
      FROM performance_metrics 
      WHERE metric_type = $1 
        AND timestamp >= $2 
        AND timestamp <= $3
    `, [MetricType.QUEUE_DEPTH, startDate, endDate]);

    const row = result.rows[0] || {};
    
    return {
      averageDepth: parseFloat(row.avg_depth || '0'),
      maxDepth: parseFloat(row.max_depth || '0'),
      averageWaitTime: 0 // TODO: Calculate from task creation to processing time
    };
  }

  /**
   * Get worker-related metrics
   */
  private async getWorkerMetrics(startDate: Date, endDate: Date): Promise<PerformanceSummary['workerMetrics']> {
    const [utilizationResult, errorResult, throughputResult] = await Promise.all([
      database.query(`
        SELECT AVG(value) as avg_utilization
        FROM performance_metrics 
        WHERE metric_type = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
      `, [MetricType.WORKER_UTILIZATION, startDate, endDate]),

      database.query(`
        SELECT AVG(value) as avg_error_rate
        FROM performance_metrics 
        WHERE metric_type = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
      `, [MetricType.ERROR_RATE, startDate, endDate]),

      database.query(`
        SELECT AVG(value) as avg_throughput
        FROM performance_metrics 
        WHERE metric_type = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
      `, [MetricType.QUEUE_THROUGHPUT, startDate, endDate])
    ]);

    const utilizationRow = utilizationResult.rows[0] || {};
    const errorRow = errorResult.rows[0] || {};
    const throughputRow = throughputResult.rows[0] || {};

    return {
      utilization: parseFloat(utilizationRow.avg_utilization || '0'),
      averageTasksPerHour: parseFloat(throughputRow.avg_throughput || '0'),
      errorRate: parseFloat(errorRow.avg_error_rate || '0')
    };
  }

  /**
   * Get system-related metrics
   */
  private async getSystemMetrics(startDate: Date, endDate: Date): Promise<PerformanceSummary['systemMetrics']> {
    const [dbResult, embeddingResult] = await Promise.all([
      database.query(`
        SELECT AVG(value) as avg_db_time
        FROM performance_metrics 
        WHERE metric_type = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
      `, [MetricType.DATABASE_QUERY_TIME, startDate, endDate]),

      database.query(`
        SELECT AVG(value) as avg_embedding_time
        FROM performance_metrics 
        WHERE metric_type = $1 
          AND timestamp >= $2 
          AND timestamp <= $3
      `, [MetricType.EMBEDDING_GENERATION_TIME, startDate, endDate])
    ]);

    const dbRow = dbResult.rows[0] || {};
    const embeddingRow = embeddingResult.rows[0] || {};

    return {
      averageDatabaseQueryTime: parseFloat(dbRow.avg_db_time || '0'),
      averageEmbeddingTime: parseFloat(embeddingRow.avg_embedding_time || '0')
    };
  }

  /**
   * Convert database row to MetricDataPoint interface
   */
  private convertRowToMetricDataPoint(row: any): MetricDataPoint {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      metricType: row.metric_type as MetricType,
      value: parseFloat(row.value),
      unit: row.unit,
      taskId: row.task_id || undefined,
      articleId: row.article_id || undefined,
      operationId: row.operation_id || undefined,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined
    };
  }
}

// Export singleton instance
export const performanceMetricsService = new PerformanceMetricsService();