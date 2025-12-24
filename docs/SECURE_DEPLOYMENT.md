# Secure MCP Deployment Guide

This guide provides security hardening recommendations specifically for MCP (Model Context Protocol) deployments based on Docker's security research and industry best practices.

## Quick Security Checklist

- [ ] Strong authentication tokens generated
- [ ] Docker security options configured
- [ ] Network policies implemented
- [ ] Rate limiting enabled
- [ ] Security audit logging enabled
- [ ] Input validation active
- [ ] Session binding configured
- [ ] Regular security updates scheduled

## Docker Security Configuration

### Recommended docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    image: ghcr.io/joelmnz/mcp-markdown-manager:latest
    container_name: mcp-markdown-manager
    
    # Security options
    security_opt:
      - no-new-privileges:true  # Prevent privilege escalation
    
    cap_drop:
      - ALL  # Drop all capabilities
    
    cap_add:
      - NET_BIND_SERVICE  # Only add required capabilities
    
    read_only: true  # Read-only root filesystem
    
    tmpfs:
      - /tmp  # Writable /tmp in memory
    
    # Resource limits (prevents DoS)
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
    
    # Environment variables
    environment:
      # Authentication (REQUIRED)
      - AUTH_TOKEN=${AUTH_TOKEN}  # Use strong random token
      
      # Database configuration
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=article_manager
      - DB_USER=article_user
      - DB_PASSWORD=${DB_PASSWORD}  # Use strong random password
      
      # MCP Server settings
      - MCP_SERVER_ENABLED=true
      - MCP_BIND_SESSION_TO_IP=true  # Bind sessions to IP addresses
      - MCP_MAX_SESSIONS_PER_IP=10  # Limit sessions per IP
      - MCP_MAX_SESSIONS_PER_TOKEN=50
      - MCP_SESSION_IDLE_MS=300000  # 5 minutes
      - MCP_SESSION_TTL_MS=1800000  # 30 minutes
      
      # Security features
      - SECURITY_AUDIT_ENABLED=true
      - SECURITY_AUDIT_FILE=true
      - RATE_LIMIT_TOOL_CALLS_PER_WINDOW=100
      - RATE_LIMIT_WINDOW_MS=60000
      
      # Input validation limits
      - MAX_TITLE_LENGTH=500
      - MAX_CONTENT_LENGTH=10485760  # 10MB
      - MAX_FOLDER_DEPTH=10
    
    ports:
      - "5000:5000"
    
    networks:
      - internal
    
    depends_on:
      - postgres
    
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    container_name: mcp-postgres
    
    # Security options
    security_opt:
      - no-new-privileges:true
    
    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    
    environment:
      - POSTGRES_DB=article_manager
      - POSTGRES_USER=article_user
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    
    volumes:
      - postgres_data:/var/lib/postgresql/data
    
    networks:
      - internal
    
    # Don't expose PostgreSQL port externally
    # Only app can access it via internal network
    
    restart: unless-stopped

networks:
  internal:
    driver: bridge
    # Optional: Enable network encryption
    driver_opts:
      encrypted: "true"

volumes:
  postgres_data:
    driver: local
```

### Generate Strong Credentials

```bash
# Generate strong authentication token
export AUTH_TOKEN=$(openssl rand -base64 32)

# Generate strong database password
export DB_PASSWORD=$(openssl rand -base64 32)

# Save to .env file
cat > .env <<EOF
AUTH_TOKEN=${AUTH_TOKEN}
DB_PASSWORD=${DB_PASSWORD}
EOF

# Secure the .env file
chmod 600 .env
```

## Network Security

### Docker Network Isolation

```yaml
# Use internal networks to prevent direct external access
networks:
  internal:
    driver: bridge
    internal: true  # No external connectivity
  
  external:
    driver: bridge  # For services that need external access
```

### Nginx Reverse Proxy with Security Headers

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    # SSL Configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';" always;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=mcp_api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=mcp_session:10m rate=5r/s;
    limit_conn_zone $binary_remote_addr zone=mcp_conn:10m;
    
    # Apply rate limits
    limit_req zone=mcp_api burst=20 nodelay;
    limit_conn mcp_conn 10;

    # API endpoints
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout settings
        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # MCP endpoint
    location /mcp {
        limit_req zone=mcp_session burst=10 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE support
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        chunked_transfer_encoding off;
        
        # Timeouts for long-polling
        proxy_connect_timeout 5s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Firewall Configuration

### Using UFW (Ubuntu/Debian)

```bash
# Reset firewall
sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH
sudo ufw allow ssh

# Allow HTTPS only (use reverse proxy)
sudo ufw allow 443/tcp

# Allow from specific IPs only (optional)
# sudo ufw allow from 192.168.1.0/24 to any port 443

# Enable firewall
sudo ufw enable

# Verify
sudo ufw status verbose
```

### Using iptables

```bash
#!/bin/bash
# Secure iptables configuration for MCP server

