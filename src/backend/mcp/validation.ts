/**
 * Input validation and sanitization for MCP server
 * 
 * Security measures based on Docker MCP security recommendations:
 * - Strict input validation to prevent injection attacks
 * - Content size limits to prevent DoS
 * - Path traversal prevention
 * - Schema validation for all tool inputs
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: any;
}

// Security limits configuration
const MAX_TITLE_LENGTH = 500;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB
const MAX_FILENAME_LENGTH = 255;
const MAX_FOLDER_PATH_LENGTH = 1000;
const MAX_QUERY_LENGTH = 1000;
const MAX_ARRAY_LENGTH = 100;

// Dangerous patterns that could indicate injection attempts
const DANGEROUS_PATTERNS = [
  /(\.\.|\/\.\.)/,           // Path traversal
  /[<>]/,                     // HTML/XML injection (in filenames/paths)
  /[\x00-\x1f\x7f]/,         // Control characters
  /\$\{/,                     // Template injection
  /`/,                        // Command injection
  /;(?=\s*(?:rm|del|format|mkfs|dd))/i, // Dangerous commands
];

/**
 * Validate and sanitize a string input
 */
export function validateString(
  value: any,
  fieldName: string,
  options: {
    required?: boolean;
    maxLength?: number;
    minLength?: number;
    allowEmpty?: boolean;
    pattern?: RegExp;
    checkDangerous?: boolean;
  } = {}
): ValidationResult {
  const {
    required = true,
    maxLength = 10000,
    minLength = 0,
    allowEmpty = false,
    pattern,
    checkDangerous = true,
  } = options;

  // Check if value exists
  if (value === undefined || value === null) {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, sanitized: undefined };
  }

  // Type check
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  // Empty check
  const trimmed = value.trim();
  if (!allowEmpty && trimmed === '') {
    if (required) {
      return { valid: false, error: `${fieldName} cannot be empty` };
    }
    return { valid: true, sanitized: undefined };
  }

  // Length checks
  if (trimmed.length < minLength) {
    return { valid: false, error: `${fieldName} must be at least ${minLength} characters` };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} exceeds maximum length of ${maxLength} characters` };
  }

  // Pattern validation
  if (pattern && !pattern.test(trimmed)) {
    return { valid: false, error: `${fieldName} format is invalid` };
  }

  // Check for dangerous patterns on trimmed value
  if (checkDangerous) {
    for (const dangerousPattern of DANGEROUS_PATTERNS) {
      if (dangerousPattern.test(trimmed)) {
        return { valid: false, error: `${fieldName} contains invalid characters` };
      }
    }
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate filename (slug + .md)
 */
export function validateFilename(filename: any): ValidationResult {
  const result = validateString(filename, 'filename', {
    required: true,
    maxLength: MAX_FILENAME_LENGTH,
    checkDangerous: true,
  });

  if (!result.valid) {
    return result;
  }

  // Must end with .md
  if (!result.sanitized!.endsWith('.md')) {
    return { valid: false, error: 'filename must end with .md' };
  }

  // Validate slug part (before .md)
  const slug = result.sanitized!.replace(/\.md$/, '');
  const slugPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  
  if (!slugPattern.test(slug)) {
    return {
      valid: false,
      error: 'filename must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen',
    };
  }

  return { valid: true, sanitized: result.sanitized };
}

/**
 * Validate article title
 */
export function validateTitle(title: any): ValidationResult {
  return validateString(title, 'title', {
    required: true,
    maxLength: MAX_TITLE_LENGTH,
    minLength: 1,
    checkDangerous: false, // Allow special chars in titles
  });
}

/**
 * Validate article content
 */
export function validateContent(content: any): ValidationResult {
  return validateString(content, 'content', {
    required: true,
    maxLength: MAX_CONTENT_LENGTH,
    minLength: 1,
    checkDangerous: false, // Content can contain code, markdown, etc.
  });
}

/**
 * Validate folder path
 */
export function validateFolder(folder: any): ValidationResult {
  // Folder is optional
  if (folder === undefined || folder === null || folder === '' || folder === '/') {
    return { valid: true, sanitized: '' };
  }

  const result = validateString(folder, 'folder', {
    required: false,
    maxLength: MAX_FOLDER_PATH_LENGTH,
    allowEmpty: true,
    checkDangerous: true,
  });

  if (!result.valid) {
    return result;
  }

  // Additional folder-specific validation
  const sanitized = result.sanitized;
  if (sanitized) {
    // Check for path traversal attempts
    if (sanitized.includes('..')) {
      return { valid: false, error: 'folder path cannot contain ..' };
    }

    // Validate folder path structure
    const folderPattern = /^[a-zA-Z0-9_\-\/]+$/;
    if (!folderPattern.test(sanitized)) {
      return { valid: false, error: 'folder path contains invalid characters' };
    }
  }

  return { valid: true, sanitized: sanitized || '' };
}

/**
 * Validate search query
 */
export function validateQuery(query: any): ValidationResult {
  return validateString(query, 'query', {
    required: true,
    maxLength: MAX_QUERY_LENGTH,
    minLength: 1,
    checkDangerous: false, // Allow searching for special characters
  });
}

/**
 * Validate array input
 */
export function validateArray(
  value: any,
  fieldName: string,
  options: {
    required?: boolean;
    maxLength?: number;
    minLength?: number;
    itemValidator?: (item: any, index: number) => ValidationResult;
  } = {}
): ValidationResult {
  const {
    required = true,
    maxLength = MAX_ARRAY_LENGTH,
    minLength = 1,
    itemValidator,
  } = options;

  // Check if value exists
  if (value === undefined || value === null) {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, sanitized: undefined };
  }

  // Type check
  if (!Array.isArray(value)) {
    return { valid: false, error: `${fieldName} must be an array` };
  }

  // Length checks
  if (value.length < minLength) {
    return { valid: false, error: `${fieldName} must have at least ${minLength} items` };
  }

  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} exceeds maximum length of ${maxLength} items` };
  }

  // Validate each item if validator provided
  if (itemValidator) {
    const sanitizedItems: any[] = [];
    for (let i = 0; i < value.length; i++) {
      const itemResult = itemValidator(value[i], i);
      if (!itemResult.valid) {
        return { valid: false, error: `${fieldName}[${i}]: ${itemResult.error}` };
      }
      sanitizedItems.push(itemResult.sanitized);
    }
    return { valid: true, sanitized: sanitizedItems };
  }

  return { valid: true, sanitized: value };
}

