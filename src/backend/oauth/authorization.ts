import { oauthStorage, generateToken } from './storage.js';
import { isValidCodeChallengeMethod, isValidCodeChallenge } from './pkce.js';
import { parseEnvInt } from '../utils/config.js';

/**
 * Authorization endpoint implementation
 * Handles OAuth 2.0 authorization code flow with PKCE
 */

const OAUTH_AUTHORIZATION_CODE_TTL = parseEnvInt(
  process.env.OAUTH_AUTHORIZATION_CODE_TTL,
  600,
  'OAUTH_AUTHORIZATION_CODE_TTL'
); // 10 minutes

/**
 * Authorization request parameters
 */
export interface AuthorizationRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
}

/**
 * Authorization response (success)
 */
export interface AuthorizationResponse {
  code: string;
  state?: string;
}

/**
 * Authorization error response
 */
export interface AuthorizationError {
  error: string;
  error_description?: string;
  state?: string;
}

/**
 * Validate authorization request
 */
export async function validateAuthorizationRequest(
  request: AuthorizationRequest
): Promise<{ valid: boolean; error?: AuthorizationError }> {
  // response_type must be 'code'
  if (request.response_type !== 'code') {
    return {
      valid: false,
      error: {
        error: 'unsupported_response_type',
        error_description: 'Only "code" response_type is supported',
        state: request.state,
      },
    };
  }

  // client_id is required
  if (!request.client_id) {
    return {
      valid: false,
      error: {
        error: 'invalid_request',
        error_description: 'client_id is required',
        state: request.state,
      },
    };
  }

  // Verify client exists
  const client = await oauthStorage.getClient(request.client_id);
  if (!client) {
    return {
      valid: false,
      error: {
        error: 'invalid_client',
        error_description: 'Unknown client_id',
        state: request.state,
      },
    };
  }

  // redirect_uri is required
  if (!request.redirect_uri) {
    return {
      valid: false,
      error: {
        error: 'invalid_request',
        error_description: 'redirect_uri is required',
        state: request.state,
      },
    };
  }

  // Verify redirect_uri is registered
  if (!client.redirect_uris.includes(request.redirect_uri)) {
    return {
      valid: false,
      error: {
        error: 'invalid_request',
        error_description: 'redirect_uri not registered for this client',
        state: request.state,
      },
    };
  }

  // PKCE: code_challenge is required
  if (!request.code_challenge) {
    return {
      valid: false,
      error: {
        error: 'invalid_request',
        error_description: 'code_challenge is required (PKCE)',
        state: request.state,
      },
    };
  }

  // PKCE: code_challenge_method is required
  if (!request.code_challenge_method) {
    return {
      valid: false,
      error: {
        error: 'invalid_request',
        error_description: 'code_challenge_method is required (PKCE)',
        state: request.state,
      },
    };
  }

  // PKCE: Validate code_challenge_method
  if (!isValidCodeChallengeMethod(request.code_challenge_method)) {
    return {
      valid: false,
      error: {
        error: 'invalid_request',
        error_description: 'code_challenge_method must be "S256" or "plain"',
        state: request.state,
      },
    };
  }

  // PKCE: Validate code_challenge format
  if (!isValidCodeChallenge(request.code_challenge, request.code_challenge_method as any)) {
    return {
      valid: false,
      error: {
        error: 'invalid_request',
        error_description: 'Invalid code_challenge format',
        state: request.state,
      },
    };
  }

  return { valid: true };
}

/**
 * Generate authorization code
 */
export async function generateAuthorizationCode(
  request: AuthorizationRequest,
  userId?: string
): Promise<AuthorizationResponse> {
  // Validate request
  const validation = await validateAuthorizationRequest(request);
  if (!validation.valid) {
    throw new Error(validation.error!.error_description || validation.error!.error);
  }

  // Generate authorization code
  const code = generateToken(32);
  const expiresAt = new Date(Date.now() + OAUTH_AUTHORIZATION_CODE_TTL * 1000);

  // Store authorization code
  await oauthStorage.createAuthorizationCode({
    code,
    client_id: request.client_id,
    user_id: userId,
    code_challenge: request.code_challenge,
    code_challenge_method: request.code_challenge_method,
    redirect_uri: request.redirect_uri,
    scope: request.scope,
    expires_at: expiresAt,
  });

  return {
    code,
    state: request.state,
  };
}

/**
 * Build redirect URL with authorization code
 */
export function buildAuthorizationRedirect(
  redirectUri: string,
  response: AuthorizationResponse
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('code', response.code);
  if (response.state) {
    url.searchParams.set('state', response.state);
  }
  return url.toString();
}

/**
 * Build redirect URL with error
 */
export function buildErrorRedirect(redirectUri: string, error: AuthorizationError): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error.error);
  if (error.error_description) {
    url.searchParams.set('error_description', error.error_description);
  }
  if (error.state) {
    url.searchParams.set('state', error.state);
  }
  return url.toString();
}

/**
 * Parse authorization request from URL parameters
 */
export function parseAuthorizationRequest(params: URLSearchParams): AuthorizationRequest {
  return {
    response_type: params.get('response_type') || '',
    client_id: params.get('client_id') || '',
    redirect_uri: params.get('redirect_uri') || '',
    scope: params.get('scope') || undefined,
    state: params.get('state') || undefined,
    code_challenge: params.get('code_challenge') || '',
    code_challenge_method: params.get('code_challenge_method') || '',
  };
}
