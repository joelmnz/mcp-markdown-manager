# Security Guide for MCP Markdown Manager

This document provides security recommendations and best practices for deploying and operating the MCP Markdown Manager, addressing vulnerabilities identified in Docker's MCP security analysis.

## Table of Contents

1. [Security Overview](#security-overview)
2. [Threat Model](#threat-model)
3. [Authentication & Authorization](#authentication--authorization)
4. [Input Validation & Sanitization](#input-validation--sanitization)
5. [Rate Limiting & DoS Protection](#rate-limiting--dos-protection)
6. [Network Security](#network-security)
7. [Container Security](#container-security)
8. [Monitoring & Logging](#monitoring--logging)
9. [Security Configuration](#security-configuration)
10. [Incident Response](#incident-response)

## Security Overview

The MCP Markdown Manager implements multiple layers of security to protect against common threats identified in MCP server deployments:

- **Authentication**: Bearer token authentication for all interfaces (Web UI, API, MCP)
- **Input Validation**: Comprehensive validation and sanitization of all user inputs
- **Rate Limiting**: Per-session rate limiting to prevent DoS attacks
- **Session Management**: Secure session handling with configurable limits and timeouts
- **SQL Injection Protection**: Parameterized queries for all database operations
- **Path Traversal Prevention**: Strict validation of file paths and folder structures
- **Container Isolation**: Non-root user execution in Docker containers
- **Security Logging**: Audit logging for suspicious activities

## Threat Model

### Threats Addressed

Based on Docker's MCP security analysis, the following threats are specifically addressed:

1. **Command Injection**: Strict input validation prevents shell command injection
2. **SQL Injection**: Parameterized queries eliminate SQL injection vectors
3. **Path Traversal**: Folder path validation prevents directory traversal attacks
4. **DoS Attacks**: Rate limiting and request size limits prevent resource exhaustion
5. **Session Hijacking**: IP binding and token validation prevent session theft
6. **Data Exfiltration**: Input validation and content size limits reduce data leak risks
7. **Credential Exposure**: Environment-based configuration keeps secrets out of code

### Out of Scope

The following threats are not fully addressed and require additional measures:

1. **Supply Chain Attacks**: Use npm audit and dependency scanning tools
2. **Zero-day Exploits**: Keep dependencies updated and monitor security advisories
3. **Physical Security**: Secure the host system and network infrastructure
4. **Social Engineering**: Train users and administrators on security best practices

## Authentication & Authorization

### Bearer Token Authentication

All interfaces (Web UI, REST API, MCP server) use a single bearer token for authentication.

**Configuration:**
```bash
# Set a strong, random token
AUTH_TOKEN=your-secure-random-token-here
```

**Best Practices:**

1. **Generate Strong Tokens**: Use at least 32 characters of random data
   ```bash
   # Generate a secure token
   openssl rand -base64 32
   ```

2. **Rotate Tokens Regularly**: Change tokens periodically and after security incidents

3. **Never Commit Tokens**: Keep `.env` files out of version control

4. **Use Different Tokens per Environment**: Development, staging, and production should have different tokens

5. **Secure Token Storage**: 
   - Use Docker secrets for production deployments
   - Use environment variables, not config files
   - Never log or display tokens

### Token Validation

The server validates tokens on every request:

- Exact match comparison (timing-safe)
- No default or fallback tokens
- Server refuses to start without AUTH_TOKEN set

## Input Validation & Sanitization

### Validation Layers

The MCP server implements multiple validation layers:

1. **Type Validation**: Ensures inputs match expected types
2. **Length Validation**: Enforces minimum and maximum lengths
3. **Pattern Validation**: Uses regex to validate format
4. **Dangerous Pattern Detection**: Blocks known attack patterns
5. **Sanitization**: Removes or escapes dangerous characters

### Protected Fields

#### Filenames
- Must end with `.md`
- Only lowercase letters, numbers, and hyphens
- Cannot start or end with hyphen
- Maximum 255 characters
- No path traversal sequences (`..`, `./`)

#### Titles
- Maximum 500 characters
- Minimum 1 character
- All Unicode characters allowed (for internationalization)

#### Content
- Maximum 10MB (configurable)
- Minimum 1 character
- All content types allowed (markdown, code, etc.)

#### Folder Paths
- Maximum 1000 characters
- Only alphanumeric, underscore, hyphen, and forward slash
- No path traversal (`..`)
- No absolute paths

#### Search Queries
- Maximum 1000 characters
- Minimum 1 character
- Threat detection for SQL injection, command injection, XSS

### Custom Validation Configuration

You can adjust validation limits via environment variables:

```bash
# Maximum content size (bytes)
MCP_MAX_REQUEST_SIZE_BYTES=10485760  # 10MB

# Array limits for multi-search operations
MCP_MULTI_SEARCH_LIMIT=10
```

## Rate Limiting & DoS Protection

### Session-Based Rate Limiting

Each MCP session has independent rate limits:

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
- Logs rate limit violations for monitoring

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

## Network Security

### Recommended Network Architecture

```
Internet
    |
[Reverse Proxy (nginx/Cloudflare)]
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
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data:;" always;

    # Rate limiting at proxy level
    limit_req_zone $binary_remote_addr zone=mcpapi:10m rate=10r/s;
    limit_req zone=mcpapi burst=20 nodelay;

    # Client body size limit
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### IP Binding

Optionally bind sessions to IP addresses:

```bash
# Bind sessions to originating IP (not recommended behind NAT)
MCP_BIND_SESSION_TO_IP=true
```

**Considerations:**
- Don't enable behind NAT or load balancers
- May break mobile clients switching networks
- Useful for static IP environments

### Network Isolation

**Docker Compose Network Configuration:**
```yaml
services:
  app:
    networks:
      - frontend
      - backend
    # Only expose required ports
    ports:
      - "127.0.0.1:5000:5000"  # Bind to localhost only

  postgres:
    networks:
      - backend
    # Don't expose database port externally

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access
```

## Container Security

### Non-Root User

The Docker container runs as a non-root user:

```dockerfile
# UNRAID-compatible user IDs
RUN useradd --system --uid 99 --gid 100 --no-create-home bunuser
USER bunuser
```

### Image Scanning

Regularly scan images for vulnerabilities:

```bash
# Using Docker Scout
docker scout cves ghcr.io/joelmnz/mcp-markdown-manager:latest

# Using Trivy
trivy image ghcr.io/joelmnz/mcp-markdown-manager:latest
```

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

### Read-Only Filesystem

Mount volumes as read-only where possible:

```yaml
services:
  app:
    volumes:
      - ./data:/data
      # Mount config as read-only
      - ./config:/config:ro
```

## Monitoring & Logging

### Security Event Logging

Security events are logged with severity levels:

- **Critical**: Immediate action required (e.g., repeated authentication failures)
- **High**: Potential security incident (e.g., injection attempt detected)
- **Medium**: Suspicious activity (e.g., rate limit exceeded)
- **Low**: Security-relevant information (e.g., session created)

### Log Format

Security logs use JSON format for easy parsing:

```json
{
  "timestamp": "2025-01-26T03:52:27.264Z",
  "event": "suspicious_search_query",
  "severity": "medium",
  "details": {
    "query": "'; DROP TABLE articles;--",
    "threats": ["Possible SQL injection attempt"]
  },
  "ip": "192.168.1.100",
  "sessionId": "abc-123-def-456"
}
```

### Monitoring Recommendations

1. **Log Aggregation**: Send logs to a centralized system (ELK, Splunk, etc.)
2. **Alerting**: Configure alerts for high/critical severity events
3. **Metrics**: Monitor request rates, error rates, session counts
4. **Health Checks**: Use `/health` endpoint for uptime monitoring

### Important Events to Monitor

- Authentication failures
- Rate limit violations
- Session creation/deletion
- Input validation failures
- SQL/command injection attempts
- Path traversal attempts
- Oversized requests
- Database errors

## Security Configuration

### Recommended Production Settings

```bash
# Authentication
AUTH_TOKEN=<64-character-random-string>

# Database
DB_PASSWORD=<strong-password>
DB_SSL=true
DB_MAX_CONNECTIONS=100

# MCP Server
MCP_SERVER_ENABLED=true
MCP_BIND_SESSION_TO_IP=false  # Set to true only if not behind proxy/NAT

# Session Management
MCP_SESSION_IDLE_MS=900000      # 15 minutes
MCP_SESSION_TTL_MS=3600000      # 1 hour
MCP_MAX_SESSIONS_TOTAL=200
MCP_MAX_SESSIONS_PER_IP=50
MCP_MAX_SESSIONS_PER_TOKEN=100

# Rate Limiting
MCP_RATE_LIMIT_WINDOW_MS=60000          # 1 minute
MCP_RATE_LIMIT_MAX_REQUESTS=100         # 100 requests per minute
MCP_MAX_REQUEST_SIZE_BYTES=10485760     # 10MB

# Multi-search limits
MCP_MULTI_SEARCH_LIMIT=10

# Application
NODE_ENV=production
PORT=5000
```

### Security Hardening Checklist

- [ ] Set a strong, unique AUTH_TOKEN
- [ ] Use HTTPS/TLS for all connections
- [ ] Enable database SSL connections
- [ ] Configure rate limiting appropriately for your use case
- [ ] Set up log monitoring and alerting
- [ ] Use a reverse proxy with security headers
- [ ] Enable container resource limits
- [ ] Run vulnerability scans on Docker images
- [ ] Keep dependencies updated
- [ ] Use separate tokens for different environments
- [ ] Implement database backups
- [ ] Configure firewall rules
- [ ] Review and test incident response procedures

## Incident Response

### Detection

Monitor for:
1. Multiple authentication failures
2. Unusual request patterns
3. High error rates
4. Injection attempt alerts
5. Rate limit violations

### Response Procedures

#### Suspected Credential Compromise

1. **Immediate Actions:**
   ```bash
   # Generate new token
   NEW_TOKEN=$(openssl rand -base64 32)
   
   # Update .env file
   echo "AUTH_TOKEN=$NEW_TOKEN" >> .env
   
   # Restart service
   docker compose restart app
   ```

2. **Investigation:**
   - Review security logs for unauthorized access
   - Check database for suspicious modifications
   - Audit user sessions and activities

3. **Recovery:**
   - Rotate all credentials
   - Review and update access controls
   - Notify affected parties if data was accessed

#### Active Attack

1. **Mitigation:**
   ```bash
   # Block attacking IP at firewall level
   ufw deny from <attacker-ip>
   
   # Or in nginx
   deny <attacker-ip>;
   
   # Temporarily disable MCP server if needed
   MCP_SERVER_ENABLED=false
   ```

2. **Investigation:**
   - Capture network traffic
   - Preserve logs
   - Document attack patterns

3. **Recovery:**
   - Remove firewall blocks once attack subsides
   - Update rate limiting if needed
   - Patch any discovered vulnerabilities

### Post-Incident

1. **Review:**
   - What happened?
   - How was it detected?
   - What was the impact?
   - How was it resolved?

2. **Improvements:**
   - Update security controls
   - Enhance monitoring
   - Train team on new procedures
   - Update documentation

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [PostgreSQL Security Best Practices](https://www.postgresql.org/docs/current/security.html)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** create a public GitHub issue
2. Email the maintainer directly (see README.md for contact)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to respond to security reports within 48 hours.
