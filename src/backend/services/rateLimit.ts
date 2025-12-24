/**
 * Rate limiting service for MCP tool calls
 * Prevents abuse and resource exhaustion attacks
 */

import { securityAuditService, SecurityEventSeverity, SecurityEventType } from './securityAudit.js';

export interface RateLimitConfig {
  // Tool calls per session per time window
  maxToolCallsPerWindow: number;
  windowMs: number;
  
  // Specific tool limits (for expensive operations)
  toolSpecificLimits: Map<string, {
    maxCallsPerWindow: number;
    windowMs: number;
  }>;
  
  // Burst allowance
  burstAllowance: number;
}

interface RateLimitEntry {
  count: number;
  firstCallTime: number;
  burstUsed: number;
}

class RateLimitService {
  private readonly config: RateLimitConfig;
  
  // Session-based rate limiting
  private sessionLimits: Map<string, RateLimitEntry> = new Map();
  
  // Tool-specific rate limiting per session
  private toolLimits: Map<string, Map<string, RateLimitEntry>> = new Map();
  
  // Cleanup interval
  private cleanupInterval: Timer | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60000; // 1 minute
  
  constructor() {
    // Load configuration from environment
    this.config = {
      maxToolCallsPerWindow: parseInt(process.env.RATE_LIMIT_TOOL_CALLS_PER_WINDOW || '100', 10),
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
      burstAllowance: parseInt(process.env.RATE_LIMIT_BURST_ALLOWANCE || '10', 10),
      toolSpecificLimits: this.loadToolSpecificLimits(),
    };
    
    // Start cleanup interval
    this.startCleanup();
  }
  
  /**
   * Load tool-specific rate limits from environment
   */
  private loadToolSpecificLimits(): Map<string, { maxCallsPerWindow: number; windowMs: number }> {
    const limits = new Map<string, { maxCallsPerWindow: number; windowMs: number }>();
    
    // Example tool-specific limits (can be configured via env vars)
    // Expensive operations get tighter limits
    limits.set('createArticle', {
      maxCallsPerWindow: parseInt(process.env.RATE_LIMIT_CREATE_ARTICLE || '20', 10),
      windowMs: 60000, // 1 minute
    });
    
    limits.set('updateArticle', {
      maxCallsPerWindow: parseInt(process.env.RATE_LIMIT_UPDATE_ARTICLE || '30', 10),
      windowMs: 60000,
    });
    
    limits.set('deleteArticle', {
      maxCallsPerWindow: parseInt(process.env.RATE_LIMIT_DELETE_ARTICLE || '10', 10),
      windowMs: 60000,
    });
    
    limits.set('semanticSearch', {
      maxCallsPerWindow: parseInt(process.env.RATE_LIMIT_SEMANTIC_SEARCH || '50', 10),
      windowMs: 60000,
    });
    
    limits.set('multiSemanticSearch', {
      maxCallsPerWindow: parseInt(process.env.RATE_LIMIT_MULTI_SEMANTIC_SEARCH || '20', 10),
      windowMs: 60000,
    });
    
    return limits;
  }
  
  /**
   * Check if a tool call is allowed for a session
   */
  checkRateLimit(sessionId: string, toolName: string, ip?: string): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const now = Date.now();
    
    // Check general tool call rate limit
    const generalLimit = this.checkGeneralLimit(sessionId, now);
    if (!generalLimit.allowed) {
      securityAuditService.log(
        SecurityEventType.RATE_LIMIT_EXCEEDED,
        SecurityEventSeverity.WARNING,
        'General tool call rate limit exceeded',
        { sessionId, toolName, ip, limitType: 'general' }
      );
      return generalLimit;
    }
    
    // Check tool-specific rate limit if configured
    const toolLimit = this.checkToolSpecificLimit(sessionId, toolName, now);
    if (!toolLimit.allowed) {
      securityAuditService.log(
        SecurityEventType.RATE_LIMIT_EXCEEDED,
        SecurityEventSeverity.WARNING,
        'Tool-specific rate limit exceeded',
        { sessionId, toolName, ip, limitType: 'tool-specific' }
      );
      return toolLimit;
    }
    
    // Both limits passed, record the call
    this.recordToolCall(sessionId, toolName, now);
    
