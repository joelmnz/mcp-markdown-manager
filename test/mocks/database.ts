import { mock } from "bun:test";

export const createMockDatabase = () => ({
  query: mock(async () => ({ rows: [] })),
  connect: mock(async () => ({
    query: mock(async () => ({ rows: [] })),
    release: mock(() => {}),
  })),
  on: mock(() => {}),
  end: mock(async () => {}),
});

export const createMockArticleService = () => ({
  listArticles: mock(async () => []),
  readArticle: mock(async () => null),
  createArticle: mock(async () => ({})),
  updateArticle: mock(async () => ({})),
  deleteArticle: mock(async () => true),
  searchArticles: mock(async () => []),
  generateSlug: mock((title: string) => title.toLowerCase().replace(/\s+/g, '-')),
});
