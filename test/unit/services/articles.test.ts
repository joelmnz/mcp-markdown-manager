import { describe, expect, test, beforeEach, mock } from "bun:test";
import { DatabaseArticleService } from "../../../src/backend/services/databaseArticles";

// Mock database module
const mockDatabase = {
  query: mock(async () => ({ rows: [] })),
  transaction: mock(async (callback: Function) => callback(null)),
};

mock.module("../../../src/backend/services/database.js", () => ({
  database: mockDatabase,
}));

// Mock constraint service
const mockConstraintService = {
  validateArticleData: mock(async () => {}),
  validateVersionData: mock(async () => {}),
  validateEmbeddingData: mock(async () => {}),
};

mock.module("../../../src/backend/services/databaseConstraints.js", () => ({
  databaseConstraintService: mockConstraintService,
}));

// Mock error handling
mock.module("../../../src/backend/services/databaseErrors.js", () => ({
  handleDatabaseError: (error: any) => error,
  DatabaseServiceError: class DatabaseServiceError extends Error {
    constructor(public type: string, message: string, public userMessage: string) {
      super(message);
    }
  },
  DatabaseErrorType: {
    VALIDATION_ERROR: "VALIDATION_ERROR",
    CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",
  },
  retryDatabaseOperation: async (fn: Function) => fn(),
  logDatabaseError: () => {},
}));

