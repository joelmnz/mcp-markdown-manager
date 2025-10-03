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
  deleteArticle
} from '../services/articles';
import { randomUUID } from 'crypto';

const AUTH_TOKEN = process.env.AUTH_TOKEN;

// Session management for HTTP transport
const transports: Record<string, StreamableHTTPServerTransport> = {};

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
    return {
      tools: [
        {
          name: 'listArticles',
          description: 'List all articles with metadata (title, filename, creation date)',
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
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      switch (request.params.name) {
        case 'listArticles': {
          const articles = await listArticles();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(articles, null, 2),
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
          const { title, content } = request.params.arguments as {
            title: string;
            content: string;
          };
          const article = await createArticle(title, content);
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
          const { filename, title, content } = request.params.arguments as {
            filename: string;
            title: string;
            content: string;
          };
          const article = await updateArticle(filename, title, content);
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
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader.replace('Bearer ', '') !== AUTH_TOKEN) {
    console.log('MCP auth failed');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body: any;
  try {
    body = await request.json();
    console.log('MCP POST request received:', body);
    
    const sessionId = request.headers.get('mcp-session-id');
    
    // Handle initialize request - this is the first request from the client
    if (isInitializeRequest(body)) {
      console.log('Handling initialize request');
      
      // Generate a new session ID
      const newSessionId = randomUUID();
      
      // Create a new transport for this session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });
      
      // Store the transport
      transports[newSessionId] = transport;
      
      // Set up transport close handler
      transport.onclose = () => {
        console.log(`Transport closed for session ${newSessionId}`);
        delete transports[newSessionId];
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
    const transport = transports[sessionId];
    if (!transport) {
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
    
    // Handle the request with the existing transport
    const nodeReq = await convertBunRequestToNode(request, body);
    const nodeRes = createNodeResponse();
    
    await transport.handleRequest(nodeReq, nodeRes, body);
    
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
  
  if (!sessionId || !transports[sessionId]) {
    return new Response('Invalid or missing session ID', { status: 400 });
  }
  
  console.log(`Establishing SSE stream for session ${sessionId}`);
  
  const transport = transports[sessionId];
  const nodeReq = await convertBunRequestToNode(request);
  const nodeRes = createNodeResponse();
  
  await transport.handleRequest(nodeReq, nodeRes);
  
  return convertNodeResponseToBun(nodeRes);
}

// HTTP endpoint handler for MCP protocol - DELETE requests (session termination)
export async function handleMCPDeleteRequest(request: Request): Promise<Response> {
  const sessionId = request.headers.get('mcp-session-id');
  
  if (!sessionId || !transports[sessionId]) {
    return new Response('Invalid or missing session ID', { status: 400 });
  }
  
  console.log(`Terminating session ${sessionId}`);
  
  const transport = transports[sessionId];
  const nodeReq = await convertBunRequestToNode(request);
  const nodeRes = createNodeResponse();
  
  await transport.handleRequest(nodeReq, nodeRes);
  
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