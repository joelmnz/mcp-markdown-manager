import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import {
  convertBunRequestToNode,
  createNodeResponse,
  convertNodeResponseToBun,
  handleTransportRequest
} from './utils.ts';
import { toolHandlers } from './handlers.ts';
import { loggingService, LogLevel, LogCategory } from '../services/logging.ts';
import { logSecurityEvent } from './validation.ts';

type McpSessionEntry = {
  transport: StreamableHTTPServerTransport;
  token: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  ip: string;
  userAgent: string | null;
  requestCount: number; // Track request count for rate limiting
  lastRequestMs: number; // Track last request time
};

const AUTH_TOKEN = process.env.AUTH_TOKEN;
const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';
const MCP_MULTI_SEARCH_LIMIT = Number.parseInt(process.env.MCP_MULTI_SEARCH_LIMIT ?? '10', 10);

const MCP_SESSION_IDLE_MS = Number.parseInt(process.env.MCP_SESSION_IDLE_MS ?? '900000', 10); // 15m
const MCP_SSE_HEADERS_TIMEOUT_MS = Number.parseInt(process.env.MCP_SSE_HEADERS_TIMEOUT_MS ?? '30000', 10); // 30s
const MCP_SESSION_TTL_MS = Number.parseInt(process.env.MCP_SESSION_TTL_MS ?? '3600000', 10); // 1h
const MCP_MAX_SESSIONS_TOTAL = Number.parseInt(process.env.MCP_MAX_SESSIONS_TOTAL ?? '200', 10);
const MCP_MAX_SESSIONS_PER_IP = Number.parseInt(process.env.MCP_MAX_SESSIONS_PER_IP ?? '50', 10);
const MCP_MAX_SESSIONS_PER_TOKEN = Number.parseInt(process.env.MCP_MAX_SESSIONS_PER_TOKEN ?? '100', 10);
const MCP_BIND_SESSION_TO_IP = process.env.MCP_BIND_SESSION_TO_IP?.toLowerCase() === 'true';

// Rate limiting configuration
const MCP_RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.MCP_RATE_LIMIT_WINDOW_MS ?? '60000', 10); // 1 minute
const MCP_RATE_LIMIT_MAX_REQUESTS = Number.parseInt(process.env.MCP_RATE_LIMIT_MAX_REQUESTS ?? '100', 10);
const MCP_MAX_REQUEST_SIZE_BYTES = Number.parseInt(process.env.MCP_MAX_REQUEST_SIZE_BYTES ?? String(10 * 1024 * 1024), 10); // 10MB

// Session management for HTTP transport
const sessions: Record<string, McpSessionEntry> = {};

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  return token ? token : null;
}

function isAuthorizedToken(token: string | null): token is string {
  if (!token || !AUTH_TOKEN) return false;
  return token === AUTH_TOKEN;
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Check rate limit for a session
 * Returns error response if rate limit exceeded
 */
function checkRateLimit(entry: McpSessionEntry, nowMs: number): Response | null {
  // Reset counter if outside the time window
  if (nowMs - entry.lastRequestMs > MCP_RATE_LIMIT_WINDOW_MS) {
    entry.requestCount = 0;
    entry.lastRequestMs = nowMs;
  }

  entry.requestCount++;

  if (entry.requestCount > MCP_RATE_LIMIT_MAX_REQUESTS) {
    logSecurityEvent({
      timestamp: new Date(nowMs).toISOString(),
      event: 'rate_limit_exceeded',
      severity: 'medium',
      details: {
        ip: entry.ip,
        requestCount: entry.requestCount,
        window: MCP_RATE_LIMIT_WINDOW_MS,
        limit: MCP_RATE_LIMIT_MAX_REQUESTS,
      },
      ip: entry.ip,
    });

    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((entry.lastRequestMs + MCP_RATE_LIMIT_WINDOW_MS - nowMs) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((entry.lastRequestMs + MCP_RATE_LIMIT_WINDOW_MS - nowMs) / 1000)),
        },
      }
    );
  }

  return null;
}

/**
 * Validate request size to prevent DoS attacks
 */
