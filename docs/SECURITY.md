# Security Guide for MCP Markdown Manager

This document provides security recommendations for deploying and operating the MCP Markdown Manager.

## Security Overview

The MCP Markdown Manager implements multiple security layers:

- **Authentication**: Bearer token authentication for all interfaces (Web UI, API, MCP)
- **Input Validation**: Comprehensive validation and sanitization of all user inputs
- **Rate Limiting**: Per-session rate limiting to prevent DoS attacks
- **SQL Injection Protection**: Parameterized queries for all database operations
- **Path Traversal Prevention**: Strict validation of file paths and folder structures
- **Container Isolation**: Non-root user execution in Docker containers
- **Session Management**: Secure session handling with configurable limits and timeouts

## Authentication

All interfaces use a single bearer token for authentication.

### Configuration

```bash
# Set a strong, random token (minimum 32 characters recommended)
AUTH_TOKEN=your-secret-token-here
```

### Best Practices

1. **Generate Strong Tokens**: Use at least 32 characters of random data
   ```bash
   openssl rand -base64 32
   ```

2. **Rotate Tokens Regularly**: Change tokens periodically and after security incidents

3. **Never Commit Tokens**: Keep `.env` files out of version control

4. **Use Different Tokens per Environment**: Development, staging, and production should have different tokens

## Input Validation

The MCP server validates all inputs to prevent injection attacks and DoS:

### Protected Fields

- **Filenames**: Must be lowercase slugs ending in `.md` (max 255 chars)
- **Titles**: Maximum 500 characters
- **Content**: Maximum 10MB (configurable)
- **Folder Paths**: Maximum 1000 characters, no path traversal
- **Search Queries**: Maximum 1000 characters

### Database Protection

The application uses parameterized SQL queries throughout, which prevents SQL injection attacks. All database operations use the `pg` library with parameter binding:

```typescript
// Example of safe parameterized query
const result = await database.query(
  'SELECT * FROM articles WHERE title ILIKE $1',
  [`%${query}%`]
);
```

This approach ensures that user input is never directly concatenated into SQL strings.

## Rate Limiting & DoS Protection

### Session-Based Rate Limiting

Each MCP session has independent rate limits to prevent abuse.

**Default Configuration:**
```bash
# Requests per time window
MCP_RATE_LIMIT_MAX_REQUESTS=100

# Time window (milliseconds)
MCP_RATE_LIMIT_WINDOW_MS=60000  # 1 minute
```

**Behavior:**
- Counter resets after the time window expires
- Returns HTTP 429 with `Retry-After` header when exceeded
- Applies to both GET and POST requests

### Session Limits

Multiple limits prevent session exhaustion attacks:

```bash
# Total active sessions across all clients
MCP_MAX_SESSIONS_TOTAL=200

# Sessions per IP address
MCP_MAX_SESSIONS_PER_IP=50

# Sessions per authentication token
MCP_MAX_SESSIONS_PER_TOKEN=100
```

### Session Timeouts

Sessions automatically expire:

```bash
# Maximum session idle time (15 minutes)
MCP_SESSION_IDLE_MS=900000

# Maximum session lifetime (1 hour)
MCP_SESSION_TTL_MS=3600000
```

### Request Size Limits

Prevent memory exhaustion:

```bash
# Maximum request body size (10MB)
MCP_MAX_REQUEST_SIZE_BYTES=10485760
```

**Important**: This limit is enforced at the application level. For defense in depth, also configure limits at your reverse proxy (e.g., nginx `client_max_body_size`).

## Network Security

### Recommended Architecture

```
Internet
    |
[Reverse Proxy (nginx/Caddy/Cloudflare)]
    | (HTTPS)
    |
[MCP Markdown Manager Container]
    |
[PostgreSQL Container]
```

### Reverse Proxy Configuration

