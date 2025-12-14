# Frontend Runtime Configuration Utilities

This directory contains utilities for handling runtime base path configuration, enabling the application to work correctly when deployed on subpaths (e.g., `/md`) without requiring rebuilds.

## Overview

The runtime configuration system allows the same built frontend assets to work in different deployment scenarios:

- **Root deployment**: `https://example.com/` (base path: `""`)
- **Subpath deployment**: `https://example.com/md/` (base path: `"/md"`)
- **Subdomain deployment**: `https://md.example.com/` (base path: `""`)

## Architecture

```
Environment Variables → Server → HTML Template → Runtime Config → Frontend Utilities
```

1. **Server reads** `BASE_PATH`/`BASE_URL` environment variables
2. **Server injects** configuration into HTML template at request time
3. **Frontend reads** configuration from `window.__APP_CONFIG__`
4. **Utilities use** configuration for all URL generation

## Files

### `runtimeConfig.ts`
Core configuration management with initialization, validation, and change notifications.

```typescript
import { initializeRuntimeConfig, getRuntimeConfig } from './runtimeConfig';

// Initialize configuration (call once at app startup)
const result = initializeRuntimeConfig();
if (!result.isValid) {
  console.warn('Configuration issues:', result.errors);
}

// Get current configuration
const config = getRuntimeConfig();
console.log('Base path:', config.baseUrl);
```

### `useBasePath.ts`
React hook for base path configuration and navigation.

```typescript
import { useBasePath } from '../hooks/useBasePath';

function MyComponent() {
  const { basePath, navigate, buildUrl, buildApiUrl, isConfigured } = useBasePath();
  
  const handleClick = () => {
    navigate('/article/example.md');
  };
  
  return (
    <div>
      <p>Base path: {basePath}</p>
      <p>Article URL: {buildUrl('/article/example.md')}</p>
      <button onClick={handleClick}>Navigate</button>
    </div>
  );
}
```

### `apiClient.ts`
Centralized API client with automatic base path handling.

```typescript
import { getConfiguredApiClient } from '../utils/apiClient';

async function fetchArticles(token: string) {
  const apiClient = getConfiguredApiClient();
  const response = await apiClient.get('/api/articles', token);
  return response.json();
}

// Or use the singleton directly
import { apiClient } from '../utils/apiClient';
const response = await apiClient.post('/api/articles', articleData, token);
```

### `urlBuilder.ts`
Utility functions for building URLs with base path support.

```typescript
import { 
  buildRouteUrl, 
  buildApiUrl, 
  buildPublicArticleUrl,
  buildAssetUrl 
} from '../utils/urlBuilder';

// Frontend routes
const homeUrl = buildRouteUrl('/');
const articleUrl = buildRouteUrl('/article/example.md');
const publicUrl = buildPublicArticleUrl('example-slug');

// API endpoints
const apiUrl = buildApiUrl('/api/articles');

// Static assets
const iconUrl = buildAssetUrl('/icon-192.png');
```

## Migration Guide

### Before (Direct fetch calls)
```typescript
// ❌ Hardcoded paths - won't work with subpath deployment
const response = await fetch('/api/articles', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const navigate = (path: string) => {
  window.history.pushState({}, '', path);
};
```

### After (Runtime configuration)
```typescript
// ✅ Runtime base path support
import { getConfiguredApiClient } from '../utils/apiClient';
import { useBasePath } from '../hooks/useBasePath';

const apiClient = getConfiguredApiClient();
const response = await apiClient.get('/api/articles', token);

const { navigate } = useBasePath();
navigate('/article/example.md');
```

## Configuration Format

The server injects configuration into the HTML template:

```html
<script>
  window.__APP_CONFIG__ = {
    "baseUrl": "/md",
    "apiBaseUrl": "/md",
    "mcpBaseUrl": "/md"
  };
</script>
```

### Configuration Properties

- **`baseUrl`**: Base path for frontend routes (e.g., `"/md"` or `""`)
- **`apiBaseUrl`**: Base path for API endpoints (e.g., `"/md"` or `""`)
- **`mcpBaseUrl`**: Base path for MCP endpoints (e.g., `"/md"` or `""`)

### Path Normalization

All paths are automatically normalized:
- `"md"` → `"/md"`
- `"md/"` → `"/md"`
- `"/md/"` → `"/md"`
- `""` → `""` (root deployment)
- `"/"` → `""` (root deployment)

## Error Handling

The system gracefully handles configuration issues:

```typescript
// Missing configuration
if (!isRuntimeConfigAvailable()) {
  console.warn('No runtime configuration, using root path behavior');
}

// Invalid configuration
const result = initializeRuntimeConfig();
if (!result.isValid) {
  console.error('Configuration errors:', result.errors);
  // Falls back to root path behavior
}
```

## Testing

Use the test utilities to verify configuration:

```typescript
import { runTests } from './utils/__tests__/runtimeConfig.test';

// Run basic configuration tests
runTests();

// Manual testing
import { logConfigStatus } from './utils/runtimeConfig';
logConfigStatus(); // Logs current configuration to console
```

## Best Practices

1. **Initialize early**: Call `initializeRuntimeConfig()` in App.tsx before rendering
2. **Use hooks**: Prefer `useBasePath()` hook in React components
3. **Centralize API calls**: Use `apiClient` instead of direct fetch calls
4. **Build URLs dynamically**: Never hardcode paths, always use URL builders
5. **Handle fallbacks**: Check `isConfigured` for graceful degradation

## Deployment Examples

### Root Path Deployment
```bash
# No base path configuration needed
BASE_PATH=""
# or simply omit BASE_PATH
```

### Subpath Deployment
```bash
# Deploy to /md subpath
BASE_PATH="/md"
```

### Docker Deployment
```dockerfile
ENV BASE_PATH="/md"
ENV BASE_URL="/md"
```

The same built frontend assets work in all scenarios without rebuilding.