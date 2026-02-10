import { randomBytes } from 'node:crypto';

/**
 * Generate a cryptographically secure random nonce
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Add security headers to the response
 *
 * @param response The Bun response object
 * @param nonce The nonce used for Content-Security-Policy
 * @param isHttps Whether the request was made over HTTPS
 * @returns The response with security headers added
 */
export function addSecurityHeaders(response: Response, nonce: string, isHttps: boolean = false): Response {
  // Content Security Policy
  // script-src: Allow self and scripts with correct nonce
  // style-src: Allow self and unsafe-inline (required for React/emotion/etc)
  // img-src: Allow self and data URIs (common for small assets)
  // connect-src: Allow self (API calls)
  // font-src: Allow self
  // object-src: None (no plugins)
  // base-uri: Self (prevents base tag hijacking)
  // form-action: Self (prevents form submission to external sites)
  // frame-ancestors: None (prevents clickjacking)
  // upgrade-insecure-requests: Only on HTTPS to avoid breaking HTTP deployments
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];

  // Only add upgrade-insecure-requests on HTTPS deployments
  // This prevents breaking HTTP-only deployments (local dev, private networks)
  if (isHttps) {
    cspDirectives.push("upgrade-insecure-requests");
  }

  const csp = cspDirectives.join('; ');

  response.headers.set('Content-Security-Policy', csp);

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Control referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable dangerous features
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}
