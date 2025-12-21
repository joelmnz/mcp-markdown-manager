import { DatabaseServiceError, DatabaseErrorType } from './databaseErrors.js';

// Configuration interface for the embedding queue system
export interface EmbeddingQueueConfig {
  enabled: boolean;                    // Enable/disable background processing
  workerInterval: number;              // Polling interval in milliseconds (default: 5000)
  maxRetries: number;                  // Maximum retry attempts (default: 3)
  retryBackoffBase: number;           // Base delay for exponential backoff (default: 1000)
  batchSize: number;                  // Tasks to process per batch (default: 1)
  cleanupInterval: number;            // Cleanup interval in hours (default: 24)
  cleanupRetentionDays: number;       // Retention period for completed tasks (default: 30)
  heartbeatInterval: number;          // Worker heartbeat interval in milliseconds (default: 30000)
  metricsInterval: number;            // Metrics collection interval in milliseconds (default: 60000)
  maxProcessingTime: number;          // Maximum processing time before task is considered stuck (default: 30 minutes)
  stuckTaskCleanupEnabled: boolean;   // Enable automatic cleanup of stuck tasks (default: true)
}

// Default configuration values
const DEFAULT_CONFIG: EmbeddingQueueConfig = {
  enabled: true,
  workerInterval: 5000,              // 5 seconds
  maxRetries: 3,
  retryBackoffBase: 1000,            // 1 second
  batchSize: 1,
  cleanupInterval: 24,               // 24 hours
  cleanupRetentionDays: 30,          // 30 days
  heartbeatInterval: 30000,          // 30 seconds
  metricsInterval: 60000,            // 1 minute
  maxProcessingTime: 30 * 60 * 1000, // 30 minutes
  stuckTaskCleanupEnabled: true
};

// Environment variable mappings
const ENV_MAPPINGS = {
  enabled: 'EMBEDDING_QUEUE_ENABLED',
  workerInterval: 'EMBEDDING_QUEUE_WORKER_INTERVAL',
  maxRetries: 'EMBEDDING_QUEUE_MAX_RETRIES',
  retryBackoffBase: 'EMBEDDING_QUEUE_RETRY_BACKOFF_BASE',
  batchSize: 'EMBEDDING_QUEUE_BATCH_SIZE',
  cleanupInterval: 'EMBEDDING_QUEUE_CLEANUP_INTERVAL',
  cleanupRetentionDays: 'EMBEDDING_QUEUE_CLEANUP_RETENTION_DAYS',
  heartbeatInterval: 'EMBEDDING_QUEUE_HEARTBEAT_INTERVAL',
  metricsInterval: 'EMBEDDING_QUEUE_METRICS_INTERVAL',
  maxProcessingTime: 'EMBEDDING_QUEUE_MAX_PROCESSING_TIME',
  stuckTaskCleanupEnabled: 'EMBEDDING_QUEUE_STUCK_TASK_CLEANUP_ENABLED'
};

// Configuration validation rules
interface ValidationRule {
  min?: number;
  max?: number;
  type: 'number' | 'boolean';
  required?: boolean;
}

const VALIDATION_RULES: Record<keyof EmbeddingQueueConfig, ValidationRule> = {
  enabled: { type: 'boolean' },
  workerInterval: { type: 'number', min: 1000, max: 300000 }, // 1 second to 5 minutes
  maxRetries: { type: 'number', min: 0, max: 10 },
  retryBackoffBase: { type: 'number', min: 100, max: 60000 }, // 100ms to 1 minute
  batchSize: { type: 'number', min: 1, max: 100 },
  cleanupInterval: { type: 'number', min: 1, max: 168 }, // 1 hour to 1 week
  cleanupRetentionDays: { type: 'number', min: 1, max: 365 }, // 1 day to 1 year
  heartbeatInterval: { type: 'number', min: 5000, max: 300000 }, // 5 seconds to 5 minutes
  metricsInterval: { type: 'number', min: 10000, max: 3600000 }, // 10 seconds to 1 hour
  maxProcessingTime: { type: 'number', min: 60000, max: 7200000 }, // 1 minute to 2 hours
  stuckTaskCleanupEnabled: { type: 'boolean' }
};

class EmbeddingQueueConfigService {
  private config: EmbeddingQueueConfig | null = null;
  private validationErrors: string[] = [];

