/**
 * Security audit logging service
 * Logs security-relevant events for monitoring and incident response
 */

export enum SecurityEventType {
  // Authentication events
  AUTH_SUCCESS = 'auth_success',
  AUTH_FAILURE = 'auth_failure',
  AUTH_MISSING = 'auth_missing',
  
  // Session events
  SESSION_CREATED = 'session_created',
  SESSION_EXPIRED = 'session_expired',
  SESSION_TERMINATED = 'session_terminated',
  SESSION_LIMIT_EXCEEDED = 'session_limit_exceeded',
  SESSION_IP_MISMATCH = 'session_ip_mismatch',
  SESSION_TOKEN_MISMATCH = 'session_token_mismatch',
  
  // Input validation events
  VALIDATION_FAILURE = 'validation_failure',
  SUSPICIOUS_INPUT = 'suspicious_input',
  
  // Rate limiting events
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  
  // Tool usage events
  TOOL_CALL = 'tool_call',
  TOOL_ERROR = 'tool_error',
  
  // Operational events
  SERVER_START = 'server_start',
  SERVER_SHUTDOWN = 'server_shutdown',
  DATABASE_ERROR = 'database_error',
}

export enum SecurityEventSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface SecurityEvent {
  timestamp: string;
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  message: string;
  details: {
    ip?: string;
    userAgent?: string;
    sessionId?: string;
    toolName?: string;
    error?: string;
    [key: string]: any;
  };
}

class SecurityAuditService {
  private readonly ENABLE_AUDIT_LOG = process.env.SECURITY_AUDIT_ENABLED?.toLowerCase() !== 'false'; // Default: enabled
  private readonly LOG_TO_FILE = process.env.SECURITY_AUDIT_FILE?.toLowerCase() === 'true';
  private readonly LOG_FILE_PATH = process.env.SECURITY_AUDIT_FILE_PATH || '/tmp/security-audit.log';
  private readonly MAX_LOG_SIZE = parseInt(process.env.SECURITY_AUDIT_MAX_SIZE || '104857600', 10); // 100MB
  
  // In-memory buffer for recent events (for monitoring)
  private recentEvents: SecurityEvent[] = [];
  private readonly MAX_RECENT_EVENTS = 1000;
  
  // Counters for monitoring
  private eventCounters: Map<SecurityEventType, number> = new Map();
  private lastCounterReset: Date = new Date();
  
  constructor() {
    // Initialize counters
    for (const type of Object.values(SecurityEventType)) {
      this.eventCounters.set(type as SecurityEventType, 0);
    }
  }
  
  /**
   * Log a security event
   */
  log(
    type: SecurityEventType,
    severity: SecurityEventSeverity,
    message: string,
    details: SecurityEvent['details'] = {}
  ): void {
    if (!this.ENABLE_AUDIT_LOG) {
      return;
    }
    
    const event: SecurityEvent = {
      timestamp: new Date().toISOString(),
      type,
      severity,
      message,
      details,
    };
    
    // Update counter
    const currentCount = this.eventCounters.get(type) || 0;
    this.eventCounters.set(type, currentCount + 1);
    
    // Add to recent events buffer
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }
    
    // Format log message
    const logMessage = this.formatLogMessage(event);
    
    // Log to console based on severity
    switch (severity) {
      case SecurityEventSeverity.CRITICAL:
      case SecurityEventSeverity.ERROR:
        console.error(logMessage);
        break;
      case SecurityEventSeverity.WARNING:
        console.warn(logMessage);
        break;
      case SecurityEventSeverity.INFO:
        console.log(logMessage);
        break;
    }
    
