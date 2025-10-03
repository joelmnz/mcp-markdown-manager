# Deployment Guide

## Quick Start

### 1. Local Development

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Clone and setup
cd article_manager
bun install

# Configure
cp .env.example .env
# Edit .env and set AUTH_TOKEN

# Run development
bun run dev:backend  # Terminal 1
bun run dev:frontend # Terminal 2

# Access at http://localhost:5000
```

### 2. Production with Docker Compose

```bash
# Configure
cp .env.example .env
# Edit .env and set AUTH_TOKEN

# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### 3. Production with Docker

```bash
# Build
docker build -t article-manager .

# Run
docker run -d \
  -p 5000:5000 \
  -e AUTH_TOKEN=your-secret-token \
  -v $(pwd)/data:/data \
  --name article-manager \
  article-manager
```

## Testing the Deployment

```bash
# Health check
curl http://localhost:5000/health

# Test API (replace with your token)
curl -H "Authorization: Bearer your-token" \
  http://localhost:5000/api/articles

# Create test article
curl -X POST \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"# Test\n\nContent here"}' \
  http://localhost:5000/api/articles
```

## Production Checklist

- [ ] Set strong AUTH_TOKEN
- [ ] Configure reverse proxy (nginx/caddy) with HTTPS
- [ ] Set up regular backups of data directory
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Test disaster recovery procedures
- [ ] Document access procedures for team

## Backup Strategy

```bash
# Backup data directory
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Restore from backup
tar -xzf backup-20250101.tar.gz
```
