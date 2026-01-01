import { oauthStorage, generateToken, hashToken } from './storage.js';

/**
 * Dynamic Client Registration (DCR) implementation
 * RFC 7591: https://tools.ietf.org/html/rfc7591
 */

/**
 * Client metadata for registration request
 */
export interface ClientRegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
}

/**
 * Client registration response
 */
export interface ClientRegistrationResponse {
  client_id: string;
  client_secret: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
}

/**
 * Validate redirect URI format
 */
function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // Must be HTTPS in production (or localhost for development)
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        return false;
      }
    }
    // No fragments allowed
    if (url.hash) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate client registration request
 */
export function validateRegistrationRequest(request: ClientRegistrationRequest): { valid: boolean; error?: string } {
  // redirect_uris is required and must be an array
  if (!request.redirect_uris || !Array.isArray(request.redirect_uris) || request.redirect_uris.length === 0) {
    return { valid: false, error: 'redirect_uris is required and must be a non-empty array' };
  }

  // Validate each redirect URI
  for (const uri of request.redirect_uris) {
    if (!isValidRedirectUri(uri)) {
      return { valid: false, error: `Invalid redirect_uri: ${uri}` };
    }
  }

  // Validate grant_types if provided
  if (request.grant_types) {
    const validGrantTypes = ['authorization_code', 'refresh_token'];
    for (const grantType of request.grant_types) {
      if (!validGrantTypes.includes(grantType)) {
        return { valid: false, error: `Invalid grant_type: ${grantType}` };
      }
    }
  }

  // Validate response_types if provided
  if (request.response_types) {
    const validResponseTypes = ['code'];
    for (const responseType of request.response_types) {
      if (!validResponseTypes.includes(responseType)) {
        return { valid: false, error: `Invalid response_type: ${responseType}` };
      }
    }
  }

  // Validate token_endpoint_auth_method if provided
  if (request.token_endpoint_auth_method) {
    const validAuthMethods = ['client_secret_basic', 'client_secret_post', 'none'];
    if (!validAuthMethods.includes(request.token_endpoint_auth_method)) {
      return { valid: false, error: `Invalid token_endpoint_auth_method: ${request.token_endpoint_auth_method}` };
    }
  }

  return { valid: true };
}

/**
 * Register a new OAuth client
 */
export async function registerClient(request: ClientRegistrationRequest): Promise<ClientRegistrationResponse> {
  // Validate request
  const validation = validateRegistrationRequest(request);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Generate client credentials
  const clientId = generateToken(16); // 16 bytes = 22 chars base64url
  const clientSecret = generateToken(32); // 32 bytes = 43 chars base64url
  const clientSecretHash = hashToken(clientSecret);

  // Set defaults
  const grantTypes = request.grant_types || ['authorization_code', 'refresh_token'];
  const responseTypes = request.response_types || ['code'];
  const tokenEndpointAuthMethod = request.token_endpoint_auth_method || 'client_secret_basic';

  // Store client in database
  const client = await oauthStorage.createClient({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: request.client_name,
    redirect_uris: request.redirect_uris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    scope: request.scope,
  });

  // Build response
  const now = Math.floor(Date.now() / 1000);
  const response: ClientRegistrationResponse = {
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: now,
    client_secret_expires_at: 0, // 0 means it doesn't expire
    client_name: request.client_name,
    redirect_uris: request.redirect_uris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    scope: request.scope,
  };

  return response;
}

/**
 * Get client information (for introspection)
 */
export async function getClientInfo(clientId: string): Promise<ClientRegistrationResponse | null> {
  const client = await oauthStorage.getClient(clientId);
  if (!client) {
    return null;
  }

  const response: ClientRegistrationResponse = {
    client_id: client.client_id,
    client_secret: '[REDACTED]', // Never return the actual secret
    client_id_issued_at: Math.floor(client.created_at.getTime() / 1000),
    client_secret_expires_at: 0,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types: client.grant_types,
    response_types: client.response_types,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    scope: client.scope,
  };

  return response;
}

/**
 * Delete a registered client
 */
export async function deleteClient(clientId: string): Promise<boolean> {
  return await oauthStorage.deleteClient(clientId);
}
