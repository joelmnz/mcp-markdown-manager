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

const { createArticle, updateArticle, readArticle } = await import("../../../src/backend/services/articles");

describe("Article Service - Notes", () => {
  beforeEach(() => {
    mockDatabaseArticleService.createArticle.mockClear();
    mockDatabaseArticleService.readArticle.mockClear();
    mockDatabaseArticleService.getArticleId.mockClear();
    mockDatabaseArticleService.updateArticle.mockClear();
    mockEmbeddingQueueService.enqueueTask.mockClear();
    mockDatabaseVersionHistoryService.createVersion.mockClear();
  });

  test("createArticle should persist notes and still create an initial version", async () => {
    const article = {
      slug: 'test-article',
      title: 'Test Article',
      content: 'Content',
      notes: 'Note content',
      folder: '',
      created: new Date().toISOString(),
      isPublic: false,
      noRag: false
    };

    mockDatabaseArticleService.createArticle.mockResolvedValue(article);
    mockDatabaseArticleService.getArticleId.mockResolvedValue(1);

    const created = await createArticle('Test Article', 'Content', '', undefined, undefined, undefined, false, 'Note content');

    expect(mockDatabaseArticleService.createArticle).toHaveBeenCalledWith(
      'Test Article',
      'Content',
      '',
      undefined,
      undefined,
      false,
      'Note content'
    );
    expect(mockDatabaseVersionHistoryService.createVersion).toHaveBeenCalledTimes(1);
    expect(created.notes).toBe('Note content');
  });

  test("updateArticle should allow notes-only updates without versioning or embedding", async () => {
    const existingArticle = {
      slug: 'test-article',
      title: 'Test Article',
      content: 'Content',
      notes: 'Original note',
      folder: '',
      created: new Date().toISOString(),
      isPublic: false,
      noRag: false
    };

    const updatedArticle = { ...existingArticle, notes: 'Updated note' };

    mockDatabaseArticleService.readArticle.mockResolvedValue(existingArticle);
    mockDatabaseArticleService.updateArticle.mockResolvedValue(updatedArticle);

    const updated = await updateArticle('test-article.md', 'Test Article', 'Content', '', undefined, undefined, undefined, undefined, 'Updated note');

    expect(mockDatabaseArticleService.updateArticle).toHaveBeenCalledWith(
      'test-article',
      'Test Article',
      'Content',
      '',
      undefined,
      undefined,
      undefined,
      'Updated note'
    );
    expect(mockDatabaseVersionHistoryService.createVersion).not.toHaveBeenCalled();
    expect(mockEmbeddingQueueService.enqueueTask).not.toHaveBeenCalled();
    expect(updated.notes).toBe('Updated note');
  });

  test("readArticle should expose notes in the legacy shape", async () => {
    mockDatabaseArticleService.readArticle.mockResolvedValue({
      slug: 'test-article',
      title: 'Test Article',
      content: 'Content',
      notes: 'Visible note',
      folder: '',
      created: new Date().toISOString(),
      isPublic: false,
      noRag: false
    });

    const article = await readArticle('test-article.md');

    expect(article?.notes).toBe('Visible note');
  });
});
