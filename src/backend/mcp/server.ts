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
import { semanticSearch, SearchResult } from '../services/vectorIndex';
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
const MCP_MULTI_SEARCH_LIMIT = Number.parseInt(process.env.MCP_MULTI_SEARCH_LIMIT ?? '10', 10);

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
          properties: {
            folder: {
              type: 'string',
              description: 'Folder to list articles from. Use "" for all folders, "/" for root folder only.',
            },
            maxArticles: {
              type: 'number',
              description: 'Maximum number of articles to return (default: 100)',
            },
          },
          required: ['folder'],
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
            folder: {
              type: 'string',
              description: 'Optional folder path. Use "" (default) for all folders, "/" for root folder only.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'multiSearchArticles',
        description: 'Search articles by multiple titles (partial match) and return unique results',
        inputSchema: {
          type: 'object',
          properties: {
            titles: {
              type: 'array',
              description: `Array of title search queries (max ${MCP_MULTI_SEARCH_LIMIT} items)`,
              items: {
                type: 'string',
              },
              maxItems: MCP_MULTI_SEARCH_LIMIT,
            },
            folder: {
              type: 'string',
              description: 'Optional folder path to filter results (e.g., "projects/web-dev")',
            },
          },
          required: ['titles'],
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
            folder: {
              type: 'string',
              description: 'Optional folder path. Use "" (default) for all folders, "/" for root folder only.',
            },
          },
          required: ['query'],
        },
      });

      tools.push({
        name: 'multiSemanticSearch',
        description: 'Perform multiple semantic searches across article content and return unique results',
        inputSchema: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              description: `Array of search queries (max ${MCP_MULTI_SEARCH_LIMIT} items)`,
              items: {
                type: 'string',
              },
              maxItems: MCP_MULTI_SEARCH_LIMIT,
            },
            k: {
              type: 'number',
              description: 'Number of results to return per query (default: 5)',
            },
            folder: {
              type: 'string',
              description: 'Optional folder path to filter results (e.g., "projects/web-dev")',
            },
          },
          required: ['queries'],
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
          const { folder, maxArticles } = request.params.arguments as { folder: string; maxArticles?: number };
          
          // If folder is empty string, treat as undefined (all folders)
          // If folder is "/", pass it as is (service handles it as root)
          const folderParam = folder === '' ? undefined : folder;
          const limit = maxArticles || 100;

          const articles = await listArticles(folderParam, limit);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(articles, null, 2),
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
          const { query, folder } = request.params.arguments as { query: string; folder?: string };
          
          // If folder is empty string, treat as undefined (all folders)
          const folderParam = folder === '' ? undefined : folder;
          
          const results = await searchArticles(query, folderParam);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'multiSearchArticles': {
          const { titles, folder } = request.params.arguments as { titles: string[]; folder?: string };
          
          // Validate array size
          if (!Array.isArray(titles)) {
            throw new Error('titles must be an array');
          }
          if (titles.length === 0) {
            throw new Error('titles array cannot be empty');
          }
          if (titles.length > MCP_MULTI_SEARCH_LIMIT) {
            throw new Error(`titles array cannot exceed ${MCP_MULTI_SEARCH_LIMIT} items`);
          }

          // Perform searches and aggregate results
          const allResults = await Promise.all(
            titles.map(title => searchArticles(title, folder))
          );

          // Flatten results and remove duplicates based on filename
          const uniqueResults = Array.from(
            new Map(
              allResults.flat().map(article => [article.filename, article])
            ).values()
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(uniqueResults, null, 2),
              },
            ],
          };
        }

        case 'semanticSearch': {
          if (!SEMANTIC_SEARCH_ENABLED) {
            throw new Error('Semantic search is not enabled');
          }
          const { query, k, folder } = request.params.arguments as { query: string; k?: number; folder?: string };
          
          // If folder is empty string, treat as undefined (all folders)
          const folderParam = folder === '' ? undefined : folder;
          
          const results = await semanticSearch(query, k || 5, folderParam);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'multiSemanticSearch': {
          if (!SEMANTIC_SEARCH_ENABLED) {
            throw new Error('Semantic search is not enabled');
          }
          const { queries, k, folder } = request.params.arguments as { queries: string[]; k?: number; folder?: string };
          
          // Validate array size
          if (!Array.isArray(queries)) {
            throw new Error('queries must be an array');
          }
          if (queries.length === 0) {
            throw new Error('queries array cannot be empty');
          }
          if (queries.length > MCP_MULTI_SEARCH_LIMIT) {
            throw new Error(`queries array cannot exceed ${MCP_MULTI_SEARCH_LIMIT} items`);
          }

          const resultsPerQuery = k || 5;

          // Perform searches and aggregate results
          const allResults = await Promise.all(
            queries.map(query => semanticSearch(query, resultsPerQuery, folder))
          );

          // Flatten results and remove duplicates based on chunk filename + chunkIndex
          const seenChunks = new Map<string, SearchResult>();
          const uniqueResults: SearchResult[] = [];

          for (const results of allResults) {
            for (const result of results) {
              const key = `${result.chunk.filename}:${result.chunk.chunkIndex}`;
              if (!seenChunks.has(key)) {
                seenChunks.set(key, result);
                uniqueResults.push(result);
              }
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(uniqueResults, null, 2),
              },
            ],
          };
        }

        case 'readArticle': {
          const { filename } = request.params.arguments as { filename: string };
          const article = await readArticle(filename);
          if (!article) {
            throw new Error(`Article ${filename} not found`);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(article, null, 2),
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

  let controller: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      // Optional: Handle stream cancellation
    }
  });

  let resolveHeaders: (headers: Headers) => void;
  let rejectHeaders: (reason?: any) => void;
  const headersPromise = new Promise<Headers>((resolve, reject) => {
    resolveHeaders = resolve;
    rejectHeaders = reject;
  });

  let headersResolved = false;

  const nodeRes = createNodeResponse({
    onWrite: (chunk) => {
      if (typeof chunk === 'string') {
        controller.enqueue(new TextEncoder().encode(chunk));
      } else if (chunk instanceof Uint8Array) {
        controller.enqueue(chunk);
      } else {
        controller.enqueue(new TextEncoder().encode(String(chunk)));
      }
    },
    onEnd: () => {
      try {
        controller.close();
      } catch (e) {
        // Ignore if already closed
      }
    },
    onWriteHead: (code, headersObj) => {
      if (headersResolved) return;
      headersResolved = true;

      const responseHeaders = new Headers();
      if (headersObj) {
        Object.entries(headersObj).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => responseHeaders.append(key, v));
          } else if (value) {
            responseHeaders.set(key, value as string);
          }
        });
      }
      resolveHeaders(responseHeaders);
    }
  });

  // Start handling the request without awaiting it to block the response
  entry.transport.handleRequest(nodeReq, nodeRes).catch(error => {
    console.error('Error handling MCP GET request:', error);
    if (!headersResolved) {
      rejectHeaders(error);
    }
    try {
      controller.error(error);
    } catch (e) {
      // Ignore
    }
  });

  try {
    const headers = await headersPromise;
    return new Response(stream, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Failed to establish SSE stream:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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

interface NodeResponseCallbacks {
  onWrite?: (chunk: any) => void;
  onEnd?: (data?: any) => void;
  onHeader?: (name: string, value: string | string[]) => void;
  onWriteHead?: (code: number, headers?: Record<string, string | string[]>) => void;
  onFlushHeaders?: () => void;
}

function createNodeResponse(callbacks?: NodeResponseCallbacks): any {
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
      callbacks?.onHeader?.(name, value);
      return this;
    },

    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },

    writeHead(code: number, message?: string | Record<string, string>, headersObj?: Record<string, string>) {
      statusCode = code;
      let finalHeaders: Record<string, string | string[]> = {};
      
      if (typeof message === 'string') {
        statusMessage = message;
        if (headersObj) {
          Object.entries(headersObj).forEach(([k, v]) => {
            headers[k.toLowerCase()] = v;
            finalHeaders[k.toLowerCase()] = v;
          });
        }
      } else if (message) {
        Object.entries(message).forEach(([k, v]) => {
          headers[k.toLowerCase()] = v;
          finalHeaders[k.toLowerCase()] = v;
        });
      }
      this.headersSent = true;
      this.statusCode = code;
      
      callbacks?.onWriteHead?.(code, finalHeaders);
      return this;
    },
    
    flushHeaders() {
      this.headersSent = true;
      callbacks?.onFlushHeaders?.();
    },

    write(chunk: any) {
      chunks.push(chunk);
      callbacks?.onWrite?.(chunk);
      return true;
    },

    end(data?: any) {
      if (data) {
        chunks.push(data);
        callbacks?.onWrite?.(data);
      }
      finished = true;
      this.finished = true;
      callbacks?.onEnd?.(data);
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