import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  listArticles,
  searchArticles,
  readArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  getFolders
} from '../services/articles';
import { semanticSearch } from '../services/vectorIndex';
import { embeddingQueueService } from '../services/embeddingQueue';
import { databaseArticleService } from '../services/databaseArticles';
import { randomUUID } from 'crypto';

type McpSessionEntry = {
  transport: StreamableHTTPServerTransport;
  token: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  ip: string;
  userAgent: string | null;
};

const AUTH_TOKEN = process.env.AUTH_TOKEN;
const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

const MCP_SESSION_IDLE_MS = Number.parseInt(process.env.MCP_SESSION_IDLE_MS ?? '900000', 10); // 15m
const MCP_SESSION_TTL_MS = Number.parseInt(process.env.MCP_SESSION_TTL_MS ?? '3600000', 10); // 1h
const MCP_MAX_SESSIONS_TOTAL = Number.parseInt(process.env.MCP_MAX_SESSIONS_TOTAL ?? '200', 10);
const MCP_MAX_SESSIONS_PER_IP = Number.parseInt(process.env.MCP_MAX_SESSIONS_PER_IP ?? '50', 10);
const MCP_MAX_SESSIONS_PER_TOKEN = Number.parseInt(process.env.MCP_MAX_SESSIONS_PER_TOKEN ?? '100', 10);
const MCP_BIND_SESSION_TO_IP = process.env.MCP_BIND_SESSION_TO_IP?.toLowerCase() === 'true';

// Session management for HTTP transport
const sessions: Record<string, McpSessionEntry> = {};

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1].trim();
  return token ? token : null;
}

