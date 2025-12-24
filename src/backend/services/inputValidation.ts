/**
 * Input validation service for MCP tools and API endpoints
 * Provides comprehensive validation to prevent security vulnerabilities
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: any;
}

export interface ValidationLimits {
  maxTitleLength: number;
  maxContentLength: number;
  maxFolderPathLength: number;
  maxFolderDepth: number;
  maxFilenameLength: number;
}

// Default validation limits (configurable via environment variables)
const DEFAULT_LIMITS: ValidationLimits = {
  maxTitleLength: parseInt(process.env.MAX_TITLE_LENGTH || '500', 10),
  maxContentLength: parseInt(process.env.MAX_CONTENT_LENGTH || '10485760', 10), // 10MB
  maxFolderPathLength: parseInt(process.env.MAX_FOLDER_PATH_LENGTH || '500', 10),
  maxFolderDepth: parseInt(process.env.MAX_FOLDER_DEPTH || '10', 10),
  maxFilenameLength: parseInt(process.env.MAX_FILENAME_LENGTH || '255', 10),
};

// Pattern detection for potential security threats
const SUSPICIOUS_PATTERNS = {
  // Potential prompt injection patterns
  promptInjection: [
    /ignore\s+(?:previous|all|above)\s+(?:instructions|prompts|commands)/i,
    /system\s*:\s*you\s+are/i,
    /\[SYSTEM\]/i,
    /\<\|im_start\|\>/i,
    /\<\|im_end\|\>/i,
    /###\s*SYSTEM/i,
  ],
  
  // Path traversal attempts
  pathTraversal: [
    /\.\.[\/\\]/,
    /[\/\\]\.\.[\/\\]/,
    /\.\.[\/\\]\.\./, 
  ],
  
  // Script injection attempts
  scriptInjection: [
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick=
  ],
  
  // SQL injection patterns (defense in depth)
  sqlInjection: [
    /;\s*(?:drop|delete|truncate|update|insert)\s+/i,
    /union\s+select/i,
    /'\s+or\s+'1'\s*=\s*'1/i,
  ],
};

/**
 * Validate article title
 */
export function validateTitle(title: string, limits: ValidationLimits = DEFAULT_LIMITS): ValidationResult {
  const errors: string[] = [];
  
  // Check if title is provided
  if (!title || typeof title !== 'string') {
    errors.push('Title is required and must be a string');
    return { isValid: false, errors };
  }
  
  // Trim whitespace
  const trimmed = title.trim();
  
  // Check if empty after trimming
  if (trimmed.length === 0) {
    errors.push('Title cannot be empty');
    return { isValid: false, errors };
  }
  
  // Check length
  if (trimmed.length > limits.maxTitleLength) {
    errors.push(`Title exceeds maximum length of ${limits.maxTitleLength} characters`);
  }
  
  // Check for null bytes (can cause issues in some systems)
  if (trimmed.includes('\0')) {
    errors.push('Title cannot contain null bytes');
  }
  
  // Check for control characters (except newlines and tabs which might be intentional)
  const hasInvalidControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed);
  if (hasInvalidControlChars) {
    errors.push('Title contains invalid control characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: trimmed,
  };
}

/**
 * Validate and sanitize article content
 */
export function validateContent(content: string, limits: ValidationLimits = DEFAULT_LIMITS): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if content is provided
  if (typeof content !== 'string') {
    errors.push('Content must be a string');
    return { isValid: false, errors };
  }
  
  // Allow empty content (some articles might be placeholders)
  if (content.length === 0) {
    return { isValid: true, errors: [], sanitized: content };
  }
  
  // Check length
  if (content.length > limits.maxContentLength) {
    errors.push(`Content exceeds maximum length of ${limits.maxContentLength} bytes`);
  }
  
  // Check for null bytes
  if (content.includes('\0')) {
    errors.push('Content cannot contain null bytes');
  }
  
  // Detect potential prompt injection attempts
  for (const pattern of SUSPICIOUS_PATTERNS.promptInjection) {
    if (pattern.test(content)) {
      warnings.push('Content contains patterns that may indicate prompt injection attempt');
      break; // Only warn once
    }
  }
  
  // Detect potential script injection
  for (const pattern of SUSPICIOUS_PATTERNS.scriptInjection) {
    if (pattern.test(content)) {
      warnings.push('Content contains HTML/JavaScript patterns that may pose security risks');
      break;
    }
  }
  
  // Log warnings but don't fail validation (content might legitimately discuss these topics)
  if (warnings.length > 0) {
    console.warn('Content validation warnings:', warnings);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: content,
  };
}

