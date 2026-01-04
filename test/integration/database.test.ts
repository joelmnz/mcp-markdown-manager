#!/usr/bin/env bun
/**
 * Integration tests for database operations
 *
 * REQUIREMENTS:
 * - PostgreSQL database running (use `bun run dc:db`)
 * - Environment variables configured (.env file)
 *
 * Run with: bun test:integration
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { databaseInit } from "../../src/backend/services/databaseInit.js";
import { databaseArticleService } from "../../src/backend/services/articles.js";
import { createAccessToken, listAccessTokens, deleteAccessToken, validateAccessToken } from "../../src/backend/services/accessTokens.js";

// Track created resources for cleanup
const createdArticleSlugs: string[] = [];
const createdTokenIds: number[] = [];

describe("Database Integration Tests", () => {
  beforeAll(async () => {
    console.log("Initializing database...");
    await databaseInit.initialize();
  });

  afterAll(async () => {
    console.log("Cleaning up test data...");

    // Delete created articles
    for (const slug of createdArticleSlugs) {
      try {
        await databaseArticleService.deleteArticle(slug);
      } catch (error) {
        console.warn(`Failed to delete article ${slug}:`, error);
      }
    }

    // Delete created tokens
    for (const tokenId of createdTokenIds) {
      try {
        await deleteAccessToken(tokenId);
      } catch (error) {
        console.warn(`Failed to delete token ${tokenId}:`, error);
      }
    }

    console.log("Shutting down database connection...");
    await databaseInit.shutdown();
  });

  describe("Database Initialization", () => {
    test("should initialize database schema", async () => {
      // Database should be initialized in beforeAll
      expect(true).toBe(true);
    });
  });

  describe("Article CRUD Operations", () => {
    test("should create an article", async () => {
      const article = await databaseArticleService.createArticle(
        "Integration Test Article",
        "# Test Content\n\nThis is a test article."
      );

      createdArticleSlugs.push(article.slug);

      expect(article.slug).toBe("integration-test-article");
      expect(article.title).toBe("Integration Test Article");
      expect(article.content).toContain("Test Content");
    });

    test("should read an article", async () => {
      const created = await databaseArticleService.createArticle(
        "Read Test Article",
        "Content for reading"
      );
      createdArticleSlugs.push(created.slug);

      const article = await databaseArticleService.readArticle(created.slug);

      expect(article).not.toBeNull();
      expect(article?.title).toBe("Read Test Article");
      expect(article?.content).toBe("Content for reading");
    });

    test("should update an article", async () => {
      const created = await databaseArticleService.createArticle(
        "Update Test",
        "Original content"
      );
      createdArticleSlugs.push(created.slug);

      const updated = await databaseArticleService.updateArticle(
        created.slug,
        "Update Test Updated",
        "Updated content"
      );

      expect(updated.title).toBe("Update Test Updated");
      expect(updated.content).toBe("Updated content");
    });

    test("should delete an article", async () => {
      const created = await databaseArticleService.createArticle(
        "Delete Test",
        "To be deleted"
      );

      const deleted = await databaseArticleService.deleteArticle(created.slug);
      expect(deleted).toBe(true);

      const article = await databaseArticleService.readArticle(created.slug);
      expect(article).toBeNull();
    });

    test("should list articles", async () => {
      const article1 = await databaseArticleService.createArticle(
        "List Test 1",
        "Content 1"
      );
      const article2 = await databaseArticleService.createArticle(
        "List Test 2",
        "Content 2"
      );
      createdArticleSlugs.push(article1.slug, article2.slug);

      const articles = await databaseArticleService.listArticles();

      expect(articles.length).toBeGreaterThanOrEqual(2);
      const slugs = articles.map(a => a.slug);
      expect(slugs).toContain("list-test-1");
      expect(slugs).toContain("list-test-2");
    });

    test("should search articles by title", async () => {
      const article = await databaseArticleService.createArticle(
        "Unique Search Term Article",
        "Content"
      );
      createdArticleSlugs.push(article.slug);

      const results = await databaseArticleService.searchArticles("Unique Search");

      expect(results.length).toBeGreaterThanOrEqual(1);
      const found = results.find(a => a.slug === article.slug);
      expect(found).toBeDefined();
    });

    test("should handle folder organization", async () => {
      const article = await databaseArticleService.createArticle(
        "Folder Test",
        "Content",
        "test-folder"
      );
      createdArticleSlugs.push(article.slug);

      expect(article.folder).toBe("test-folder");

      const articlesInFolder = await databaseArticleService.listArticles("test-folder");
      const found = articlesInFolder.find(a => a.slug === article.slug);
      expect(found).toBeDefined();
    });
  });

  describe("Access Token Operations", () => {
    test("should create an access token", async () => {
      const token = await createAccessToken("Integration Test Token", "write");
      createdTokenIds.push(token.id);

      expect(token.name).toBe("Integration Test Token");
      expect(token.scope).toBe("write");
      expect(token.token).toMatch(/^sk-md-/);
    });

    test("should validate an access token", async () => {
      const token = await createAccessToken("Validation Test", "read-only");
      createdTokenIds.push(token.id);

      const validation = await validateAccessToken(token.token);

      expect(validation.valid).toBe(true);
      expect(validation.scope).toBe("read-only");
      expect(validation.tokenId).toBe(token.id);
    });

    test("should list access tokens", async () => {
      const token1 = await createAccessToken("List Test 1", "write");
      const token2 = await createAccessToken("List Test 2", "read-only");
      createdTokenIds.push(token1.id, token2.id);

      const tokens = await listAccessTokens();

      expect(tokens.length).toBeGreaterThanOrEqual(2);
      const names = tokens.map(t => t.name);
      expect(names).toContain("List Test 1");
      expect(names).toContain("List Test 2");

      // Verify tokens are masked
      const listToken1 = tokens.find(t => t.name === "List Test 1");
      expect(listToken1?.masked_token).toContain("****");
      expect(listToken1?.masked_token).not.toContain(token1.token);
    });

    test("should delete an access token", async () => {
      const token = await createAccessToken("Delete Test", "write");

      const deleted = await deleteAccessToken(token.id);
      expect(deleted).toBe(true);

      const validation = await validateAccessToken(token.token);
      expect(validation.valid).toBe(false);
    });
  });

  describe("Database Constraints", () => {
    test("should prevent duplicate slugs", async () => {
      const article1 = await databaseArticleService.createArticle(
        "Duplicate Test",
        "First article"
      );
      createdArticleSlugs.push(article1.slug);

      await expect(
        databaseArticleService.createArticle("Duplicate Test", "Second article")
      ).rejects.toThrow();
    });

    test("should enforce required fields", async () => {
      await expect(
        databaseArticleService.createArticle("", "Content")
      ).rejects.toThrow();

      await expect(
        databaseArticleService.createArticle("Title", "")
      ).rejects.toThrow();
    });
  });

  describe("Database Migration", () => {
    test("should have all required tables", async () => {
      const { database } = await import("../../src/backend/services/database.js");

      const result = await database.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('articles', 'access_tokens', 'article_history', 'schema_version')
        ORDER BY table_name
      `);

      const tables = result.rows.map(r => r.table_name);
      expect(tables).toContain("articles");
      expect(tables).toContain("access_tokens");
      expect(tables).toContain("article_history");
      expect(tables).toContain("schema_version");
    });
  });
});
