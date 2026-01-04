import { describe, expect, test, beforeEach, mock } from "bun:test";

// Set mock AUTH_TOKEN before importing auth module
process.env.AUTH_TOKEN = "test-auth-token-12345";

// Mock access token service
const mockValidateAccessToken = mock(async (token: string) => ({
  valid: false,
  scope: undefined,
  tokenId: undefined,
}));

const mockHasPermission = mock((userScope: string, requiredScope: string) => {
  if (userScope === "write") return true;
  if (userScope === "read-only" && requiredScope === "read-only") return true;
  return false;
});

const mockGetTokenNameById = mock(async (id: number) => {
  if (id === 1) return "Test Token";
  return null;
});

mock.module("../../../src/backend/services/accessTokens.js", () => ({
  validateAccessToken: mockValidateAccessToken,
  hasPermission: mockHasPermission,
  getTokenNameById: mockGetTokenNameById,
}));

// Import after mocking
const {
  authenticateWeb,
  authenticateAccessToken,
  authenticate,
  requireAuth,
} = await import("../../../src/backend/middleware/auth");

describe("Authentication Middleware", () => {
  beforeEach(() => {
    mockValidateAccessToken.mockClear();
    mockHasPermission.mockClear();
    mockGetTokenNameById.mockClear();
  });

  describe("authenticateWeb", () => {
    test("should accept valid AUTH_TOKEN", () => {
      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer test-auth-token-12345",
        },
      });

      const result = authenticateWeb(request);
      expect(result).toBe(true);
    });

    test("should reject invalid AUTH_TOKEN", () => {
      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer wrong-token",
        },
      });

      const result = authenticateWeb(request);
      expect(result).toBe(false);
    });

    test("should reject missing Authorization header", () => {
      const request = new Request("http://localhost/test");

      const result = authenticateWeb(request);
      expect(result).toBe(false);
    });

    test("should reject empty Authorization header", () => {
      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer ",
        },
      });

      const result = authenticateWeb(request);
      expect(result).toBe(false);
    });

    test("should handle authorization header without Bearer prefix", () => {
      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "test-auth-token-12345",
        },
      });

      const result = authenticateWeb(request);
      expect(result).toBe(true);
    });
  });

  describe("authenticateAccessToken", () => {
    test("should authenticate valid access token", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: true,
        scope: "write",
        tokenId: 1,
      });
      mockGetTokenNameById.mockResolvedValueOnce("Test Token");

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer sk-md-validtoken",
        },
      });

      const result = await authenticateAccessToken(request);

      expect(result).not.toBeNull();
      expect(result?.scope).toBe("write");
      expect(result?.tokenId).toBe(1);
      expect(result?.tokenName).toBe("Test Token");
      expect(mockValidateAccessToken).toHaveBeenCalledWith("sk-md-validtoken");
    });

    test("should reject invalid access token", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: false,
        scope: undefined,
        tokenId: undefined,
      });

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer invalid-token",
        },
      });

      const result = await authenticateAccessToken(request);

      expect(result).toBeNull();
    });

    test("should reject request without authorization header", async () => {
      const request = new Request("http://localhost/test");

      const result = await authenticateAccessToken(request);

      expect(result).toBeNull();
      expect(mockValidateAccessToken).not.toHaveBeenCalled();
    });

    test("should handle read-only token", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: true,
        scope: "read-only",
        tokenId: 2,
      });
      mockGetTokenNameById.mockResolvedValueOnce("Read Only Token");

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer sk-md-readonly",
        },
      });

      const result = await authenticateAccessToken(request);

      expect(result).not.toBeNull();
      expect(result?.scope).toBe("read-only");
    });
  });

  describe("authenticate (combined)", () => {
    test("should accept AUTH_TOKEN in web mode", async () => {
      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer test-auth-token-12345",
        },
      });

      const result = await authenticate(request, true);

      expect(result).not.toBeNull();
      expect(result?.scope).toBe("write");
      expect(result?.tokenName).toBe("admin");
    });

    test("should reject access token in web mode", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: true,
        scope: "write",
        tokenId: 1,
      });

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer sk-md-token",
        },
      });

      const result = await authenticate(request, true);

      expect(result).toBeNull();
    });

    test("should prefer access token over AUTH_TOKEN in API mode", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: true,
        scope: "read-only",
        tokenId: 1,
      });
      mockGetTokenNameById.mockResolvedValueOnce("API Token");

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer sk-md-token",
        },
      });

      const result = await authenticate(request, false);

      expect(result).not.toBeNull();
      expect(result?.scope).toBe("read-only");
      expect(result?.tokenName).toBe("API Token");
    });

    test("should fall back to AUTH_TOKEN in API mode", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: false,
        scope: undefined,
        tokenId: undefined,
      });

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer test-auth-token-12345",
        },
      });

      const result = await authenticate(request, false);

      expect(result).not.toBeNull();
      expect(result?.scope).toBe("write");
      expect(result?.tokenName).toBe("admin");
    });
  });

  describe("requireAuth", () => {
    test("should return auth context for valid token", async () => {
      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer test-auth-token-12345",
        },
      });

      const result = await requireAuth(request);

      expect("auth" in result).toBe(true);
      if ("auth" in result) {
        expect(result.auth.scope).toBe("write");
      }
    });

    test("should return 401 for missing token", async () => {
      const request = new Request("http://localhost/test");

      const result = await requireAuth(request);

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.status).toBe(401);
        const body = await result.error.json();
        expect(body.error).toBe("Unauthorized");
      }
    });

    test("should check required scope", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: true,
        scope: "read-only",
        tokenId: 1,
      });

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer sk-md-readonly",
        },
      });

      const result = await requireAuth(request, "write");

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.status).toBe(403);
        const body = await result.error.json();
        expect(body.error).toBe("Insufficient permissions");
      }
    });

    test("should allow write token for read-only operation", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: true,
        scope: "write",
        tokenId: 1,
      });
      mockGetTokenNameById.mockResolvedValueOnce("Write Token");

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer sk-md-write",
        },
      });

      const result = await requireAuth(request, "read-only");

      expect("auth" in result).toBe(true);
      if ("auth" in result) {
        expect(result.auth.scope).toBe("write");
      }
    });

    test("should enforce web auth when useWebAuth is true", async () => {
      mockValidateAccessToken.mockResolvedValueOnce({
        valid: true,
        scope: "write",
        tokenId: 1,
      });

      const request = new Request("http://localhost/test", {
        headers: {
          Authorization: "Bearer sk-md-token",
        },
      });

      const result = await requireAuth(request, undefined, true);

      expect("error" in result).toBe(true);
    });
  });
});
