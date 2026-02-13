# Sentinel's Journal

## 2025-05-22 - [Missing Security Headers and CSP Nonce]
**Vulnerability:** The application documentation claimed to enforce security headers (CSP, X-Frame-Options, etc.) and use a nonce for inline scripts, but the implementation was missing in the actual server code.
**Learning:** Documentation can drift from reality or describe intended state rather than actual state. Always verify security claims by inspecting the code and runtime behavior.
**Prevention:** Implement automated security header verification tests and ensure security middleware is correctly hooked into the server pipeline.

## 2025-05-23 - [Timing Attack in Auth Token Verification]
**Vulnerability:** The `authenticateWeb` function used a direct string comparison (`===`) for verifying `AUTH_TOKEN`, making it vulnerable to timing attacks.
**Learning:** Even simple string comparisons for sensitive data like tokens should be treated as potential side-channel vulnerabilities.
**Prevention:** Use `crypto.timingSafeEqual` for all secret comparisons.