/**
 * Validate folder path
 */
export function validateFolder(folder: string | undefined, limits: ValidationLimits = DEFAULT_LIMITS): ValidationResult {
  const errors: string[] = [];
  
  // Undefined or empty is valid (root folder)
  if (!folder || folder === '') {
    return { isValid: true, errors: [], sanitized: undefined };
  }
  
  // Check type
  if (typeof folder !== 'string') {
    errors.push('Folder must be a string');
    return { isValid: false, errors };
  }
  
  // Trim and normalize
  let sanitized = folder.trim();
  
  // Remove leading/trailing slashes
  sanitized = sanitized.replace(/^\/+|\/+$/g, '');
  
  // Check if empty after normalization
  if (sanitized.length === 0) {
    return { isValid: true, errors: [], sanitized: undefined };
  }
  
  // Check length
  if (sanitized.length > limits.maxFolderPathLength) {
    errors.push(`Folder path exceeds maximum length of ${limits.maxFolderPathLength} characters`);
  }
  
  // Check for path traversal attempts
  for (const pattern of SUSPICIOUS_PATTERNS.pathTraversal) {
    if (pattern.test(sanitized)) {
      errors.push('Folder path contains invalid path traversal sequences');
      break;
    }
  }
  
  // Check for invalid characters (OS-specific restrictions)
  const invalidChars = /[<>:"|?*\x00-\x1F\x7F]/;
  if (invalidChars.test(sanitized)) {
    errors.push('Folder path contains invalid characters');
  }
  
  // Check folder depth
  const depth = sanitized.split('/').length;
  if (depth > limits.maxFolderDepth) {
    errors.push(`Folder path depth exceeds maximum of ${limits.maxFolderDepth} levels`);
  }
  
  // Check for consecutive slashes
  if (sanitized.includes('//')) {
    errors.push('Folder path cannot contain consecutive slashes');
  }
  
  // Check for dots-only segments
  const segments = sanitized.split('/');
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      errors.push('Folder path cannot contain "." or ".." segments');
      break;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: sanitized || undefined,
  };
}

/**
 * Validate filename
 */
export function validateFilename(filename: string, limits: ValidationLimits = DEFAULT_LIMITS): ValidationResult {
  const errors: string[] = [];
  
  // Check if filename is provided
  if (!filename || typeof filename !== 'string') {
    errors.push('Filename is required and must be a string');
    return { isValid: false, errors };
  }
  
  // Trim whitespace
  const trimmed = filename.trim();
  
  // Check if empty
  if (trimmed.length === 0) {
    errors.push('Filename cannot be empty');
    return { isValid: false, errors };
  }
  
  // Check length
  if (trimmed.length > limits.maxFilenameLength) {
    errors.push(`Filename exceeds maximum length of ${limits.maxFilenameLength} characters`);
  }
  
  // Check for path separators (filename should not contain paths)
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    errors.push('Filename cannot contain path separators');
  }
  
  // Check for path traversal
  if (trimmed.includes('..')) {
    errors.push('Filename cannot contain ".."');
  }
  
  // Check for invalid characters
  const invalidChars = /[<>:"|?*\x00-\x1F\x7F]/;
  if (invalidChars.test(trimmed)) {
    errors.push('Filename contains invalid characters');
  }
  
  // Check for reserved names (Windows)
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
  if (reservedNames.test(trimmed)) {
    errors.push('Filename uses a reserved system name');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: trimmed,
  };
}

