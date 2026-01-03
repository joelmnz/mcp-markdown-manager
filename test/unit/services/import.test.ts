import { describe, expect, test, mock } from "bun:test";
import { ImportService } from "../../../src/backend/services/import";

const mockDatabaseArticleService = {
  readArticle: mock(async (slug: string) => null),
  createArticle: mock(async () => ({ id: 1 })),
  updateArticle: mock(async () => ({ id: 1 })),
  generateSlug: mock((title: string) => title.toLowerCase().replace(/\s+/g, '-'))
};

mock.module('../../../src/backend/services/databaseArticles.js', () => ({
  databaseArticleService: mockDatabaseArticleService
}));

mock.module('../../../src/backend/services/database.js', () => ({
  database: {
    transaction: mock(async (callback) => callback(null))
  }
}));

describe("Import Service Logic", () => {
  test("should be defined", () => {
    const importService = new ImportService();
    expect(importService).toBeDefined();
  });
});
