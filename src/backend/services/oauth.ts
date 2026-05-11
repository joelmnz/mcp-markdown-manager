import { Buffer } from 'buffer';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { TokenScope } from './accessTokens.js';

export type OAuthRole = 'admin' | 'editor' | 'reader';

export interface OAuthAuthContext {
  authType: 'oauth';
  scope: TokenScope;
  role: OAuthRole;
  principalId: string;
  principalName: string;
  folderRegex?: string;
  groups?: string[];
}

interface OidcDiscoveryMetadata {
  issuer: string;
  jwks_uri?: string;
  introspection_endpoint?: string;
}

interface OAuthConfig {
  enabled: boolean;
  issuerUrl: string;
  audience?: string;
  clientId?: string;
  clientSecret?: string;
  requiredScopes: string[];
  usernameClaim: string;
  emailClaim: string;
  groupsClaim: string;
  defaultRole: OAuthRole;
  defaultFolderRegex?: string;
}

let discoveryCache: OidcDiscoveryMetadata | null = null;
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUriCache: string | null = null;

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

function parseRequiredScopes(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

function parseRole(value: string | undefined): OAuthRole {
  if (value === 'admin' || value === 'editor' || value === 'reader') {
    return value;
  }
  return 'editor';
}

function getConfig(): OAuthConfig {
  return {
    enabled: parseBoolean(process.env.OAUTH_ENABLED),
    issuerUrl: normalizeUrl(process.env.OAUTH_ISSUER_URL || ''),
    audience: process.env.OAUTH_AUDIENCE?.trim() || undefined,
    clientId: process.env.OAUTH_CLIENT_ID?.trim() || undefined,
    clientSecret: process.env.OAUTH_CLIENT_SECRET?.trim() || undefined,
    requiredScopes: parseRequiredScopes(process.env.OAUTH_REQUIRED_SCOPES),
    usernameClaim: process.env.OAUTH_USERNAME_CLAIM || 'preferred_username',
    emailClaim: process.env.OAUTH_EMAIL_CLAIM || 'email',
    groupsClaim: process.env.OAUTH_GROUPS_CLAIM || 'groups',
    defaultRole: parseRole(process.env.OAUTH_DEFAULT_ROLE),
    defaultFolderRegex: process.env.OAUTH_DEFAULT_FOLDER_REGEX?.trim() || undefined,
  };
}

function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

function getClaimString(payload: JWTPayload | Record<string, unknown>, claimName: string): string | undefined {
  const value = payload[claimName];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getClaimStringArray(payload: JWTPayload | Record<string, unknown>, claimName: string): string[] | undefined {
  const value = payload[claimName];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[\s,]+/).filter(Boolean);
  }
  return undefined;
}

function getTokenScopes(payload: JWTPayload | Record<string, unknown>): string[] {
  const scope = getClaimString(payload, 'scope');
  if (scope) return scope.split(/[\s,]+/).filter(Boolean);

  const scp = getClaimStringArray(payload, 'scp');
  return scp || [];
}

function hasRequiredScopes(payload: JWTPayload | Record<string, unknown>, requiredScopes: string[]): boolean {
  if (requiredScopes.length === 0) return true;
  const tokenScopes = new Set(getTokenScopes(payload));
  return requiredScopes.every(scope => tokenScopes.has(scope));
}

function roleToScope(role: OAuthRole): TokenScope {
  return role === 'reader' ? 'read-only' : 'write';
}

function getPrincipalName(payload: JWTPayload | Record<string, unknown>, config: OAuthConfig): string {
  return (
    getClaimString(payload, config.usernameClaim) ||
    getClaimString(payload, config.emailClaim) ||
    getClaimString(payload, 'client_id') ||
    getClaimString(payload, 'sub') ||
    'oauth-user'
  );
}