describe("DatabaseArticleService", () => {
  let service: DatabaseArticleService;

  beforeEach(() => {
    service = new DatabaseArticleService();
    // Reset all mocks before each test
    mockDatabase.query.mockClear();
    mockConstraintService.validateArticleData.mockClear();
  });

  describe("generateSlug", () => {
    test("should generate slug from simple title", () => {
      expect(service.generateSlug("Simple Title")).toBe("simple-title");
    });

    test("should handle special characters", () => {
      expect(service.generateSlug("Title with Special! Characters@")).toBe(
        "title-with-special-characters"
      );
    });

    test("should collapse multiple spaces to single dash", () => {
      expect(service.generateSlug("Multiple   Spaces")).toBe("multiple-spaces");
    });

    test("should collapse multiple dashes", () => {
      expect(service.generateSlug("Title - with - dashes")).toBe("title-with-dashes");
    });

    test("should handle numbers", () => {
      expect(service.generateSlug("Article 123")).toBe("article-123");
    });

    test("should handle empty string", () => {
      expect(service.generateSlug("")).toBe("");
    });

    test("should trim whitespace", () => {
      expect(service.generateSlug("  Title  ")).toBe("title");
    });
  });

  describe("listArticles", () => {
    test("should list all articles when no folder specified", async () => {
      const mockRows = [
        {
          slug: "article-1",
          title: "Article 1",
          folder: "",
          is_public: false,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-02"),
        },
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockRows });

      const articles = await service.listArticles();

      expect(articles).toHaveLength(1);
      expect(articles[0].slug).toBe("article-1");
      expect(articles[0].title).toBe("Article 1");
      expect(mockDatabase.query).toHaveBeenCalledTimes(1);
    });

    test("should filter by root folder", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await service.listArticles("");

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE folder = $1"),
        expect.arrayContaining([""])
      );
    });

    test("should filter by specific folder and subfolders", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await service.listArticles("tech/ai");

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE (folder ILIKE $1 OR folder ILIKE $2)"),
        expect.arrayContaining(["tech/ai", "tech/ai/%"])
      );
    });

    test("should apply limit when specified", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await service.listArticles(undefined, 10);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT"),
        expect.arrayContaining([10])
      );
    });
  });

  describe("searchArticles", () => {
    test("should search articles by title", async () => {
      const mockRows = [
        {
          slug: "test-article",
          title: "Test Article",
          folder: "",
          is_public: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockRows });

      const results = await service.searchArticles("test");

      expect(results).toHaveLength(1);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("title ILIKE $1"),
        expect.arrayContaining(["%test%"])
      );
    });

    test("should filter search results by folder", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await service.searchArticles("test", "tech");

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("AND (folder ILIKE $2 OR folder ILIKE $3)"),
        expect.arrayContaining(["%test%", "tech", "tech/%"])
      );
    });
  });

  describe("readArticle", () => {
    test("should return article when found", async () => {
      const mockRow = {
        slug: "test-article",
        title: "Test Article",
        content: "Test content",
        folder: "",
        is_public: false,
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-02"),
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] });

      const article = await service.readArticle("test-article");

      expect(article).not.toBeNull();
      expect(article?.slug).toBe("test-article");
      expect(article?.title).toBe("Test Article");
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE slug = $1"),
        ["test-article"]
      );
    });

    test("should return null when article not found", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      const article = await service.readArticle("nonexistent");

      expect(article).toBeNull();
    });

    test("should throw error for empty slug", async () => {
      await expect(service.readArticle("")).rejects.toThrow();
      await expect(service.readArticle("  ")).rejects.toThrow();
    });
  });

  describe("createArticle", () => {
    test("should create article with generated slug", async () => {
      const mockRow = {
        id: 1,
        slug: "new-article",
        title: "New Article",
        content: "Test content",
        folder: "",
        is_public: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockConstraintService.validateArticleData.mockResolvedValueOnce(undefined);
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] });

      const article = await service.createArticle("New Article", "Test content");

      expect(article.slug).toBe("new-article");
      expect(article.title).toBe("New Article");
      expect(mockConstraintService.validateArticleData).toHaveBeenCalled();
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO articles"),
        expect.any(Array)
      );
    });

    test("should normalize folder path", async () => {
      const mockRow = {
        id: 1,
        slug: "test",
        title: "Test",
        content: "Content",
        folder: "",
        is_public: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockConstraintService.validateArticleData.mockResolvedValueOnce(undefined);
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] });

      await service.createArticle("Test", "Content", "/");

      // Verify that "/" was normalized to ""
      const callArgs = mockDatabase.query.mock.calls[0];
      expect(callArgs[1]).toContain(""); // folder should be empty string
    });

    test("should include createdBy when provided", async () => {
      const mockRow = {
        id: 1,
        slug: "test",
        title: "Test",
        content: "Content",
        folder: "",
        is_public: false,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: "user@example.com",
        updated_by: "user@example.com",
      };

      mockConstraintService.validateArticleData.mockResolvedValueOnce(undefined);
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] });

      await service.createArticle("Test", "Content", "", undefined, "user@example.com");

      const callArgs = mockDatabase.query.mock.calls[0];
      expect(callArgs[1]).toContain("user@example.com");
    });
  });

  describe("updateArticle", () => {
    test("should update existing article", async () => {
      const existingArticle = {
        id: 1,
        slug: "test-article",
        title: "Test Article",
        content: "Old content",
        folder: "",
        is_public: false,
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-01"),
      };

      const updatedArticle = {
        ...existingArticle,
        title: "Updated Title",
        content: "New content",
        updated_at: new Date(),
      };

      // Mock getArticleId
      mockDatabase.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      // Mock validateArticleData
      mockConstraintService.validateArticleData.mockResolvedValueOnce(undefined);
      // Mock update query
      mockDatabase.query.mockResolvedValueOnce({ rows: [updatedArticle] });

      const article = await service.updateArticle(
        "test-article",
        "Updated Title",
        "New content"
      );

      expect(article.title).toBe("Updated Title");
      expect(article.content).toBe("New content");
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE articles"),
        expect.any(Array)
      );
    });
  });

  describe("deleteArticle", () => {
    test("should delete article by slug", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.deleteArticle("test-article");

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM articles WHERE slug = $1"),
        ["test-article"]
      );
    });

    test("should return false if article not found", async () => {
      mockDatabase.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await service.deleteArticle("nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("folder management", () => {
    test("should list folders", async () => {
      const mockRows = [
        { folder: "tech", count: 5 },
        { folder: "tech/ai", count: 3 },
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockRows });

      const folders = await service.listFolders();

      expect(folders).toHaveLength(2);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("GROUP BY folder"),
        expect.any(Array)
      );
    });
  });
});
