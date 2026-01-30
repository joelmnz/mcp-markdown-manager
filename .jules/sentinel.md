## 2026-01-30 - Added Security Headers and CSP with Nonce
**Vulnerability:** Missing HTTP security headers (CSP, X-Frame-Options, etc.) left the application vulnerable to XSS, Clickjacking, and MIME-sniffing.
**Learning:** `Bun.serve` requires manual header injection for each response. Inline scripts needed for runtime configuration necessitated a nonce-based Content Security Policy.
**Prevention:** Implemented a `getSecurityHeaders` helper and updated the server to inject a cryptographic nonce into both the CSP header and the HTML script tag.