async function validateRequestSize(request: Request): Promise<Response | null> {
  const contentLength = request.headers.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MCP_MAX_REQUEST_SIZE_BYTES) {
      logSecurityEvent({
        timestamp: new Date().toISOString(),
        event: 'oversized_request',
        severity: 'medium',
        details: {
          contentLength: size,
          limit: MCP_MAX_REQUEST_SIZE_BYTES,
          ip: getClientIp(request),
        },
        ip: getClientIp(request),
      });

      return new Response(
        JSON.stringify({
          error: 'Request too large',
          maxSize: MCP_MAX_REQUEST_SIZE_BYTES,
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return null;
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
      loggingService.log(LogLevel.INFO, LogCategory.TASK_LIFECYCLE, `MCP session cleaned up: ${sessionId}`, {
        metadata: { reason: idleExpired ? 'idle' : 'ttl', sessionId }
      });
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

function getSessionId(request: Request): string | null {
  const url = new URL(request.url);
  return request.headers.get('mcp-session-id') || url.searchParams.get('sessionId');
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
    loggingService.log(LogLevel.WARN, LogCategory.ERROR_HANDLING, `MCP session not found: ${sessionId}`, {
      metadata: { ip: getClientIp(request), sessionId }
    });
    return new Response('Session not found', { status: 404 });
  }

  if (entry.token !== token) {
    loggingService.log(LogLevel.WARN, LogCategory.ERROR_HANDLING, `MCP Token mismatch for session ${sessionId}`, {
      metadata: { ip: getClientIp(request), sessionId }
    });
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (MCP_BIND_SESSION_TO_IP) {
    const ip = getClientIp(request);
    if (entry.ip !== ip) {
      loggingService.log(LogLevel.WARN, LogCategory.ERROR_HANDLING, `MCP IP mismatch for session ${sessionId}`, {
        metadata: { originalIp: entry.ip, currentIp: ip, sessionId }
      });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return { entry, sessionId };
}

// Create a configured MCP server instance
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
              description: 'Optional folder path. Omit for all folders. Use "" or "/" for root folder only.',
            },
            maxArticles: {
              type: 'number',
              description: 'Maximum number of articles to return (default: 100)',
            },
          },
          required: [],
        },
      },
      {
        name: 'listFolders',
        description: 'Get a unique list of all article folders to understand the knowledge repository structure',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'searchArticles',
        description: 'Search articles by title (partial match)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query to match against article titles' },
            folder: {
              type: 'string',
              description: 'Optional folder path. Omit for all folders. Use "" or "/" for root folder only.',
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
              items: { type: 'string' },
              maxItems: MCP_MULTI_SEARCH_LIMIT,
            },
            folder: {
              type: 'string',
              description: 'Optional folder path. Omit for all folders. Use "" or "/" for root folder only.',
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
            filename: { type: 'string', description: 'Filename of the article (e.g., my-article.md)' },
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
            title: { type: 'string', description: 'Title of the article' },
            content: { type: 'string', description: 'Markdown content of the article' },
            folder: { type: 'string', description: 'Optional folder path.' },
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
            filename: { type: 'string', description: 'Filename of the article to update' },
            title: { type: 'string', description: 'New title of the article' },
            content: { type: 'string', description: 'New markdown content of the article' },
            folder: { type: 'string', description: 'New folder path.' },
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
            filename: { type: 'string', description: 'Filename of the article to delete' },
          },
          required: ['filename'],
        },
      },
    ];

    if (SEMANTIC_SEARCH_ENABLED) {
      tools.push({
        name: 'semanticSearch',
        description: 'Perform semantic search across article content using vector embeddings',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            k: { type: 'number', description: 'Number of results (default: 5)' },
            folder: {
              type: 'string',
              description: 'Optional folder path. Omit for all folders. Use "" or "/" for root folder only.',
            },
          },
          required: ['query'],
        },
      });

      tools.push({
        name: 'multiSemanticSearch',
        description: 'Perform multiple semantic searches and return unique results',
        inputSchema: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              description: `Array of search queries (max ${MCP_MULTI_SEARCH_LIMIT} items)`,
              items: { type: 'string' },
              maxItems: MCP_MULTI_SEARCH_LIMIT,
            },
            k: { type: 'number', description: 'Number of results per query' },
            folder: {
              type: 'string',
              description: 'Optional folder path. Omit for all folders. Use "" or "/" for root folder only.',
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
    const startTime = Date.now();
    const toolName = request.params.name;
    try {
      const handler = toolHandlers[toolName];
      if (!handler) throw new Error(`Unknown tool: ${toolName}`);

      const result = await handler(request.params.arguments);

      loggingService.logPerformanceMetric(`mcp_tool_${toolName}`, Date.now() - startTime, {
        metadata: { success: true }
      });

      return result;
    } catch (error) {
      loggingService.log(LogLevel.ERROR, LogCategory.ERROR_HANDLING, `MCP tool error: ${toolName}`, {
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }],
        isError: true,
      };
    }
  });

  return server;
}

