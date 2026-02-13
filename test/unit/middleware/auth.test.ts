import { describe, test, expect, beforeAll } from "bun:test";

describe("Auth Middleware", () => {
  let authenticateWeb: any;

  beforeAll(async () => {
    // Set environment variable before importing the module
    process.env.AUTH_TOKEN = "secret-token-123";

    // Dynamic import to ensure environment variable is set first
    const authModule = await import("../../../src/backend/middleware/auth.js");
    authenticateWeb = authModule.authenticateWeb;
  });

  test("authenticateWeb should return true for correct token", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        Authorization: "Bearer secret-token-123",
      },
    });

    expect(authenticateWeb(request)).toBe(true);
  });

  test("authenticateWeb should return false for incorrect token", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        Authorization: "Bearer wrong-token",
      },
    });

    expect(authenticateWeb(request)).toBe(false);
  });

  test("authenticateWeb should return false for token with different length", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        Authorization: "Bearer secret-token-12", // one char less
      },
    });

    expect(authenticateWeb(request)).toBe(false);
  });

  test("authenticateWeb should return false for missing token", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        // No Authorization header
      },
    });

    expect(authenticateWeb(request)).toBe(false);
  });

  test("authenticateWeb should return false for empty token", () => {
    const request = new Request("http://localhost/api/test", {
      headers: {
        Authorization: "Bearer ",
      },
    });

    expect(authenticateWeb(request)).toBe(false);
  });
});
