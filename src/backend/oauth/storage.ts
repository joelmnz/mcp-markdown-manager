import { database } from '../services/database.js';
import { createHash, randomBytes } from 'crypto';

/**
 * OAuth client information
 */
export interface OAuthClient {
  client_id: string;
  client_secret_hash: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * OAuth authorization code
 */
export interface OAuthAuthorizationCode {
  code: string;
  client_id: string;
  user_id?: string;
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  scope?: string;
  expires_at: Date;
  created_at: Date;
  used_at?: Date;
}

/**
 * OAuth access token
 */
export interface OAuthAccessToken {
  token_hash: string;
  client_id: string;
  user_id?: string;
  scope?: string;
  expires_at: Date;
  created_at: Date;
  revoked_at?: Date;
}

/**
 * OAuth refresh token
 */
export interface OAuthRefreshToken {
  token_hash: string;
  access_token_hash?: string;
  client_id: string;
  user_id?: string;
  scope?: string;
  expires_at: Date;
  created_at: Date;
  revoked_at?: Date;
}

/**
 * Hash a token or secret using SHA-256
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically secure random token
 */
export function generateToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * OAuth storage service for managing clients, codes, and tokens
 */
export class OAuthStorageService {
  /**
   * Create a new OAuth client
   */
  async createClient(client: Omit<OAuthClient, 'created_at' | 'updated_at'>): Promise<OAuthClient> {
    const result = await database.query(
      `INSERT INTO oauth_clients (
        client_id, client_secret_hash, client_name, redirect_uris,
        grant_types, response_types, token_endpoint_auth_method, scope
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        client.client_id,
        client.client_secret_hash,
        client.client_name,
        client.redirect_uris,
        client.grant_types,
        client.response_types,
        client.token_endpoint_auth_method,
        client.scope,
      ]
    );
    return result.rows[0];
  }

  /**
   * Get OAuth client by client_id
   */
  async getClient(clientId: string): Promise<OAuthClient | null> {
    const result = await database.query(
      'SELECT * FROM oauth_clients WHERE client_id = $1',
      [clientId]
    );
    return result.rows[0] || null;
  }

  /**
   * Verify client secret
   */
  async verifyClientSecret(clientId: string, clientSecret: string): Promise<boolean> {
    const client = await this.getClient(clientId);
    if (!client) return false;

    const secretHash = hashToken(clientSecret);
    return client.client_secret_hash === secretHash;
  }

  /**
   * Delete OAuth client
   */
  async deleteClient(clientId: string): Promise<boolean> {
    const result = await database.query(
      'DELETE FROM oauth_clients WHERE client_id = $1',
      [clientId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Create authorization code
   */
  async createAuthorizationCode(code: Omit<OAuthAuthorizationCode, 'created_at'>): Promise<OAuthAuthorizationCode> {
    const result = await database.query(
      `INSERT INTO oauth_authorization_codes (
        code, client_id, user_id, code_challenge, code_challenge_method,
        redirect_uri, scope, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        code.code,
        code.client_id,
        code.user_id,
        code.code_challenge,
        code.code_challenge_method,
        code.redirect_uri,
        code.scope,
        code.expires_at,
      ]
    );
    return result.rows[0];
  }

  /**
   * Get and consume authorization code (mark as used)
   */
  async consumeAuthorizationCode(code: string): Promise<OAuthAuthorizationCode | null> {
    const result = await database.query(
      `UPDATE oauth_authorization_codes
       SET used_at = NOW()
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING *`,
      [code]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete expired authorization codes
   */
  async deleteExpiredAuthorizationCodes(): Promise<number> {
    const result = await database.query(
      'DELETE FROM oauth_authorization_codes WHERE expires_at < NOW()'
    );
    return result.rowCount ?? 0;
  }

  /**
   * Create access token
   */
  async createAccessToken(token: Omit<OAuthAccessToken, 'created_at'>): Promise<OAuthAccessToken> {
    const result = await database.query(
      `INSERT INTO oauth_access_tokens (
        token_hash, client_id, user_id, scope, expires_at
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        token.token_hash,
        token.client_id,
        token.user_id,
        token.scope,
        token.expires_at,
      ]
    );
    return result.rows[0];
  }

  /**
   * Get access token by hash
   */
  async getAccessToken(tokenHash: string): Promise<OAuthAccessToken | null> {
    const result = await database.query(
      `SELECT * FROM oauth_access_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    return result.rows[0] || null;
  }

  /**
   * Revoke access token
   */
  async revokeAccessToken(tokenHash: string): Promise<boolean> {
    const result = await database.query(
      `UPDATE oauth_access_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete expired access tokens
   */
  async deleteExpiredAccessTokens(): Promise<number> {
    const result = await database.query(
      'DELETE FROM oauth_access_tokens WHERE expires_at < NOW()'
    );
    return result.rowCount ?? 0;
  }

  /**
   * Create refresh token
   */
  async createRefreshToken(token: Omit<OAuthRefreshToken, 'created_at'>): Promise<OAuthRefreshToken> {
    const result = await database.query(
      `INSERT INTO oauth_refresh_tokens (
        token_hash, access_token_hash, client_id, user_id, scope, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        token.token_hash,
        token.access_token_hash,
        token.client_id,
        token.user_id,
        token.scope,
        token.expires_at,
      ]
    );
    return result.rows[0];
  }

  /**
   * Get refresh token by hash
   */
  async getRefreshToken(tokenHash: string): Promise<OAuthRefreshToken | null> {
    const result = await database.query(
      `SELECT * FROM oauth_refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    return result.rows[0] || null;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tokenHash: string): Promise<boolean> {
    const result = await database.query(
      `UPDATE oauth_refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete expired refresh tokens
   */
  async deleteExpiredRefreshTokens(): Promise<number> {
    const result = await database.query(
      'DELETE FROM oauth_refresh_tokens WHERE expires_at < NOW()'
    );
    return result.rowCount ?? 0;
  }

  /**
   * Clean up all expired tokens and codes
   */
  async cleanupExpired(): Promise<{ codes: number; accessTokens: number; refreshTokens: number }> {
    const codes = await this.deleteExpiredAuthorizationCodes();
    const accessTokens = await this.deleteExpiredAccessTokens();
    const refreshTokens = await this.deleteExpiredRefreshTokens();

    return { codes, accessTokens, refreshTokens };
  }
}

// Export singleton instance
export const oauthStorage = new OAuthStorageService();
