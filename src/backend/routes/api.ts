import { authenticate, requireAuth, authenticateWeb, type AuthContext } from '../middleware/auth';
import { createRateLimiter, RateLimitPresets } from '../middleware/rateLimit';
import { createRequestSizeValidator, RequestSizePresets } from '../middleware/requestSize';
import { DatabaseServiceError, DatabaseErrorType } from '../services/databaseErrors.js';
import {
  createAccessToken,
  listAccessTokens,
  deleteAccessToken,
  deleteAccessTokenById,
  getAccessToken,
  hasPermission,
  type TokenScope
} from '../services/accessTokens.js';
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
  deleteArticleVersions,
  renameArticleSlug
} from '../services/articles';
import { semanticSearch, hybridSearch, getDetailedIndexStats, indexUnindexedArticles } from '../services/vectorIndex';
import { databaseHealthService } from '../services/databaseHealth.js';
import { databaseInit } from '../services/databaseInit.js';
import { backgroundWorkerService } from '../services/backgroundWorker.js';
import { embeddingQueueService } from '../services/embeddingQueue.js';
import { embeddingQueueConfigService } from '../services/embeddingQueueConfig.js';
import { importStatusService } from '../services/importStatus.js';

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

// Create middleware instances
const apiRateLimit = createRateLimiter(RateLimitPresets.API_GENERAL);
const expensiveRateLimit = createRateLimiter(RateLimitPresets.API_EXPENSIVE);
const publicRateLimit = createRateLimiter(RateLimitPresets.PUBLIC_LIGHT);
const requestSizeValidator = createRequestSizeValidator(RequestSizePresets.ARTICLE_CONTENT);

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
    // Apply light rate limiting to prevent health check abuse
    const rateLimitError = publicRateLimit(request);
    if (rateLimitError) return rateLimitError;

    try {
      const isAuthenticated = await authenticate(request, true);

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
    // Apply light rate limiting to prevent abuse
    const rateLimitError = publicRateLimit(request);
    if (rateLimitError) return rateLimitError;

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
  // The middleware now accepts both AUTH_TOKEN (for web UI) and access tokens (for API/MCP)
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult.error;

  const authContext = authResult.auth;

  // Helper function to check if token has required scope
  const checkScope = (requiredScope: TokenScope): Response | null => {
    if (!hasPermission(authContext.scope, requiredScope)) {
      return new Response(JSON.stringify({
        error: 'Insufficient permissions',
        message: `This operation requires ${requiredScope} scope, but token has ${authContext.scope} scope`
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return null;
  };

  // Apply rate limiting to all authenticated endpoints
  const rateLimitError = apiRateLimit(request);
  if (rateLimitError) return rateLimitError;

  // Apply request size validation to POST/PUT endpoints
  if (request.method === 'POST' || request.method === 'PUT') {
    const sizeError = await requestSizeValidator(request);
    if (sizeError) return sizeError;
  }

  try {
    // ==================== Access Token Management Endpoints ====================
    // These endpoints require web auth (AUTH_TOKEN) only

    // GET /api/access-tokens - List all access tokens
    if (path === '/api/access-tokens' && request.method === 'GET') {
      // This endpoint requires web auth only
      const webAuthResult = await requireAuth(request, 'write', true);
      if ('error' in webAuthResult) return webAuthResult.error;

      try {
        const tokens = await listAccessTokens();
        return new Response(JSON.stringify(tokens), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Failed to list access tokens');
      }
    }

    // POST /api/access-tokens - Create a new access token
    if (path === '/api/access-tokens' && request.method === 'POST') {
      // This endpoint requires web auth only
      const webAuthResult = await requireAuth(request, 'write', true);
      if ('error' in webAuthResult) return webAuthResult.error;

      try {
        const body = await request.json();
        const { name, scope } = body;

        if (!name || !name.trim()) {
          return new Response(JSON.stringify({ error: 'Token name is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (scope !== 'read-only' && scope !== 'write') {
          return new Response(JSON.stringify({ error: 'Scope must be either "read-only" or "write"' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const token = await createAccessToken(name, scope as TokenScope);
        return new Response(JSON.stringify(token), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Failed to create access token');
      }
    }

    // DELETE /api/access-tokens/:id - Delete an access token by ID
    if (path.startsWith('/api/access-tokens/') && request.method === 'DELETE') {
      // This endpoint requires web auth only
      const webAuthResult = await requireAuth(request, 'write', true);
      if ('error' in webAuthResult) return webAuthResult.error;

      try {
        const idOrToken = decodeURIComponent(path.replace('/api/access-tokens/', ''));

        // Try to parse as ID first (number)
        const tokenId = parseInt(idOrToken, 10);
        let deleted: boolean;

        if (!isNaN(tokenId)) {
          // Delete by ID
          deleted = await deleteAccessTokenById(tokenId);
        } else {
          // Delete by token string (fallback for backwards compatibility)
          deleted = await deleteAccessToken(idOrToken);
        }

        if (!deleted) {
          return new Response(JSON.stringify({ error: 'Token not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Failed to delete access token');
      }
    }

    // ==================== Article and Search Endpoints ====================

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
      const folder = url.searchParams.get('folder') ?? undefined;

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
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

      // Apply stricter rate limiting for expensive operations
      const expensiveRateLimitError = expensiveRateLimit(request);
      if (expensiveRateLimitError) return expensiveRateLimitError;

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
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

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
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

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
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

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
      const folder = url.searchParams.get('folder') ?? undefined;

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
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

      const body = await request.json();
      const { title, content, folder, message, noRag } = body;

      if (!title || !content) {
        return new Response(JSON.stringify({ error: 'Title and content are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (noRag !== undefined && typeof noRag !== 'boolean') {
        return new Response(JSON.stringify({ error: 'noRag must be a boolean' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const article = await createArticle(title, content, folder, message, undefined, authContext.tokenName, noRag);
      return new Response(JSON.stringify(article), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // PUT /api/articles/:filename - Update article
    if (path.startsWith('/api/articles/') && request.method === 'PUT') {
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

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
      const { title, content, folder, message, noRag } = body;

      if (!title || !content) {
        return new Response(JSON.stringify({ error: 'Title and content are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (noRag !== undefined && typeof noRag !== 'boolean') {
        return new Response(JSON.stringify({ error: 'noRag must be a boolean' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const article = await updateArticle(filename, title, content, folder, message, undefined, authContext.tokenName, noRag);
      return new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // DELETE /api/articles/:filename - Delete article or versions
    if (path.startsWith('/api/articles/') && request.method === 'DELETE') {
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

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
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

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

    // POST /api/articles/:filename/rename-slug - Rename article slug
    if (path.match(/^\/api\/articles\/[^\/]+\/rename-slug$/) && request.method === 'POST') {
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

      try {
        const filename = path.replace('/api/articles/', '').replace('/rename-slug', '');
        const body = await request.json();
        const { newSlug } = body;

        if (!newSlug || !newSlug.trim()) {
          return new Response(JSON.stringify({ error: 'New slug is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const renamedArticle = await renameArticleSlug(filename, newSlug);

        return new Response(JSON.stringify({
          success: true,
          article: renamedArticle
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return handleServiceError(error, 'Failed to rename article slug');
      }
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
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

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
      // Require write scope
      const scopeError = checkScope('write');
      if (scopeError) return scopeError;

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