**nginx example:**
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting at proxy level (additional layer)
    limit_req_zone $binary_remote_addr zone=mcpapi:10m rate=10r/s;
    limit_req zone=mcpapi burst=20 nodelay;

    # Client body size limit (defense in depth)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### IP Binding

Optionally bind sessions to IP addresses:

```bash
# Bind sessions to originating IP (not recommended behind NAT)
MCP_BIND_SESSION_TO_IP=true
```

**Note**: Don't enable behind NAT or load balancers, as it may break mobile clients.

## Container Security

### Non-Root User

The Docker container runs as a non-root user (UID 99, GID 100).

### Resource Limits

Prevent container resource exhaustion:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Network Isolation

**Docker Compose example:**
```yaml
services:
  app:
    networks:
      - frontend
      - backend
    ports:
      - "127.0.0.1:5000:5000"  # Bind to localhost only

  postgres:
    networks:
      - backend  # No external access

networks:
  backend:
    driver: bridge
    internal: true
```

## Monitoring & Logging

### Security Event Logging

Security events are logged with severity levels (low, medium, high, critical).

### Important Events to Monitor

- Authentication failures
- Rate limit violations
- Session creation/deletion
- Input validation failures
- Oversized requests
- Database errors

### Log Format

Security logs use JSON format:

```json
{
  "timestamp": "2025-01-26T03:52:27.264Z",
  "event": "rate_limit_exceeded",
  "severity": "medium",
  "details": { ... },
  "ip": "192.168.1.100",
  "sessionId": "abc-123"
}
```

## Production Configuration

### Recommended Settings

```bash
# Authentication
AUTH_TOKEN=<64-character-random-string>

# Database
DB_PASSWORD=<strong-password>
DB_SSL=true

# MCP Server
MCP_SERVER_ENABLED=true
MCP_SESSION_IDLE_MS=900000
MCP_SESSION_TTL_MS=3600000
MCP_MAX_SESSIONS_TOTAL=200
MCP_MAX_SESSIONS_PER_IP=50
MCP_RATE_LIMIT_MAX_REQUESTS=100
MCP_MAX_REQUEST_SIZE_BYTES=10485760

# Application
NODE_ENV=production
PORT=5000
```

### Security Hardening Checklist

- [ ] Set a strong, unique AUTH_TOKEN
- [ ] Use HTTPS/TLS for all connections
- [ ] Enable database SSL connections
- [ ] Configure rate limiting appropriately
- [ ] Set up log monitoring and alerting
- [ ] Use a reverse proxy with security headers
- [ ] Enable container resource limits
- [ ] Keep dependencies updated
- [ ] Configure firewall rules
- [ ] Implement database backups

## Security Features

### What's Protected

1. **SQL Injection**: ✅ Prevented by parameterized queries throughout the codebase
2. **Command Injection**: ✅ No shell command execution; all operations through database
3. **Path Traversal**: ✅ Strict path validation; no direct filesystem access
4. **DoS Attacks**: ✅ Rate limiting and request size limits
5. **Session Hijacking**: ✅ Token validation, optional IP binding, timeouts
6. **Credential Exposure**: ✅ Environment-based configuration

### Dependency Security

Regularly update dependencies and scan for vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Scan Docker images
docker scout cves <image>
```

## Incident Response

### Detection

Monitor for:
1. Multiple authentication failures
2. Unusual request patterns
3. High error rates
4. Rate limit violations

### Response to Credential Compromise

1. Generate new token: `openssl rand -base64 32`
2. Update `.env` file with new AUTH_TOKEN
3. Restart service: `docker compose restart app`
4. Review logs for unauthorized access
5. Audit database for suspicious modifications

### Response to Active Attack

1. Block attacking IP at firewall level
2. Temporarily disable MCP server if needed: `MCP_SERVER_ENABLED=false`
3. Capture network traffic and preserve logs
4. Update rate limiting if needed
5. Patch any discovered vulnerabilities

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** create a public GitHub issue
2. Email the maintainer directly (see README.md)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
