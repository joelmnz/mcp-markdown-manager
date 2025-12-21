/**
 * Runtime configuration interface
 */
interface RuntimeConfig {
  baseUrl: string;
  apiBaseUrl: string;
  mcpBaseUrl: string;
}

/**
 * API client configuration
 */
interface ApiClientConfig {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
}

/**
 * API client with runtime base path support
 * 
 * This client:
 * 1. Dynamically constructs URLs using runtime configuration
 * 2. Supports reconfiguration when runtime config changes
 * 3. Automatically prepends base path to all endpoints
 * 4. Provides a centralized interface for all API calls
 * 
 * MIGRATION GUIDE:
 * 
 * Before (direct fetch):
 * ```typescript
 * const response = await fetch('/api/articles', {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * });
 * ```
 * 
 * After (using API client):
 * ```typescript
 * import { getConfiguredApiClient } from '../utils/apiClient';
 * const apiClient = getConfiguredApiClient();
 * const response = await apiClient.get('/api/articles', token);
 * ```
 * 
 * Or using the singleton:
 * ```typescript
 * import { apiClient } from '../utils/apiClient';
 * const response = await apiClient.get('/api/articles', token);
 * ```
 */
class ApiClient {
  private config: ApiClientConfig;

  constructor(config?: ApiClientConfig) {
    this.config = config || this.getDefaultConfig();
  }

  /**
   * Get default configuration from runtime environment
   */
  private getDefaultConfig(): ApiClientConfig {
    const runtimeConfig = (window as any).__APP_CONFIG__ as RuntimeConfig;
    
    return {
      baseUrl: runtimeConfig?.apiBaseUrl || '',
      defaultHeaders: {
        'Content-Type': 'application/json'
      }
    };
  }

  /**
   * Configure the API client with new settings
   */
  configure(config: ApiClientConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Build a full URL for an API endpoint
   */
  private buildUrl(endpoint: string): string {
    // Normalize endpoint to ensure it starts with /
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // If base URL is empty (root deployment), return endpoint as-is
    if (!this.config.baseUrl) {
      return normalizedEndpoint;
    }
    
    // Combine base URL with endpoint, avoiding double slashes
    return `${this.config.baseUrl}${normalizedEndpoint}`;
  }

  /**
   * Prepare headers for a request
   */
  private prepareHeaders(token?: string, additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers = { ...this.config.defaultHeaders };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (additionalHeaders) {
      Object.assign(headers, additionalHeaders);
    }
    
    return headers;
  }

  /**
   * Make a GET request
   */
  async get(endpoint: string, token?: string, additionalHeaders?: Record<string, string>): Promise<Response> {
    const url = this.buildUrl(endpoint);
    const headers = this.prepareHeaders(token, additionalHeaders);
    
    return fetch(url, {
      method: 'GET',
      headers
    });
  }

  /**
   * Make a POST request
   */
  async post(endpoint: string, data?: any, token?: string, additionalHeaders?: Record<string, string>): Promise<Response> {
    const url = this.buildUrl(endpoint);
    const headers = this.prepareHeaders(token, additionalHeaders);
    
    return fetch(url, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined
    });
  }

  /**
   * Make a PUT request
   */
  async put(endpoint: string, data?: any, token?: string, additionalHeaders?: Record<string, string>): Promise<Response> {
    const url = this.buildUrl(endpoint);
    const headers = this.prepareHeaders(token, additionalHeaders);
    
    return fetch(url, {
      method: 'PUT',
      headers,
      body: data ? JSON.stringify(data) : undefined
    });
  }

  /**
   * Make a DELETE request
   */
  async delete(endpoint: string, token?: string, additionalHeaders?: Record<string, string>): Promise<Response> {
    const url = this.buildUrl(endpoint);
    const headers = this.prepareHeaders(token, additionalHeaders);
    
    return fetch(url, {
      method: 'DELETE',
      headers
    });
  }

  /**
   * Make a request with custom method and options
   */
  async request(endpoint: string, options: RequestInit & { token?: string }): Promise<Response> {
    const url = this.buildUrl(endpoint);
    const { token, ...fetchOptions } = options;
    
    // Merge headers
    const headers = this.prepareHeaders(token, fetchOptions.headers as Record<string, string>);
    
    return fetch(url, {
      ...fetchOptions,
      headers
    });
  }

  /**
   * Get the current base URL configuration
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }
}

// Create and export a singleton instance
export const apiClient = new ApiClient();

// Export the class for custom instances if needed
export { ApiClient };

/**
 * Utility function to reconfigure the API client with runtime config
 */
export function configureApiClient(runtimeConfig: RuntimeConfig): void {
  apiClient.configure({
    baseUrl: runtimeConfig.apiBaseUrl,
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Utility function to get API client configured for current runtime
 */
export function getConfiguredApiClient(): ApiClient {
  const runtimeConfig = (window as any).__APP_CONFIG__ as RuntimeConfig;
  
  if (runtimeConfig) {
    configureApiClient(runtimeConfig);
  }
  
  return apiClient;
}