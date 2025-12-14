# Design Document: Nginx Subpath Deployment Support

## Overview

This design implements support for deploying the MCP Markdown Manager application behind Nginx on a subpath (e.g., `/md`) or subdomain. The solution involves configuring a base path through environment variables, updating both frontend and backend to handle path prefixes correctly, and ensuring all static assets, API calls, and routing work seamlessly with the configured base path.

The implementation follows a configuration-driven approach where the base path is set via environment variables and automatically applied throughout the application without requiring code changes for different deployment scenarios.

## Architecture

### Base Path Flow
```
Environment Variable (BASE_PATH) → Server Configuration → HTML Template Injection → Frontend Configuration → All URL Generation
```

### Component Interaction
- **Environment Configuration**: `BASE_PATH` environment variable defines the deployment path
- **Server Middleware**: Handles route matching and static asset serving with base path
- **HTML Template**: Injects base path configuration into the frontend
- **Frontend Router**: Uses base path for all navigation and URL generation
- **API Client**: Prepends base path to all API requests
- **Service Worker**: Registers and caches resources with correct base path

## Components and Interfaces

### 1. Base Path Configuration Service
**Location**: `src/backend/services/basePath.ts`

**Interface**:
```typescript
interface BasePathConfig {
  basePath: string;
  normalizedPath: string;
  isRoot: boolean;
}

interface BasePathService {
  getConfig(): BasePathConfig;
  normalizePath(path: string): string;
  prependBasePath(url: string): string;
  stripBasePath(url: string): string;
}
```

**Responsibilities**:
- Parse and validate `BASE_PATH` environment variable
- Normalize path format (remove trailing slashes, ensure leading slash)
- Provide utilities for URL manipulation with base path

### 2. Server Route Handler Updates
**Location**: `src/backend/server.ts`

**Changes**:
- Update route matching to handle base path prefixes
- Modify static file serving to work with base path
- Update API and MCP endpoint routing
- Inject base path configuration into HTML template

### 3. Frontend Base Path Hook
**Location**: `src/frontend/hooks/useBasePath.ts`

**Interface**:
```typescript
interface UseBasePathReturn {
  basePath: string;
  navigate: (path: string) => void;
  buildUrl: (path: string) => string;
  buildApiUrl: (endpoint: string) => string;
}
```

**Responsibilities**:
- Provide base path configuration to React components
- Handle navigation with base path awareness
- Generate URLs with correct base path prefix

### 4. Updated Routing System
**Location**: `src/frontend/App.tsx`

**Changes**:
- Parse routes considering base path prefix
- Update navigation to maintain base path
- Modify browser history management

### 5. API Client Updates
**Location**: New utility in `src/frontend/utils/apiClient.ts`

**Interface**:
```typescript
interface ApiClient {
  get(endpoint: string, token: string): Promise<Response>;
  post(endpoint: string, data: any, token: string): Promise<Response>;
  put(endpoint: string, data: any, token: string): Promise<Response>;
  delete(endpoint: string, token: string): Promise<Response>;
}
```

**Responsibilities**:
- Centralize API calls with base path handling
- Automatically prepend base path to all endpoints

## Data Models

### Base Path Configuration
```typescript
interface BasePathConfig {
  // Original environment variable value
  basePath: string;
  
  // Normalized path (e.g., "/md" from "md/", "/md/", "md")
  normalizedPath: string;
  
  // Whether running at root path
  isRoot: boolean;
  
  // Validation status
  isValid: boolean;
}
```

