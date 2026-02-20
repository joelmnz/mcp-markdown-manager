import { describe, test, expect, beforeAll } from "bun:test";

describe("Auth Middleware - authenticateWeb", () => {
  let authenticateWeb: (request: Request) => boolean;
  const TEST_TOKEN = "test-secret-token-123456";

  beforeAll(async () => {
    // Set environment variable before importing module
    process.env.AUTH_TOKEN = TEST_TOKEN;

    // Use dynamic import to ensure environment variable is read
    const mod = await import("../../../src/backend/middleware/auth.js");
    authenticateWeb = mod.authenticateWeb;
  });

  test("should return true for correct token", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });

    const result = authenticateWeb(request);
    expect(result).toBeTrue();
  });

  test("should return false for incorrect token", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        "Authorization": "Bearer wrong-token"
      }
    });

    const result = authenticateWeb(request);
    expect(result).toBeFalse();
  });

  test("should return false for token with different length", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}extra`
      }
    });

    const result = authenticateWeb(request);
    expect(result).toBeFalse();
  });

  test("should return false for missing token", () => {
    const request = new Request("http://localhost/api/test");

    const result = authenticateWeb(request);
    expect(result).toBeFalse();
  });

  test("should return false for empty token", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        "Authorization": "Bearer "
      }
    });

    const result = authenticateWeb(request);
    expect(result).toBeFalse();
  });
});
