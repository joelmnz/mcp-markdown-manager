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
        metadata: { reason: idleExpired ? 'idle' : 'ttl' }
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
    loggingService.log(LogLevel.WARN, LogCategory.ERROR_HANDLING, `MCP Token mismatch for session ${sessionId}`, {
      metadata: { ip: getClientIp(request) }
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
        metadata: { originalIp: entry.ip, currentIp: ip }
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
              items: { type: 'string' },
              maxItems: MCP_MULTI_SEARCH_LIMIT,
            },
            folder: { type: 'string', description: 'Optional folder path' },
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
            folder: { type: 'string', description: 'Optional folder path' },
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
            folder: { type: 'string', description: 'New folder path' },
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
            folder: { type: 'string', description: 'Optional folder path' },
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
            folder: { type: 'string', description: 'Optional folder path' },
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
    const sessionId = request.headers.get('mcp-session-id');

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
      };

      transport.onclose = () => {
        delete sessions[newSessionId];
      };

      const server = createConfiguredMCPServer();
      await server.connect(transport);

      loggingService.log(LogLevel.INFO, LogCategory.TASK_LIFECYCLE, `New MCP session initialized: ${newSessionId}`, {
        metadata: { ip, userAgent }
      });

      return handleTransportRequest(transport, request, body, newSessionId);
    }

    if (!sessionId) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body?.id || null, error: { code: -32000, message: 'No valid session ID provided' } }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const entry = sessions[sessionId];
    if (!entry) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body?.id || null, error: { code: -32000, message: 'Invalid session ID' } }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (entry.token !== token || (MCP_BIND_SESSION_TO_IP && entry.ip !== getClientIp(request))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    entry.lastSeenAtMs = nowMs;
    return handleTransportRequest(entry.transport, request, body, sessionId);

  } catch (error) {
    loggingService.log(LogLevel.ERROR, LogCategory.ERROR_HANDLING, 'MCP POST error', { error: error instanceof Error ? error : new Error(String(error)) });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body?.id, error: { code: -32000, message: error instanceof Error ? error.message : 'Internal error' } }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function handleMCPGetRequest(request: Request): Promise<Response> {
  const sessionId = request.headers.get('mcp-session-id');
  const nowMs = Date.now();
  cleanupExpiredSessions(nowMs);

  const authorized = getAuthorizedSession(request, sessionId);
  if (authorized instanceof Response) return authorized;

  const { entry } = authorized;
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
  nodeRes = createNodeResponse({
    onWrite: (chunk) => {
      const data = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
      controller.enqueue(data);
    },
    onEnd: () => { try { controller.close(); } catch (e) {} },
    onWriteHead: (_code, headersObj) => {
      if (headersResolved) return;
      headersResolved = true;
      const responseHeaders = new Headers();
      if (headersObj) {
        Object.entries(headersObj).forEach(([key, value]) => {
          if (Array.isArray(value)) value.forEach(v => responseHeaders.append(key, v));
          else if (value) responseHeaders.set(key, value as string);
        });
      }
      resolveHeaders(responseHeaders);
    },
    onFlushHeaders: (headersObj) => {
      if (headersResolved) return;
      headersResolved = true;
      const responseHeaders = new Headers();
      if (headersObj) {
        Object.entries(headersObj).forEach(([key, value]) => {
          if (Array.isArray(value)) value.forEach(v => responseHeaders.append(key, v));
          else if (value) responseHeaders.set(key, value as string);
        });
      }
      resolveHeaders(responseHeaders);
    }
  });

  entry.transport.handleRequest(nodeReq, nodeRes).catch(error => {
    loggingService.log(LogLevel.ERROR, LogCategory.ERROR_HANDLING, `SSE Stream error for session ${sessionId}`, { error });
    if (!headersResolved) rejectHeaders(error);
    try { controller.error(error); } catch (e) {}
  });

  try {
    const headers = await headersPromise;
    return new Response(stream, { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleMCPDeleteRequest(request: Request): Promise<Response> {
  const sessionId = request.headers.get('mcp-session-id');
  const nowMs = Date.now();
  cleanupExpiredSessions(nowMs);

  const authorized = getAuthorizedSession(request, sessionId);
  if (authorized instanceof Response) return authorized;

  const { entry } = authorized;
  entry.lastSeenAtMs = nowMs;

  const nodeReq = await convertBunRequestToNode(request);
  const nodeRes = createNodeResponse();
  await entry.transport.handleRequest(nodeReq, nodeRes);

  loggingService.log(LogLevel.INFO, LogCategory.TASK_LIFECYCLE, `MCP session terminated: ${sessionId}`);
  return convertNodeResponseToBun(nodeRes, sessionId ?? undefined);
}
