import { describe, test, expect } from "bun:test";
import { generateNonce, addSecurityHeaders } from "../../../src/backend/middleware/security.js";

describe("Security Middleware", () => {
  test("generateNonce should return a non-empty string", () => {
    const nonce = generateNonce();
    expect(nonce).toBeString();
    expect(nonce.length).toBeGreaterThan(0);
  });

  test("generateNonce should return unique values", () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    expect(nonce1).not.toBe(nonce2);
  });

  test("addSecurityHeaders should add CSP headers with nonce", () => {
    const response = new Response("ok");
    const nonce = "test-nonce-123";

    const secureResponse = addSecurityHeaders(response, nonce);

    const csp = secureResponse.headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain(`nonce-${nonce}`);
    expect(csp).toContain("script-src 'self' 'nonce-test-nonce-123'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  test("addSecurityHeaders should add other security headers", () => {
    const response = new Response("ok");
    const nonce = generateNonce();

    const secureResponse = addSecurityHeaders(response, nonce);

    expect(secureResponse.headers.get("X-Frame-Options")).toBe("DENY");
    expect(secureResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(secureResponse.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(secureResponse.headers.get("Permissions-Policy")).toBeDefined();
  });
});
