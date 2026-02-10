# Sentinel's Journal

## 2025-05-22 - [Missing Security Headers and CSP Nonce]
**Vulnerability:** The application documentation claimed to enforce security headers (CSP, X-Frame-Options, etc.) and use a nonce for inline scripts, but the implementation was missing in the actual server code.
**Learning:** Documentation can drift from reality or describe intended state rather than actual state. Always verify security claims by inspecting the code and runtime behavior.
**Prevention:** Implement automated security header verification tests and ensure security middleware is correctly hooked into the server pipeline.