  /**
   * Get the current configuration, loading from environment if not already loaded
   */
  getConfig(): EmbeddingQueueConfig {
    if (!this.config) {
      this.config = this.loadConfiguration();
    }
    return { ...this.config }; // Return a copy to prevent external modification
  }

  /**
   * Reload configuration from environment variables
   */
  reloadConfig(): EmbeddingQueueConfig {
    this.config = null;
    this.validationErrors = [];
    return this.getConfig();
  }

  /**
   * Get validation errors from the last configuration load
   */
  getValidationErrors(): string[] {
    return [...this.validationErrors];
  }

  /**
   * Check if the configuration is valid
   */
  isConfigValid(): boolean {
    this.getConfig(); // Ensure config is loaded
    return this.validationErrors.length === 0;
  }

  /**
   * Get configuration status and recommendations
   */
  getConfigStatus(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
  } {
    const config = this.getConfig();
    const errors = this.getValidationErrors();
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check for potential performance issues
    if (config.workerInterval < 2000) {
      warnings.push('Worker interval is very low (<2s), may cause high CPU usage');
    }

    if (config.workerInterval > 30000) {
      warnings.push('Worker interval is high (>30s), may cause slow processing');
    }

    if (config.maxRetries > 5) {
      warnings.push('High retry count may cause long delays for failing tasks');
    }

    if (config.cleanupRetentionDays < 7) {
      warnings.push('Short retention period may make debugging difficult');
    }

    if (config.maxProcessingTime < 300000) { // 5 minutes
      warnings.push('Short max processing time may cause premature task resets');
    }

    // Provide recommendations
    if (!config.enabled) {
      recommendations.push('Background embedding is disabled - articles will be processed synchronously');
    }

    if (config.batchSize > 1) {
      recommendations.push('Batch processing is not yet implemented - batch size will be ignored');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations
    };
  }

