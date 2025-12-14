# Nginx Subpath Deployment Guide

This guide explains how to deploy the MCP Markdown Manager behind Nginx on a subpath (e.g., `/md`, `/articles`) using the runtime base path configuration feature.

## Overview

The application supports runtime base path configuration, allowing the same built frontend assets to work with different deployment paths without rebuilding. This is achieved through:

- **Runtime Configuration**: Base path is set via environment variables and injected into the frontend at request time
- **Dynamic URL Generation**: All URLs (API calls, navigation, assets) are constructed using runtime configuration
- **Deployment Flexibility**: Same Docker image works across different environments and paths

## Runtime Configuration Approach

### Key Benefits

1. **Build Once, Deploy Anywhere**: Same frontend assets work with any base path
2. **Container Portability**: Same Docker image for root path and subpath deployments
3. **Environment Flexibility**: Configure base path through environment variables only
4. **No Rebuild Required**: Change deployment path without rebuilding frontend

### How It Works

```
Environment Variables → Server Configuration → HTML Template Injection → Frontend Runtime Config → All URL Generation
```

1. **Environment**: Set `BASE_URL` or `BASE_PATH` environment variable
2. **Server**: Parses and validates base path configuration
3. **Template**: Injects base path into HTML template at request time
4. **Frontend**: Reads injected configuration and uses for all URL generation
5. **URLs**: All navigation, API calls, and assets use runtime base path

## Environment Variable Configuration

### BASE_URL vs BASE_PATH

**BASE_URL** (Recommended for production):
```bash
# Full URL including protocol and domain
BASE_URL=https://example.com/md
BASE_URL=https://mysite.org/articles
BASE_URL=https://docs.company.com/wiki
```

**BASE_PATH** (Path only):
```bash
# Path portion only
BASE_PATH=/md
BASE_PATH=/articles
BASE_PATH=/app/docs
```

**Priority**: `BASE_URL` takes precedence if both are set. The path portion is extracted from `BASE_URL`.

### Path Normalization

The system automatically normalizes base paths:

```bash
# These all become "/md"
BASE_PATH=md
BASE_PATH=/md
BASE_PATH=md/
BASE_PATH=/md/

# These all become "/app/docs"
BASE_PATH=app/docs
BASE_PATH=/app/docs
BASE_PATH=app/docs/
BASE_PATH=/app/docs/
```

### Default Behavior

```bash
# Root path deployment (default)
# BASE_URL=
# BASE_PATH=
# (or leave unset)
```

## Nginx Configuration Examples

### Basic Subpath Configuration

```nginx
server {
    listen 80;
    server_name example.com;

    # Serve MCP Markdown Manager on /md subpath
    location /md/ {
        # Remove /md prefix when forwarding to backend
        rewrite ^/md/(.*)$ /$1 break;
        
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Important: Set base path for the application
        proxy_set_header X-Base-Path /md;
    }

    # Handle exact /md redirect
    location = /md {
        return 301 /md/;
    }
}
```

### Advanced Configuration with SSL

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Serve MCP Markdown Manager on /articles subpath
    location /articles/ {
        # Remove /articles prefix when forwarding to backend
        rewrite ^/articles/(.*)$ /$1 break;
        
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Base-Path /articles;
        
        # WebSocket support for potential future features
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Handle exact /articles redirect
    location = /articles {
        return 301 /articles/;
    }
    
    # Optional: Serve other applications on different paths
    location /api/ {
        proxy_pass http://localhost:3000;
        # ... other API configuration
    }
}
```

### Multiple Applications Configuration

```nginx
server {
    listen 80;
    server_name myserver.local;

    # MCP Markdown Manager on /md
    location /md/ {
        rewrite ^/md/(.*)$ /$1 break;
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Base-Path /md;
    }
    
    location = /md {
        return 301 /md/;
    }

    # Another app on /wiki
    location /wiki/ {
        rewrite ^/wiki/(.*)$ /$1 break;
        proxy_pass http://localhost:8080;
        # ... wiki app configuration
    }
    
    location = /wiki {
        return 301 /wiki/;
    }

    # Default app at root
    location / {
        proxy_pass http://localhost:3000;
        # ... default app configuration
    }
}
```

### Docker Compose with Nginx

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream mcp-markdown {
        server mcp-markdown-manager:5000;
    }

    server {
        listen 80;
        server_name localhost;

        location /md/ {
            rewrite ^/md/(.*)$ /$1 break;
            proxy_pass http://mcp-markdown;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Base-Path /md;
        }
        
        location = /md {
            return 301 /md/;
        }
    }
}
```

