import { handleApiRequest } from './routes/api';
import { handleMCPPostRequest, handleMCPGetRequest, handleMCPDeleteRequest } from './mcp/server';
import { databaseInit } from './services/databaseInit.js';
import { databaseHealthService } from './services/databaseHealth.js';
import { basePathService } from './services/basePath.js';

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

/**
 * Inject base path configuration into HTML template
 * 
 * This function replaces template placeholders with runtime configuration,
 * enabling the same built assets to work with any base path deployment.
 */
function injectBasePathConfig(htmlContent: string): string {
  // Get current base path configuration
  const config = basePathService.getConfig();
  const clientConfig = basePathService.getClientConfig();
  
  // Replace template placeholders with actual base path values
  const basePath = config.isRoot ? '' : config.normalizedPath;
  
  // Create runtime configuration object for frontend
  const runtimeConfig = JSON.stringify({
    ...clientConfig,
    isRoot: config.isRoot
  });
  
  return htmlContent
    .replace(/\{\{BASE_PATH\}\}/g, basePath)
    .replace(/\{\{BASE_PATH_CONFIG\}\}/g, runtimeConfig);
}

/**
 * Generate manifest.json with runtime base path configuration
 */
async function generateManifest(config: any): Promise<string> {
  const templatePath = process.env.NODE_ENV === 'production' 
    ? './public/manifest.template.json' 
    : './public/manifest.template.json';
  
  try {
    const templateFile = Bun.file(templatePath);
    const templateContent = await templateFile.text();
    const basePath = config.isRoot ? '' : config.normalizedPath;
    
    // Replace template placeholders with actual base path values
    const manifestContent = templateContent.replace(/\{\{BASE_PATH\}\}/g, basePath);
    
    return manifestContent;
  } catch (error) {
    console.error('Error generating manifest.json:', error);
    // Fallback to basic manifest
    const basePath = config.isRoot ? '' : config.normalizedPath;
    return JSON.stringify({
      name: "MCP Markdown Manager",
      short_name: "Articles",
      start_url: basePath + "/",
      scope: basePath + "/",
      display: "standalone",
      theme_color: "#4a9eff"
    });
  }
}

// Initialize database before starting server
await initializeDatabase();