# Flush existing rules
iptables -F
iptables -X

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow SSH
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow HTTPS
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Rate limiting for new connections
iptables -A INPUT -p tcp --dport 443 -m state --state NEW -m recent --set
iptables -A INPUT -p tcp --dport 443 -m state --state NEW -m recent --update --seconds 60 --hitcount 20 -j DROP

# Save rules
iptables-save > /etc/iptables/rules.v4
```

## Monitoring and Alerting

### Security Metrics API

Access security metrics at runtime:

```bash
# View recent security events (add this endpoint to your API if needed)
curl -H "Authorization: Bearer ${AUTH_TOKEN}" \
  http://localhost:5000/api/security/events

# View rate limiting statistics
curl -H "Authorization: Bearer ${AUTH_TOKEN}" \
  http://localhost:5000/api/security/rate-limits
```

### Log Monitoring

```bash
# Monitor security audit logs
tail -f /var/log/mcp-security-audit.log | grep -E "WARNING|ERROR|CRITICAL"

# Set up alerts for suspicious activity
grep -E "auth_failure|suspicious_input|rate_limit_exceeded" \
  /var/log/mcp-security-audit.log | \
  mail -s "MCP Security Alert" admin@example.com
```

### Prometheus Integration (Future Enhancement)

```yaml
# Example metrics to track
mcp_auth_failures_total
mcp_rate_limit_exceeded_total
mcp_session_created_total
mcp_tool_calls_total
mcp_validation_failures_total
```

## Incident Response Procedures

### 1. Suspected Breach

```bash
# Immediately rotate authentication token
export NEW_AUTH_TOKEN=$(openssl rand -base64 32)
docker-compose exec app sed -i "s/AUTH_TOKEN=.*/AUTH_TOKEN=${NEW_AUTH_TOKEN}/" /app/.env
docker-compose restart app

# Review recent security events
docker-compose exec app cat /tmp/security-audit.log | grep -E "ERROR|CRITICAL"

# Check active sessions
docker-compose exec app bun eval "
const sessions = /* get sessions from MCP server */;
console.log(JSON.stringify(sessions, null, 2));
"
```

### 2. Rate Limit Abuse

```bash
# Identify abusive IPs
grep "rate_limit_exceeded" /var/log/mcp-security-audit.log | \
  awk '{print $NF}' | sort | uniq -c | sort -rn

# Block IP at nginx level
echo "deny 203.0.113.0/24;" | sudo tee -a /etc/nginx/conf.d/blacklist.conf
sudo nginx -s reload
```

### 3. Prompt Injection Attempt

```bash
# Review suspicious input events
grep "suspicious_input" /var/log/mcp-security-audit.log

# If confirmed, temporarily disable MCP server
docker-compose exec app sed -i "s/MCP_SERVER_ENABLED=true/MCP_SERVER_ENABLED=false/" /app/.env
docker-compose restart app

# Analyze and patch before re-enabling
```

## Regular Security Tasks

### Daily

- [ ] Review security audit logs for anomalies
- [ ] Check rate limiting statistics
- [ ] Monitor authentication failure rates

### Weekly

- [ ] Review and rotate logs
- [ ] Update dependency vulnerabilities
- [ ] Test backup restore procedures

### Monthly

- [ ] Rotate authentication tokens
- [ ] Review and update firewall rules
- [ ] Audit Docker image for vulnerabilities
- [ ] Review session limits and adjust if needed

### Quarterly

- [ ] Full security audit
- [ ] Penetration testing
- [ ] Update disaster recovery procedures
- [ ] Review and update security documentation

## Security Scanning

### Container Scanning

```bash
# Using Docker Scout
docker scout cves ghcr.io/joelmnz/mcp-markdown-manager:latest

# Using Trivy
trivy image ghcr.io/joelmnz/mcp-markdown-manager:latest

# Using Grype
grype ghcr.io/joelmnz/mcp-markdown-manager:latest
```

### Dependency Scanning

```bash
# Check for vulnerable dependencies
cd /path/to/mcp-markdown-manager
bun audit  # When available

# Alternative: Use npm audit
npm audit --production
```

### Configuration Scanning

```bash
# Docker Bench for Security
docker run --rm --net host --pid host --userns host \
  -v /etc:/etc:ro \
  -v /var/lib:/var/lib:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  docker/docker-bench-security
```

## Compliance Considerations

### Data Protection

- Store AUTH_TOKEN in secrets manager (not .env file) for production
- Enable encryption at rest for database (PostgreSQL TDE)
- Use TLS for all network communication
- Implement data retention policies

### Access Control

- Use separate tokens for different environments (dev/staging/prod)
- Implement token expiration (future enhancement)
- Maintain access logs for compliance
- Regular access reviews

### Audit Requirements

- Retain security logs for required period
- Implement tamper-proof logging (write-once storage)
- Regular security audits
- Incident response documentation

## Additional Resources

- [Docker MCP Security Blog](https://www.docker.com/blog/mcp-security-issues-threatening-ai-infrastructure/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

## Support

For security issues, please report to:
- Create a private security advisory on GitHub
- Email: [security contact email]

Do not report security vulnerabilities in public issues.
