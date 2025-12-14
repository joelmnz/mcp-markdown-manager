# Deployment Examples

This document provides quick deployment examples for different scenarios using the MCP Markdown Manager's runtime base path configuration feature.

## Quick Reference

| Deployment Type | File | Base Path | Access URL |
|----------------|------|-----------|------------|
| Standard (Root) | `docker-compose.yml` | `/` | `http://localhost:5000` |
| Nginx Subpath | `docker-compose.subpath.yml` | `/md` | `http://localhost/md` |
| Production SSL | `docker-compose.production.yml` | `/articles` | `https://yourdomain.com/articles` |

## Standard Deployment (Root Path)

**Use Case**: Simple deployment at root path without nginx proxy.

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with AUTH_TOKEN and DB_PASSWORD

# 2. Deploy
docker-compose up -d

# 3. Access
# http://localhost:5000
```

**Environment**: No base path configuration needed (defaults to root).

## Nginx Subpath Deployment

**Use Case**: Deploy behind nginx on a subpath like `/md` or `/articles`.

```bash
# 1. Configure environment for subpath
cp .env.subpath.example .env
# Edit .env with AUTH_TOKEN, DB_PASSWORD, and BASE_URL

# 2. Deploy with nginx proxy
docker-compose -f docker-compose.subpath.yml up -d

# 3. Access
# http://localhost/md (or your configured subpath)
```

**Key Files**:
- `docker-compose.subpath.yml` - Docker services with nginx proxy
- `nginx-subpath.conf` - Nginx configuration for subpath routing
- `.env.subpath.example` - Environment template with base path examples

**Environment Configuration**:
```bash
BASE_URL=http://localhost/md
# or
BASE_PATH=/md
```

## Production Deployment with SSL

**Use Case**: Production deployment with SSL, security headers, and performance optimizations.

```bash
# 1. Prepare SSL certificates
mkdir ssl
# Copy your cert.pem and key.pem to ssl/ directory

# 2. Configure production environment
cp .env.production.example .env.production
# Edit with production values, including BASE_URL with HTTPS

# 3. Update domain in nginx config
# Edit nginx-production.conf and replace "yourdomain.com" with your domain

# 4. Deploy production stack
docker-compose -f docker-compose.production.yml --env-file .env.production up -d

# 5. Access
# https://yourdomain.com/articles (or your configured subpath)
```

**Key Files**:
- `docker-compose.production.yml` - Production services with SSL nginx
- `nginx-production.conf` - Production nginx with SSL and security
- `.env.production.example` - Production environment template

**Environment Configuration**:
```bash
BASE_URL=https://yourdomain.com/articles
AUTH_TOKEN=production-secret-token
DB_PASSWORD=production-database-password
OPENAI_API_KEY=your-openai-key  # for semantic search
```

## Custom Subpath Examples

### Deploy on `/wiki` subpath

```bash
# Environment
BASE_URL=http://localhost/wiki

# Nginx location block
location /wiki/ {
    rewrite ^/wiki/(.*)$ /$1 break;
    proxy_pass http://mcp-markdown;
    proxy_set_header X-Base-Path /wiki;
    # ... other headers
}
```

### Deploy on `/docs/articles` nested path

```bash
# Environment
BASE_URL=https://company.com/docs/articles

# Nginx location block
location /docs/articles/ {
    rewrite ^/docs/articles/(.*)$ /$1 break;
    proxy_pass http://mcp-markdown;
    proxy_set_header X-Base-Path /docs/articles;
    # ... other headers
}
```

### Multiple Applications on Same Domain

```bash
# App 1: MCP Markdown Manager on /md
BASE_URL=http://localhost/md

# App 2: Another app on /api
# App 3: Static site on /