    return { allowed: true };
  }
  
  /**
   * Check general tool call rate limit
   */
  private checkGeneralLimit(sessionId: string, now: number): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    let entry = this.sessionLimits.get(sessionId);
    
    if (!entry) {
      // First call, create entry
      return { allowed: true };
    }
    
    // Check if window has expired
    const windowAge = now - entry.firstCallTime;
    if (windowAge > this.config.windowMs) {
      // Window expired, reset
      return { allowed: true };
    }
    
    // Check if within limit
    const effectiveLimit = this.config.maxToolCallsPerWindow + (entry.burstUsed < this.config.burstAllowance ? this.config.burstAllowance : 0);
    
    if (entry.count >= effectiveLimit) {
      const retryAfter = Math.ceil((this.config.windowMs - windowAge) / 1000);
      return {
        allowed: false,
        reason: 'Too many tool calls',
        retryAfter,
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check tool-specific rate limit
   */
  private checkToolSpecificLimit(sessionId: string, toolName: string, now: number): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const toolConfig = this.config.toolSpecificLimits.get(toolName);
    if (!toolConfig) {
      // No specific limit for this tool
      return { allowed: true };
    }
    
    // Get or create tool limits map for this session
    let sessionToolLimits = this.toolLimits.get(sessionId);
    if (!sessionToolLimits) {
      return { allowed: true };
    }
    
    let entry = sessionToolLimits.get(toolName);
    if (!entry) {
      return { allowed: true };
    }
    
    // Check if window has expired
    const windowAge = now - entry.firstCallTime;
    if (windowAge > toolConfig.windowMs) {
      // Window expired
      return { allowed: true };
    }
    
    // Check if within limit
    if (entry.count >= toolConfig.maxCallsPerWindow) {
      const retryAfter = Math.ceil((toolConfig.windowMs - windowAge) / 1000);
      return {
        allowed: false,
        reason: `Too many ${toolName} calls`,
        retryAfter,
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Record a tool call
   */
  private recordToolCall(sessionId: string, toolName: string, now: number): void {
    // Record general limit
    let entry = this.sessionLimits.get(sessionId);
    if (!entry || (now - entry.firstCallTime) > this.config.windowMs) {
      // Create new entry or reset expired window
      entry = {
        count: 1,
        firstCallTime: now,
        burstUsed: 0,
      };
    } else {
      // Increment count
      entry.count++;
      
      // Track burst usage
      if (entry.count > this.config.maxToolCallsPerWindow) {
        entry.burstUsed++;
      }
    }
    this.sessionLimits.set(sessionId, entry);
    
    // Record tool-specific limit
    const toolConfig = this.config.toolSpecificLimits.get(toolName);
    if (toolConfig) {
      let sessionToolLimits = this.toolLimits.get(sessionId);
      if (!sessionToolLimits) {
        sessionToolLimits = new Map();
        this.toolLimits.set(sessionId, sessionToolLimits);
      }
      
      let toolEntry = sessionToolLimits.get(toolName);
      if (!toolEntry || (now - toolEntry.firstCallTime) > toolConfig.windowMs) {
        toolEntry = {
          count: 1,
          firstCallTime: now,
          burstUsed: 0,
        };
      } else {
        toolEntry.count++;
      }
      sessionToolLimits.set(toolName, toolEntry);
    }
  }
  
  /**
   * Remove rate limit data for a session (called when session is terminated)
   */
  clearSession(sessionId: string): void {
    this.sessionLimits.delete(sessionId);
    this.toolLimits.delete(sessionId);
  }
  
  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }
  
  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    // Cleanup general limits
    for (const [sessionId, entry] of this.sessionLimits.entries()) {
      if ((now - entry.firstCallTime) > this.config.windowMs * 2) {
        this.sessionLimits.delete(sessionId);
      }
    }
    
    // Cleanup tool-specific limits
    for (const [sessionId, toolLimitsMap] of this.toolLimits.entries()) {
      let hasAnyEntries = false;
      
      for (const [toolName, entry] of toolLimitsMap.entries()) {
        const toolConfig = this.config.toolSpecificLimits.get(toolName);
        const maxWindowMs = toolConfig ? toolConfig.windowMs : this.config.windowMs;
        
        if ((now - entry.firstCallTime) > maxWindowMs * 2) {
          toolLimitsMap.delete(toolName);
        } else {
          hasAnyEntries = true;
        }
      }
      
      // Remove session if no entries left
      if (!hasAnyEntries) {
        this.toolLimits.delete(sessionId);
      }
    }
  }
  
  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  /**
   * Get current statistics
   */
  getStatistics(): {
    totalSessions: number;
    config: RateLimitConfig;
    sessionsWithCalls: number;
  } {
    return {
      totalSessions: this.sessionLimits.size,
      sessionsWithCalls: this.toolLimits.size,
      config: {
        ...this.config,
        toolSpecificLimits: this.config.toolSpecificLimits, // Already a Map
      },
    };
  }
}

// Export singleton instance
export const rateLimitService = new RateLimitService();
