import { createHash } from 'crypto';

/**
 * PKCE (Proof Key for Code Exchange) utilities
 * Implements RFC 7636: https://tools.ietf.org/html/rfc7636
 */

export type CodeChallengeMethod = 'S256' | 'plain';

/**
 * Validate code challenge method
 */
export function isValidCodeChallengeMethod(method: string): method is CodeChallengeMethod {
  return method === 'S256' || method === 'plain';
}

/**
 * Generate code challenge from code verifier using S256 method
 * S256: BASE64URL(SHA256(ASCII(code_verifier)))
 */
export function generateCodeChallenge(codeVerifier: string, method: CodeChallengeMethod = 'S256'): string {
  if (method === 'plain') {
    return codeVerifier;
  }

  // S256 method
  const hash = createHash('sha256').update(codeVerifier).digest();
  return hash.toString('base64url');
}

/**
 * Verify that the code verifier matches the code challenge
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: CodeChallengeMethod
): boolean {
  if (!codeVerifier || !codeChallenge) {
    return false;
  }

  const expectedChallenge = generateCodeChallenge(codeVerifier, method);
  return expectedChallenge === codeChallenge;
}

/**
 * Validate code verifier format according to RFC 7636
 * - Length must be between 43 and 128 characters
 * - Must contain only unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
export function isValidCodeVerifier(codeVerifier: string): boolean {
  if (!codeVerifier) return false;

  const length = codeVerifier.length;
  if (length < 43 || length > 128) {
    return false;
  }

  // Check if it contains only allowed characters
  const validPattern = /^[A-Za-z0-9\-._~]+$/;
  return validPattern.test(codeVerifier);
}

/**
 * Validate code challenge format
 * - For S256: BASE64URL encoded string (43 chars for SHA-256)
 * - For plain: same validation as code verifier
 */
export function isValidCodeChallenge(codeChallenge: string, method: CodeChallengeMethod): boolean {
  if (!codeChallenge) return false;

  if (method === 'plain') {
    return isValidCodeVerifier(codeChallenge);
  }

  // S256: BASE64URL encoded SHA-256 hash (43 characters)
  const base64UrlPattern = /^[A-Za-z0-9\-_]+$/;
  return base64UrlPattern.test(codeChallenge) && codeChallenge.length === 43;
}

/**
 * PKCE validation result
 */
export interface PKCEValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Comprehensive PKCE validation
 */
export function validatePKCE(
  codeVerifier: string,
  codeChallenge: string,
  method: CodeChallengeMethod
): PKCEValidationResult {
  // Validate method
  if (!isValidCodeChallengeMethod(method)) {
    return { valid: false, error: 'Invalid code_challenge_method. Must be "S256" or "plain"' };
  }

  // Validate code verifier format
  if (!isValidCodeVerifier(codeVerifier)) {
    return {
      valid: false,
      error: 'Invalid code_verifier format. Must be 43-128 characters long and contain only [A-Z], [a-z], [0-9], "-", ".", "_", "~"'
    };
  }

  // Validate code challenge format
  if (!isValidCodeChallenge(codeChallenge, method)) {
    return {
      valid: false,
      error: `Invalid code_challenge format for method "${method}"`
    };
  }

  // Verify code challenge matches code verifier
  if (!verifyCodeChallenge(codeVerifier, codeChallenge, method)) {
    return {
      valid: false,
      error: 'Code verifier does not match code challenge'
    };
  }

  return { valid: true };
}
