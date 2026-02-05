import { database } from './database.js';
import { randomBytes } from 'crypto';
import { DatabaseServiceError, DatabaseErrorType } from './databaseErrors.js';

export type TokenScope = 'read-only' | 'write';

export interface AccessToken {
  id: number;
  token: string;
  name: string;
  scope: TokenScope;
  folder_filter: string | null;
  created_at: Date;
  last_used_at: Date | null;
}

export interface AccessTokenInfo {
  id: number;
  name: string;
  scope: TokenScope;
  folder_filter: string | null;
  created_at: Date;
  last_used_at: Date | null;
  masked_token: string;
}

export interface TokenValidationResult {
  valid: boolean;
  scope?: TokenScope;
  tokenId?: number;
  folderFilter?: string | null;
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
 * Normalize and validate folder filter
 * Returns normalized filter or null for no filter
 * Empty string "" means no filter (access to all folders)
 * 
 * Note: This function ensures that whitespace-only filters are treated
 * as "no filter" by trimming and checking for empty strings.
 * The root folder "/" is also normalized to null (no filter).
 */
function normalizeFolderFilter(folderFilter?: string | null): string | null {
  // Handle null, undefined, or empty string - all mean "no filter"
  if (!folderFilter || folderFilter.trim() === '') {
    return null;
  }

  // Trim and normalize the filter
  let normalized = folderFilter.trim();
  
  // Remove leading/trailing slashes
  normalized = normalized.replace(/^\/+|\/+$/g, '');
  
  // If empty after normalization (e.g., was "/"), return null
  if (normalized === '') {
    return null;
  }
  
  // Convert to lowercase for case-insensitive matching
  normalized = normalized.toLowerCase();
  
  return normalized;
}

/**
 * Validate folder filter format
 * Throws if the format is invalid
 */
function validateFolderFilterFormat(folderFilter: string | null): void {
  if (!folderFilter) {
    return; // null/empty is valid (means no filter)
  }
  
  // Check for invalid characters (only allow alphanumeric, -, _, /, and *)
  if (!/^[a-z0-9\-_\/*\s]+$/i.test(folderFilter)) {
    throw new DatabaseServiceError(
      DatabaseErrorType.VALIDATION_ERROR,
      'Invalid folder filter format',
      'Folder filter can only contain letters, numbers, hyphens, underscores, forward slashes, spaces, and asterisks (*)'
    );
  }
  
  // Check for invalid patterns like multiple consecutive slashes
  if (/\/\/+/.test(folderFilter)) {
    throw new DatabaseServiceError(
      DatabaseErrorType.VALIDATION_ERROR,
      'Invalid folder filter format',
      'Folder filter cannot contain consecutive forward slashes'
    );
  }
}

/**
 * Create a new access token
 */
export async function createAccessToken(name: string, scope: TokenScope, folderFilter?: string | null): Promise<AccessToken> {
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

  // Normalize and validate folder filter
  const normalizedFilter = normalizeFolderFilter(folderFilter);
  validateFolderFilterFormat(normalizedFilter);

  const token = generateAccessToken();

  try {
    const result = await database.query<AccessToken>(
      `INSERT INTO access_tokens (token, name, scope, folder_filter)
       VALUES ($1, $2, $3, $4)
       RETURNING id, token, name, scope, folder_filter, created_at, last_used_at`,
      [token, name.trim(), scope, normalizedFilter]
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
      `SELECT id, token, name, scope, folder_filter, created_at, last_used_at
       FROM access_tokens
       ORDER BY created_at DESC`
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      scope: row.scope,
      folder_filter: row.folder_filter,
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
      `SELECT id, token, name, scope, folder_filter, created_at, last_used_at
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
 * Update an access token's folder filter
 */
export async function updateAccessTokenFolderFilter(id: number, folderFilter: string | null): Promise<AccessToken> {
  // Normalize and validate folder filter
  const normalizedFilter = normalizeFolderFilter(folderFilter);
  validateFolderFilterFormat(normalizedFilter);

  try {
    const result = await database.query<AccessToken>(
      `UPDATE access_tokens 
       SET folder_filter = $1
       WHERE id = $2
       RETURNING id, token, name, scope, folder_filter, created_at, last_used_at`,
      [normalizedFilter, id]
    );

    if (result.rows.length === 0) {
      throw new DatabaseServiceError(
        DatabaseErrorType.NOT_FOUND,
        'Access token not found',
        'The specified access token does not exist'
      );
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof DatabaseServiceError) {
      throw error;
    }
    throw new DatabaseServiceError(
      DatabaseErrorType.UNKNOWN_ERROR,
      `Failed to update access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'Could not update the access token. Please try again.'
    );
  }
}

/**
 * Get token name by ID (for tracking purposes)
 */
export async function getTokenNameById(tokenId: number): Promise<string | null> {
  try {
    const result = await database.query<AccessToken>(
      `SELECT name FROM access_tokens WHERE id = $1`,
      [tokenId]
    );

    return result.rows.length > 0 ? result.rows[0].name : null;
  } catch (error) {
    console.error('Failed to get token name:', error);
    return null;
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
      `SELECT id, scope, folder_filter, last_used_at
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
      folderFilter: tokenData.folder_filter,
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

/**
 * Check if an article folder matches the token's folder filter
 * Returns true if access is allowed, false otherwise
 * 
 * @param articleFolder - The folder path of the article (case-sensitive from DB)
 * @param folderFilter - The token's folder filter (null means no restriction)
 * 
 * Examples:
 * - folderFilter = null -> allows all folders
 * - folderFilter = "projects" -> allows "projects" and "projects/subfolder"
 * - folderFilter = "projects/*" -> allows "projects/subfolder" but NOT "projects" itself
 * - folderFilter = "projects/project a" -> allows only "projects/project a" and subfolders
 */
export function checkFolderAccess(articleFolder: string, folderFilter: string | null): boolean {
  // No filter means access to all folders
  if (!folderFilter) {
    return true;
  }

  // Normalize article folder for comparison (lowercase, trim)
  const normalizedArticleFolder = (articleFolder || '').toLowerCase().trim();
  const normalizedFilter = folderFilter.toLowerCase().trim();

  // Handle wildcard patterns
  if (normalizedFilter.endsWith('/*')) {
    // Pattern like "projects/*" - matches subfolders only, not the folder itself
    const basePath = normalizedFilter.slice(0, -2); // Remove "/*"
    
    // Check if article is in a subfolder of the base path
    return normalizedArticleFolder.startsWith(basePath + '/');
  } else {
    // Exact folder match or subfolder match
    // e.g., "projects" matches "projects" and "projects/subfolder"
    return normalizedArticleFolder === normalizedFilter || 
           normalizedArticleFolder.startsWith(normalizedFilter + '/');
  }
}

/**
 * Export folder filter validation for external use
 */
export { normalizeFolderFilter, validateFolderFilterFormat };