    // Log to file if enabled
    if (this.LOG_TO_FILE) {
      this.logToFile(logMessage);
    }
  }
  
  /**
   * Format log message for output
   */
  private formatLogMessage(event: SecurityEvent): string {
    const details = Object.entries(event.details)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    
    return `[SECURITY] [${event.timestamp}] [${event.severity.toUpperCase()}] [${event.type}] ${event.message}${details ? ' | ' + details : ''}`;
  }
  
  /**
   * Log to file (async, non-blocking)
   */
  private async logToFile(message: string): Promise<void> {
    try {
      // Check file size and rotate if needed
      await this.rotateLogIfNeeded();
      
      // Append to file (async)
      const file = Bun.file(this.LOG_FILE_PATH);
      await Bun.write(this.LOG_FILE_PATH, message + '\n', { createPath: true });
    } catch (error) {
      console.error('Failed to write security audit log:', error);
    }
  }
  
  /**
   * Rotate log file if it exceeds max size
   */
  private async rotateLogIfNeeded(): Promise<void> {
    try {
      const file = Bun.file(this.LOG_FILE_PATH);
      if (await file.exists()) {
        const size = file.size;
        if (size > this.MAX_LOG_SIZE) {
          // Rename current log file
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedPath = `${this.LOG_FILE_PATH}.${timestamp}`;
          await Bun.write(rotatedPath, file);
          
          // Clear current log file
          await Bun.write(this.LOG_FILE_PATH, '');
          
          console.log(`Security audit log rotated to ${rotatedPath}`);
        }
      }
    } catch (error) {
      console.error('Failed to rotate security audit log:', error);
    }
  }
  
  /**
   * Get recent security events
   */
  getRecentEvents(limit?: number): SecurityEvent[] {
    const events = [...this.recentEvents];
    return limit ? events.slice(-limit) : events;
  }
  
  /**
   * Get event counters
   */
  getEventCounters(): { [key: string]: number } {
    const counters: { [key: string]: number } = {};
    for (const [type, count] of this.eventCounters.entries()) {
      counters[type] = count;
    }
    return counters;
  }
  
  /**
   * Reset event counters
   */
  resetCounters(): void {
    for (const type of this.eventCounters.keys()) {
      this.eventCounters.set(type, 0);
    }
    this.lastCounterReset = new Date();
  }
  
  /**
   * Get statistics
   */
  getStatistics(): {
    totalEvents: number;
    countersSince: string;
    recentEventsCount: number;
    counters: { [key: string]: number };
  } {
    const counters = this.getEventCounters();
    const totalEvents = Object.values(counters).reduce((sum, count) => sum + count, 0);
    
    return {
      totalEvents,
      countersSince: this.lastCounterReset.toISOString(),
      recentEventsCount: this.recentEvents.length,
      counters,
    };
  }
  
  /**
   * Convenience methods for common events
   */
  
  logAuthSuccess(ip: string, userAgent: string | null): void {
    this.log(
      SecurityEventType.AUTH_SUCCESS,
      SecurityEventSeverity.INFO,
      'Authentication successful',
      { ip, userAgent: userAgent || undefined }
    );
  }
  
  logAuthFailure(ip: string, userAgent: string | null, reason?: string): void {
    this.log(
      SecurityEventType.AUTH_FAILURE,
      SecurityEventSeverity.WARNING,
      'Authentication failed',
      { ip, userAgent: userAgent || undefined, reason }
    );
  }
  
  logAuthMissing(ip: string, userAgent: string | null): void {
    this.log(
      SecurityEventType.AUTH_MISSING,
      SecurityEventSeverity.WARNING,
      'Authentication credentials missing',
      { ip, userAgent: userAgent || undefined }
    );
  }
  
  logSessionCreated(sessionId: string, ip: string, userAgent: string | null): void {
    this.log(
      SecurityEventType.SESSION_CREATED,
      SecurityEventSeverity.INFO,
      'Session created',
      { sessionId, ip, userAgent: userAgent || undefined }
    );
  }
  
  logSessionExpired(sessionId: string, reason: 'idle' | 'ttl'): void {
    this.log(
      SecurityEventType.SESSION_EXPIRED,
      SecurityEventSeverity.INFO,
      'Session expired',
      { sessionId, reason }
    );
  }
  
  logSessionTerminated(sessionId: string): void {
    this.log(
      SecurityEventType.SESSION_TERMINATED,
      SecurityEventSeverity.INFO,
      'Session terminated',
      { sessionId }
    );
  }
  
  logSessionLimitExceeded(ip: string, limitType: 'total' | 'per-ip' | 'per-token'): void {
    this.log(
      SecurityEventType.SESSION_LIMIT_EXCEEDED,
      SecurityEventSeverity.WARNING,
      'Session limit exceeded',
      { ip, limitType }
    );
  }
  
  logSessionIpMismatch(sessionId: string, expectedIp: string, actualIp: string): void {
    this.log(
      SecurityEventType.SESSION_IP_MISMATCH,
      SecurityEventSeverity.ERROR,
      'Session IP mismatch detected',
      { sessionId, expectedIp, actualIp }
    );
  }
  
  logSessionTokenMismatch(sessionId: string, ip: string): void {
    this.log(
      SecurityEventType.SESSION_TOKEN_MISMATCH,
      SecurityEventSeverity.ERROR,
      'Session token mismatch detected',
      { sessionId, ip }
    );
  }
  
  logValidationFailure(errors: string[], input: any, ip?: string): void {
    this.log(
      SecurityEventType.VALIDATION_FAILURE,
      SecurityEventSeverity.WARNING,
      'Input validation failed',
      { errors, inputType: typeof input, ip }
    );
  }
  
  logSuspiciousInput(pattern: string, field: string, ip?: string): void {
    this.log(
      SecurityEventType.SUSPICIOUS_INPUT,
      SecurityEventSeverity.WARNING,
      'Suspicious input pattern detected',
      { pattern, field, ip }
    );
  }
  
  logToolCall(toolName: string, sessionId: string, ip: string): void {
    this.log(
      SecurityEventType.TOOL_CALL,
      SecurityEventSeverity.INFO,
      'Tool called',
      { toolName, sessionId, ip }
    );
  }
  
  logToolError(toolName: string, error: string, sessionId?: string): void {
    this.log(
      SecurityEventType.TOOL_ERROR,
      SecurityEventSeverity.ERROR,
      'Tool execution error',
      { toolName, error, sessionId }
    );
  }
  
  logServerStart(): void {
    this.log(
      SecurityEventType.SERVER_START,
      SecurityEventSeverity.INFO,
      'Server started'
    );
  }
  
  logServerShutdown(reason?: string): void {
    this.log(
      SecurityEventType.SERVER_SHUTDOWN,
      SecurityEventSeverity.INFO,
      'Server shutting down',
      { reason }
    );
  }
}

// Export singleton instance
export const securityAuditService = new SecurityAuditService();