/**
 * Validate number input
 */
export function validateNumber(
  value: any,
  fieldName: string,
  options: {
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): ValidationResult {
  const { required = true, min, max, integer = false } = options;

  // Check if value exists
  if (value === undefined || value === null) {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, sanitized: undefined };
  }

  // Type and conversion check
  const num = typeof value === 'string' ? Number(value) : value;
  
  if (typeof num !== 'number' || isNaN(num)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }

  // Integer check
  if (integer && !Number.isInteger(num)) {
    return { valid: false, error: `${fieldName} must be an integer` };
  }

  // Range checks
  if (min !== undefined && num < min) {
    return { valid: false, error: `${fieldName} must be at least ${min}` };
  }

  if (max !== undefined && num > max) {
    return { valid: false, error: `${fieldName} must be at most ${max}` };
  }

  return { valid: true, sanitized: num };
}

/**
 * Security audit log entry
 */
export interface SecurityAuditEntry {
  timestamp: string;
  event: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  ip?: string;
  sessionId?: string;
}

/**
 * Log security events
 */
export function logSecurityEvent(entry: SecurityAuditEntry): void {
  const logEntry = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  // Log to console with appropriate level
  const prefix = `[SECURITY-${entry.severity.toUpperCase()}]`;
  
  if (entry.severity === 'critical' || entry.severity === 'high') {
    console.error(prefix, JSON.stringify(logEntry));
  } else if (entry.severity === 'medium') {
    console.warn(prefix, JSON.stringify(logEntry));
  } else {
    console.log(prefix, JSON.stringify(logEntry));
  }

  // In production, this should also:
  // - Send to a SIEM system
  // - Write to a dedicated security log file
  // - Trigger alerts for high/critical events
}

/**
 * Detect potential security threats in input
 * 
 * Note: This function is intentionally minimal to avoid false positives.
 * The application is primarily an article storage system that may contain
 * security-related content. Real protection comes from:
 * - Parameterized SQL queries (prevents SQL injection)
 * - No shell command execution (prevents command injection)
 * - Database-only storage (prevents path traversal)
 * - Input validation and length limits (prevents DoS)
 */
export function detectSecurityThreats(input: string): string[] {
  // This function is kept for potential future use but currently returns no threats
  // to avoid blocking legitimate article content about security topics.
  // The real security is enforced at the database layer with parameterized queries.
  return [];
}
