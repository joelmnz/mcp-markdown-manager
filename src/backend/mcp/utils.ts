import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Helper functions to convert between Bun and Node.js request/response
// NOTE: The MCP SDK is designed for Node.js and expects Node.js 'IncomingMessage' and 'ServerResponse' objects.
// Since we are running on Bun which uses standard Web API 'Request' and 'Response' objects,
// we need to manually bridge these interfaces.

/**
 * Handle HTTP requests using the provided transport.
 * This is a helper to encapsulate the bridging logic.
 */
export async function handleTransportRequest(
  transport: StreamableHTTPServerTransport,
  bunReq: Request,
  body?: any,
  sessionId?: string
): Promise<Response> {
  const nodeReq = await convertBunRequestToNode(bunReq, body);
  const nodeRes = createNodeResponse();
  await transport.handleRequest(nodeReq, nodeRes, body);
  return convertNodeResponseToBun(nodeRes, sessionId);
}

export async function convertBunRequestToNode(bunReq: Request, parsedBody?: any): Promise<any> {
  const url = new URL(bunReq.url);
  const listeners: Record<string, Function[]> = {};

  const socketMock = {
    remoteAddress: '127.0.0.1',
    encrypted: false,
    on: () => {},
    destroy: () => {},
  };

  const nodeReq: any = {
    method: bunReq.method,
    url: url.pathname + url.search,
    headers: {} as Record<string, string>,
    body: parsedBody,
    
    // EventEmitter implementation
    on(event: string, listener: Function) {
      if (!listeners[event]) listeners[event] = [];
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
    off(event: string, listener: Function) {
      return this.removeListener(event, listener);
    },
    emit(event: string, ...args: any[]) {
      if (listeners[event]) {
        listeners[event].forEach(l => l(...args));
        return true;
      }
      return false;
    },
    
    // Mock socket
    socket: socketMock,
    connection: socketMock, // Alias for socket
    httpVersion: '1.1',
    complete: true,
  };

  // Convert headers
  bunReq.headers.forEach((value, key) => {
    nodeReq.headers[key.toLowerCase()] = value;
  });

  return nodeReq;
}

export interface NodeResponseCallbacks {
  onWrite?: (chunk: any) => void;
  onEnd?: (data?: any) => void;
  onHeader?: (name: string, value: string | string[]) => void;
  onWriteHead?: (code: number, headers?: Record<string, string | string[]>) => void;
  onFlushHeaders?: () => void;
}

export function createNodeResponse(callbacks?: NodeResponseCallbacks): any {
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

    off(event: string, listener: Function) {
      return this.removeListener(event, listener);
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

export async function convertNodeResponseToBun(nodeRes: any, sessionId?: string): Promise<Response> {
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
