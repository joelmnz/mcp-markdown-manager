import { validateAccessToken, hasPermission, getTokenNameById, type TokenScope } from '../services/accessTokens.js';
import { timingSafeEqual } from 'node:crypto';

const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  throw new Error('AUTH_TOKEN environment variable is required');
}

// Pre-compute buffer for constant-time comparison to avoid overhead on every request
const AUTH_TOKEN_BUFFER = Buffer.from(AUTH_TOKEN);

export interface AuthContext {
  scope: TokenScope;
  tokenId?: number;
  tokenName?: string;
}

/**
 * Extract Bearer token from Authorization header
 */
function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  return token || null;
}

/**
 * Authenticate web login using AUTH_TOKEN environment variable
 * This is ONLY used for web UI login validation
 */
export function authenticateWeb(request: Request): boolean {
  const token = getBearerToken(request);

  if (!token) {
    return false;
  }

  // Use timingSafeEqual to prevent timing attacks
  try {
    const tokenBuffer = Buffer.from(token);

    // Timing attack prevention: Check lengths first
    // If lengths differ, we still want to avoid immediate return if possible to mask length?
    // Actually, checking length first is standard practice as timingSafeEqual throws if lengths differ.
    // Length leakage is usually considered acceptable or unavoidable for variable length tokens,
    // but AUTH_TOKEN is fixed for a deployment.
    if (tokenBuffer.length !== AUTH_TOKEN_BUFFER.length) {
      return false;
    }

    return timingSafeEqual(tokenBuffer, AUTH_TOKEN_BUFFER);
  } catch (error) {
    console.error('Error during token comparison:', error);
    return false;
  }
}

/**
 * Authenticate using access token from database
 * Returns the auth context with scope if valid, null otherwise
 */
export async function authenticateAccessToken(request: Request): Promise<AuthContext | null> {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  // Validate token against database
  const validation = await validateAccessToken(token);

  if (!validation.valid || !validation.scope) {
    return null;
  }

  // Get token name for tracking
  let tokenName: string | undefined = undefined;
  if (validation.tokenId) {
    const name = await getTokenNameById(validation.tokenId);
    tokenName = name || undefined;
  }

  return {
    scope: validation.scope,
    tokenId: validation.tokenId,
    tokenName,
  };
}

/**
 * Combined authentication: checks both web auth and access tokens
 * For web-only endpoints (token management), pass useWebAuth=true to ONLY accept AUTH_TOKEN
 * For API/MCP endpoints, this accepts BOTH access tokens and AUTH_TOKEN for flexibility
 */
export async function authenticate(request: Request, useWebAuth: boolean = false): Promise<AuthContext | null> {
  if (useWebAuth) {
    // Web-only mode: check AUTH_TOKEN env var ONLY
    const isValid = authenticateWeb(request);
    if (isValid) {
      // Web auth always has write scope and uses "admin" as token name
      return { scope: 'write', tokenName: 'admin' };
    }
    return null;
  }

  // API/MCP mode: Try access token first, then fall back to AUTH_TOKEN
  // This allows both web UI (using AUTH_TOKEN) and external APIs (using access tokens) to work

  // First, try access token from database
  const accessTokenAuth = await authenticateAccessToken(request);
  if (accessTokenAuth) {
    return accessTokenAuth;
  }

  // Fall back to AUTH_TOKEN for web UI compatibility
  const isWebAuth = authenticateWeb(request);
  if (isWebAuth) {
    // AUTH_TOKEN always has write scope and uses "admin" as token name
    return { scope: 'write', tokenName: 'admin' };
  }

  return null;
}

/**
 * Require authentication and optionally check for required scope
 * Returns error response if authentication fails or insufficient permissions
 * Returns null if authentication succeeds (attach auth context to request if needed)
 */
export async function requireAuth(
  request: Request,
  requiredScope?: TokenScope,
  useWebAuth: boolean = false
): Promise<{ error: Response } | { auth: AuthContext }> {
  const authContext = await authenticate(request, useWebAuth);

  if (!authContext) {
    return {
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  // Check scope if required
  if (requiredScope && !hasPermission(authContext.scope, requiredScope)) {
    return {
      error: new Response(JSON.stringify({
        error: 'Insufficient permissions',
        message: `This operation requires ${requiredScope} scope, but token has ${authContext.scope} scope`
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  return { auth: authContext };
}
