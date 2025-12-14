/**
 * Base Path Configuration Service
 * 
 * Handles parsing, validation, and normalization of base path configuration
 * from environment variables for nginx subpath deployment support.
 */

export interface BasePathConfig {
  // Original environment variable value
  basePath: string;
  
  // Normalized path (e.g., "/md" from "md/", "/md/", "md")
  normalizedPath: string;
  
  // Whether running at root path
  isRoot: boolean;
  
  // Validation status
  isValid: boolean;
}

export interface BasePathService {
  getConfig(): BasePathConfig;
  normalizePath(path: string): string;
  prependBasePath(url: string): string;
  stripBasePath(url: string): string;
}

class BasePathServiceImpl implements BasePathService {
  private config: BasePathConfig;

  constructor() {
    this.config = this.parseBasePathFromEnvironment();
  }

  /**
   * Parse and validate BASE_PATH environment variable
   */
  private parseBasePathFromEnvironment(): BasePathConfig {
    const basePath = process.env.BASE_PATH || '';
    
    if (!basePath) {
      return {
        basePath: '',
        normalizedPath: '',
        isRoot: true,
        isValid: true
      };
    }

    const normalizedPath = this.normalizePath(basePath);
    const isValid = this.validateBasePath(normalizedPath);
    
    if (!isValid) {
      console.warn(`Invalid BASE_PATH configuration: "${basePath}". Falling back to root path mode.`);
      return {
        basePath,
        normalizedPath: '',
        isRoot: true,
        isValid: false
      };
    }

    console.log(`Base path configured: "${normalizedPath}"`);
    
    return {
      basePath,
      normalizedPath,
      isRoot: normalizedPath === '',
      isValid: true
    };
  }

  /**
   * Normalize path format - ensure leading slash, remove trailing slash
   */
  normalizePath(path: string): string {
    if (!path || path === '/') {
      return '';
    }

    // Remove leading and trailing whitespace
    let normalized = path.trim();
    
    // Ensure leading slash
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    
    // Remove trailing slash (except for root)
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    return normalized;
  }

  /**
   * Validate base path format
   */
  private validateBasePath(path: string): boolean {
    if (path === '') {
      return true; // Root path is valid
    }

    // Must start with slash
    if (!path.startsWith('/')) {
      return false;
    }

    // Must not end with slash (except root)
    if (path.length > 1 && path.endsWith('/')) {
      return false;
    }

    // Check for invalid characters (basic validation)
    // Allow alphanumeric, hyphens, underscores, and forward slashes
    const validPathRegex = /^\/[a-zA-Z0-9\-_\/]*$/;
    if (!validPathRegex.test(path)) {
      return false;
    }

    // Must not contain double slashes
    if (path.includes('//')) {
      return false;
    }

    return true;
  }

  /**
   * Get current base path configuration
   */
  getConfig(): BasePathConfig {
    return { ...this.config };
  }

  /**
   * Prepend base path to a URL
   */
  prependBasePath(url: string): string {
    if (this.config.isRoot || !this.config.isValid) {
      return url;
    }

    // Handle empty or root URLs
    if (!url || url === '/') {
      return this.config.normalizedPath || '/';
    }

    // Ensure URL starts with slash
    const normalizedUrl = url.startsWith('/') ? url : '/' + url;
    
    return this.config.normalizedPath + normalizedUrl;
  }

  /**
   * Strip base path from a URL
   */
  stripBasePath(url: string): string {
    if (this.config.isRoot || !this.config.isValid || !url) {
      return url;
    }

    // If URL starts with base path, remove it
    if (url.startsWith(this.config.normalizedPath)) {
      const stripped = url.slice(this.config.normalizedPath.length);
      return stripped || '/';
    }

    return url;
  }
}

// Export singleton instance
export const basePathService: BasePathService = new BasePathServiceImpl();

// Export for testing
export { BasePathServiceImpl };