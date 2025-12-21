import { DatabaseError } from 'pg';

/**
 * Database error types for better error handling
 */
export enum DatabaseErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  QUERY_ERROR = 'QUERY_ERROR',
  TRANSACTION_ERROR = 'TRANSACTION_ERROR',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Custom database error class with user-friendly messages
 */
export class DatabaseServiceError extends Error {
  public readonly type: DatabaseErrorType;
  public readonly userMessage: string;
  public readonly originalError?: Error;
  public readonly code?: string;

  constructor(
    type: DatabaseErrorType,
    message: string,
    userMessage: string,
    originalError?: Error,
    code?: string
  ) {
    super(message);
    this.name = 'DatabaseServiceError';
    this.type = type;
    this.userMessage = userMessage;
    this.originalError = originalError;
    this.code = code;
  }
}

/**
 * PostgreSQL error codes that we handle specifically
 */
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  CONNECTION_FAILURE: '08000',
  CONNECTION_EXCEPTION: '08001',
  CONNECTION_DOES_NOT_EXIST: '08003',
  QUERY_CANCELED: '57014',
  ADMIN_SHUTDOWN: '57P01',
  CRASH_SHUTDOWN: '57P02',
  CANNOT_CONNECT_NOW: '57P03',
  DATABASE_DROPPED: '57P04',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01'
} as const;

/**
 * Convert PostgreSQL errors to user-friendly messages
 */
export function handleDatabaseError(error: unknown): DatabaseServiceError {
  // Handle our custom errors
  if (error instanceof DatabaseServiceError) {
    return error;
  }

  // Handle PostgreSQL errors
  if (error instanceof DatabaseError) {
    const pgError = error as DatabaseError;
    
    switch (pgError.code) {
      case PG_ERROR_CODES.UNIQUE_VIOLATION:
        return new DatabaseServiceError(
          DatabaseErrorType.CONSTRAINT_VIOLATION,
          `Unique constraint violation: ${pgError.message}`,
          'This item already exists. Please choose a different name or identifier.',
          pgError,
          pgError.code
        );

      case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION:
        return new DatabaseServiceError(
          DatabaseErrorType.CONSTRAINT_VIOLATION,
          `Foreign key constraint violation: ${pgError.message}`,
          'Cannot perform this operation because it would break data relationships.',
          pgError,
          pgError.code
        );

      case PG_ERROR_CODES.NOT_NULL_VIOLATION:
        return new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          `Not null constraint violation: ${pgError.message}`,
          'Required information is missing. Please fill in all required fields.',
          pgError,
          pgError.code
        );

      case PG_ERROR_CODES.CHECK_VIOLATION:
        return new DatabaseServiceError(
          DatabaseErrorType.VALIDATION_ERROR,
          `Check constraint violation: ${pgError.message}`,
          'The provided data does not meet the required format or constraints.',
          pgError,
          pgError.code
        );

      case PG_ERROR_CODES.CONNECTION_FAILURE:
      case PG_ERROR_CODES.CONNECTION_EXCEPTION:
      case PG_ERROR_CODES.CONNECTION_DOES_NOT_EXIST:
      case PG_ERROR_CODES.CANNOT_CONNECT_NOW:
        return new DatabaseServiceError(
          DatabaseErrorType.CONNECTION_ERROR,
          `Database connection error: ${pgError.message}`,
          'Unable to connect to the database. Please try again in a moment.',
          pgError,
          pgError.code
        );

      case PG_ERROR_CODES.QUERY_CANCELED:
        return new DatabaseServiceError(
          DatabaseErrorType.TIMEOUT_ERROR,
          `Query was canceled: ${pgError.message}`,
          'The operation took too long and was canceled. Please try again.',
          pgError,
          pgError.code
        );

      case PG_ERROR_CODES.ADMIN_SHUTDOWN:
      case PG_ERROR_CODES.CRASH_SHUTDOWN:
      case PG_ERROR_CODES.DATABASE_DROPPED:
        return new DatabaseServiceError(
          DatabaseErrorType.CONNECTION_ERROR,
          `Database unavailable: ${pgError.message}`,
          'The database is temporarily unavailable. Please try again later.',
          pgError,
          pgError.code
        );

      case PG_ERROR_CODES.SERIALIZATION_FAILURE:
      case PG_ERROR_CODES.DEADLOCK_DETECTED:
        return new DatabaseServiceError(
          DatabaseErrorType.TRANSACTION_ERROR,
          `Transaction conflict: ${pgError.message}`,
          'A conflict occurred while processing your request. Please try again.',
          pgError,
          pgError.code
        );

      default:
        return new DatabaseServiceError(
          DatabaseErrorType.QUERY_ERROR,
          `Database query error: ${pgError.message}`,
          'An error occurred while processing your request. Please try again.',
          pgError,
          pgError.code
        );
    }
  }

  // Handle generic errors
  if (error instanceof Error) {
    // Check for connection-related errors in the message
    const message = error.message.toLowerCase();
    
    if (message.includes('connection') || message.includes('connect')) {
      return new DatabaseServiceError(
        DatabaseErrorType.CONNECTION_ERROR,
        error.message,
        'Unable to connect to the database. Please check your connection and try again.',
        error
      );
    }

    if (message.includes('timeout')) {
      return new DatabaseServiceError(
        DatabaseErrorType.TIMEOUT_ERROR,
        error.message,
        'The operation took too long to complete. Please try again.',
        error
      );
    }

    return new DatabaseServiceError(
      DatabaseErrorType.UNKNOWN_ERROR,
      error.message,
      'An unexpected error occurred. Please try again.',
      error
    );
  }

  // Handle unknown error types
  return new DatabaseServiceError(
    DatabaseErrorType.UNKNOWN_ERROR,
    'Unknown error occurred',
    'An unexpected error occurred. Please try again.',
    error instanceof Error ? error : new Error(String(error))
  );
}

/**
 * Retry configuration for database operations
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: DatabaseErrorType[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableErrors: [
    DatabaseErrorType.CONNECTION_ERROR,
    DatabaseErrorType.TIMEOUT_ERROR,
    DatabaseErrorType.TRANSACTION_ERROR
  ]
};

/**
 * Retry a database operation with exponential backoff
 */
export async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: DatabaseServiceError;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = handleDatabaseError(error);

      // Don't retry if this error type is not retryable
      if (!finalConfig.retryableErrors.includes(lastError.type)) {
        throw lastError;
      }

      // Don't retry on the last attempt
      if (attempt === finalConfig.maxAttempts) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
        finalConfig.maxDelay
      );

      console.warn(`Database operation failed (attempt ${attempt}/${finalConfig.maxAttempts}), retrying in ${delay}ms:`, lastError.message);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: DatabaseServiceError): boolean {
  return DEFAULT_RETRY_CONFIG.retryableErrors.includes(error.type);
}

/**
 * Log database errors with appropriate level
 */
export function logDatabaseError(error: DatabaseServiceError, context?: string): void {
  const logContext = context ? `[${context}] ` : '';
  
  switch (error.type) {
    case DatabaseErrorType.CONNECTION_ERROR:
    case DatabaseErrorType.TIMEOUT_ERROR:
      console.warn(`${logContext}Database ${error.type}:`, error.message);
      break;
    
    case DatabaseErrorType.VALIDATION_ERROR:
    case DatabaseErrorType.NOT_FOUND:
      console.info(`${logContext}Database ${error.type}:`, error.message);
      break;
    
    default:
      console.error(`${logContext}Database ${error.type}:`, error.message, error.originalError);
      break;
  }
}