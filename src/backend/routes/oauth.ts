import { registerClient, getClientInfo, deleteClient, type ClientRegistrationRequest } from '../oauth/dcr.js';
import {
  parseAuthorizationRequest,
  validateAuthorizationRequest,
  generateAuthorizationCode,
  buildAuthorizationRedirect,
  buildErrorRedirect,
} from '../oauth/authorization.js';
import { processTokenRequest, revokeToken } from '../oauth/token-endpoint.js';
import { basePathService } from '../services/basePath.js';

/**
 * OAuth 2.0 route handlers
 */

const OAUTH_ENABLED = process.env.OAUTH_ENABLED?.toLowerCase() === 'true';

/**
 * Check if OAuth is enabled
 */
function checkOAuthEnabled(): Response | null {
  if (!OAUTH_ENABLED) {
    return new Response(
      JSON.stringify({
        error: 'OAuth is not enabled',
        message: 'Set OAUTH_ENABLED=true in environment variables',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  return null;
}

/**
 * POST /oauth/register - Dynamic Client Registration (RFC 7591)
 */
export async function handleRegisterRequest(request: Request): Promise<Response> {
  const enabledCheck = checkOAuthEnabled();
  if (enabledCheck) return enabledCheck;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json() as ClientRegistrationRequest;
    const response = await registerClient(body);

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'invalid_client_metadata',
        error_description: error instanceof Error ? error.message : 'Registration failed',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /oauth/authorize - Authorization endpoint
 */
export async function handleAuthorizeRequest(request: Request): Promise<Response> {
  const enabledCheck = checkOAuthEnabled();
  if (enabledCheck) return enabledCheck;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const authRequest = parseAuthorizationRequest(url.searchParams);

    // Validate authorization request
    const validation = await validateAuthorizationRequest(authRequest);
    if (!validation.valid) {
      const error = validation.error!;

      // If we have a valid redirect_uri, redirect with error
      if (authRequest.redirect_uri) {
        const redirectUrl = buildErrorRedirect(authRequest.redirect_uri, error);
        return Response.redirect(redirectUrl, 302);
      }

      // Otherwise return error directly
      return new Response(
        JSON.stringify({
          error: error.error,
          error_description: error.error_description,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Build consent page URL with query parameters
    const basePath = basePathService.getConfig().normalizedPath;
    const consentUrl = new URL(`${basePath}/oauth/consent`, request.url);
    consentUrl.searchParams.set('response_type', authRequest.response_type);
    consentUrl.searchParams.set('client_id', authRequest.client_id);
    consentUrl.searchParams.set('redirect_uri', authRequest.redirect_uri);
    consentUrl.searchParams.set('code_challenge', authRequest.code_challenge);
    consentUrl.searchParams.set('code_challenge_method', authRequest.code_challenge_method);
    if (authRequest.scope) consentUrl.searchParams.set('scope', authRequest.scope);
    if (authRequest.state) consentUrl.searchParams.set('state', authRequest.state);

    // Redirect to consent page
    return Response.redirect(consentUrl.toString(), 302);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'server_error',
        error_description: error instanceof Error ? error.message : 'Authorization failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * POST /oauth/authorize/approve - Approve authorization (from consent page)
 */
export async function handleAuthorizeApprove(request: Request): Promise<Response> {
  const enabledCheck = checkOAuthEnabled();
  if (enabledCheck) return enabledCheck;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await request.formData();
    const authRequest = parseAuthorizationRequest(formData as any);

    // For single-user system, use default user ID
    const userId = 'default-user';

    // Generate authorization code
    const response = await generateAuthorizationCode(authRequest, userId);

    // Redirect back to client with code
    const redirectUrl = buildAuthorizationRedirect(authRequest.redirect_uri, response);
    return Response.redirect(redirectUrl, 302);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'server_error',
        error_description: error instanceof Error ? error.message : 'Authorization failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * POST /oauth/token - Token endpoint
 */
export async function handleTokenRequest(request: Request): Promise<Response> {
  const enabledCheck = checkOAuthEnabled();
  if (enabledCheck) return enabledCheck;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          error_description: 'Content-Type must be application/x-www-form-urlencoded',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const body = await request.text();
    const params = new URLSearchParams(body);

    const result = await processTokenRequest(request, params);

    // Check if it's an error response
    if ('error' in result) {
      return new Response(JSON.stringify(result), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Success response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'server_error',
        error_description: error instanceof Error ? error.message : 'Token request failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * POST /oauth/revoke - Token revocation (RFC 7009)
 */
export async function handleRevokeRequest(request: Request): Promise<Response> {
  const enabledCheck = checkOAuthEnabled();
  if (enabledCheck) return enabledCheck;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.text();
    const params = new URLSearchParams(body);

    const token = params.get('token');
    if (!token) {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          error_description: 'token parameter is required',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const tokenTypeHint = params.get('token_type_hint') || undefined;

    await revokeToken(token, tokenTypeHint);

    // RFC 7009: Always return 200 for revocation requests
    return new Response('', { status: 200 });
  } catch (error) {
    // RFC 7009: Even on error, return 200 to prevent token scanning
    return new Response('', { status: 200 });
  }
}

/**
 * OAuth router - dispatch to appropriate handler
 */
export async function handleOAuthRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = basePathService.stripBasePath(url.pathname);

  // Route to appropriate handler
  if (path === '/oauth/register') {
    return handleRegisterRequest(request);
  }

  if (path === '/oauth/authorize') {
    return handleAuthorizeRequest(request);
  }

  if (path === '/oauth/authorize/approve') {
    return handleAuthorizeApprove(request);
  }

  if (path === '/oauth/token') {
    return handleTokenRequest(request);
  }

  if (path === '/oauth/revoke') {
    return handleRevokeRequest(request);
  }

  // Unknown OAuth endpoint
  return new Response('Not Found', { status: 404 });
}
