import { describe, expect, test, mock, beforeEach, afterAll } from "bun:test";

const originalSemanticSearchEnabled = process.env.SEMANTIC_SEARCH_ENABLED;
process.env.SEMANTIC_SEARCH_ENABLED = 'true';

afterAll(() => {
  if (originalSemanticSearchEnabled !== undefined) {
    process.env.SEMANTIC_SEARCH_ENABLED = originalSemanticSearchEnabled;
  } else {
    delete process.env.SEMANTIC_SEARCH_ENABLED;
  }
});

// Mock dependencies
const mockDatabaseArticleService = {
  createArticle: mock(),
  readArticle: mock(),
  getArticleId: mock(),
  updateArticle: mock(),
  generateSlug: mock((title: string) => title.toLowerCase().replace(/\s+/g, '-')),
  getPublicArticle: mock()
};

const mockEmbeddingQueueService = {
  enqueueTask: mock()
};

const mockEmbeddingQueueConfigService = {
  getConfig: mock(() => ({ enabled: true, maxRetries: 3 }))
};

const mockDatabaseVersionHistoryService = {
    createVersion: mock()
};

mock.module('../../../src/backend/services/databaseArticles.js', () => ({
  databaseArticleService: mockDatabaseArticleService
}));

mock.module('../../../src/backend/services/embeddingQueue.js', () => ({
  embeddingQueueService: mockEmbeddingQueueService
}));

mock.module('../../../src/backend/services/embeddingQueueConfig.js', () => ({
  embeddingQueueConfigService: mockEmbeddingQueueConfigService
}));

mock.module('../../../src/backend/services/databaseVersionHistory.js', () => ({
    databaseVersionHistoryService: mockDatabaseVersionHistoryService
}));

// Dynamic import to ensure env var is picked up
const { createArticle, updateArticle } = await import("../../../src/backend/services/articles");

describe("Article Service - No RAG", () => {
  beforeEach(() => {
    mockDatabaseArticleService.createArticle.mockClear();
    mockDatabaseArticleService.updateArticle.mockClear();
    mockDatabaseArticleService.readArticle.mockClear();
    mockDatabaseArticleService.getArticleId.mockClear();
    mockEmbeddingQueueService.enqueueTask.mockClear();
  });

  test("createArticle should skip embedding when noRag is true", async () => {
    const article = { slug: 'test-article', title: 'Test Article', content: 'Content', folder: '', created: new Date().toISOString(), isPublic: false, noRag: true };
    mockDatabaseArticleService.createArticle.mockResolvedValue(article);
    mockDatabaseArticleService.getArticleId.mockResolvedValue(1);

    await createArticle('Test Article', 'Content', '', undefined, undefined, undefined, true);

    expect(mockDatabaseArticleService.createArticle).toHaveBeenCalledWith('Test Article', 'Content', '', undefined, undefined, true);
    expect(mockEmbeddingQueueService.enqueueTask).not.toHaveBeenCalled();
  });

  test("createArticle should enqueue embedding when noRag is false", async () => {
    const article = { slug: 'test-article', title: 'Test Article', content: 'Content', folder: '', created: new Date().toISOString(), isPublic: false, noRag: false };
    mockDatabaseArticleService.createArticle.mockResolvedValue(article);
    mockDatabaseArticleService.getArticleId.mockResolvedValue(1);

    await createArticle('Test Article', 'Content', '', undefined, undefined, undefined, false);

    expect(mockDatabaseArticleService.createArticle).toHaveBeenCalledWith('Test Article', 'Content', '', undefined, undefined, false);
    expect(mockEmbeddingQueueService.enqueueTask).toHaveBeenCalled();
  });

  test("updateArticle should delete embeddings when noRag is changed to true", async () => {
    const existingArticle = { slug: 'test-article', title: 'Test Article', content: 'Content', folder: '', created: new Date().toISOString(), isPublic: false, noRag: false };
    const updatedArticle = { ...existingArticle, noRag: true };

    mockDatabaseArticleService.readArticle.mockResolvedValue(existingArticle);
    mockDatabaseArticleService.updateArticle.mockResolvedValue(updatedArticle);
    mockDatabaseArticleService.getArticleId.mockResolvedValue(1);

    await updateArticle('test-article.md', 'Test Article', 'Content', '', undefined, undefined, undefined, true);

    expect(mockDatabaseArticleService.updateArticle).toHaveBeenCalled();
    expect(mockEmbeddingQueueService.enqueueTask).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'delete',
        metadata: expect.objectContaining({ reason: 'no_rag_enabled' })
    }));
    expect(mockEmbeddingQueueService.enqueueTask).toHaveBeenCalledTimes(1);
    expect(mockEmbeddingQueueService.enqueueTask).not.toHaveBeenCalledWith(expect.objectContaining({
        operation: 'update'
    }));
  });

  test("updateArticle should update embeddings when noRag is false", async () => {
      const existingArticle = { slug: 'test-article', title: 'Test Article', content: 'Content', folder: '', created: new Date().toISOString(), isPublic: false, noRag: false };
      const updatedArticle = { ...existingArticle, noRag: false };

      mockDatabaseArticleService.readArticle.mockResolvedValue(existingArticle);
      mockDatabaseArticleService.updateArticle.mockResolvedValue(updatedArticle);
      mockDatabaseArticleService.getArticleId.mockResolvedValue(1);

      await updateArticle('test-article.md', 'Test Article', 'Content', '', undefined, undefined, undefined, false);

      expect(mockEmbeddingQueueService.enqueueTask).toHaveBeenCalledWith(expect.objectContaining({
          operation: 'update'
      }));
  });
});