export function createMCPServer() {
  return createConfiguredMCPServer();
}

function isInitializeRequest(body: any): boolean {
  return body && body.method === 'initialize';
}

export async function handleMCPPostRequest(request: Request): Promise<Response> {
  const token = getBearerToken(request);
  if (!isAuthorizedToken(token)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const nowMs = Date.now();
  cleanupExpiredSessions(nowMs);

  let body: any;
  try {
    body = await request.json();
    const sessionId = getSessionId(request);

    if (isInitializeRequest(body)) {
      const ip = getClientIp(request);
      const userAgent = request.headers.get('user-agent');

      const limitResponse = enforceSessionLimits(ip, token);
      if (limitResponse) return limitResponse;

      const newSessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      sessions[newSessionId] = {
        transport,
        token,
        createdAtMs: nowMs,
        lastSeenAtMs: nowMs,
        ip,
        userAgent,
        requestCount: 1,
        lastRequestMs: nowMs,
      };

      transport.onclose = () => {
        delete sessions[newSessionId];
      };

      const server = createConfiguredMCPServer();
      await server.connect(transport);

      loggingService.log(LogLevel.INFO, LogCategory.TASK_LIFECYCLE, `New MCP session initialized: ${newSessionId}`, {
        metadata: { ip, userAgent, sessionId: newSessionId }
      });

      return handleTransportRequest(transport, request, body, newSessionId);
    }

    const authorized = getAuthorizedSession(request, sessionId);
    if (authorized instanceof Response) return authorized;

    const { entry } = authorized;
    entry.lastSeenAtMs = nowMs;
    return handleTransportRequest(entry.transport, request, body, sessionId ?? undefined);

  } catch (error) {
    loggingService.log(LogLevel.ERROR, LogCategory.ERROR_HANDLING, 'MCP POST error', { error: error instanceof Error ? error : new Error(String(error)) });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body?.id, error: { code: -32000, message: error instanceof Error ? error.message : 'Internal error' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function handleMCPGetRequest(request: Request): Promise<Response> {
  const sessionId = getSessionId(request);
  const nowMs = Date.now();
  cleanupExpiredSessions(nowMs);

  const authorized = getAuthorizedSession(request, sessionId);
  if (authorized instanceof Response) return authorized;

  const { entry } = authorized;
  
  // Check rate limit
  const rateLimitCheck = checkRateLimit(entry, nowMs);
  if (rateLimitCheck) return rateLimitCheck;
  
  entry.lastSeenAtMs = nowMs;

  const nodeReq = await convertBunRequestToNode(request);
  let controller: ReadableStreamDefaultController;
  let nodeRes: any;

  const stream = new ReadableStream({
    start(c) { controller = c; },
    cancel() { if (nodeRes) nodeRes.emit('close'); }
  });

  let resolveHeaders: (headers: Headers) => void;
  let rejectHeaders: (reason?: any) => void;
  const headersPromise = new Promise<Headers>((resolve, reject) => {
    resolveHeaders = resolve;
    rejectHeaders = reject;
  });

  let headersResolved = false;

  let timeoutId: Timer;
  const resolveHeadersSafely = (headers: Headers) => {
    if (headersResolved) return;
    headersResolved = true;
    clearTimeout(timeoutId);
    resolveHeaders(headers);
  };

  const rejectHeadersSafely = (reason?: any) => {
    if (headersResolved) return;
    headersResolved = true;
    clearTimeout(timeoutId);
    rejectHeaders(reason);
  };

  // Add timeout to prevent indefinite hanging if headers are never written
  timeoutId = setTimeout(() => {
    rejectHeadersSafely(new Error('Timeout waiting for response headers'));
  }, MCP_SSE_HEADERS_TIMEOUT_MS);

  nodeRes = createNodeResponse({
    onWrite: (chunk) => {
      const data = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
      controller.enqueue(data);
    },
    onEnd: (_data, headersObj) => {
      // If headers were never written but end is called, resolve with accumulated or default headers
      if (!headersResolved) {
        const responseHeaders = new Headers();
        if (headersObj) {
          Object.entries(headersObj).forEach(([key, value]) => {
            if (Array.isArray(value)) value.forEach(v => responseHeaders.append(key, v));
            else if (value) responseHeaders.set(key, value as string);
          });
        }

        // Apply defaults if they weren't set via setHeader
        if (!responseHeaders.has('Content-Type')) {
          responseHeaders.set('Content-Type', 'text/event-stream');
        }
        if (!responseHeaders.has('Cache-Control')) {
          responseHeaders.set('Cache-Control', 'no-cache');
        }
        if (!responseHeaders.has('Connection')) {
          responseHeaders.set('Connection', 'keep-alive');
        }

        resolveHeadersSafely(responseHeaders);
      }
      try {
        controller.close();
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Failed to close SSE controller:', e);
        }
      }
    },
    onWriteHead: (_code, headersObj) => {
      const responseHeaders = new Headers();
      if (headersObj) {
        Object.entries(headersObj).forEach(([key, value]) => {
          if (Array.isArray(value)) value.forEach(v => responseHeaders.append(key, v));
          else if (value) responseHeaders.set(key, value as string);
        });
      }
      resolveHeadersSafely(responseHeaders);
    },
    onFlushHeaders: (headersObj) => {
      const responseHeaders = new Headers();
      if (headersObj) {
        Object.entries(headersObj).forEach(([key, value]) => {
          if (Array.isArray(value)) value.forEach(v => responseHeaders.append(key, v));
          else if (value) responseHeaders.set(key, value as string);
        });
      }
      resolveHeadersSafely(responseHeaders);
    }
  });

  entry.transport.handleRequest(nodeReq, nodeRes).catch(error => {
    loggingService.log(LogLevel.ERROR, LogCategory.ERROR_HANDLING, `SSE Stream error for session ${sessionId}`, {
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { sessionId }
    });
    rejectHeadersSafely(error);
    try { controller.error(error); } catch (e) { }
  });

  try {
    const headers = await headersPromise;
    return new Response(stream, { status: 200, headers });
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    loggingService.log(
      LogLevel.ERROR,
      LogCategory.ERROR_HANDLING,
      `Failed to establish SSE stream for session ${sessionId}`,
      { error: errorObj, metadata: { sessionId } }
    );
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleMCPDeleteRequest(request: Request): Promise<Response> {
  const sessionId = getSessionId(request);
  const nowMs = Date.now();
  cleanupExpiredSessions(nowMs);

  const authorized = getAuthorizedSession(request, sessionId);
  if (authorized instanceof Response) return authorized;

  const { entry } = authorized;
  entry.lastSeenAtMs = nowMs;

  const nodeReq = await convertBunRequestToNode(request);
  const nodeRes = createNodeResponse();
  await entry.transport.handleRequest(nodeReq, nodeRes);

  loggingService.log(LogLevel.INFO, LogCategory.TASK_LIFECYCLE, `MCP session terminated: ${sessionId}`, {
    metadata: { sessionId }
  });
  return convertNodeResponseToBun(nodeRes, sessionId ?? undefined);
}
