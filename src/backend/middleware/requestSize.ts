/**
 * Request size validation middleware
 *
 * Validates Content-Length header to prevent DoS attacks via large payloads.
 * Checks size before processing request body for efficiency.
 *
 * Security features:
 * - Content-Length header validation (fast, before reading body)
 * - Configurable size limits per endpoint type
 * - Returns 413 Payload Too Large when exceeded
 * - Security event logging for violations
 * - Graceful handling of missing Content-Length header
 */

import { logSecurityEvent, type SecurityAuditEntry } from '../mcp/validation';
import { getClientIp } from './rateLimit';
import { parseEnvInt } from '../utils/config';


export interface RequestSizeConfig {
  maxBytes: number;
  routes?: string[]; // Optional: specific routes to apply to
}

export type RequestSizeMiddleware = (request: Request) => Promise<Response | null>;

/**
 * Create a request size validation middleware with the specified configuration
 *
 * @param config Request size configuration
 * @returns Middleware function that validates size and returns Response if exceeded
 *
 * @example
 * const sizeValidator = createRequestSizeValidator(RequestSizePresets.ARTICLE_CONTENT);
 * const error = await sizeValidator(request);
 * if (error) return error;
 */
export function createRequestSizeValidator(config: RequestSizeConfig): RequestSizeMiddleware {
  return async (request: Request): Promise<Response | null> => {
    const contentLength = request.headers.get('content-length');

    // If no Content-Length header, allow request (defensive approach)
    // Some clients may not send this header for small requests
    if (!contentLength) {
      return null;
    }

    const size = parseInt(contentLength, 10);

    // Check if size is invalid
    if (isNaN(size) || size < 0) {
      return null; // Allow request with invalid header
    }

    // Check if size exceeds limit
    if (size > config.maxBytes) {
      const clientIp = getClientIp(request);

      // Log security event
      logSecurityEvent({
        timestamp: new Date().toISOString(),
        event: 'oversized_request',
        severity: 'medium',
        details: {
          contentLength: size,
          limit: config.maxBytes,
          ip: clientIp,
          path: new URL(request.url).pathname,
        },
        ip: clientIp,
      });

      return new Response(
        JSON.stringify({
          error: 'Request too large',
          maxSize: config.maxBytes,
          receivedSize: size,
        }),
        {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return null;
  };
}

/**
 * Preset request size configurations for different endpoint types
 */
export const RequestSizePresets = {
  /** Article content - 10MB (matches MCP limit) */
  ARTICLE_CONTENT: {
    maxBytes: parseEnvInt(process.env.API_MAX_REQUEST_SIZE_BYTES, 10 * 1024 * 1024, 'API_MAX_REQUEST_SIZE_BYTES'),
  },

  /** Small payloads - 1MB for metadata and small operations */
  SMALL_PAYLOAD: {
    maxBytes: 1024 * 1024, // 1MB
  },
};
