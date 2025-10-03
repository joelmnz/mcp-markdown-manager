import { handleApiRequest } from './routes/api';
import { handleMCPRequest } from './mcp/server';
import { existsSync, mkdirSync } from 'fs';

const PORT = parseInt(process.env.PORT || '5000');
const DATA_DIR = process.env.DATA_DIR || '/data';

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Created data directory: ${DATA_DIR}`);
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    
    // Handle MCP endpoint
    if (url.pathname === '/mcp' && request.method === 'POST') {
      return handleMCPRequest(request);
    }
    
    // Handle API endpoints
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      return handleApiRequest(request);
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
        return new Response(file);
      }
      
      // Fallback to index.html for client-side routing
      const indexFile = Bun.file(publicDir + '/index.html');
      if (await indexFile.exists()) {
        return new Response(indexFile);
      }
      
      return new Response('Not Found', { status: 404 });
    }
    
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`🚀 Article Manager server running on http://localhost:${PORT}`);
console.log(`📁 Data directory: ${DATA_DIR}`);
console.log(`🔒 Authentication: ${process.env.AUTH_TOKEN ? 'Enabled' : 'MISSING - Set AUTH_TOKEN!'}`);
