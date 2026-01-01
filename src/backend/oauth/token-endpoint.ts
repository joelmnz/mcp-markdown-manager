import { oauthStorage, hashToken } from './storage.js';
import { validatePKCE } from './pkce.js';
import { oauthTokenService } from './tokens.js';

/**
 * Token endpoint implementation
 * Handles token exchange and refresh
 */

/**
 * Token request (authorization_code grant)
 */
export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
}

/**
 * Token response (success)
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Token error response
 */
export interface TokenError {
  error: string;
  error_description?: string;
}

/**
 * Extract client credentials from Authorization header or request body
 */
export function extractClientCredentials(
  request: Request,
  bodyParams: URLSearchParams
): { clientId: string; clientSecret?: string } | null {
  // Try Basic authentication first
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
      const [clientId, clientSecret] = credentials.split(':');
      if (clientId) {
        return { clientId, clientSecret };
      }
    } catch {
      // Invalid Basic auth, fall through
    }
  }

  // Try client_id and client_secret from body
  const clientId = bodyParams.get('client_id');
  const clientSecret = bodyParams.get('client_secret') || undefined;

  if (clientId) {
    return { clientId, clientSecret };
  }

  return null;
}

/**
 * Verify client authentication
 */
async function verifyClient(clientId: string, clientSecret?: string): Promise<{ valid: boolean; error?: TokenError }> {
  const client = await oauthStorage.getClient(clientId);
  if (!client) {
    return {
      valid: false,
      error: {
        error: 'invalid_client',
        error_description: 'Unknown client_id',
      },
    };
  }

  // If client uses client_secret authentication, verify it
  if (client.token_endpoint_auth_method !== 'none') {
    if (!clientSecret) {
      return {
        valid: false,
        error: {
          error: 'invalid_client',
          error_description: 'client_secret is required',
        },
      };
    }

    const secretValid = await oauthStorage.verifyClientSecret(clientId, clientSecret);
    if (!secretValid) {
      return {
        valid: false,
        error: {
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        },
      };
    }
  }

  return { valid: true };
}

/**
 * Handle authorization_code grant
 */
async function handleAuthorizationCodeGrant(
  tokenRequest: TokenRequest
): Promise<TokenResponse | TokenError> {
  // Validate required parameters
  if (!tokenRequest.code) {
    return {
      error: 'invalid_request',
      error_description: 'code is required',
    };
  }

  if (!tokenRequest.redirect_uri) {
    return {
      error: 'invalid_request',
      error_description: 'redirect_uri is required',
    };
  }

  if (!tokenRequest.code_verifier) {
    return {
      error: 'invalid_request',
      error_description: 'code_verifier is required (PKCE)',
    };
  }

  // Consume authorization code (one-time use, validates expiration)
  const authCode = await oauthStorage.consumeAuthorizationCode(tokenRequest.code);
  if (!authCode) {
    return {
      error: 'invalid_grant',
      error_description: 'Invalid or expired authorization code',
    };
  }

  // Verify client_id matches
  if (authCode.client_id !== tokenRequest.client_id) {
    return {
      error: 'invalid_grant',
      error_description: 'Authorization code was not issued to this client',
    };
  }

  // Verify redirect_uri matches
  if (authCode.redirect_uri !== tokenRequest.redirect_uri) {
    return {
      error: 'invalid_grant',
      error_description: 'redirect_uri does not match',
    };
  }

  // Verify PKCE code_verifier
  const pkceValidation = validatePKCE(
    tokenRequest.code_verifier,
    authCode.code_challenge,
    authCode.code_challenge_method as any
  );

  if (!pkceValidation.valid) {
    return {
      error: 'invalid_grant',
      error_description: pkceValidation.error || 'PKCE validation failed',
    };
  }

  // Generate access token
  const { token: accessToken, expiresIn } = await oauthTokenService.createAccessToken(
    authCode.client_id,
    authCode.user_id,
    authCode.scope
  );

  // Generate refresh token
  const accessTokenHash = hashToken(accessToken);
  const { token: refreshToken } = await oauthTokenService.createRefreshToken(
    authCode.client_id,
    accessTokenHash,
    authCode.user_id,
    authCode.scope
  );

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: authCode.scope,
  };
}

/**
 * Handle refresh_token grant
 */
async function handleRefreshTokenGrant(tokenRequest: TokenRequest): Promise<TokenResponse | TokenError> {
  if (!tokenRequest.refresh_token) {
    return {
      error: 'invalid_request',
      error_description: 'refresh_token is required',
    };
  }

  // Refresh the access token
  const result = await oauthTokenService.refreshAccessToken(tokenRequest.refresh_token);

  if (!result) {
    return {
      error: 'invalid_grant',
      error_description: 'Invalid or expired refresh token',
    };
  }

  return {
    access_token: result.accessToken,
    token_type: 'Bearer',
    expires_in: result.expiresIn,
    refresh_token: result.refreshToken,
  };
}

/**
 * Process token request
 */
export async function processTokenRequest(
  request: Request,
  bodyParams: URLSearchParams
): Promise<TokenResponse | TokenError> {
  // Extract client credentials
  const credentials = extractClientCredentials(request, bodyParams);
  if (!credentials) {
    return {
      error: 'invalid_client',
      error_description: 'Client authentication failed',
    };
  }

  // Verify client
  const clientVerification = await verifyClient(credentials.clientId, credentials.clientSecret);
  if (!clientVerification.valid) {
    return clientVerification.error!;
  }

  // Build token request object
  const tokenRequest: TokenRequest = {
    grant_type: bodyParams.get('grant_type') || '',
    code: bodyParams.get('code') || undefined,
    redirect_uri: bodyParams.get('redirect_uri') || undefined,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code_verifier: bodyParams.get('code_verifier') || undefined,
    refresh_token: bodyParams.get('refresh_token') || undefined,
  };

  // Validate grant_type
  if (!tokenRequest.grant_type) {
    return {
      error: 'invalid_request',
      error_description: 'grant_type is required',
    };
  }

  // Handle based on grant type
  switch (tokenRequest.grant_type) {
    case 'authorization_code':
      return await handleAuthorizationCodeGrant(tokenRequest);

    case 'refresh_token':
      return await handleRefreshTokenGrant(tokenRequest);

    default:
      return {
        error: 'unsupported_grant_type',
        error_description: `Grant type "${tokenRequest.grant_type}" is not supported`,
      };
  }
}

/**
 * Revoke a token (access or refresh)
 */
export async function revokeToken(token: string, tokenTypeHint?: string): Promise<void> {
  // Try to revoke as access token
  if (!tokenTypeHint || tokenTypeHint === 'access_token') {
    const revoked = await oauthTokenService.revokeAccessToken(token);
    if (revoked) return;
  }

  // Try to revoke as refresh token
  if (!tokenTypeHint || tokenTypeHint === 'refresh_token') {
    await oauthTokenService.revokeRefreshToken(token);
  }

  // RFC 7009: The revocation endpoint returns 200 even if token is invalid
  // This prevents token scanning attacks
}
