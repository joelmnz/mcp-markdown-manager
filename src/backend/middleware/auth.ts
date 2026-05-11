import { validateAccessToken, hasPermission, getTokenNameById, type TokenScope } from '../services/accessTokens.js';
import { authenticateOAuthToken, type OAuthRole } from '../services/oauth.js';

const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  throw new Error('AUTH_TOKEN environment variable is required');
}

export type AuthType = 'local-token' | 'oauth' | 'auth-token';

export interface AuthContext {
  authType: AuthType;
  scope: TokenScope;
  role: OAuthRole;
  principalId: string;
  principalName: string;
  tokenId?: number;
  tokenName?: string;
  folderRegex?: string;
  groups?: string[];
}

/**
 * Extract a token from a strict Authorization: Bearer <token> header.
 */
export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1].trim();
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

  return token === AUTH_TOKEN;
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

  const principalName = tokenName || `token-${validation.tokenId ?? 'unknown'}`;

  return {
    authType: 'local-token',
    scope: validation.scope,
    role: validation.scope === 'write' ? 'editor' : 'reader',
    principalId: validation.tokenId ? `token:${validation.tokenId}` : principalName,
    principalName,
    tokenId: validation.tokenId,
    tokenName,
    folderRegex: validation.folderRegex,
  };
}

/**
 * Authenticate using an OAuth/OIDC access token.
 */
export async function authenticateOAuth(request: Request): Promise<AuthContext | null> {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  return authenticateOAuthToken(token);
}

function createAuthTokenContext(): AuthContext {
  return {
    authType: 'auth-token',
    scope: 'write',
    role: 'admin',
    principalId: 'auth-token:admin',
    principalName: 'admin',
    tokenName: 'admin',
  };
}

/**
 * Combined authentication: checks web auth, access tokens, and optional OAuth tokens.
 * For web-only endpoints (token management), pass useWebAuth=true to ONLY accept AUTH_TOKEN.
 * For API/MCP endpoints, this accepts access tokens, OAuth tokens when enabled, and AUTH_TOKEN for compatibility.
 */
export async function authenticate(request: Request, useWebAuth: boolean = false): Promise<AuthContext | null> {
  if (useWebAuth) {
    // Web-only mode: check AUTH_TOKEN env var ONLY
    const isValid = authenticateWeb(request);
    if (isValid) {
      return createAuthTokenContext();
    }
    return null;
  }

  // API/MCP mode: Try local access token first, then optional OAuth, then AUTH_TOKEN fallback.
  const accessTokenAuth = await authenticateAccessToken(request);
  if (accessTokenAuth) {
    return accessTokenAuth;
  }

  const oauthAuth = await authenticateOAuth(request);
  if (oauthAuth) {
    return oauthAuth;
  }

  // Fall back to AUTH_TOKEN for web UI compatibility
  const isWebAuth = authenticateWeb(request);
  if (isWebAuth) {
    return createAuthTokenContext();
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