## Docker Deployment Examples

### Docker Compose with Subpath

Create `docker-compose.subpath.yml`:

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - mcp-markdown-manager
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    container_name: mcp-markdown-postgres
    environment:
      - POSTGRES_DB=article_manager
      - POSTGRES_USER=article_user
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/postgres-init:/docker-entrypoint-initdb.d
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U article_user -d article_manager"]
      interval: 10s
      timeout: 5s
      retries: 5

  mcp-markdown-manager:
    image: ghcr.io/joelmnz/mcp-markdown-manager:latest
    container_name: mcp-markdown-manager
    environment:
      - AUTH_TOKEN=${AUTH_TOKEN}
      - DATA_DIR=/data
      - PORT=5000
      - NODE_ENV=production
      - MCP_SERVER_ENABLED=true
      
      # Runtime base path configuration
      - BASE_URL=http://localhost/md
      # Alternative: BASE_PATH=/md
      
      # Database configuration
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=article_manager
      - DB_USER=article_user
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_SSL=false
    volumes:
      - ./data:/data
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    # Note: No external port mapping - accessed through nginx

volumes:
  postgres_data:
    driver: local
```

### Environment Configuration for Subpath

Create `.env` file:

```bash
# Authentication
AUTH_TOKEN=your-secret-token-here
DB_PASSWORD=your-database-password-here

# Base path configuration for /md subpath
BASE_URL=http://localhost/md

# Alternative path-only configuration:
# BASE_PATH=/md
```

### Deployment Commands

```bash
# Deploy with subpath configuration
docker-compose -f docker-compose.subpath.yml up -d

# Check logs
docker-compose -f docker-compose.subpath.yml logs -f

# Access application
# http://localhost/md
```

## Production Deployment Examples

### Production with SSL

Create `docker-compose.production.yml`:

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx-ssl.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - mcp-markdown-manager
    restart: unless-stopped

  mcp-markdown-manager:
    image: ghcr.io/joelmnz/mcp-markdown-manager:latest
    container_name: mcp-markdown-manager
    environment:
      - AUTH_TOKEN=${AUTH_TOKEN}
      - DATA_DIR=/data
      - PORT=5000
      - NODE_ENV=production
      - MCP_SERVER_ENABLED=true
      
      # Production base URL with HTTPS
      - BASE_URL=https://example.com/md
      
      # Database configuration
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=article_manager
      - DB_USER=article_user
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_SSL=false
    volumes:
      - ./data:/data
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    # ... same as above
```

### Environment for Production

```bash
# .env.production
AUTH_TOKEN=production-secret-token
DB_PASSWORD=production-database-password

# Production base URL
BASE_URL=https://example.com/md
```

## Testing Subpath Deployment

### 1. Verify Base Path Configuration

Check application startup logs:

```bash
docker-compose logs mcp-markdown-manager | grep -i "base"
```

Expected output:
```
Base path configured: /md
Base URL: https://example.com/md
```

### 2. Test Frontend URLs

Access the application and verify:

- **Main page**: `https://example.com/md/` loads correctly
- **Navigation**: All internal links maintain `/md` prefix
- **API calls**: Browser network tab shows API calls to `/md/api/*`
- **Assets**: CSS/JS files load from `/md/App.[hash].js`