/**
 * Validate array input for multi-search operations
 */
export function validateSearchArray(
  items: any[], 
  fieldName: string,
  maxItems: number
): ValidationResult {
  const errors: string[] = [];
  
  // Check if array
  if (!Array.isArray(items)) {
    errors.push(`${fieldName} must be an array`);
    return { isValid: false, errors };
  }
  
  // Check if empty
  if (items.length === 0) {
    errors.push(`${fieldName} array cannot be empty`);
    return { isValid: false, errors };
  }
  
  // Check max items
  if (items.length > maxItems) {
    errors.push(`${fieldName} array cannot exceed ${maxItems} items`);
  }
  
  // Check all items are strings
  const allStrings = items.every(item => typeof item === 'string');
  if (!allStrings) {
    errors.push(`All items in ${fieldName} must be strings`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: items,
  };
}

/**
 * Validate numeric parameter
 */
export function validateNumber(
  value: any,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): ValidationResult {
  const errors: string[] = [];
  
  // Check if undefined (might be optional)
  if (value === undefined) {
    return { isValid: true, errors: [], sanitized: undefined };
  }
  
  // Check if number
  const num = Number(value);
  if (isNaN(num)) {
    errors.push(`${fieldName} must be a valid number`);
    return { isValid: false, errors };
  }
  
  // Check if integer required
  if (options.integer && !Number.isInteger(num)) {
    errors.push(`${fieldName} must be an integer`);
  }
  
  // Check min
  if (options.min !== undefined && num < options.min) {
    errors.push(`${fieldName} must be at least ${options.min}`);
  }
  
  // Check max
  if (options.max !== undefined && num > options.max) {
    errors.push(`${fieldName} must be at most ${options.max}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: num,
  };
}

/**
 * Complete validation for create article operation
 */
export function validateCreateArticle(params: {
  title: string;
  content: string;
  folder?: string;
}): ValidationResult {
  const errors: string[] = [];
  
  // Validate title
  const titleResult = validateTitle(params.title);
  if (!titleResult.isValid) {
    errors.push(...titleResult.errors);
  }
  
  // Validate content
  const contentResult = validateContent(params.content);
  if (!contentResult.isValid) {
    errors.push(...contentResult.errors);
  }
  
  // Validate folder
  const folderResult = validateFolder(params.folder);
  if (!folderResult.isValid) {
    errors.push(...folderResult.errors);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      title: titleResult.sanitized,
      content: contentResult.sanitized,
      folder: folderResult.sanitized,
    },
  };
}

/**
 * Complete validation for update article operation
 */
export function validateUpdateArticle(params: {
  filename: string;
  title: string;
  content: string;
  folder?: string;
}): ValidationResult {
  const errors: string[] = [];
  
  // Validate filename
  const filenameResult = validateFilename(params.filename);
  if (!filenameResult.isValid) {
    errors.push(...filenameResult.errors);
  }
  
  // Validate title
  const titleResult = validateTitle(params.title);
  if (!titleResult.isValid) {
    errors.push(...titleResult.errors);
  }
  
  // Validate content
  const contentResult = validateContent(params.content);
  if (!contentResult.isValid) {
    errors.push(...contentResult.errors);
  }
  
  // Validate folder
  const folderResult = validateFolder(params.folder);
  if (!folderResult.isValid) {
    errors.push(...folderResult.errors);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      filename: filenameResult.sanitized,
      title: titleResult.sanitized,
      content: contentResult.sanitized,
      folder: folderResult.sanitized,
    },
  };
}

export const inputValidation = {
  validateTitle,
  validateContent,
  validateFolder,
  validateFilename,
  validateSearchArray,
  validateNumber,
  validateCreateArticle,
  validateUpdateArticle,
  DEFAULT_LIMITS,
};
