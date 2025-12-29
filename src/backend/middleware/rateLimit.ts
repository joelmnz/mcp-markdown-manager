/**
 * Rate limiting middleware
 *
 * Provides configurable rate limiting with per-IP tracking to prevent DoS attacks.
 * Uses sliding window algorithm with in-memory storage.
 *
 * Security features:
 * - IP-based tracking (x-forwarded-for or x-real-ip headers)
 * - Configurable limits per endpoint type
 * - Returns 429 with Retry-After header when exceeded
 * - Security event logging for violations
 * - Automatic cleanup of expired entries
 */

import { logSecurityEvent, type SecurityAuditEntry } from '../mcp/validation';
import { parseEnvInt } from '../utils/config';


export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: Request) => string; // Default: IP address
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export type RateLimitMiddleware = (request: Request) => Response | null;

/**
 * In-memory storage for rate limit tracking
 * Key: identifier (IP address or custom key)
 * Value: { count, resetTime }
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Extract client IP address from request headers
 * Checks x-forwarded-for and x-real-ip headers (common reverse proxy headers)
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Cleanup expired rate limit entries
 * Runs periodically to prevent memory leaks
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Create a rate limiting middleware with the specified configuration
 *
 * @param config Rate limiting configuration
 * @returns Middleware function that checks rate limit and returns Response if exceeded
 *
 * @example
 * const apiRateLimit = createRateLimiter(RateLimitPresets.API_GENERAL);
 * const error = apiRateLimit(request);
 * if (error) return error;
 */
export function createRateLimiter(config: RateLimitConfig): RateLimitMiddleware {
  const keyGenerator = config.keyGenerator || getClientIp;

  return (request: Request): Response | null => {
    const key = keyGenerator(request);
    const now = Date.now();
    const resetTime = now + config.windowMs;

    let entry = rateLimitStore.get(key);

    // Create new entry if doesn't exist or if outside window
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime,
      };
      rateLimitStore.set(key, entry);
      return null;
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);

      // Log security event
      logSecurityEvent({
        timestamp: new Date(now).toISOString(),
        event: 'rate_limit_exceeded',
        severity: 'medium',
        details: {
          ip: key,
          path: new URL(request.url).pathname,
          requestCount: entry.count,
          window: config.windowMs,
          limit: config.maxRequests,
        },
        ip: key,
      });

      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          retryAfter: retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
          },
        }
      );
    }

    // Increment counter
    entry.count++;
    return null;
  };
}

/**
 * Preset rate limit configurations for different endpoint types
 */
export const RateLimitPresets = {
  /** General API endpoints - 60 requests per minute */
  API_GENERAL: {
    windowMs: parseEnvInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60000, 'API_RATE_LIMIT_WINDOW_MS'),
    maxRequests: parseEnvInt(process.env.API_RATE_LIMIT_MAX_REQUESTS, 60, 'API_RATE_LIMIT_MAX_REQUESTS'),
  },

  /** Expensive operations (reindex, etc.) - 5 requests per minute */
  API_EXPENSIVE: {
    windowMs: parseEnvInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60000, 'API_RATE_LIMIT_WINDOW_MS'),
    maxRequests: parseEnvInt(process.env.API_RATE_LIMIT_EXPENSIVE_MAX_REQUESTS, 5, 'API_RATE_LIMIT_EXPENSIVE_MAX_REQUESTS'),
  },

  /** MCP session endpoints - 100 requests per minute (matches current implementation) */
  MCP_SESSION: {
    windowMs: parseEnvInt(process.env.MCP_RATE_LIMIT_WINDOW_MS, 60000, 'MCP_RATE_LIMIT_WINDOW_MS'),
    maxRequests: parseEnvInt(process.env.MCP_RATE_LIMIT_MAX_REQUESTS, 100, 'MCP_RATE_LIMIT_MAX_REQUESTS'),
  },

  /** Public endpoints - 30 requests per minute */
  PUBLIC_LIGHT: {
    windowMs: parseEnvInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60000, 'API_RATE_LIMIT_WINDOW_MS'),
    maxRequests: parseEnvInt(process.env.API_RATE_LIMIT_PUBLIC_MAX_REQUESTS, 30, 'API_RATE_LIMIT_PUBLIC_MAX_REQUESTS'),
  },
};
