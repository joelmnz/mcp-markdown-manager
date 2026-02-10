
import { describe, expect, test, mock, beforeEach } from "bun:test";
import { embeddingQueueService } from "../../../src/backend/services/embeddingQueue";

const mockQuery = mock(async () => ({ rows: [], rowCount: 0 }));

mock.module('../../../src/backend/services/database.js', () => ({
  database: {
    query: mockQuery,
    transaction: mock(async (callback) => callback({ query: mockQuery }))
  }
}));

// Mock other dependencies
mock.module('../../../src/backend/services/logging.js', () => ({
  loggingService: {
    logQueueOperation: mock(async () => {}),
    logBulkOperation: mock(async () => {})
  }
}));

mock.module('../../../src/backend/services/performanceMetrics.js', () => ({
  performanceMetricsService: {
    recordBulkOperationTime: mock(async () => {})
  }
}));

describe("EmbeddingQueueService", () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
  });

  // Helper to normalize SQL for matching
  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();

  test("getDetailedQueueStats should include recentErrors", async () => {
    mockQuery.mockImplementation(async (sql, params) => {
        if (typeof sql === 'string') {
            const normalized = normalizeSql(sql);

            if (normalized.includes('SELECT status, COUNT(*) as count')) {
                return { rows: [{ status: 'failed', count: '5' }], rowCount: 1 };
            }
            if (normalized.includes('SELECT priority, COUNT(*) as count')) {
                return { rows: [], rowCount: 0 };
            }
            if (normalized.includes('SELECT operation, COUNT(*) as count')) {
                return { rows: [], rowCount: 0 };
            }
            if (normalized.includes('SUM(CASE WHEN status = \'completed\'')) {
                 return { rows: [], rowCount: 0 };
            }
            // Match the recent errors query
            if (normalized.includes("WHERE status = 'failed'") && normalized.includes("LIMIT 10")) {
                return {
                    rows: [
                        {
                            id: 'task-1',
                            slug: 'article-1',
                            operation: 'create',
                            error_message: 'Error 1',
                            completed_at: new Date('2023-01-01T12:00:00Z')
                        }
                    ],
                    rowCount: 1
                };
            }
        }
        return { rows: [], rowCount: 0 };
    });

    const result = await embeddingQueueService.getDetailedQueueStats();

    expect(result.recentErrors).toBeDefined();
    expect(result.recentErrors.length).toBe(1);
    expect(result.recentErrors[0].id).toBe('task-1');
    expect(result.recentErrors[0].errorMessage).toBe('Error 1');
  });

  test("deleteTask should execute correct delete query", async () => {
    mockQuery.mockImplementation(async (sql, params) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('DELETE FROM embedding_tasks WHERE id = $1')) {
            return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
    });

    await embeddingQueueService.deleteTask('task-1');

    const calls = mockQuery.mock.calls;
    const deleteCall = calls.find(call => normalizeSql(call[0] as string).includes('DELETE FROM embedding_tasks WHERE id = $1'));
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1]).toEqual(['task-1']);
  });

  test("clearFailedTasks should execute correct delete query", async () => {
     mockQuery.mockImplementation(async (sql, params) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes("DELETE FROM embedding_tasks WHERE status = 'failed'")) {
            return { rowCount: 5, rows: [] };
        }
        return { rowCount: 0, rows: [] };
    });

    const count = await embeddingQueueService.clearFailedTasks();

    expect(count).toBe(5);
    const calls = mockQuery.mock.calls;
    const deleteCall = calls.find(call => normalizeSql(call[0] as string).includes("DELETE FROM embedding_tasks WHERE status = 'failed'"));
    expect(deleteCall).toBeDefined();
  });
});