function isAuthorizedToken(token: string | null): token is string {
  if (!token || !AUTH_TOKEN) {
    return false;
  }
  return token === AUTH_TOKEN;
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

function cleanupExpiredSessions(nowMs: number) {
  for (const [sessionId, entry] of Object.entries(sessions)) {
    const idleExpired = nowMs - entry.lastSeenAtMs > MCP_SESSION_IDLE_MS;
    const ttlExpired = nowMs - entry.createdAtMs > MCP_SESSION_TTL_MS;
    if (idleExpired || ttlExpired) {
      try {
        (entry.transport as any).close?.();
      } catch {
        // ignore
      }
      delete sessions[sessionId];
    }
  }
}

function enforceSessionLimits(ip: string, token: string): Response | null {
  const allSessions = Object.values(sessions);
  if (allSessions.length >= MCP_MAX_SESSIONS_TOTAL) {
    return new Response(JSON.stringify({ error: 'Too many active sessions' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ipCount = allSessions.filter((s) => s.ip === ip).length;
  if (ipCount >= MCP_MAX_SESSIONS_PER_IP) {
    return new Response(JSON.stringify({ error: 'Too many active sessions for IP' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokenCount = allSessions.filter((s) => s.token === token).length;
  if (tokenCount >= MCP_MAX_SESSIONS_PER_TOKEN) {
    return new Response(JSON.stringify({ error: 'Too many active sessions for token' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null;
}

function getAuthorizedSession(request: Request, sessionId: string | null): { entry: McpSessionEntry; sessionId: string } | Response {
  const token = getBearerToken(request);
  if (!isAuthorizedToken(token)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!sessionId) {
    return new Response('Invalid or missing session ID', { status: 400 });
  }

  const entry = sessions[sessionId];
  if (!entry) {
    return new Response('Invalid or missing session ID', { status: 400 });
  }

  if (entry.token !== token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (MCP_BIND_SESSION_TO_IP) {
    const ip = getClientIp(request);
    if (entry.ip !== ip) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return { entry, sessionId };
}

// Create a configured MCP server instance (shared logic for stdio and HTTP)
function createConfiguredMCPServer() {
  const server = new Server(
    {
      name: 'mcp-markdown-manager',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: any[] = [
      {
        name: 'listArticles',
        description: 'List all articles with metadata (title, filename, creation date)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'listFolders',
        description: 'Get a unique list of all article folders to understand the knowledge repository structure',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'searchArticles',
        description: 'Search articles by title (partial match)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to match against article titles',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'readArticle',
        description: 'Read a single article by filename',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the article (e.g., my-article.md)',
            },
          },
          required: ['filename'],
        },
      },
      {
        name: 'createArticle',
        description: 'Create a new article with title and content',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the article',
            },
            content: {
              type: 'string',
              description: 'Markdown content of the article',
            },
            folder: {
              type: 'string',
              description: 'Optional folder path (e.g., "projects/web-dev")'
            },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'updateArticle',
        description: 'Update an existing article',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the article to update',
            },
            title: {
              type: 'string',
              description: 'New title of the article',
            },
            content: {
              type: 'string',
              description: 'New markdown content of the article',
            },
            folder: {
              type: 'string',
              description: 'New folder path (e.g., "projects/web-dev")'
            },
          },
          required: ['filename', 'title', 'content'],
        },
      },
      {
        name: 'deleteArticle',
        description: 'Delete an article by filename',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the article to delete',
            },
          },
          required: ['filename'],
        },
      },
    ];

    // Add semantic search tool if enabled
    if (SEMANTIC_SEARCH_ENABLED) {
      tools.push({
        name: 'semanticSearch',
        description: 'Perform semantic search across article content using vector embeddings',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to find semantically similar content',
            },
            k: {
              type: 'number',
              description: 'Number of results to return (default: 5)',
            },
          },
          required: ['query'],
        },
      });

      // Add embedding queue management tools
      tools.push({
        name: 'getEmbeddingQueueStatus',
        description: 'Get current status and statistics of the embedding queue',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      });

      tools.push({
        name: 'getArticleEmbeddingStatus',
        description: 'Get embedding status for a specific article',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Filename of the article (e.g., my-article.md)',
            },
          },
          required: ['filename'],
        },
      });

      tools.push({
        name: 'getBulkEmbeddingProgress',
        description: 'Get progress of bulk embedding operations',
        inputSchema: {
          type: 'object',
          properties: {
            operationId: {
              type: 'string',
              description: 'Optional operation ID to get specific bulk operation progress',
            },
          },
        },
      });
    }

    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      switch (request.params.name) {
        case 'listArticles': {
          const articles = await listArticles();

          // Add embedding status if semantic search is enabled
          let articlesWithEmbeddingStatus = articles;
          if (SEMANTIC_SEARCH_ENABLED) {
            try {
              articlesWithEmbeddingStatus = await Promise.all(
                articles.map(async (article) => {
                  try {
                    const slug = article.filename.replace(/\.md$/, '');
                    const articleId = await databaseArticleService.getArticleId(slug);

                    if (articleId) {
                      const tasks = await embeddingQueueService.getTasksForArticle(articleId);
                      const latestTask = tasks.length > 0 ? tasks[0] : null;

                      return {
                        ...article,
                        embeddingStatus: {
                          status: latestTask?.status || 'no_tasks',
                          hasEmbedding: latestTask?.status === 'completed',
                          isPending: latestTask?.status === 'pending' || latestTask?.status === 'processing',
                          lastUpdated: latestTask?.completedAt || latestTask?.createdAt
                        }
                      };
                    }
                    return article;
                  } catch (error) {
                    // Don't fail the entire list if one article's embedding status check fails
                    console.warn(`Failed to get embedding status for article ${article.filename}:`, error);
                    return article;
                  }
                })
              );
            } catch (error) {
              // Don't fail the article list if embedding status checks fail
              console.warn('Failed to get embedding status for articles:', error);
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(articlesWithEmbeddingStatus, null, 2),
              },
            ],
          };
        }

        case 'listFolders': {
          const folders = await getFolders();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(folders, null, 2),
              },
            ],
          };
        }

        case 'searchArticles': {
          const { query } = request.params.arguments as { query: string };
          const results = await searchArticles(query);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'semanticSearch': {
          if (!SEMANTIC_SEARCH_ENABLED) {
            throw new Error('Semantic search is not enabled');
          }
          const { query, k } = request.params.arguments as { query: string; k?: number };
          const results = await semanticSearch(query, k || 5);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'getEmbeddingQueueStatus': {
          if (!SEMANTIC_SEARCH_ENABLED) {
            throw new Error('Semantic search is not enabled');
          }
          const detailedStats = await embeddingQueueService.getDetailedQueueStats();
          const queueHealth = await embeddingQueueService.getQueueHealth();

          const response = {
            stats: detailedStats.stats,
            tasksByPriority: detailedStats.tasksByPriority,
            tasksByOperation: detailedStats.tasksByOperation,
            recentActivity: detailedStats.recentActivity,
            health: queueHealth
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        case 'getArticleEmbeddingStatus': {
          if (!SEMANTIC_SEARCH_ENABLED) {
            throw new Error('Semantic search is not enabled');
          }
          const { filename } = request.params.arguments as { filename: string };

          // Convert filename to slug and get article ID
          const slug = filename.replace(/\.md$/, '');
          const articleId = await databaseArticleService.getArticleId(slug);

          if (!articleId) {
            throw new Error(`Article ${filename} not found`);
          }

          // Get embedding tasks for this article
          const tasks = await embeddingQueueService.getTasksForArticle(articleId);

          // Get the most recent task status
          const latestTask = tasks.length > 0 ? tasks[0] : null;

          const response = {
            filename,
            articleId,
            embeddingStatus: latestTask?.status || 'no_tasks',
            latestTask: latestTask ? {
              id: latestTask.id,
              operation: latestTask.operation,
              status: latestTask.status,
              priority: latestTask.priority,
              attempts: latestTask.attempts,
              maxAttempts: latestTask.maxAttempts,
              createdAt: latestTask.createdAt,
              scheduledAt: latestTask.scheduledAt,
              processedAt: latestTask.processedAt,
              completedAt: latestTask.completedAt,
              errorMessage: latestTask.errorMessage
            } : null,
            allTasks: tasks.map(task => ({
              id: task.id,
              operation: task.operation,
              status: task.status,
              createdAt: task.createdAt,
              completedAt: task.completedAt,
              errorMessage: task.errorMessage
            }))
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        case 'getBulkEmbeddingProgress': {
          if (!SEMANTIC_SEARCH_ENABLED) {
            throw new Error('Semantic search is not enabled');
          }
          const { operationId } = request.params.arguments as { operationId?: string };

          if (operationId) {
            // Get specific bulk operation summary
            const summary = await embeddingQueueService.getBulkOperationSummary(operationId);
            if (!summary) {
              throw new Error(`Bulk operation ${operationId} not found`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(summary, null, 2),
                },
              ],
            };
          } else {
            // Get recent bulk operations
            const recentOperations = await embeddingQueueService.listRecentBulkOperations(10);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(recentOperations, null, 2),
                },
              ],
            };
          }
        }

        case 'readArticle': {
          const { filename } = request.params.arguments as { filename: string };
          const article = await readArticle(filename);
          if (!article) {
            throw new Error(`Article ${filename} not found`);
          }

          // Add embedding status if semantic search is enabled
          let embeddingStatus = undefined;
          if (SEMANTIC_SEARCH_ENABLED) {
            try {
              const slug = filename.replace(/\.md$/, '');
              const articleId = await databaseArticleService.getArticleId(slug);

              if (articleId) {
                const tasks = await embeddingQueueService.getTasksForArticle(articleId);
                const latestTask = tasks.length > 0 ? tasks[0] : null;

                embeddingStatus = {
                  status: latestTask?.status || 'no_tasks',
                  lastUpdated: latestTask?.completedAt || latestTask?.createdAt,
                  hasEmbedding: latestTask?.status === 'completed',
                  isPending: latestTask?.status === 'pending' || latestTask?.status === 'processing',
                  errorMessage: latestTask?.errorMessage
                };
              }
            } catch (error) {
              // Don't fail the article read if embedding status check fails
              console.warn('Failed to get embedding status for article:', error);
            }
          }

          const response = {
            ...article,
            ...(embeddingStatus && { embeddingStatus })
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        case 'createArticle': {
          const { title, content, folder } = request.params.arguments as {
            title: string;
            content: string;
            folder?: string;
          };
          // Use background embedding for immediate response without waiting for embedding completion
          const article = await createArticle(title, content, folder, undefined, {
            embeddingPriority: 'normal'
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(article, null, 2),
              },
            ],
          };
        }

        case 'updateArticle': {
          const { filename, title, content, folder } = request.params.arguments as {
            filename: string;
            title: string;
            content: string;
            folder?: string;
          };
          // Use background embedding for immediate response without waiting for embedding completion
          const article = await updateArticle(filename, title, content, folder, undefined, {
            embeddingPriority: 'normal'
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(article, null, 2),
              },
            ],
          };
        }

        case 'deleteArticle': {
          const { filename } = request.params.arguments as { filename: string };
          await deleteArticle(filename);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, filename }, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// MCP Server for stdio transport (used by MCP clients)
export function createMCPServer() {
  const server = createConfiguredMCPServer();
  return server;
}

// Helper to check if a request is an initialize request
function isInitializeRequest(body: any): boolean {
  return body && body.method === 'initialize';
}

// HTTP endpoint handler for MCP protocol - POST requests
export async function handleMCPPostRequest(request: Request): Promise<Response> {
  // Check authentication
  const token = getBearerToken(request);
  if (!isAuthorizedToken(token)) {
    console.log('MCP auth failed');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const nowMs = Date.now();
  cleanupExpiredSessions(nowMs);

  let body: any;
  try {
    body = await request.json();
    console.log('MCP POST request received:', { id: body?.id ?? null, method: body?.method ?? null });

    const sessionId = request.headers.get('mcp-session-id');

    // Handle initialize request - this is the first request from the client
    if (isInitializeRequest(body)) {
      console.log('Handling initialize request');

      const ip = getClientIp(request);
      const userAgent = request.headers.get('user-agent');

      const limitResponse = enforceSessionLimits(ip, token);
      if (limitResponse) {
        return limitResponse;
      }

      // Generate a new session ID
      const newSessionId = randomUUID();

      // Create a new transport for this session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      // Store the transport
      sessions[newSessionId] = {
        transport,
        token,
        createdAtMs: nowMs,
        lastSeenAtMs: nowMs,
        ip,
        userAgent,
      };

      // Set up transport close handler
      transport.onclose = () => {
        console.log(`Transport closed for session ${newSessionId}`);
        delete sessions[newSessionId];
      };

      // Connect the server to the transport
      const server = createConfiguredMCPServer();
      await server.connect(transport);

      // Convert Bun Request to Node.js-compatible request object
      const nodeReq = await convertBunRequestToNode(request, body);
      const nodeRes = createNodeResponse();

      // Handle the request with the transport
      await transport.handleRequest(nodeReq, nodeRes, body);

      // Convert Node.js response back to Bun Response
      return convertNodeResponseToBun(nodeRes, newSessionId);
    }

    // For non-initialize requests, we need a session ID
    if (!sessionId) {
      console.log('No session ID provided for non-initialize request');
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body?.id || null,
        error: {
          code: -32000,
          message: 'No valid session ID provided',
        },
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if we have a transport for this session
    const entry = sessions[sessionId];
    if (!entry) {
      console.log(`No transport found for session ${sessionId}`);
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body?.id || null,
        error: {
          code: -32000,
          message: 'Invalid session ID',
        },
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Token binding check (prevents session ID hijack)
    if (entry.token !== token) {
      console.log(`Token mismatch for session ${sessionId}`);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (MCP_BIND_SESSION_TO_IP) {
      const ip = getClientIp(request);
      if (entry.ip !== ip) {
        console.log(`IP mismatch for session ${sessionId}`);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    entry.lastSeenAtMs = nowMs;

    // Handle the request with the existing transport
    const nodeReq = await convertBunRequestToNode(request, body);
    const nodeRes = createNodeResponse();

    await entry.transport.handleRequest(nodeReq, nodeRes, body);

    return convertNodeResponseToBun(nodeRes);

  } catch (error) {
    console.log('MCP error:', error);
    const id = body?.id;
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : 'Internal server error',
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// HTTP endpoint handler for MCP protocol - GET requests (SSE streams)
export async function handleMCPGetRequest(request: Request): Promise<Response> {
  const sessionId = request.headers.get('mcp-session-id');

  const nowMs = Date.now();
  cleanupExpiredSessions(nowMs);

  const authorized = getAuthorizedSession(request, sessionId);
  if (authorized instanceof Response) {
    return authorized;
  }

  console.log(`Establishing SSE stream for session ${sessionId}`);

  const { entry } = authorized;
  entry.lastSeenAtMs = nowMs;

  const nodeReq = await convertBunRequestToNode(request);
  const nodeRes = createNodeResponse();

  await entry.transport.handleRequest(nodeReq, nodeRes);

  return convertNodeResponseToBun(nodeRes);
}

// HTTP endpoint handler for MCP protocol - DELETE requests (session termination)
export async function handleMCPDeleteRequest(request: Request): Promise<Response> {
  const sessionId = request.headers.get('mcp-session-id');

  const nowMs = Date.now();
  cleanupExpiredSessions(nowMs);

  const authorized = getAuthorizedSession(request, sessionId);
  if (authorized instanceof Response) {
    return authorized;
  }

  console.log(`Terminating session ${sessionId}`);

  const { entry } = authorized;
  entry.lastSeenAtMs = nowMs;

  const nodeReq = await convertBunRequestToNode(request);
  const nodeRes = createNodeResponse();

  await entry.transport.handleRequest(nodeReq, nodeRes);

  return convertNodeResponseToBun(nodeRes);
}

// Helper functions to convert between Bun and Node.js request/response

async function convertBunRequestToNode(bunReq: Request, parsedBody?: any): Promise<any> {
  const url = new URL(bunReq.url);

  const nodeReq: any = {
    method: bunReq.method,
    url: url.pathname + url.search,
    headers: {} as Record<string, string>,
    body: parsedBody,
  };

  // Convert headers
  bunReq.headers.forEach((value, key) => {
    nodeReq.headers[key.toLowerCase()] = value;
  });

  return nodeReq;
}

function createNodeResponse(): any {
  let statusCode = 200;
  let statusMessage = 'OK';
  const headers: Record<string, string | string[]> = {};
  const chunks: any[] = [];
  let finished = false;
  const listeners: Record<string, Function[]> = {};
  let finishPromise: Promise<void>;
  let resolveFinish: () => void;

  // Create a promise that resolves when the response is finished
  finishPromise = new Promise((resolve) => {
    resolveFinish = resolve;
  });

  const nodeRes: any = {
    statusCode,
    statusMessage,
    finished,
    headersSent: false,

    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
      return this;
    },

    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },

    writeHead(code: number, message?: string | Record<string, string>, headersObj?: Record<string, string>) {
      statusCode = code;
      if (typeof message === 'string') {
        statusMessage = message;
        if (headersObj) {
          Object.entries(headersObj).forEach(([k, v]) => {
            headers[k.toLowerCase()] = v;
          });
        }
      } else if (message) {
        Object.entries(message).forEach(([k, v]) => {
          headers[k.toLowerCase()] = v;
        });
      }
      this.headersSent = true;
      this.statusCode = code;
      return this;
    },

    write(chunk: any) {
      chunks.push(chunk);
      return true;
    },

    end(data?: any) {
      if (data) {
        chunks.push(data);
      }
      finished = true;
      this.finished = true;
      // Trigger finish event
      this.emit('finish');
      // Resolve the finish promise
      resolveFinish();
    },

    // EventEmitter-like methods
    on(event: string, listener: Function) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(listener);
      return this;
    },

    once(event: string, listener: Function) {
      const onceWrapper = (...args: any[]) => {
        listener(...args);
        this.removeListener(event, onceWrapper);
      };
      return this.on(event, onceWrapper);
    },

    removeListener(event: string, listener: Function) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(l => l !== listener);
      }
      return this;
    },

    emit(event: string, ...args: any[]) {
      if (listeners[event]) {
        listeners[event].forEach(listener => listener(...args));
      }
      return true;
    },

    // Expose internal state for conversion
    _getState() {
      return { statusCode, statusMessage, headers, chunks, finished };
    },

    // Expose the finish promise
    _waitForFinish() {
      return finishPromise;
    },
  };

  return nodeRes;
}

async function convertNodeResponseToBun(nodeRes: any, sessionId?: string): Promise<Response> {
  // Wait for the response to finish
  await nodeRes._waitForFinish();

  const state = nodeRes._getState();
  const { statusCode, headers, chunks } = state;

  // Combine all chunks
  const body = chunks.length > 0 ? chunks.join('') : '';

  // Convert headers to Headers object
  const responseHeaders = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => responseHeaders.append(key, v));
    } else if (value) {
      responseHeaders.set(key, value as string);
    }
  });

  // Add session ID header if provided
  if (sessionId) {
    responseHeaders.set('mcp-session-id', sessionId);
  }

  return new Response(body, {
    status: statusCode,
    headers: responseHeaders,
  });
}