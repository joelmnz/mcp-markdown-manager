import { authenticate, requireAuth } from '../middleware/auth';
import { DatabaseServiceError, DatabaseErrorType } from '../services/databaseErrors.js';
import {
  listArticles,
  getFolders,
  renameFolder,
  deleteFolder,
  searchArticles,
  readArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  isArticlePublic,
  setArticlePublic,
  getArticleBySlug,
  listArticleVersions,
  getArticleVersion,
  restoreArticleVersion,
  deleteArticleVersions
} from '../services/articles';
import { semanticSearch, hybridSearch, getDetailedIndexStats, indexUnindexedArticles } from '../services/vectorIndex';
import { databaseHealthService } from '../services/databaseHealth.js';
import { databaseInit } from '../services/databaseInit.js';
import { backgroundWorkerService } from '../services/backgroundWorker.js';
import { embeddingQueueService } from '../services/embeddingQueue.js';
import { embeddingQueueConfigService } from '../services/embeddingQueueConfig.js';
import { importStatusService } from '../services/importStatus.js';

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

/**
 * Helper to handle service errors and return appropriate HTTP responses
 */
function handleServiceError(error: unknown, defaultMessage: string): Response {
  if (error instanceof DatabaseServiceError) {
    let status = 500;
    if (error.type === DatabaseErrorType.NOT_FOUND) {
      status = 404;
    } else if (error.type === DatabaseErrorType.VALIDATION_ERROR || error.type === DatabaseErrorType.CONSTRAINT_VIOLATION) {
      status = 400;
    }

    return new Response(JSON.stringify({
      error: error.userMessage || error.message
    }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    error: error instanceof Error ? error.message : defaultMessage
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Health check endpoint (no auth required)
  if (path === '/health') {
    try {
      const isAuthenticated = authenticate(request);

      // Simple health check that uses minimal database connections
      const basicHealthCheck = await databaseInit.healthCheck();

      // Public/minimal response to reduce information leakage
      if (!isAuthenticated) {
        const systemHealthy = basicHealthCheck.healthy;
        return new Response(JSON.stringify({
          status: systemHealthy ? 'ok' : 'degraded',
          timestamp: new Date().toISOString(),
          database: {
            healthy: basicHealthCheck.healthy,
            message: basicHealthCheck.message,
          },
        }), {
          status: systemHealthy ? 200 : 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get embedding queue configuration (no database calls)
      const queueConfig = embeddingQueueConfigService.getConfig();
      const configStatus = embeddingQueueConfigService.getConfigStatus();

      // Only get worker stats if basic health is good
      let workerStats = null;
      if (basicHealthCheck.healthy && queueConfig.enabled && configStatus.isValid) {
        try {
          workerStats = await backgroundWorkerService.getWorkerStats();
        } catch (error) {
          console.error('Error getting worker stats:', error);
        }
      }

      // Determine overall system health
      const systemHealthy = basicHealthCheck.healthy;

      return new Response(JSON.stringify({
        status: systemHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        database: {
          healthy: basicHealthCheck.healthy,
          message: basicHealthCheck.message,
          details: basicHealthCheck.details || null
        },
        services: {
          semanticSearch: SEMANTIC_SEARCH_ENABLED,
          mcpServer: process.env.MCP_SERVER_ENABLED?.toLowerCase() === 'true',
          embeddingQueue: {
            enabled: queueConfig.enabled,
            configValid: configStatus.isValid,
            configErrors: configStatus.errors,
            configWarnings: configStatus.warnings
          }
        },
        worker: workerStats ? {
          isRunning: workerStats.isRunning,
          tasksProcessed: workerStats.tasksProcessed,
          tasksSucceeded: workerStats.tasksSucceeded,
          tasksFailed: workerStats.tasksFailed,
          averageProcessingTime: workerStats.averageProcessingTime,
          lastProcessedAt: workerStats.lastProcessedAt
        } : null
      }), {
        status: systemHealthy ? 200 : 503,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Health check error:', error);
      return new Response(JSON.stringify({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed',
        database: {
          healthy: false,
          message: 'Health check failed'
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Public article endpoint (no auth required)
  if (path.startsWith('/api/public-articles/') && request.method === 'GET') {
    try {
      const slug = path.replace('/api/public-articles/', '');
      const article = await getArticleBySlug(slug);

      if (!article) {
        return new Response(JSON.stringify({ error: 'Article not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Public article error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // All other API endpoints require authentication
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    // GET /api/search - Semantic or Hybrid search
    if (path === '/api/search' && request.method === 'GET') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({ error: 'Semantic search is not enabled' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const query = url.searchParams.get('query');
      const k = parseInt(url.searchParams.get('k') || '5', 10);
      const mode = url.searchParams.get('mode') || 'hybrid'; // 'semantic' or 'hybrid'
      const folder = url.searchParams.get('folder') || undefined;

      if (!query) {
        return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const results = mode === 'semantic'
        ? await semanticSearch(query, k, folder)
        : await hybridSearch(query, k, folder);

      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/rag/status - Get RAG index status
    if (path === '/api/rag/status' && request.method === 'GET') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({
          enabled: false,
          message: 'Semantic search is not enabled'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const stats = await getDetailedIndexStats();
      return new Response(JSON.stringify({
        enabled: true,
        ...stats
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/queue/status - Get Embedding Queue status
    if (path === '/api/queue/status' && request.method === 'GET') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({
          enabled: false,
          message: 'Semantic search is not enabled'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const config = embeddingQueueConfigService.getConfig();
      if (!config.enabled) {
        return new Response(JSON.stringify({
          enabled: false,
          message: 'Embedding queue is disabled'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const [detailedStats, health] = await Promise.all([
          embeddingQueueService.getDetailedQueueStats(),
          embeddingQueueService.getQueueHealth()
        ]);

        return new Response(JSON.stringify({
          enabled: true,
          stats: detailedStats.stats,
          tasksByPriority: detailedStats.tasksByPriority,
          tasksByOperation: detailedStats.tasksByOperation,
          recentActivity: detailedStats.recentActivity,
          health: health
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          enabled: true,
          error: error instanceof Error ? error.message : 'Failed to retrieve queue status'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /api/rag/reindex - Rebuild entire index
    if (path === '/api/rag/reindex' && request.method === 'POST') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({ error: 'Semantic search is not enabled' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const result = await embeddingQueueService.resetAndReindexAll();
        const stats = await getDetailedIndexStats();
        
        return new Response(JSON.stringify({
          success: true,
          message: `Reindexing started. Queued ${result.queuedTasks} articles.`,
          queuedTasks: result.queuedTasks,
          ...stats
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to rebuild index'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /api/rag/index-unindexed - Index only unindexed articles
    if (path === '/api/rag/index-unindexed' && request.method === 'POST') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({ error: 'Semantic search is not enabled' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const result = await indexUnindexedArticles();
        const stats = await getDetailedIndexStats();
        return new Response(JSON.stringify({
          success: true,
          indexed: result.indexed,
          failed: result.failed,
          ...stats
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to index articles'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /api/folders - List all folders
    if (path === '/api/folders' && request.method === 'GET') {
      try {
        const folders = await getFolders();
        return new Response(JSON.stringify(folders), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Failed to retrieve folders');
      }
    }

    // PUT /api/folders/manage/:oldName - Rename a folder
    if (path.startsWith('/api/folders/manage/') && request.method === 'PUT') {
      try {
        const oldFolderName = decodeURIComponent(path.replace('/api/folders/manage/', ''));
        const body = await request.json();
        const { newName } = body;

        if (!newName || !newName.trim()) {
          return new Response(JSON.stringify({
            error: 'New folder name is required'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await renameFolder(oldFolderName, newName);
        return new Response(JSON.stringify({
          success: true,
          message: `Folder renamed successfully. ${result.updatedCount} articles updated.`,
          updatedCount: result.updatedCount
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Failed to rename folder');
      }
    }

    // DELETE /api/folders/manage/:folderName - Delete a folder
    if (path.startsWith('/api/folders/manage/') && request.method === 'DELETE') {
      try {
        const folderName = decodeURIComponent(path.replace('/api/folders/manage/', ''));
        const result = await deleteFolder(folderName);
        return new Response(JSON.stringify({
          success: true,
          message: `Folder deleted successfully. ${result.updatedCount} articles updated.`,
          updatedCount: result.updatedCount
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Failed to delete folder');
      }
    }

    // GET /api/articles - List all articles
    if (path === '/api/articles' && request.method === 'GET') {
      const query = url.searchParams.get('q');
      const folder = url.searchParams.get('folder') || undefined;

      if (query) {
        // Search articles
        const results = await searchArticles(query, folder);
        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // List all articles
        const articles = await listArticles(folder);
        return new Response(JSON.stringify(articles), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /api/articles/:filename - Read single article or list versions
    if (path.startsWith('/api/articles/') && request.method === 'GET') {
      const fullPath = path.replace('/api/articles/', '');

      // Check if this is a versions endpoint using regex to avoid path parsing vulnerabilities
      // Matches: <filename>/versions or <filename>/versions/<versionId>
      const versionMatch = fullPath.match(/^(.+?)\/versions(?:\/([^\/]+))?$/);

      if (versionMatch) {
        const filename = versionMatch[1];
        const versionId = versionMatch[2];

        if (!versionId) {
          // List all versions
          const versions = await listArticleVersions(filename);
          return new Response(JSON.stringify(versions), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          // Get specific version
          const version = await getArticleVersion(filename, versionId);

          if (!version) {
            return new Response(JSON.stringify({ error: 'Version not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          return new Response(JSON.stringify(version), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Regular article read
      const filename = fullPath;
      const article = await readArticle(filename);

      if (!article) {
        return new Response(JSON.stringify({ error: 'Article not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // POST /api/articles - Create new article
    if (path === '/api/articles' && request.method === 'POST') {
      const body = await request.json();
      const { title, content, folder, message } = body;

      if (!title || !content) {
        return new Response(JSON.stringify({ error: 'Title and content are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const article = await createArticle(title, content, folder, message);
      return new Response(JSON.stringify(article), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // PUT /api/articles/:filename - Update article
    if (path.startsWith('/api/articles/') && request.method === 'PUT') {
      const filename = path.replace('/api/articles/', '');

      // Check if this is a version restore endpoint using regex to avoid path parsing vulnerabilities
      // Matches: <filename>/versions/<versionId>/restore
      const restoreMatch = filename.match(/^(.+?)\/versions\/([^\/]+)\/restore$/);

      if (restoreMatch) {
        const articleFilename = restoreMatch[1];
        const versionId = restoreMatch[2];

        const body = await request.json();
        const { message } = body;

        const article = await restoreArticleVersion(articleFilename, versionId, message);
        return new Response(JSON.stringify(article), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Regular article update
      const body = await request.json();
      const { title, content, folder, message } = body;

      // Validate that at least one field is provided for update
      if (title === undefined && content === undefined && folder === undefined) {
        return new Response(JSON.stringify({ error: 'At least one field (title, content, or folder) must be provided for update' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const article = await updateArticle(filename, title, content, folder, message);
      return new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // DELETE /api/articles/:filename - Delete article or versions
    if (path.startsWith('/api/articles/') && request.method === 'DELETE') {
      const fullPath = path.replace('/api/articles/', '');

      // Check if this is a versions delete endpoint using regex to avoid path parsing vulnerabilities
      // Matches: <filename>/versions or <filename>/versions/<versionId>
      const versionMatch = fullPath.match(/^(.+?)\/versions(?:\/([^\/]+))?$/);

      if (versionMatch) {
        const filename = versionMatch[1];
        const versionId = versionMatch[2];

        if (!versionId) {
          // Delete all versions
          await deleteArticleVersions(filename);
        } else {
          // Delete specific version
          await deleteArticleVersions(filename, [versionId]);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Regular article deletion
      const filename = fullPath;
      await deleteArticle(filename);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/articles/:filename/public-status - Get public status
    if (path.match(/^\/api\/articles\/[^\/]+\/public-status$/) && request.method === 'GET') {
      const filename = path.replace('/api/articles/', '').replace('/public-status', '');
      const isPublic = await isArticlePublic(filename);

      return new Response(JSON.stringify({ isPublic }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // POST /api/articles/:filename/public - Set public status
    if (path.match(/^\/api\/articles\/[^\/]+\/public$/) && request.method === 'POST') {
      const filename = path.replace('/api/articles/', '').replace('/public', '');
      const body = await request.json();
      const { isPublic } = body;

      if (typeof isPublic !== 'boolean') {
        return new Response(JSON.stringify({ error: 'isPublic must be a boolean' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      await setArticlePublic(filename, isPublic);

      return new Response(JSON.stringify({ success: true, isPublic }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/import/status - Get import status
    if (path === '/api/import/status' && request.method === 'GET') {
      const status = importStatusService.getStatus();
      return new Response(JSON.stringify(status), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // POST /api/import/validate - Start validation
    if (path === '/api/import/validate' && request.method === 'POST') {
      try {
        const result = await importStatusService.validate();
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Validation failed');
      }
    }

    // POST /api/import/start - Start import
    if (path === '/api/import/start' && request.method === 'POST') {
      try {
        await importStatusService.startImport();
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Import failed to start');
      }
    }

    // Route not found
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('API Error:', error);
    return handleServiceError(error, 'Internal server error');
  }
}