# Nginx configuration handles routing to different backends
```

## Runtime Configuration Benefits

### Build Once, Deploy Anywhere

The same Docker image works for all deployment scenarios:

```bash
# Same image, different base paths
docker run -e BASE_URL=http://localhost/md app:latest        # /md subpath
docker run -e BASE_URL=https://prod.com/articles app:latest  # /articles subpath
docker run app:latest                                        # root path
```

### Environment-Specific Configuration

```bash
# Development
BASE_URL=http://localhost/md

# Staging
BASE_URL=https://staging.company.com/md

# Production
BASE_URL=https://company.com/articles
```

### Container Portability

```yaml
# Same container definition, different environments
services:
  app:
    image: mcp-markdown-manager:latest
    environment:
      - BASE_URL=${BASE_URL}  # Set per environment
```

## Troubleshooting Common Issues

### Assets Not Loading (404 Errors)

**Problem**: CSS/JS files return 404 errors.

**Solution**: 
1. Check nginx rewrite rule removes base path correctly
2. Verify `BASE_URL`/`BASE_PATH` environment variable is set
3. Check application logs for base path configuration

```bash
# Check configuration
docker logs mcp-markdown-manager | grep -i "base"

# Expected output:
# Base path configured: /md
# Base URL: http://localhost/md
```

### API Calls Failing

**Problem**: Frontend API calls return 404 or CORS errors.

**Solution**:
1. Ensure nginx forwards API requests to backend
2. Verify `Authorization` header is passed through
3. Check that API calls include base path prefix

```bash
# Test API endpoint
curl -H "Authorization: Bearer your-token" \
     http://localhost/md/api/articles
```

### Navigation Broken

**Problem**: Internal navigation doesn't maintain base path.

**Solution**:
1. Verify frontend runtime configuration is loaded
2. Check browser console for JavaScript errors
3. Ensure all navigation uses runtime base path

```javascript
// Check runtime config in browser console
console.log(window.__APP_CONFIG__);
// Should show: { baseUrl: "/md", apiBaseUrl: "/md", mcpBaseUrl: "/md" }
```

### Service Worker Issues

**Problem**: PWA functionality not working with subpath.

**Solution**:
1. Clear browser cache and service worker
2. Check service worker registration scope
3. Verify cached resources use correct base path

## Monitoring and Maintenance

### Health Checks

```bash
# Application health
curl http://localhost/md/health

# Database health
docker exec mcp-markdown-manager bun run db:health

# Nginx status
docker exec nginx-proxy nginx -t
```

### Log Monitoring

```bash
# Application logs
docker logs -f mcp-markdown-manager

# Nginx access logs
docker exec nginx-proxy tail -f /var/log/nginx/access.log

# Database logs
docker logs -f mcp-markdown-postgres
```

### Backup and Recovery

```bash
# Database backup
docker exec mcp-markdown-postgres pg_dump -U article_user article_manager > backup.sql

# Data directory backup
tar -czf data-backup-$(date +%Y%m%d).tar.gz ./data

# Restore database
docker exec -i mcp-markdown-postgres psql -U article_user article_manager < backup.sql
```

## Security Considerations

### Production Checklist

- [ ] Strong `AUTH_TOKEN` (32+ characters)
- [ ] Strong database password (16+ characters)
- [ ] SSL certificates properly configured
- [ ] Security headers enabled in nginx
- [ ] Rate limiting configured
- [ ] Access logs monitored
- [ ] Regular backups scheduled
- [ ] Firewall configured (ports 80/443 only)
- [ ] Domain DNS properly configured
- [ ] API keys secured and rotated

### Access Control

```nginx
# IP-based restrictions (optional)
location /md/admin/ {
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;
    # ... proxy configuration
}
```

### Rate Limiting

```nginx
# API rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /md/api/ {
    limit_req zone=api burst=20 nodelay;
    # ... proxy configuration
}
```

This guide provides practical examples for deploying the MCP Markdown Manager in various scenarios, leveraging the runtime base path configuration for maximum deployment flexibility.
</content>