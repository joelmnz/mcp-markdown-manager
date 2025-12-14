/**
 * Runtime configuration interface
 */
export interface RuntimeConfig {
  baseUrl: string;
  apiBaseUrl: string;
  mcpBaseUrl: string;
}

/**
 * Configuration validation result
 */
interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
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
 * Runtime configuration manager
 * 
 * This module:
 * 1. Initializes runtime configuration from server-injected variables
 * 2. Validates configuration structure and values
 * 3. Provides fallback behavior for missing configuration
 * 4. Handles configuration updates and notifications
 */

let currentConfig: RuntimeConfig | null = null;
let configListeners: Array<(config: RuntimeConfig) => void> = [];

/**
 * Initialize runtime configuration from global variable
 */
export function initializeRuntimeConfig(): ConfigValidationResult {
  try {
    const injectedConfig = (window as any).__APP_CONFIG__;
    
    if (!injectedConfig) {
      console.warn('No runtime configuration found in window.__APP_CONFIG__, using default root path behavior');
      currentConfig = DEFAULT_CONFIG;
      return {
        isValid: false,
        errors: ['No runtime configuration injected by server'],
        config: DEFAULT_CONFIG
      };
    }
    
    // Validate configuration structure
    const validation = validateConfig(injectedConfig);
    
    if (validation.isValid && validation.config) {
      currentConfig = validation.config;
      console.log('Runtime configuration initialized successfully:', currentConfig);
      
      // Notify listeners of configuration change
      notifyConfigListeners(currentConfig);
      
      return validation;
    } else {
      console.error('Invalid runtime configuration:', validation.errors);
      currentConfig = DEFAULT_CONFIG;
      return {
        isValid: false,
        errors: validation.errors,
        config: DEFAULT_CONFIG
      };
    }
  } catch (error) {
    console.error('Error initializing runtime configuration:', error);
    currentConfig = DEFAULT_CONFIG;
    return {
      isValid: false,
      errors: [`Initialization error: ${error}`],
      config: DEFAULT_CONFIG
    };
  }
}

/**
 * Validate runtime configuration structure and values
 */
function validateConfig(config: any): ConfigValidationResult {
  const errors: string[] = [];
  
  if (typeof config !== 'object' || config === null) {
    return {
      isValid: false,
      errors: ['Configuration must be an object'],
      config: null
    };
  }
  
  // Validate baseUrl
  if (config.baseUrl !== undefined && typeof config.baseUrl !== 'string') {
    errors.push('baseUrl must be a string');
  }
  
  // Validate apiBaseUrl
  if (config.apiBaseUrl !== undefined && typeof config.apiBaseUrl !== 'string') {
    errors.push('apiBaseUrl must be a string');
  }
  
  // Validate mcpBaseUrl
  if (config.mcpBaseUrl !== undefined && typeof config.mcpBaseUrl !== 'string') {
    errors.push('mcpBaseUrl must be a string');
  }
  
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      config: null
    };
  }
  
  // Normalize configuration values
  const normalizedConfig: RuntimeConfig = {
    baseUrl: normalizeBasePath(config.baseUrl || ''),
    apiBaseUrl: normalizeBasePath(config.apiBaseUrl || ''),
    mcpBaseUrl: normalizeBasePath(config.mcpBaseUrl || '')
  };
  
  return {
    isValid: true,
    errors: [],
    config: normalizedConfig
  };
}

/**
 * Normalize a base path to ensure consistent format
 */
function normalizeBasePath(path: string): string {
  if (!path || path === '/') {
    return '';
  }
  
  // Remove trailing slash, ensure leading slash
  let normalized = path.replace(/\/+$/, '');
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  
  return normalized;
}

/**
 * Get current runtime configuration
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (!currentConfig) {
    // Try to initialize if not already done
    const result = initializeRuntimeConfig();
    return result.config || DEFAULT_CONFIG;
  }
  
  return currentConfig;
}

/**
 * Check if runtime configuration is available and valid
 */
export function isRuntimeConfigAvailable(): boolean {
  return currentConfig !== null && currentConfig !== DEFAULT_CONFIG;
}

/**
 * Update runtime configuration (for testing or dynamic updates)
 */
export function updateRuntimeConfig(newConfig: Partial<RuntimeConfig>): ConfigValidationResult {
  const mergedConfig = {
    ...getRuntimeConfig(),
    ...newConfig
  };
  
  const validation = validateConfig(mergedConfig);
  
  if (validation.isValid && validation.config) {
    currentConfig = validation.config;
    notifyConfigListeners(currentConfig);
    console.log('Runtime configuration updated:', currentConfig);
  }
  
  return validation;
}

/**
 * Add a listener for configuration changes
 */
export function addConfigListener(listener: (config: RuntimeConfig) => void): () => void {
  configListeners.push(listener);
  
  // Immediately call with current config if available
  if (currentConfig) {
    listener(currentConfig);
  }
  
  // Return unsubscribe function
  return () => {
    const index = configListeners.indexOf(listener);
    if (index > -1) {
      configListeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners of configuration changes
 */
function notifyConfigListeners(config: RuntimeConfig): void {
  configListeners.forEach(listener => {
    try {
      listener(config);
    } catch (error) {
      console.error('Error in config listener:', error);
    }
  });
}

/**
 * Reset configuration to default (for testing)
 */
export function resetRuntimeConfig(): void {
  currentConfig = null;
  configListeners = [];
}

/**
 * Get configuration validation errors if any
 */
export function getConfigValidationErrors(): string[] {
  try {
    const injectedConfig = (window as any).__APP_CONFIG__;
    if (!injectedConfig) {
      return ['No runtime configuration found'];
    }
    
    const validation = validateConfig(injectedConfig);
    return validation.errors;
  } catch (error) {
    return [`Validation error: ${error}`];
  }
}

/**
 * Log current configuration status for debugging
 */
export function logConfigStatus(): void {
  const config = getRuntimeConfig();
  const isAvailable = isRuntimeConfigAvailable();
  const errors = getConfigValidationErrors();
  
  console.group('Runtime Configuration Status');
  console.log('Available:', isAvailable);
  console.log('Configuration:', config);
  if (errors.length > 0) {
    console.log('Validation Errors:', errors);
  }
  console.groupEnd();
}