  /**
   * Load configuration from environment variables with validation
   */
  private loadConfiguration(): EmbeddingQueueConfig {
    const config = { ...DEFAULT_CONFIG };
    this.validationErrors = [];

    // Load each configuration value from environment
    for (const [key, envVar] of Object.entries(ENV_MAPPINGS)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        try {
          const parsedValue = this.parseEnvironmentValue(key as keyof EmbeddingQueueConfig, envValue);
          if (parsedValue !== null) {
            (config as any)[key] = parsedValue;
          }
        } catch (error) {
          this.validationErrors.push(
            `Invalid value for ${envVar}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    // Validate the final configuration
    this.validateConfiguration(config);

    return config;
  }

  /**
   * Parse environment variable value based on expected type
   */
  private parseEnvironmentValue(key: keyof EmbeddingQueueConfig, value: string): any {
    const rule = VALIDATION_RULES[key];

    if (rule.type === 'boolean') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
        return true;
      } else if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
        return false;
      } else {
        throw new Error(`Expected boolean value (true/false), got: ${value}`);
      }
    }

    if (rule.type === 'number') {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue)) {
        throw new Error(`Expected number, got: ${value}`);
      }
      return numValue;
    }

    return value;
  }

  /**
   * Validate configuration values against rules
   */
  private validateConfiguration(config: EmbeddingQueueConfig): void {
    for (const [key, rule] of Object.entries(VALIDATION_RULES)) {
      const value = (config as any)[key];
      const envVar = ENV_MAPPINGS[key as keyof EmbeddingQueueConfig];

      // Check type
      if (rule.type === 'number' && typeof value !== 'number') {
        this.validationErrors.push(`${envVar}: Expected number, got ${typeof value}`);
        continue;
      }

      if (rule.type === 'boolean' && typeof value !== 'boolean') {
        this.validationErrors.push(`${envVar}: Expected boolean, got ${typeof value}`);
        continue;
      }

      // Check numeric ranges
      if (rule.type === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          this.validationErrors.push(`${envVar}: Value ${value} is below minimum ${rule.min}`);
        }
        if (rule.max !== undefined && value > rule.max) {
          this.validationErrors.push(`${envVar}: Value ${value} is above maximum ${rule.max}`);
        }
      }
    }

    // Cross-validation rules
    if (config.retryBackoffBase >= config.maxProcessingTime / 2) {
      this.validationErrors.push(
        'EMBEDDING_QUEUE_RETRY_BACKOFF_BASE should be much smaller than EMBEDDING_QUEUE_MAX_PROCESSING_TIME'
      );
    }

    if (config.heartbeatInterval >= config.maxProcessingTime) {
      this.validationErrors.push(
        'EMBEDDING_QUEUE_HEARTBEAT_INTERVAL should be smaller than EMBEDDING_QUEUE_MAX_PROCESSING_TIME'
      );
    }

    if (config.workerInterval >= config.heartbeatInterval) {
      this.validationErrors.push(
        'EMBEDDING_QUEUE_WORKER_INTERVAL should be smaller than EMBEDDING_QUEUE_HEARTBEAT_INTERVAL'
      );
    }
  }

  /**
   * Get configuration as environment variable format (for documentation/export)
   */
  getEnvironmentVariables(): Record<string, string> {
    const config = this.getConfig();
    const envVars: Record<string, string> = {};

    for (const [key, envVar] of Object.entries(ENV_MAPPINGS)) {
      const value = (config as any)[key];
      envVars[envVar] = String(value);
    }

    return envVars;
  }

  /**
   * Get configuration documentation
   */
  getConfigurationDocumentation(): string {
    const lines = [
      '# Embedding Queue Configuration',
      '',
      'The embedding queue system can be configured using the following environment variables:',
      ''
    ];

    for (const [key, envVar] of Object.entries(ENV_MAPPINGS)) {
      const rule = VALIDATION_RULES[key as keyof EmbeddingQueueConfig];
      const defaultValue = DEFAULT_CONFIG[key as keyof EmbeddingQueueConfig];
      
      lines.push(`## ${envVar}`);
      lines.push(`- **Type**: ${rule.type}`);
      lines.push(`- **Default**: ${defaultValue}`);
      
      if (rule.min !== undefined || rule.max !== undefined) {
        const range = rule.min !== undefined && rule.max !== undefined 
          ? `${rule.min} - ${rule.max}`
          : rule.min !== undefined 
            ? `>= ${rule.min}`
            : `<= ${rule.max}`;
        lines.push(`- **Range**: ${range}`);
      }
      
      lines.push(`- **Description**: ${this.getConfigDescription(key as keyof EmbeddingQueueConfig)}`);
      lines.push('');
    }

    lines.push('## Examples');
    lines.push('');
    lines.push('```bash');
    lines.push('# Disable background processing (process embeddings synchronously)');
    lines.push('EMBEDDING_QUEUE_ENABLED=false');
    lines.push('');
    lines.push('# Increase worker polling interval for lower CPU usage');
    lines.push('EMBEDDING_QUEUE_WORKER_INTERVAL=10000');
    lines.push('');
    lines.push('# Increase retry attempts for unreliable embedding services');
    lines.push('EMBEDDING_QUEUE_MAX_RETRIES=5');
    lines.push('');
    lines.push('# Reduce cleanup retention for storage-constrained environments');
    lines.push('EMBEDDING_QUEUE_CLEANUP_RETENTION_DAYS=7');
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * Get human-readable description for configuration keys
   */
  private getConfigDescription(key: keyof EmbeddingQueueConfig): string {
    const descriptions: Record<keyof EmbeddingQueueConfig, string> = {
      enabled: 'Enable or disable background embedding processing. When disabled, embeddings are generated synchronously.',
      workerInterval: 'How often the worker checks for new tasks (milliseconds). Lower values = faster processing but higher CPU usage.',
      maxRetries: 'Maximum number of retry attempts for failed embedding tasks.',
      retryBackoffBase: 'Base delay for exponential backoff between retries (milliseconds).',
      batchSize: 'Number of tasks to process in each batch (currently unused, reserved for future use).',
      cleanupInterval: 'How often to clean up old completed tasks (hours).',
      cleanupRetentionDays: 'How long to keep completed tasks before cleanup (days).',
      heartbeatInterval: 'How often the worker sends heartbeat signals (milliseconds).',
      metricsInterval: 'How often to collect and record performance metrics (milliseconds).',
      maxProcessingTime: 'Maximum time a task can be in processing state before being considered stuck (milliseconds).',
      stuckTaskCleanupEnabled: 'Enable automatic cleanup of tasks stuck in processing state.'
    };

    return descriptions[key] || 'No description available';
  }
}

// Export singleton instance
export const embeddingQueueConfigService = new EmbeddingQueueConfigService();

// Export types and defaults for external use
export { DEFAULT_CONFIG, ENV_MAPPINGS, VALIDATION_RULES };