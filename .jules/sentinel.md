# Sentinel's Journal

## 2025-05-22 - [Missing Security Headers and CSP Nonce]
**Vulnerability:** The application documentation claimed to enforce security headers (CSP, X-Frame-Options, etc.) and use a nonce for inline scripts, but the implementation was missing in the actual server code.
**Learning:** Documentation can drift from reality or describe intended state rather than actual state. Always verify security claims by inspecting the code and runtime behavior.
**Prevention:** Implement automated security header verification tests and ensure security middleware is correctly hooked into the server pipeline.

## 2025-01-28 - [Timing Attack in Auth Middleware]
**Vulnerability:** The `authenticateWeb` function used a direct string comparison (`===`) to validate the `AUTH_TOKEN`, which is vulnerable to timing attacks.
**Learning:** Even in high-level languages like JavaScript/TypeScript, timing attacks are possible when comparing secrets. The default equality operator is not constant-time.
**Prevention:** Use `crypto.timingSafeEqual` for comparing secrets. Ensure buffers are of equal length before comparison to avoid errors, while acknowledging that length leakage is often unavoidable for fixed secrets.