### Frontend Configuration
```typescript
interface FrontendConfig {
  basePath: string;
  apiBasePath: string;
  mcpBasePath: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After reviewing all properties identified in the prework, several can be consolidated to eliminate redundancy:

**Consolidations:**
- Properties 1.1, 3.1 (static asset serving) can be combined into one comprehensive asset serving property
- Properties 1.2, 3.2, 3.4 (URL maintenance during navigation) can be combined into one navigation property  
- Properties 1.3, 4.2, 4.3 (API/MCP URL generation) can be combined into one URL generation property
- Properties 2.1, 5.1 (environment variable detection and usage) can be combined
- Properties 2.2, 5.5 (default root path behavior) are the same and can be combined
- Properties 2.3, 5.2 (base path validation and normalization) can be combined
- Properties 4.1, 4.4 (MCP endpoint access and authentication) can be combined into one MCP functionality property

**Property 1: Static asset serving with base path**
*For any* configured base path and any static asset, the system should serve the asset at a URL that includes the base path prefix
**Validates: Requirements 1.1, 3.1**

**Property 2: Navigation maintains base path**
*For any* configured base path and any navigation action (direct navigation, browser back/forward), the resulting URL should maintain the base path prefix
**Validates: Requirements 1.2, 3.2, 3.4**

**Property 3: API and MCP URL generation includes base path**
*For any* configured base path and any API or MCP endpoint, all generated URLs should include the base path prefix
**Validates: Requirements 1.3, 4.2, 4.3**

**Property 4: Service worker uses base path**
*For any* configured base path, the service worker should register and cache resources using URLs that include the base path prefix
**Validates: Requirements 1.4**

**Property 5: MCP endpoint functionality with base path**
*For any* configured base path, the MCP endpoint should respond correctly at the base path location and handle authentication properly
**Validates: Requirements 1.5, 4.1, 4.4**

**Property 6: Base path detection and usage**
*For any* BASE_PATH environment variable value, the system should detect and use it for all URL generation throughout the application
**Validates: Requirements 2.1, 5.1**

**Property 7: Base path validation and normalization**
*For any* BASE_PATH input format (with/without slashes, invalid characters), the system should normalize it to the correct format or reject invalid inputs
**Validates: Requirements 2.3, 5.2**

**Property 8: Configuration change adaptation**
*For any* base path configuration change, all internal URL references should update without requiring code modifications
**Validates: Requirements 2.4**

**Property 9: HTML template injection**
*For any* configured base path, the served HTML template should contain the correct base path configuration for frontend use
**Validates: Requirements 2.5**

**Property 10: Page refresh handling**
*For any* route and configured base path, refreshing the page should serve the correct content with the base path maintained
**Validates: Requirements 3.3**

**Property 11: Public article URL generation**
*For any* public article and configured base path, generated URLs should include the base path prefix
**Validates: Requirements 3.5**

**Property 12: Error response URL consistency**
*For any* error response and configured base path, returned URLs should maintain consistent formatting with the base path
**Validates: Requirements 4.5**

**Property 13: Invalid base path fallback**
*For any* invalid BASE_PATH configuration, the system should log a warning and operate in root path mode
**Validates: Requirements 5.3**

## Error Handling

### Base Path Configuration Errors
- **Invalid Format**: Log warning and fall back to root path mode
- **Missing Environment Variable**: Default to root path operation
- **Runtime Path Changes**: Validate and apply or reject with logging

### Route Resolution Errors
- **Unmatched Routes**: Fall back to index.html for SPA routing
- **Asset Not Found**: Return 404 with correct base path in error response
- **API Endpoint Mismatch**: Return 404 with proper error formatting

### Frontend Configuration Errors
- **Missing Base Path Config**: Default to root path behavior
- **Invalid Navigation Attempts**: Redirect to valid routes with base path
- **Service Worker Registration Failures**: Log errors but continue operation

## Testing Strategy

### Dual Testing Approach
The implementation will use both unit testing and property-based testing to ensure comprehensive coverage:

**Unit Testing**:
- Specific examples of base path normalization
- Edge cases for invalid configurations
- Integration points between frontend and backend
- Service worker registration scenarios

**Property-Based Testing**:
- **Library**: fast-check for TypeScript/JavaScript property-based testing
- **Minimum Iterations**: 100 iterations per property test
- **Coverage**: Universal properties that should hold across all base path configurations

**Property-Based Test Requirements**:
- Each property-based test must run a minimum of 100 iterations
- Each test must be tagged with a comment referencing the design document property
- Tag format: `**Feature: nginx-subpath-deployment, Property {number}: {property_text}**`
- Each correctness property must be implemented by a single property-based test
- Tests should generate random base path configurations and verify properties hold

**Unit Test Requirements**:
- Test specific examples and edge cases
- Verify integration between components
- Cover error conditions and fallback behaviors
- Focus on concrete scenarios that demonstrate correct behavior

Both testing approaches are complementary: unit tests catch specific bugs and verify concrete scenarios, while property tests verify general correctness across all possible inputs and configurations.