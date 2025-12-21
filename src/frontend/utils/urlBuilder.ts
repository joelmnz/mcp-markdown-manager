/**
 * Runtime configuration interface
 */
interface RuntimeConfig {
  baseUrl: string;
  apiBaseUrl: string;
  mcpBaseUrl: string;
}

/**
 * URL building utilities with runtime base path support
 * 
 * These utilities:
 * 1. Read runtime configuration from injected global variables
 * 2. Build URLs with correct base path prefixes
 * 3. Handle both frontend routes and API endpoints
 * 4. Support public article URLs and navigation links
 */

/**
 * Get runtime configuration from global variable
 */
function getRuntimeConfig(): RuntimeConfig {
  const config = (window as any).__APP_CONFIG__;
  
  if (!config || typeof config !== 'object') {
    // Return default configuration for root path deployment
    return {
      baseUrl: '',
      apiBaseUrl: '',
      mcpBaseUrl: ''
    };
  }
  
  return {
    baseUrl: config.baseUrl || '',
    apiBaseUrl: config.apiBaseUrl || '',
    mcpBaseUrl: config.mcpBaseUrl || ''
  };
}

/**
 * Build a frontend route URL with base path
 */
export function buildRouteUrl(path: string): string {
  const config = getRuntimeConfig();
  
  // Normalize path to ensure it starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // If base URL is empty (root deployment), return path as-is
  if (!config.baseUrl) {
    return normalizedPath;
  }
  
  // Combine base URL with path, avoiding double slashes
  return `${config.baseUrl}${normalizedPath}`;
}

/**
 * Build an API endpoint URL with base path
 */
export function buildApiUrl(endpoint: string): string {
  const config = getRuntimeConfig();
  
  // Normalize endpoint to ensure it starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // If API base URL is empty (root deployment), return endpoint as-is
  if (!config.apiBaseUrl) {
    return normalizedEndpoint;
  }
  
  // Combine API base URL with endpoint
  return `${config.apiBaseUrl}${normalizedEndpoint}`;
}

/**
 * Build an MCP endpoint URL with base path
 */
export function buildMcpUrl(endpoint: string): string {
  const config = getRuntimeConfig();
  
  // Normalize endpoint to ensure it starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // If MCP base URL is empty (root deployment), return endpoint as-is
  if (!config.mcpBaseUrl) {
    return normalizedEndpoint;
  }
  
  // Combine MCP base URL with endpoint
  return `${config.mcpBaseUrl}${normalizedEndpoint}`;
}

/**
 * Build a public article URL with base path
 */
export function buildPublicArticleUrl(slug: string): string {
  return buildRouteUrl(`/public-article/${slug}`);
}

/**
 * Build an article view URL with base path
 */
export function buildArticleUrl(filename: string): string {
  return buildRouteUrl(`/article/${filename}`);
}

/**
 * Build an article edit URL with base path
 */
export function buildEditUrl(filename: string): string {
  return buildRouteUrl(`/edit/${filename}`);
}

/**
 * Build a new article URL with base path
 */
export function buildNewArticleUrl(): string {
  return buildRouteUrl('/new');
}

/**
 * Build a home URL with base path
 */
export function buildHomeUrl(): string {
  return buildRouteUrl('/');
}

/**
 * Build a RAG status URL with base path
 */
export function buildRagStatusUrl(): string {
  return buildRouteUrl('/rag-status');
}

/**
 * Build an import files URL with base path
 */
export function buildImportFilesUrl(): string {
  return buildRouteUrl('/import-files');
}

/**
 * Build a static asset URL with base path
 */
export function buildAssetUrl(assetPath: string): string {
  const config = getRuntimeConfig();
  
  // Normalize asset path to ensure it starts with /
  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  
  // If base URL is empty (root deployment), return path as-is
  if (!config.baseUrl) {
    return normalizedPath;
  }
  
  // Combine base URL with asset path
  return `${config.baseUrl}${normalizedPath}`;
}

/**
 * Parse a URL to extract the path without base path
 * Useful for routing logic that needs to work with relative paths
 */
export function parseRouteFromUrl(url: string): string {
  const config = getRuntimeConfig();
  
  // If no base URL configured, return the pathname as-is
  if (!config.baseUrl) {
    return new URL(url, window.location.origin).pathname;
  }
  
  const pathname = new URL(url, window.location.origin).pathname;
  
  // Remove base path prefix if present
  if (pathname.startsWith(config.baseUrl)) {
    const relativePath = pathname.slice(config.baseUrl.length);
    return relativePath || '/';
  }
  
  return pathname;
}

/**
 * Check if runtime configuration is available
 */
export function isRuntimeConfigAvailable(): boolean {
  const config = (window as any).__APP_CONFIG__;
  return config && typeof config === 'object';
}

/**
 * Get the current base path configuration
 */
export function getBasePath(): string {
  return getRuntimeConfig().baseUrl;
}

/**
 * Get the current API base path configuration
 */
export function getApiBasePath(): string {
  return getRuntimeConfig().apiBaseUrl;
}

/**
 * Get the current MCP base path configuration
 */
export function getMcpBasePath(): string {
  return getRuntimeConfig().mcpBaseUrl;
}