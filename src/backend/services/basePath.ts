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

export interface ClientBasePathConfig {
  baseUrl: string;
  apiBaseUrl: string;
  mcpBaseUrl: string;
}

export interface BasePathService {
  getConfig(): BasePathConfig;
  normalizePath(path: string): string;
  prependBasePath(url: string): string;
  stripBasePath(url: string): string;
  getClientConfig(): ClientBasePathConfig;
  validateEnvironmentConfiguration(): {
    isValid: boolean;
    warnings: string[];
    recommendations: string[];
  };
}

class BasePathServiceImpl implements BasePathService {
  private config: BasePathConfig;

  constructor() {
    this.config = this.parseBasePathFromEnvironment();
  }

  /**
   * Parse and validate BASE_PATH/BASE_URL environment variables
   */
  private parseBasePathFromEnvironment(): BasePathConfig {
    // Support both BASE_PATH and BASE_URL environment variables
    // BASE_URL takes precedence if both are set
    const baseUrl = process.env.BASE_URL?.trim();
    const basePath = process.env.BASE_PATH?.trim();
    
    let configuredPath = '';
    let sourceVariable = '';
    
    // Determine which variable to use and extract path
    if (baseUrl) {
      sourceVariable = 'BASE_URL';
      // Extract path from BASE_URL if it's a full URL
      try {
        const url = new URL(baseUrl);
        configuredPath = url.pathname;
        console.log(`📍 Base path source: BASE_URL="${baseUrl}" (extracted path: "${configuredPath}")`);
      } catch {
        // If BASE_URL is not a valid URL, treat it as a path
        configuredPath = baseUrl;
        console.log(`📍 Base path source: BASE_URL="${baseUrl}" (treated as path)`);
      }
    } else if (basePath) {
      sourceVariable = 'BASE_PATH';
      configuredPath = basePath;
      console.log(`📍 Base path source: BASE_PATH="${basePath}"`);
    } else {
      console.log(`📍 Base path: No BASE_URL or BASE_PATH configured, using root path mode`);
    }
    
    // Handle empty or root-only paths
    if (!configuredPath || configuredPath === '/' || configuredPath === '') {
      console.log(`✅ Base path configuration: Root path mode (no subpath)`);
      return {
        basePath: configuredPath,
        normalizedPath: '',
        isRoot: true,
        isValid: true
      };
    }

    // Normalize and validate the path
    const normalizedPath = this.normalizePath(configuredPath);
    const isValid = this.validateBasePath(normalizedPath);
    
    if (!isValid) {
      console.warn(`❌ Invalid base path configuration: "${configuredPath}" from ${sourceVariable}`);
      console.warn(`   Validation failed - falling back to root path mode`);
      console.warn(`   Valid format examples: "/md", "/app", "/docs/articles"`);
      return {
        basePath: configuredPath,
        normalizedPath: '',
        isRoot: true,
        isValid: false
      };
    }

    console.log(`✅ Base path configuration: "${normalizedPath}" (normalized from "${configuredPath}")`);
    console.log(`   Source: ${sourceVariable}`);
    console.log(`   All URLs will be prefixed with: ${normalizedPath}`);
    
    return {
      basePath: configuredPath,
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
      console.warn(`   Validation error: Path must start with "/" (got: "${path}")`);
      return false;
    }

    // Must not end with slash (except root)
    if (path.length > 1 && path.endsWith('/')) {
      console.warn(`   Validation error: Path must not end with "/" (got: "${path}")`);
      return false;
    }

    // Check for invalid characters (basic validation)
    // Allow alphanumeric, hyphens, underscores, and forward slashes
    const validPathRegex = /^\/[a-zA-Z0-9\-_\/]*$/;
    if (!validPathRegex.test(path)) {
      console.warn(`   Validation error: Path contains invalid characters (got: "${path}")`);
      console.warn(`   Allowed characters: a-z, A-Z, 0-9, -, _, /`);
      return false;
    }

    // Must not contain double slashes
    if (path.includes('//')) {
      console.warn(`   Validation error: Path must not contain double slashes (got: "${path}")`);
      return false;
    }

    // Additional validation: path segments should not be empty
    const segments = path.split('/').filter(segment => segment !== '');
    if (segments.length === 0) {
      console.warn(`   Validation error: Path has no valid segments (got: "${path}")`);
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

  /**
   * Get client-side configuration for runtime injection
   */
  getClientConfig(): ClientBasePathConfig {
    const basePath = this.config.isRoot ? '' : this.config.normalizedPath;
    
    return {
      baseUrl: basePath,
      apiBaseUrl: basePath,
      mcpBaseUrl: basePath
    };
  }

  /**
   * Validate environment configuration and provide detailed feedback
   */
  validateEnvironmentConfiguration(): {
    isValid: boolean;
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    const baseUrl = process.env.BASE_URL?.trim();
    const basePath = process.env.BASE_PATH?.trim();
    
    // Check for common configuration issues
    if (baseUrl && basePath) {
      warnings.push('Both BASE_URL and BASE_PATH are set. BASE_URL takes precedence.');
      recommendations.push('Consider using only BASE_URL or only BASE_PATH to avoid confusion.');
    }
    
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (url.pathname === '/') {
          recommendations.push('BASE_URL points to root path. Consider unsetting it for root deployment.');
        }
      } catch {
        // BASE_URL is treated as path, which is fine
      }
    }
    
    if (basePath) {
      if (basePath === '/') {
        recommendations.push('BASE_PATH is set to "/". Consider unsetting it for root deployment.');
      }
      
      if (basePath.endsWith('/') && basePath.length > 1) {
        warnings.push(`BASE_PATH "${basePath}" ends with "/". It will be normalized to "${basePath.slice(0, -1)}".`);
      }
      
      if (!basePath.startsWith('/')) {
        warnings.push(`BASE_PATH "${basePath}" doesn't start with "/". It will be normalized to "/${basePath}".`);
      }
    }
    
    // Docker-specific recommendations
    if (process.env.NODE_ENV === 'production') {
      if (!baseUrl && !basePath) {
        recommendations.push('For production deployment behind nginx, consider setting BASE_PATH or BASE_URL.');
      }
    }
    
    return {
      isValid: this.config.isValid,
      warnings,
      recommendations
    };
  }
}

// Export singleton instance
export const basePathService: BasePathService = new BasePathServiceImpl();

// Export for testing
export { BasePathServiceImpl };