// Get base path configuration and validate environment
const basePathConfig = basePathService.getConfig();
const envValidation = basePathService.validateEnvironmentConfiguration();

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
    
    // Strip base path from URL for internal routing
    const originalPath = url.pathname;
    const routePath = basePathService.stripBasePath(originalPath);
    
    // Handle MCP endpoint
    if (routePath === '/mcp') {
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
    if (routePath.startsWith('/api/') || routePath === '/health') {
      // Create a new request with the stripped path for API handling
      const apiUrl = new URL(request.url);
      apiUrl.pathname = routePath;
      const apiRequest = new Request(apiUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      const response = await handleApiRequest(apiRequest);
      logRequest(response.status);
      return response;
    }
    
    // Serve static files from public directory
    const publicDir = process.env.NODE_ENV === 'production' 
      ? './public' 
      : './public';
    
    // Serve index.html for all non-API routes (SPA routing)
    if (!routePath.startsWith('/api/') && !routePath.startsWith('/mcp')) {
      const filePath = routePath === '/' ? '/index.html' : routePath;
      const file = Bun.file(publicDir + filePath);
      
      if (await file.exists()) {
        // Set proper MIME type for service worker
        const headers: Record<string, string> = {};
        if (routePath === '/sw.js') {
          headers['Content-Type'] = 'application/javascript';
          headers['Service-Worker-Allowed'] = basePathConfig.isRoot ? '/' : basePathConfig.normalizedPath + '/';
        } else if (routePath === '/manifest.json') {
          // Generate manifest.json with runtime base path configuration
          const manifestContent = await generateManifest(basePathConfig);
          logRequest(200);
          return new Response(manifestContent, { 
            headers: { 'Content-Type': 'application/manifest+json' }
          });
        }
        
        // Special handling for index.html - inject base path configuration
        if (filePath === '/index.html') {
          const htmlContent = await file.text();
          const injectedHtml = injectBasePathConfig(htmlContent);
          
          logRequest(200);
          return new Response(injectedHtml, { 
            headers: { 'Content-Type': 'text/html' }
          });
        }
        
        logRequest(200);
        return new Response(file, { headers });
      }
      
      // Fallback to index.html for client-side routing
      const indexFile = Bun.file(publicDir + '/index.html');
      if (await indexFile.exists()) {
        const htmlContent = await indexFile.text();
        const injectedHtml = injectBasePathConfig(htmlContent);
        
        logRequest(200);
        return new Response(injectedHtml, { 
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      logRequest(404);
      return new Response('Not Found', { status: 404 });
    }
    
    logRequest(404);
    return new Response('Not Found', { status: 404 });
  },
});

// Enhanced startup logging
console.log('');
console.log('🚀 MCP Markdown Manager Server Started');
console.log('=====================================');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log(`🗄️  Database: PostgreSQL`);
console.log(`🔒 Authentication: ${process.env.AUTH_TOKEN ? 'Enabled' : 'MISSING - Set AUTH_TOKEN!'}`);
console.log(`🤖 MCP Server: ${MCP_SERVER_ENABLED ? 'Enabled at /mcp' : 'Disabled'}`);

// Detailed base path configuration logging
console.log('');
console.log('🌐 Base Path Configuration:');
if (basePathConfig.isRoot) {
  console.log(`   Mode: Root path deployment`);
  console.log(`   Frontend URL: http://localhost:${PORT}/`);
  console.log(`   API Base: http://localhost:${PORT}/api`);
  if (MCP_SERVER_ENABLED) {
    console.log(`   MCP Endpoint: http://localhost:${PORT}/mcp`);
  }
} else {
  console.log(`   Mode: Subpath deployment`);
  console.log(`   Base Path: ${basePathConfig.normalizedPath}`);
  console.log(`   Frontend URL: http://localhost:${PORT}${basePathConfig.normalizedPath}/`);
  console.log(`   API Base: http://localhost:${PORT}${basePathConfig.normalizedPath}/api`);
  if (MCP_SERVER_ENABLED) {
    console.log(`   MCP Endpoint: http://localhost:${PORT}${basePathConfig.normalizedPath}/mcp`);
  }
  console.log(`   Static Assets: Served with base path prefix`);
  console.log(`   Runtime Config: Injected into frontend at request time`);
}

// Environment variable status
console.log('');
console.log('🔧 Environment Configuration:');
console.log(`   BASE_URL: ${process.env.BASE_URL ? `"${process.env.BASE_URL}"` : 'Not set'}`);
console.log(`   BASE_PATH: ${process.env.BASE_PATH ? `"${process.env.BASE_PATH}"` : 'Not set'}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   PORT: ${PORT}`);

// Display validation warnings and recommendations
if (envValidation.warnings.length > 0) {
  console.log('');
  console.log('⚠️  Configuration Warnings:');
  envValidation.warnings.forEach((warning: string) => {
    console.log(`   - ${warning}`);
  });
}

if (envValidation.recommendations.length > 0) {
  console.log('');
  console.log('💡 Configuration Recommendations:');
  envValidation.recommendations.forEach((recommendation: string) => {
    console.log(`   - ${recommendation}`);
  });
}

// Docker deployment information
if (process.env.NODE_ENV === 'production') {
  console.log('');
  console.log('🐳 Docker Deployment Notes:');
  console.log('   - Set BASE_URL or BASE_PATH in docker-compose.yml environment section');
  console.log('   - Frontend assets are built without hardcoded paths');
  console.log('   - Base path configuration is injected at runtime');
  console.log('   - Same built image works with any base path configuration');
}

console.log('');
console.log('✅ Server initialization complete');
console.log('');
