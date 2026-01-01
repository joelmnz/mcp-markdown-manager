import { oauthTokenService } from '../oauth/tokens.js';
import type { AccessTokenPayload } from '../oauth/tokens.js';

const AUTH_TOKEN = process.env.AUTH_TOKEN;
const OAUTH_ENABLED = process.env.OAUTH_ENABLED?.toLowerCase() === 'true';
const OAUTH_LEGACY_TOKEN_ENABLED = process.env.OAUTH_LEGACY_TOKEN_ENABLED?.toLowerCase() !== 'false'; // Default true

if (!AUTH_TOKEN && !OAUTH_ENABLED) {
  throw new Error('Either AUTH_TOKEN or OAUTH_ENABLED must be configured');
}

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  type?: 'legacy' | 'oauth';
  payload?: AccessTokenPayload;
  error?: string;
}

/**
 * Authenticate a request using either legacy token or OAuth
 */
export async function authenticate(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return { authenticated: false, error: 'Missing Authorization header' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Invalid Authorization header format' };
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  // Try legacy AUTH_TOKEN first (if enabled)
  if (OAUTH_LEGACY_TOKEN_ENABLED && AUTH_TOKEN && token === AUTH_TOKEN) {
    return { authenticated: true, type: 'legacy' };
  }

  // Try OAuth token validation (if enabled)
  if (OAUTH_ENABLED) {
    try {
      const validation = await oauthTokenService.validateAccessToken(token);
      if (validation.valid && validation.payload) {
        return {
          authenticated: true,
          type: 'oauth',
          payload: validation.payload,
        };
      }
      // If validation failed, continue to return false at the end
    } catch (error) {
      // OAuth validation error, fall through to return false
    }
  }

  return { authenticated: false, error: 'Invalid or expired token' };
}

/**
 * Synchronous authentication (legacy only, for backward compatibility)
 * @deprecated Use authenticate() instead for OAuth support
 */
export function authenticateSync(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace('Bearer ', '');

  // Only check legacy token
  if (OAUTH_LEGACY_TOKEN_ENABLED && AUTH_TOKEN) {
    return token === AUTH_TOKEN;
  }

  return false;
}

/**
 * Require authentication middleware
 */
export async function requireAuth(request: Request): Promise<Response | null> {
  const authResult = await authenticate(request);

  if (!authResult.authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return null;
}

/**
 * Get authenticated user/client info from request
 */
export async function getAuthInfo(request: Request): Promise<{
  type: 'legacy' | 'oauth';
  userId?: string;
  clientId?: string;
  scope?: string;
} | null> {
  const authResult = await authenticate(request);

  if (!authResult.authenticated) {
    return null;
  }

  if (authResult.type === 'legacy') {
    return { type: 'legacy' };
  }

  if (authResult.type === 'oauth' && authResult.payload) {
    return {
      type: 'oauth',
      userId: authResult.payload.sub,
      clientId: authResult.payload.aud,
      scope: authResult.payload.scope,
    };
  }

  return null;
}
