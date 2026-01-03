import { database } from './database.js';
import { randomBytes } from 'crypto';
import { DatabaseServiceError, DatabaseErrorType } from './databaseErrors.js';

export type TokenScope = 'read-only' | 'write';

export interface AccessToken {
  id: number;
  token: string;
  name: string;
  scope: TokenScope;
  created_at: Date;
  last_used_at: Date | null;
}

export interface AccessTokenInfo {
  id: number;
  name: string;
  scope: TokenScope;
  created_at: Date;
  last_used_at: Date | null;
  masked_token: string;
}

export interface TokenValidationResult {
  valid: boolean;
  scope?: TokenScope;
  tokenId?: number;
}

/**
 * Generate a new access token with the sk-md- prefix
 */
function generateAccessToken(): string {
  // Generate 32 cryptographically secure random bytes
  const randomHex = randomBytes(32).toString('hex'); // 64 hex characters
  return `sk-md-${randomHex}`;
}

/**
 * Mask a token for display purposes
 * Format: sk-md-****...last4
 */
function maskToken(token: string): string {
  if (!token || token.length < 10) {
    return '****';
  }

  const last4 = token.slice(-4);
  return `sk-md-****...${last4}`;
}

/**
 * Create a new access token
 */
export async function createAccessToken(name: string, scope: TokenScope): Promise<AccessToken> {
  if (!name || !name.trim()) {
    throw new DatabaseServiceError(
      DatabaseErrorType.VALIDATION_ERROR,
      'Token name is required',
      'Please provide a name for the access token'
    );
  }

  if (scope !== 'read-only' && scope !== 'write') {
    throw new DatabaseServiceError(
      DatabaseErrorType.VALIDATION_ERROR,
      `Invalid scope: ${scope}`,
      'Scope must be either "read-only" or "write"'
    );
  }

  const token = generateAccessToken();

  try {
    const result = await database.query<AccessToken>(
      `INSERT INTO access_tokens (token, name, scope)
       VALUES ($1, $2, $3)
       RETURNING id, token, name, scope, created_at, last_used_at`,
      [token, name.trim(), scope]
    );

    if (result.rows.length === 0) {
      throw new DatabaseServiceError(
        DatabaseErrorType.UNKNOWN_ERROR,
        'Failed to create access token',
        'The token could not be created. Please try again.'
      );
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof DatabaseServiceError) {
      throw error;
    }
    throw new DatabaseServiceError(
      DatabaseErrorType.UNKNOWN_ERROR,
      `Failed to create access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Could not create the access token. Please try again.'
    );
  }
}

/**
 * List all access tokens (without exposing full tokens)
 */
export async function listAccessTokens(): Promise<AccessTokenInfo[]> {
  try {
    const result = await database.query<AccessToken>(
      `SELECT id, token, name, scope, created_at, last_used_at
       FROM access_tokens
       ORDER BY created_at DESC`
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      scope: row.scope,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      masked_token: maskToken(row.token),
    }));
  } catch (error) {
    throw new DatabaseServiceError(
      DatabaseErrorType.UNKNOWN_ERROR,
      `Failed to list access tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Could not retrieve access tokens. Please try again.'
    );
  }
}

/**
 * Get a specific access token by its token value (for showing full token)
 */
export async function getAccessToken(token: string): Promise<AccessToken | null> {
  try {
    const result = await database.query<AccessToken>(
      `SELECT id, token, name, scope, created_at, last_used_at
       FROM access_tokens
       WHERE token = $1`,
      [token]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    throw new DatabaseServiceError(
      DatabaseErrorType.UNKNOWN_ERROR,
      `Failed to get access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Could not retrieve the access token. Please try again.'
    );
  }
}

/**
 * Delete an access token by ID
 */
export async function deleteAccessTokenById(id: number): Promise<boolean> {
  try {
    const result = await database.query(
      `DELETE FROM access_tokens WHERE id = $1`,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    throw new DatabaseServiceError(
      DatabaseErrorType.UNKNOWN_ERROR,
      `Failed to delete access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Could not delete the access token. Please try again.'
    );
  }
}

/**
 * Delete an access token by token string
 */
export async function deleteAccessToken(token: string): Promise<boolean> {
  try {
    const result = await database.query(
      `DELETE FROM access_tokens WHERE token = $1`,
      [token]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    throw new DatabaseServiceError(
      DatabaseErrorType.UNKNOWN_ERROR,
      `Failed to delete access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Could not delete the access token. Please try again.'
    );
  }
}

/**
 * Validate an access token and return its scope
 */
export async function validateAccessToken(token: string): Promise<TokenValidationResult> {
  if (!token || !token.startsWith('sk-md-')) {
    return { valid: false };
  }

  try {
    const result = await database.query<AccessToken>(
      `SELECT id, scope, last_used_at
       FROM access_tokens
       WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return { valid: false };
    }

    const tokenData = result.rows[0];

    // Update last_used_at timestamp asynchronously (don't wait)
    database.query(
      `UPDATE access_tokens SET last_used_at = NOW() WHERE id = $1`,
      [tokenData.id]
    ).catch(err => {
      console.warn('Failed to update last_used_at for token:', err);
    });

    return {
      valid: true,
      scope: tokenData.scope,
      tokenId: tokenData.id,
    };
  } catch (error) {
    console.error('Token validation error:', error);
    return { valid: false };
  }
}

/**
 * Check if a scope has sufficient permissions for a required scope
 * read-only can only access read operations
 * write can access both read and write operations
 */
export function hasPermission(tokenScope: TokenScope, requiredScope: TokenScope): boolean {
  if (requiredScope === 'read-only') {
    // Both read-only and write scopes can perform read operations
    return true;
  }

  if (requiredScope === 'write') {
    // Only write scope can perform write operations
    return tokenScope === 'write';
  }

  return false;
}