### 3. Test API Endpoints

```bash
# Test API with base path
curl -H "Authorization: Bearer your-token" \
     https://example.com/md/api/articles

# Test MCP endpoint
curl -H "Authorization: Bearer your-token" \
     -H "Content-Type: application/json" \
     -d '{"method":"tools/list"}' \
     https://example.com/md/mcp
```

### 4. Test Service Worker

Check browser developer tools:

1. **Application tab** → **Service Workers**
2. Verify service worker is registered for `/md/` scope
3. **Cache Storage** should show cached resources with `/md/` prefix

## Troubleshooting

### Common Issues

**1. Assets not loading (404 errors)**
- Check nginx rewrite rule removes base path correctly
- Verify `BASE_URL`/`BASE_PATH` environment variable is set
- Check application logs for base path configuration

**2. API calls failing**
- Ensure nginx forwards API requests to backend
- Verify `Authorization` header is passed through
- Check that API calls include base path prefix

**3. Navigation broken**
- Verify frontend runtime configuration is loaded
- Check browser console for JavaScript errors
- Ensure all navigation uses runtime base path

**4. Service worker issues**
- Clear browser cache and service worker
- Check service worker registration scope
- Verify cached resources use correct base path

### Debug Commands

```bash
# Check application configuration
docker exec mcp-markdown-manager printenv | grep -E "(BASE_|URL)"

# Test nginx configuration
docker exec nginx-proxy nginx -t

# Check application health
curl http://localhost/md/health

# View application logs
docker-compose logs -f mcp-markdown-manager
```

### Configuration Validation

The application validates base path configuration on startup:

```bash
# Valid configurations
BASE_PATH=/md          # ✓ Normalized to /md
BASE_PATH=articles     # ✓ Normalized to /articles
BASE_URL=https://example.com/md  # ✓ Path extracted: /md

# Invalid configurations (fallback to root)
BASE_PATH=../invalid   # ✗ Invalid characters
BASE_PATH=//double     # ✗ Double slashes
```

## Migration from Root Path

If migrating from root path deployment to subpath:

### 1. Update Environment

```bash
# Add base path configuration
echo "BASE_URL=https://example.com/md" >> .env
```

### 2. Update Nginx Configuration

Add subpath location block and rewrite rules.

### 3. Update Bookmarks/Links

Update any saved bookmarks or external links:
- `https://example.com/` → `https://example.com/md/`

### 4. Test Deployment

1. Deploy with new configuration
2. Verify all functionality works
3. Update documentation/links

## Best Practices

### 1. Environment Configuration

- Use `BASE_URL` for production (includes protocol/domain)
- Use `BASE_PATH` for development/testing
- Always include trailing slash in nginx location blocks
- Set environment variables in docker-compose.yml

### 2. Nginx Configuration

- Use rewrite rules to remove base path before forwarding
- Set appropriate proxy headers
- Include exact location redirects (e.g., `/md` → `/md/`)
- Test configuration with `nginx -t`

### 3. Deployment

- Test in development environment first
- Use same Docker image for all environments
- Monitor application logs during deployment
- Verify all features work after deployment

### 4. Monitoring

- Check application startup logs for base path configuration
- Monitor nginx access logs for 404 errors
- Test API endpoints and MCP functionality
- Verify service worker registration and caching

## Security Considerations

### 1. Proxy Headers

Always set security headers in nginx:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

### 2. SSL Configuration

For production deployments:

```nginx
# Force HTTPS
if ($scheme != "https") {
    return 301 https://$host$request_uri;
}

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
```

### 3. Access Control

Restrict access if needed:

```nginx
# IP-based access control
location /md/ {
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;
    
    # ... proxy configuration
}
```

This guide provides comprehensive instructions for deploying the MCP Markdown Manager on nginx subpaths using the runtime configuration approach, ensuring flexibility and maintainability across different deployment scenarios.
</content>