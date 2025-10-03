import { handleApiRequest } from './routes/api';
import { handleMCPPostRequest, handleMCPGetRequest, handleMCPDeleteRequest } from './mcp/server';
import { existsSync, mkdirSync } from 'fs';

const PORT = parseInt(process.env.PORT || '5000');
const DATA_DIR = process.env.DATA_DIR || '/data';
const MCP_SERVER_ENABLED = process.env.MCP_SERVER_ENABLED?.toLowerCase() === 'true';

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Created data directory: ${DATA_DIR}`);
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const startTime = Date.now();
    
    const logRequest = (status: number) => {
      const duration = Date.now() - startTime;
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${request.method} ${url.pathname} ${status} ${duration}ms`);
    };
    
    // Handle MCP endpoint
    if (url.pathname === '/mcp') {
      if (!MCP_SERVER_ENABLED) {
        logRequest(404);
        return new Response('MCP server disabled', { status: 404 });
      }
      
      let response: Response;
      if (request.method === 'POST') {
        response = await handleMCPPostRequest(request);
      } else if (request.method === 'GET') {
        response = await handleMCPGetRequest(request);
      } else if (request.method === 'DELETE') {
        response = await handleMCPDeleteRequest(request);
      } else {
        response = new Response('Method not allowed', { status: 405 });
      }
      
      logRequest(response.status);
      return response;
    }
    
    // Handle API endpoints
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      const response = await handleApiRequest(request);
      logRequest(response.status);
      return response;
    }
    
    // Serve static files from public directory
    const publicDir = process.env.NODE_ENV === 'production' 
      ? './public' 
      : './public';
    
    // Serve index.html for all non-API routes (SPA routing)
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/mcp')) {
      const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = Bun.file(publicDir + filePath);
      
      if (await file.exists()) {
        // Set proper MIME type for service worker
        const headers: Record<string, string> = {};
        if (url.pathname === '/sw.js') {
          headers['Content-Type'] = 'application/javascript';
          headers['Service-Worker-Allowed'] = '/';
        } else if (url.pathname === '/manifest.json') {
          headers['Content-Type'] = 'application/manifest+json';
        }
        
        logRequest(200);
        return new Response(file, { headers });
      }
      
      // Fallback to index.html for client-side routing
      const indexFile = Bun.file(publicDir + '/index.html');
      if (await indexFile.exists()) {
        logRequest(200);
        return new Response(indexFile);
      }
      
      logRequest(404);
      return new Response('Not Found', { status: 404 });
    }
    
    logRequest(404);
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`🚀 Article Manager server running on http://localhost:${PORT}`);
console.log(`📁 Data directory: ${DATA_DIR}`);
console.log(`🔒 Authentication: ${process.env.AUTH_TOKEN ? 'Enabled' : 'MISSING - Set AUTH_TOKEN!'}`);
console.log(`🤖 MCP Server: ${MCP_SERVER_ENABLED ? 'Enabled' : 'Disabled'}`);
