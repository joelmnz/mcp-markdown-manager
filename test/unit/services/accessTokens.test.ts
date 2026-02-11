import { describe, expect, test, beforeEach, mock } from "bun:test";

// Mock crypto module
const mockRandomBytes = mock((size: number) => {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    buffer[i] = i % 256;
  }
  return buffer;
});

mock.module("crypto", () => ({
  randomBytes: mockRandomBytes,
  createHash: (algorithm: string) => ({
    update: () => ({ digest: () => "mocked-hash" }),
  }),
}));

// Mock database module
const mockDatabase = {
  query: mock(async () => ({ rows: [] })),
};

mock.module("../../../src/backend/services/database.js", () => ({
  database: mockDatabase,
}));

// Mock error handling
const DatabaseErrorType = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  NOT_FOUND: "NOT_FOUND",
};

class DatabaseServiceError extends Error {
  constructor(public type: string, message: string, public userMessage: string) {
    super(message);
  }
}

mock.module("../../../src/backend/services/databaseErrors.js", () => ({
  DatabaseServiceError,
  DatabaseErrorType,
}));

// Import after mocking
const {
  createAccessToken,
  listAccessTokens,
  deleteAccessToken,
  validateAccessToken,
  updateTokenLastUsed,
} = await import("../../../src/backend/services/accessTokens");

describe("Access Token Service", () => {
  beforeEach(() => {
    mockDatabase.query.mockClear();
    mockRandomBytes.mockClear();
  });

  describe("createAccessToken", () => {
    test("should create access token with valid input", async () => {
      const mockToken = {
        id: 1,
        token: "sk-md-test-token",
        name: "Test Token",
        scope: "write",
        created_at: new Date(),
        last_used_at: null,
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockToken] });

      const result = await createAccessToken("Test Token", "write");

      expect(result.name).toBe("Test Token");
      expect(result.scope).toBe("write");
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO access_tokens"),
        expect.arrayContaining(["Test Token", "write"])
      );
    });

    test("should trim token name", async () => {
      const mockToken = {
        id: 1,
        token: "sk-md-test",
        name: "Token",
        scope: "read-only",
        created_at: new Date(),
        last_used_at: null,
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockToken] });

      await createAccessToken("  Token  ", "read-only");

      const callArgs = mockDatabase.query.mock.calls[0];
      expect(callArgs[1]).toContain("Token");
    });

    test("should reject empty token name", async () => {
      await expect(createAccessToken("", "write")).rejects.toThrow("name is required");
      await expect(createAccessToken("   ", "write")).rejects.toThrow("name is required");
    });

    test("should reject invalid scope", async () => {
      await expect(createAccessToken("Test", "invalid" as any)).rejects.toThrow(
        "Invalid scope"
      );
    });

    test("should accept read-only scope", async () => {
      const mockToken = {
        id: 1,
        token: "sk-md-test",
        name: "Test",
        scope: "read-only",
        created_at: new Date(),
        last_used_at: null,
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockToken] });

      const result = await createAccessToken("Test", "read-only");

      expect(result.scope).toBe("read-only");
    });

    test("should accept write scope", async () => {
      const mockToken = {
        id: 1,
        token: "sk-md-test",
        name: "Test",
        scope: "write",
        created_at: new Date(),
        last_used_at: null,
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockToken] });

      const result = await createAccessToken("Test", "write");

      expect(result.scope).toBe("write");
    });
  });

  describe("listAccessTokens", () => {
    test("should list all tokens with masked values", async () => {
      const mockTokens = [
        {
          id: 1,
          token: "sk-md-abcd1234",
          name: "Token 1",
          scope: "write",
          created_at: new Date(),
          last_used_at: new Date(),
        },
        {
          id: 2,
          token: "sk-md-efgh5678",
          name: "Token 2",
          scope: "read-only",
          created_at: new Date(),
          last_used_at: null,
        },
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockTokens });

      const result = await listAccessTokens();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Token 1");
      expect(result[0].masked_token).toContain("****");
      expect(result[0].masked_token).not.toContain("abcd1234");
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, token, name, scope"),
        []
      );
    });

    test("should return empty array when no tokens exist", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await listAccessTokens();

      expect(result).toEqual([]);
    });
  });

  describe("deleteAccessToken", () => {
    test("should delete token by ID", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await deleteAccessToken(1);

      expect(result).toBe(true);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM access_tokens WHERE id = $1"),
        [1]
      );
    });

    test("should return false if token not found", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await deleteAccessToken(999);

      expect(result).toBe(false);
    });

    test("should handle invalid token ID", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await deleteAccessToken(-1);

      expect(result).toBe(false);
    });
  });

  describe("validateAccessToken", () => {
    test("should validate correct token", async () => {
      const mockToken = {
        id: 1,
        token: "sk-md-validtoken",
        scope: "write",
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockToken] });

      const result = await validateAccessToken("sk-md-validtoken");

      expect(result.valid).toBe(true);
      expect(result.scope).toBe("write");
      expect(result.tokenId).toBe(1);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE token = $1"),
        ["sk-md-validtoken"]
      );
    });

    test("should reject invalid token", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const result = await validateAccessToken("invalid-token");

      expect(result.valid).toBe(false);
      expect(result.scope).toBeUndefined();
      expect(result.tokenId).toBeUndefined();
    });

    test("should reject empty token", async () => {
      const result = await validateAccessToken("");

      expect(result.valid).toBe(false);
      expect(mockDatabase.query).not.toHaveBeenCalled();
    });

    test("should return scope for read-only token", async () => {
      const mockToken = {
        id: 2,
        token: "sk-md-readonly",
        scope: "read-only",
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockToken] });

      const result = await validateAccessToken("sk-md-readonly");

      expect(result.valid).toBe(true);
      expect(result.scope).toBe("read-only");
    });
  });

  describe("updateTokenLastUsed", () => {
    test("should update last_used_at timestamp", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 1 });

      await updateTokenLastUsed(1);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE access_tokens"),
        expect.arrayContaining([1])
      );
    });

    test("should handle non-existent token ID", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 0 });

      // Should not throw, just silently fail
      await updateTokenLastUsed(999);

      expect(mockDatabase.query).toHaveBeenCalled();
    });
  });
});
