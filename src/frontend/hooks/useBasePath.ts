import { useState, useEffect, useCallback } from 'react';

/**
 * Runtime configuration interface injected by server
 */
interface RuntimeConfig {
  baseUrl: string;
  apiBaseUrl: string;
  mcpBaseUrl: string;
}

/**
 * Return type for useBasePath hook
 */
interface UseBasePathReturn {
  basePath: string;
  navigate: (path: string) => void;
  buildUrl: (path: string) => string;
  buildApiUrl: (endpoint: string) => string;
  isConfigured: boolean;
  config: RuntimeConfig | null;
}

/**
 * Default configuration for root path deployment
 */
const DEFAULT_CONFIG: RuntimeConfig = {
  baseUrl: '',
  apiBaseUrl: '',
  mcpBaseUrl: ''
};

/**
 * Hook for managing base path configuration and navigation
 * 
 * This hook:
 * 1. Reads runtime configuration injected by the server
 * 2. Provides utilities for URL building with base path support
 * 3. Handles navigation while maintaining base path
 * 4. Validates runtime configuration availability
 */
export function useBasePath(): UseBasePathReturn {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    // Initialize runtime configuration from server-injected global variable
    const runtimeConfig = (window as any).__APP_CONFIG__;
    
    if (runtimeConfig && typeof runtimeConfig === 'object') {
      // Validate that required properties exist
      const validConfig = {
        baseUrl: runtimeConfig.baseUrl || '',
        apiBaseUrl: runtimeConfig.apiBaseUrl || '',
        mcpBaseUrl: runtimeConfig.mcpBaseUrl || ''
      };
      
      setConfig(validConfig);
      setIsConfigured(true);
      console.log('Runtime base path configuration loaded:', validConfig);
    } else {
      // Fall back to default configuration for root path deployment
      console.warn('No runtime configuration found, using default root path behavior');
      setConfig(DEFAULT_CONFIG);
      setIsConfigured(false);
    }
  }, []);

  /**
   * Build a URL with the correct base path prefix
   */
  const buildUrl = useCallback((path: string): string => {
    if (!config) return path;
    
    // Normalize path to ensure it starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // If base URL is empty (root deployment), return path as-is
    if (!config.baseUrl) {
      return normalizedPath;
    }
    
    // Combine base URL with path, avoiding double slashes
    return `${config.baseUrl}${normalizedPath}`;
  }, [config]);

  /**
   * Build an API URL with the correct base path prefix
   */
  const buildApiUrl = useCallback((endpoint: string): string => {
    if (!config) return endpoint;
    
    // Normalize endpoint to ensure it starts with /
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // If API base URL is empty (root deployment), return endpoint as-is
    if (!config.apiBaseUrl) {
      return normalizedEndpoint;
    }
    
    // Combine API base URL with endpoint
    return `${config.apiBaseUrl}${normalizedEndpoint}`;
  }, [config]);

  /**
   * Navigate to a path while maintaining base path
   */
  const navigate = useCallback((path: string) => {
    const fullUrl = buildUrl(path);
    window.history.pushState({}, '', fullUrl);
    
    // Dispatch a custom event to notify the app of navigation
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [buildUrl]);

  return {
    basePath: config?.baseUrl || '',
    navigate,
    buildUrl,
    buildApiUrl,
    isConfigured,
    config
  };
}