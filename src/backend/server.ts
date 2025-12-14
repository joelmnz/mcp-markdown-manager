import { handleApiRequest } from './routes/api';
import { handleMCPPostRequest, handleMCPGetRequest, handleMCPDeleteRequest } from './mcp/server';
import { databaseInit } from './services/databaseInit.js';
import { databaseHealthService } from './services/databaseHealth.js';

const PORT = parseInt(process.env.PORT || '5000');
const MCP_SERVER_ENABLED = process.env.MCP_SERVER_ENABLED?.toLowerCase() === 'true';

// Initialize database and perform health checks
async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database connection...');
    await databaseInit.initialize();
    console.log('✅ Database connection established');
    
    console.log('🔄 Performing database health check...');
    const healthCheck = await databaseHealthService.performHealthCheck();
    
    if (healthCheck.healthy) {
      console.log('✅ Database health check passed');
    } else {
      console.warn('⚠️  Database health check found issues:');
      healthCheck.details.issues.forEach(issue => {
        console.warn(`   - ${issue}`);
      });
      
      // Attempt to repair constraints if there are issues
      if (!healthCheck.details.constraints) {
        console.log('🔄 Attempting to repair database constraints...');
        const repairResult = await databaseHealthService.validateAndRepairConstraints();
        
        if (repairResult.success) {
          console.log('✅ Database constraints repaired successfully');
          repairResult.repaired.forEach(repair => {
            console.log(`   - ${repair}`);
          });
        } else {
          console.warn('⚠️  Some database constraints could not be repaired:');
          repairResult.remaining.forEach(issue => {
            console.warn(`   - ${issue}`);
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.error('   The server will continue but database features may not work properly');
  }
}

// Initialize database before starting server
await initializeDatabase();

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

console.log(`🚀 MCP Markdown Manager server running on http://localhost:${PORT}`);
console.log(`🗄️  Database backend: PostgreSQL`);
console.log(`🔒 Authentication: ${process.env.AUTH_TOKEN ? 'Enabled' : 'MISSING - Set AUTH_TOKEN!'}`);
console.log(`🤖 MCP Server: ${MCP_SERVER_ENABLED ? 'Enabled' : 'Disabled'}`);