function validateFolderRegex(folderRegex: string | undefined): string | undefined {
  if (!folderRegex) return undefined;
  try {
    new RegExp(folderRegex);
    return folderRegex;
  } catch (error) {
    console.warn(`Ignoring invalid OAUTH_DEFAULT_FOLDER_REGEX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return undefined;
  }
}

function buildAuthContext(payload: JWTPayload | Record<string, unknown>, config: OAuthConfig): OAuthAuthContext | null {
  if (!hasRequiredScopes(payload, config.requiredScopes)) {
    return null;
  }

  const principalId = getClaimString(payload, 'sub') || getClaimString(payload, 'client_id') || getPrincipalName(payload, config);
  const principalName = getPrincipalName(payload, config);

  return {
    authType: 'oauth',
    scope: roleToScope(config.defaultRole),
    role: config.defaultRole,
    principalId,
    principalName,
    folderRegex: validateFolderRegex(config.defaultFolderRegex),
    groups: getClaimStringArray(payload, config.groupsClaim),
  };
}

async function getDiscoveryMetadata(config: OAuthConfig): Promise<OidcDiscoveryMetadata | null> {
  if (!config.issuerUrl) return null;
  if (discoveryCache) return discoveryCache;

  const response = await fetch(`${config.issuerUrl}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`OIDC discovery failed with status ${response.status}`);
  }

  const metadata = await response.json() as OidcDiscoveryMetadata;
  const metadataIssuer = normalizeUrl(metadata.issuer);
  if (metadataIssuer !== config.issuerUrl) {
    throw new Error(`OIDC issuer mismatch: expected ${config.issuerUrl}, got ${metadataIssuer}`);
  }

  discoveryCache = metadata;
  return discoveryCache;
}

async function validateJwtAccessToken(token: string, config: OAuthConfig, metadata: OidcDiscoveryMetadata): Promise<OAuthAuthContext | null> {
  if (!metadata.jwks_uri) return null;

  if (!jwksCache || jwksUriCache !== metadata.jwks_uri) {
    jwksCache = createRemoteJWKSet(new URL(metadata.jwks_uri));
    jwksUriCache = metadata.jwks_uri;
  }

  const verifyOptions = config.audience
    ? { issuer: config.issuerUrl, audience: config.audience }
    : { issuer: config.issuerUrl };
  const { payload } = await jwtVerify(token, jwksCache, verifyOptions);
  return buildAuthContext(payload, config);
}

function getIntrospectionHeaders(config: OAuthConfig): Headers {
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });

  if (config.clientId && config.clientSecret) {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers.set('Authorization', `Basic ${credentials}`);
  }

  return headers;
}

async function validateOpaqueAccessToken(token: string, config: OAuthConfig, metadata: OidcDiscoveryMetadata): Promise<OAuthAuthContext | null> {
  if (!metadata.introspection_endpoint) return null;

  const body = new URLSearchParams({ token });
  if (config.clientId && !config.clientSecret) {
    body.set('client_id', config.clientId);
  }

  const response = await fetch(metadata.introspection_endpoint, {
    method: 'POST',
    headers: getIntrospectionHeaders(config),
    body,
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as Record<string, unknown>;
  if (payload.active !== true) {
    return null;
  }

  const issuer = getClaimString(payload, 'iss');
  if (issuer && issuer !== config.issuerUrl) {
    return null;
  }

  if (config.audience) {
    const audiences = getClaimStringArray(payload, 'aud');
    if (audiences && audiences.length > 0 && !audiences.includes(config.audience)) {
      return null;
    }
  }

  return buildAuthContext(payload, config);
}

export async function authenticateOAuthToken(token: string): Promise<OAuthAuthContext | null> {
  const config = getConfig();
  if (!config.enabled || !config.issuerUrl) {
    return null;
  }

  try {
    const metadata = await getDiscoveryMetadata(config);
    if (!metadata) return null;

    if (isJwt(token)) {
      const jwtContext = await validateJwtAccessToken(token, config, metadata);
      if (jwtContext) return jwtContext;
    }

    return await validateOpaqueAccessToken(token, config, metadata);
  } catch (error) {
    console.warn('OAuth token validation failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
