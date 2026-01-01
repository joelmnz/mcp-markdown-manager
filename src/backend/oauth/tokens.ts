import { createHmac, randomBytes } from 'crypto';
import { oauthStorage, generateToken, hashToken } from './storage.js';
import { parseEnvInt } from '../utils/config.js';

/**
 * OAuth token configuration
 */
const OAUTH_ISSUER = process.env.OAUTH_ISSUER || 'http://localhost:5000';
const OAUTH_ACCESS_TOKEN_TTL = parseEnvInt(process.env.OAUTH_ACCESS_TOKEN_TTL, 3600, 'OAUTH_ACCESS_TOKEN_TTL'); // 1 hour
const OAUTH_REFRESH_TOKEN_TTL = parseEnvInt(process.env.OAUTH_REFRESH_TOKEN_TTL, 2592000, 'OAUTH_REFRESH_TOKEN_TTL'); // 30 days
const OAUTH_JWT_SECRET = process.env.OAUTH_JWT_SECRET || '';

if (!OAUTH_JWT_SECRET && process.env.OAUTH_ENABLED?.toLowerCase() === 'true') {
  console.warn('⚠️  OAUTH_JWT_SECRET not set. Using fallback (insecure for production!)');
}

/**
 * JWT header
 */
interface JWTHeader {
  alg: string;
  typ: string;
}

/**
 * JWT payload for access tokens
 */
export interface AccessTokenPayload {
  iss: string;          // Issuer
  sub?: string;         // Subject (user_id)
  aud: string;          // Audience (client_id)
  exp: number;          // Expiration time (Unix timestamp)
  iat: number;          // Issued at (Unix timestamp)
  scope?: string;       // Scopes
  jti: string;          // JWT ID (token identifier)
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: AccessTokenPayload;
  error?: string;
}

/**
 * Base64URL encoding
 */
function base64UrlEncode(str: string | Buffer): string {
  const base64 = Buffer.from(str).toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL decoding
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Create HMAC signature for JWT
 */
function createSignature(data: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return base64UrlEncode(hmac.digest());
}

/**
 * Generate a JWT access token
 */
export function generateJWT(payload: AccessTokenPayload, secret: string = OAUTH_JWT_SECRET): string {
  const header: JWTHeader = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode a JWT access token
 */
export function verifyJWT(token: string, secret: string = OAUTH_JWT_SECRET): TokenValidationResult {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const expectedSignature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);
    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode and validate payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AccessTokenPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    // Check issuer
    if (payload.iss !== OAUTH_ISSUER) {
      return { valid: false, error: 'Invalid issuer' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid token' };
  }
}

/**
 * OAuth token service for creating and validating tokens
 */
export class OAuthTokenService {
  /**
   * Create an access token
   */
  async createAccessToken(
    clientId: string,
    userId?: string,
    scope?: string
  ): Promise<{ token: string; expiresIn: number }> {
    const jti = generateToken(16); // JWT ID
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((now + OAUTH_ACCESS_TOKEN_TTL) * 1000);

    const payload: AccessTokenPayload = {
      iss: OAUTH_ISSUER,
      sub: userId,
      aud: clientId,
      exp: now + OAUTH_ACCESS_TOKEN_TTL,
      iat: now,
      scope,
      jti,
    };

    const token = generateJWT(payload);
    const tokenHash = hashToken(token);

    // Store token in database
    await oauthStorage.createAccessToken({
      token_hash: tokenHash,
      client_id: clientId,
      user_id: userId,
      scope,
      expires_at: expiresAt,
    });

    return { token, expiresIn: OAUTH_ACCESS_TOKEN_TTL };
  }

  /**
   * Create a refresh token
   */
  async createRefreshToken(
    clientId: string,
    accessTokenHash: string,
    userId?: string,
    scope?: string
  ): Promise<{ token: string; expiresIn: number }> {
    const token = generateToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + OAUTH_REFRESH_TOKEN_TTL * 1000);

    await oauthStorage.createRefreshToken({
      token_hash: tokenHash,
      access_token_hash: accessTokenHash,
      client_id: clientId,
      user_id: userId,
      scope,
      expires_at: expiresAt,
    });

    return { token, expiresIn: OAUTH_REFRESH_TOKEN_TTL };
  }

  /**
   * Validate an access token
   */
  async validateAccessToken(token: string): Promise<TokenValidationResult> {
    // First verify JWT signature and expiration
    const jwtResult = verifyJWT(token);
    if (!jwtResult.valid) {
      return jwtResult;
    }

    // Check if token exists in database and hasn't been revoked
    const tokenHash = hashToken(token);
    const storedToken = await oauthStorage.getAccessToken(tokenHash);

    if (!storedToken) {
      return { valid: false, error: 'Token not found or revoked' };
    }

    return { valid: true, payload: jwtResult.payload };
  }

  /**
   * Revoke an access token
   */
  async revokeAccessToken(token: string): Promise<boolean> {
    const tokenHash = hashToken(token);
    return await oauthStorage.revokeAccessToken(tokenHash);
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
    const tokenHash = hashToken(refreshToken);
    const storedRefreshToken = await oauthStorage.getRefreshToken(tokenHash);

    if (!storedRefreshToken) {
      return null;
    }

    // Revoke old refresh token (token rotation)
    await oauthStorage.revokeRefreshToken(tokenHash);

    // Create new access token
    const { token: accessToken, expiresIn } = await this.createAccessToken(
      storedRefreshToken.client_id,
      storedRefreshToken.user_id,
      storedRefreshToken.scope
    );

    // Create new refresh token
    const accessTokenHash = hashToken(accessToken);
    const { token: newRefreshToken } = await this.createRefreshToken(
      storedRefreshToken.client_id,
      accessTokenHash,
      storedRefreshToken.user_id,
      storedRefreshToken.scope
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
    };
  }

  /**
   * Revoke a refresh token
   */
  async revokeRefreshToken(token: string): Promise<boolean> {
    const tokenHash = hashToken(token);
    return await oauthStorage.revokeRefreshToken(tokenHash);
  }
}

// Export singleton instance
export const oauthTokenService = new OAuthTokenService();
