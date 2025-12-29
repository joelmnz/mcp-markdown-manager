# Deploying MCP Markdown Manager for Claude Web Integration

This guide walks you through deploying your MCP Markdown Manager server and connecting it to Claude web as a custom connector using OAuth 2.0 authentication.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start Summary](#quick-start-summary)
- [Step 1: Server Deployment](#step-1-server-deployment)
- [Step 2: Database Setup](#step-2-database-setup)
- [Step 3: OAuth Configuration](#step-3-oauth-configuration)
- [Step 4: Connecting to Claude Web](#step-4-connecting-to-claude-web)
- [Step 5: Testing Your Integration](#step-5-testing-your-integration)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

---

## Overview

**What you're building:**
- A public MCP server accessible via HTTPS
- OAuth 2.0 authentication for secure access
- Integration with Claude web as a custom connector
- Access to your markdown articles from within Claude conversations

**What Claude web needs:**
- Public HTTPS URL (e.g., `https://your-app.railway.app`)
- OAuth 2.0 with Dynamic Client Registration (DCR)
- PKCE (Proof Key for Code Exchange) support
- MCP protocol over HTTP/SSE

**Time estimate:** 30-60 minutes for first deployment

---

## Prerequisites

### Required

- ✅ **PostgreSQL database** (can be hosted or cloud-based)
- ✅ **Public HTTPS URL** (we'll set this up)
- ✅ **Claude Pro, Team, or Enterprise account** (for custom connectors)
- ✅ **Git** installed locally
- ✅ **Bun** or **Node.js** installed locally

### Recommended Knowledge

- Basic command line usage
- Understanding of environment variables
- Familiarity with cloud deployment (helpful but not required)

---

## Quick Start Summary

For experienced users, here's the TL;DR:

```bash
# 1. Clone and install
git clone <your-repo>
cd mcp-markdown-manager
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env with:
# - OAUTH_ENABLED=true
# - OAUTH_ISSUER=https://your-domain.com
# - OAUTH_JWT_SECRET=$(openssl rand -hex 32)
# - Database credentials

# 3. Deploy to Railway/Fly.io/VPS with HTTPS
# 4. Run database migration
bun scripts/database.ts init

# 5. Add to Claude web:
# - Settings → Integrations → Add custom connector
# - Enter: https://your-domain.com/mcp
# - Complete OAuth flow
```

---

## Step 1: Server Deployment

You need a publicly accessible server with HTTPS. Here are the recommended options:

### Option A: Railway (Recommended - Easiest)

**Why Railway?**
- Automatic HTTPS
- Free tier available
- PostgreSQL included
- One-click deployment
- Great for MCP servers

**Steps:**

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli

   # Login
   railway login

   # Initialize in your project directory
   cd mcp-markdown-manager
   railway init
   ```

3. **Add PostgreSQL Database**
   - In Railway dashboard, click "New" → "Database" → "PostgreSQL"
   - Railway automatically creates `DATABASE_URL`

4. **Configure Environment Variables**

   In Railway dashboard, go to your service → Variables:

   ```bash
   # Required
   AUTH_TOKEN=your-secret-token-here
   OAUTH_ENABLED=true
   OAUTH_JWT_SECRET=<generate with: openssl rand -hex 32>

   # Database (auto-configured by Railway)
   DATABASE_URL=${{Postgres.DATABASE_URL}}

   # Parse DATABASE_URL into individual vars (Railway does this automatically)
   DB_HOST=${{Postgres.PGHOST}}
   DB_PORT=${{Postgres.PGPORT}}
   DB_NAME=${{Postgres.PGDATABASE}}
   DB_USER=${{Postgres.PGUSER}}
   DB_PASSWORD=${{Postgres.PGPASSWORD}}

   # OAuth Configuration
   OAUTH_ISSUER=https://${{RAILWAY_PUBLIC_DOMAIN}}
   OAUTH_ACCESS_TOKEN_TTL=3600
   OAUTH_REFRESH_TOKEN_TTL=2592000
   OAUTH_LEGACY_TOKEN_ENABLED=true

   # MCP Configuration
   MCP_SERVER_ENABLED=true
   NODE_ENV=production
   PORT=5000
   ```

5. **Deploy**
   ```bash
   # Deploy from CLI
   railway up

   # Or connect GitHub repo in Railway dashboard for auto-deploys
   ```

6. **Get Your Public URL**
   - Railway assigns: `https://your-app.railway.app`
   - Note this URL - you'll need it for Claude web

7. **Initialize Database**
   ```bash
   # Connect to Railway environment
   railway run bun scripts/database.ts init
   ```

### Option B: Fly.io

**Why Fly.io?**
- Global edge deployment
- Free tier available
- Built-in PostgreSQL (via Fly Postgres)
- Good for low-latency worldwide access

**Steps:**

1. **Install Fly CLI**
   ```bash
   # macOS/Linux
   curl -L https://fly.io/install.sh | sh

   # Windows
   pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **Login and Launch**
   ```bash
   fly auth login
   cd mcp-markdown-manager
   fly launch
   ```

3. **Create PostgreSQL**
   ```bash
   fly postgres create
   fly postgres attach <postgres-app-name>
   ```

4. **Set Environment Variables**
   ```bash
   fly secrets set AUTH_TOKEN="your-secret-token"
   fly secrets set OAUTH_ENABLED="true"
   fly secrets set OAUTH_JWT_SECRET="$(openssl rand -hex 32)"
   fly secrets set OAUTH_ISSUER="https://your-app.fly.dev"
   fly secrets set MCP_SERVER_ENABLED="true"
   ```

5. **Deploy**
   ```bash
   fly deploy
   ```

6. **Initialize Database**
   ```bash
   fly ssh console
   bun scripts/database.ts init
   exit
   ```

### Option C: VPS (DigitalOcean, Linode, etc.)

**Why VPS?**
- Full control
- Cost-effective for high usage
- No vendor lock-in

**Steps:**

1. **Provision Server**
   - Ubuntu 22.04 LTS recommended
   - Minimum: 1GB RAM, 1 CPU

2. **Install Dependencies**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Bun
   curl -fsSL https://bun.sh/install | bash

   # Install PostgreSQL
   sudo apt install postgresql postgresql-contrib -y

   # Install Caddy (for automatic HTTPS)
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install caddy
   ```

3. **Setup PostgreSQL**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE article_manager;
   CREATE USER article_user WITH PASSWORD 'your-secure-password';
   GRANT ALL PRIVILEGES ON DATABASE article_manager TO article_user;
   \q
   ```

4. **Clone and Configure**
   ```bash
   cd /opt
   sudo git clone <your-repo> mcp-markdown-manager
   cd mcp-markdown-manager
   sudo bun install

   # Create .env
   sudo nano .env
   ```

   Add:
   ```bash
   AUTH_TOKEN=your-secret-token
   OAUTH_ENABLED=true
   OAUTH_JWT_SECRET=$(openssl rand -hex 32)
   OAUTH_ISSUER=https://your-domain.com

   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=article_manager
   DB_USER=article_user
   DB_PASSWORD=your-secure-password

   MCP_SERVER_ENABLED=true
   NODE_ENV=production
   PORT=5000
   ```

5. **Setup Caddy for HTTPS**
   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```

   Add:
   ```
   your-domain.com {
       reverse_proxy localhost:5000
   }
   ```

   ```bash
   sudo systemctl reload caddy
   ```

6. **Create Systemd Service**
   ```bash
   sudo nano /etc/systemd/system/mcp-markdown.service
   ```

   Add:
   ```ini
   [Unit]
   Description=MCP Markdown Manager
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/mcp-markdown-manager
   ExecStart=/root/.bun/bin/bun run start
   Restart=always
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable mcp-markdown
   sudo systemctl start mcp-markdown
   ```

7. **Initialize Database**
   ```bash
   cd /opt/mcp-markdown-manager
   sudo bun scripts/database.ts init
   ```

---

## Step 2: Database Setup

Regardless of deployment method, you need to initialize the database schema.

### Verify Database Connection

```bash
# Check database connection
bun scripts/database.ts health

# Expected output:
# ✅ Database is healthy
# - Connection: OK
# - Tables: 9/9 present
# - Extensions: vector, pg_trgm
```

### Initialize OAuth Tables

The OAuth tables are created automatically when `OAUTH_ENABLED=true`:

```bash
# Initialize all tables (including OAuth)
bun scripts/database.ts init

# Verify OAuth tables exist
bun scripts/database.ts info

# Expected output should include:
# - oauth_clients
# - oauth_authorization_codes
# - oauth_access_tokens
# - oauth_refresh_tokens
```

### Verify OAuth Configuration

Check your server logs on startup:

```
✅ OAuth tables created/verified
🔒 OAuth 2.0: Enabled
   Issuer: https://your-domain.com
   Access Token TTL: 3600s (1 hour)
   Refresh Token TTL: 2592000s (30 days)
```

---

## Step 3: OAuth Configuration

### Generate JWT Secret

**Critical:** Use a strong, random JWT secret:

```bash
# Generate a secure random secret
openssl rand -hex 32

# Output example:
# 8f3a9b2c7d1e5f4a6b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

### Configure Environment Variables

Ensure these are set in your deployment:

```bash
# Required OAuth Variables
OAUTH_ENABLED=true
OAUTH_ISSUER=https://your-domain.com  # MUST match your public URL
OAUTH_JWT_SECRET=<your-generated-secret>

# Optional (defaults shown)
OAUTH_ACCESS_TOKEN_TTL=3600           # 1 hour
OAUTH_REFRESH_TOKEN_TTL=2592000       # 30 days
OAUTH_AUTHORIZATION_CODE_TTL=600      # 10 minutes
OAUTH_LEGACY_TOKEN_ENABLED=true       # Keep legacy auth working
```

### Important Notes

⚠️ **OAUTH_ISSUER must match your public URL exactly:**
- ✅ `OAUTH_ISSUER=https://my-app.railway.app` (if deployed to Railway)
- ✅ `OAUTH_ISSUER=https://my-app.fly.dev` (if deployed to Fly.io)
- ✅ `OAUTH_ISSUER=https://articles.example.com` (if using custom domain)
- ❌ `OAUTH_ISSUER=http://localhost:5000` (won't work for Claude web)

⚠️ **HTTPS is required:**
- Claude web will only connect to HTTPS endpoints
- Use Railway/Fly.io for automatic HTTPS
- Use Caddy/nginx for VPS deployments

### Test OAuth Endpoints

```bash
# Test client registration (should return client credentials)
curl -X POST https://your-domain.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["https://claude.ai/oauth/callback"],
    "client_name": "Test Client"
  }'

# Expected response:
# {
#   "client_id": "...",
#   "client_secret": "...",
#   "client_id_issued_at": 1234567890,
#   ...
# }
```

---

## Step 4: Connecting to Claude Web

Now the exciting part - connecting your MCP server to Claude web!

### Prerequisites Check

Before proceeding, verify:

- ✅ Server is deployed and accessible via HTTPS
- ✅ Database is initialized with OAuth tables
- ✅ `OAUTH_ENABLED=true` in environment
- ✅ `OAUTH_ISSUER` matches your public URL
- ✅ Server responds to `https://your-domain.com/health`

### Add Custom Connector

1. **Open Claude Web**
   - Go to [claude.ai](https://claude.ai)
   - Log in with your Pro/Team/Enterprise account

2. **Navigate to Integrations**
   - Click your profile (bottom left)
   - Select **"Settings"**
   - Go to **"Integrations"** tab
   - Click **"Add custom connector"**

3. **Enter MCP Server URL**
   ```
   https://your-domain.com/mcp
   ```

   **Important:**
   - Use your actual deployed URL
   - Path must end with `/mcp`
   - Must be HTTPS (not HTTP)

4. **OAuth Configuration (Optional)**

   Claude web supports Dynamic Client Registration, so you can either:

   **Option A: Let Claude auto-register (Recommended)**
   - Leave OAuth fields blank
   - Claude will automatically register via `/oauth/register`
   - Click **"Connect"**

   **Option B: Pre-register client**
   - Manually register a client first:
     ```bash
     curl -X POST https://your-domain.com/oauth/register \
       -H "Content-Type: application/json" \
       -d '{
         "redirect_uris": ["https://claude.ai/oauth/callback"],
         "client_name": "Claude Web"
       }'
     ```
   - Copy `client_id` and `client_secret` from response
   - In Claude web, click **"Advanced settings"**
   - Paste client credentials
   - Click **"Connect"**

5. **Complete OAuth Flow**

   After clicking "Connect":

   a. **Redirect to Authorization**
      - Claude opens your authorization URL
      - You'll see your OAuth consent page

   b. **Review Consent Screen**
      - Application: Your MCP server
      - Requested permissions: Article access

   c. **Approve Authorization**
      - Click **"Authorize"** button
      - You'll be redirected back to Claude

   d. **Connection Established**
      - Claude exchanges authorization code for tokens
      - You'll see "Connected" status
      - MCP tools are now available!

### What Happens Behind the Scenes

```
1. Claude Web → POST /oauth/register
   Server → Returns client_id and client_secret

2. Claude Web → GET /oauth/authorize?
   client_id=...&
   code_challenge=...&
   code_challenge_method=S256&
   redirect_uri=https://claude.ai/oauth/callback&
   response_type=code

3. Your Server → Redirects to /oauth/consent
   User → Sees consent page

4. User → Clicks "Authorize"
   Your Server → POST /oauth/authorize/approve

5. Your Server → Generates authorization code
   Redirects → https://claude.ai/oauth/callback?code=...

6. Claude Web → POST /oauth/token
   grant_type=authorization_code&
   code=...&
   code_verifier=...

7. Your Server → Returns access_token and refresh_token

8. Claude Web → Uses access_token for MCP requests
   Authorization: Bearer <access_token>
```

---

## Step 5: Testing Your Integration

### Verify Connection Status

In Claude web:
- Settings → Integrations
- Your connector should show **"Connected"** with a green indicator
- Click to see available tools

### Available MCP Tools

Your MCP server provides these tools to Claude:

1. **listArticles** - List all articles with metadata
2. **listFolders** - Get folder structure
3. **searchArticles** - Search by title
4. **multiSearchArticles** - Batch search
5. **readArticle** - Read full article content
6. **createArticle** - Create new articles
7. **updateArticle** - Update existing articles
8. **deleteArticle** - Delete articles
9. **semanticSearch** (if enabled) - Vector search

### Test Basic Functionality

Start a conversation in Claude and try:

**Example 1: List Articles**
```
User: What articles do I have in my knowledge base?

Claude: [Uses listArticles tool]
I can see you have the following articles:
- "Getting Started with MCP" (getting-started-with-mcp.md)
- "OAuth Implementation Guide" (oauth-implementation-guide.md)
...
```

**Example 2: Read and Summarize**
```
User: Can you read my "Getting Started with MCP" article and summarize it?

Claude: [Uses readArticle tool]
Based on your article, here's a summary:
...
```

**Example 3: Create Article**
```
User: Create a new article called "Deployment Checklist" with steps for deploying MCP servers

Claude: [Uses createArticle tool]
I've created the article "Deployment Checklist" for you. The article includes:
...
```

### Monitor Server Logs

Watch your server logs to see MCP requests:

```bash
# Railway
railway logs

# Fly.io
fly logs

# VPS
sudo journalctl -u mcp-markdown -f
```

Expected log entries:
```
[2025-01-15T10:30:00.000Z] POST /mcp 200 45ms
[2025-01-15T10:30:01.000Z] MCP tool call: listArticles
[2025-01-15T10:30:02.000Z] GET /mcp 200 12ms (SSE stream)
```

### Verify OAuth Tokens

Check database to see active OAuth sessions:

```bash
# Connect to database
railway run bun scripts/database.ts info

# Or manually query
psql $DATABASE_URL -c "SELECT client_id, created_at FROM oauth_clients;"
psql $DATABASE_URL -c "SELECT expires_at FROM oauth_access_tokens WHERE revoked_at IS NULL;"
```

---

## Troubleshooting

### Connection Issues

**Problem:** "Unable to connect to MCP server"

**Solutions:**
1. Verify HTTPS is working:
   ```bash
   curl https://your-domain.com/health
   # Should return: {"status":"healthy"}
   ```

2. Check `MCP_SERVER_ENABLED=true` in environment

3. Verify the path ends with `/mcp`:
   - ✅ `https://your-domain.com/mcp`
   - ❌ `https://your-domain.com`
   - ❌ `https://your-domain.com/mcp/`

4. Check server logs for errors

### OAuth Authorization Failed

**Problem:** "Authorization failed" or "Invalid client"

**Solutions:**
1. Verify `OAUTH_ENABLED=true`

2. Check `OAUTH_ISSUER` matches your public URL:
   ```bash
   echo $OAUTH_ISSUER
   # Should match your deployment URL
   ```

3. Ensure `OAUTH_JWT_SECRET` is set and not empty

4. Clear any existing OAuth clients and re-register:
   ```bash
   psql $DATABASE_URL -c "DELETE FROM oauth_clients;"
   ```

5. Check OAuth tables exist:
   ```bash
   psql $DATABASE_URL -c "\dt oauth*"
   ```

### "Invalid redirect_uri" Error

**Problem:** Redirect URI validation fails

**Solution:**
Claude's redirect URI is: `https://claude.ai/oauth/callback`

This should be automatically accepted. If not, check server logs for the actual redirect_uri Claude is using.

### Consent Page Not Loading

**Problem:** Blank page or 404 on consent screen

**Solutions:**
1. Verify frontend is built:
   ```bash
   bun run build
   ```

2. Check static files are being served:
   ```bash
   curl https://your-domain.com/
   # Should return HTML
   ```

3. Verify base path configuration if using subpath deployment

### Tokens Expiring Too Quickly

**Problem:** Need to re-authorize frequently

**Solution:**
Adjust token lifetimes in environment:
```bash
OAUTH_ACCESS_TOKEN_TTL=86400          # 24 hours
OAUTH_REFRESH_TOKEN_TTL=7776000       # 90 days
```

Then restart server.

### Database Connection Errors

**Problem:** "Database connection failed"

**Solutions:**
1. Verify database is running:
   ```bash
   # Railway
   railway run psql

   # Fly.io
   fly postgres connect -a <postgres-app>

   # VPS
   sudo systemctl status postgresql
   ```

2. Check database credentials in environment

3. Ensure database has pgvector extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. Run health check:
   ```bash
   bun scripts/database.ts health
   ```

### Tools Not Showing in Claude

**Problem:** Connected but no tools available

**Solutions:**
1. Verify MCP server is responding:
   ```bash
   curl https://your-domain.com/mcp \
     -H "Authorization: Bearer $AUTH_TOKEN"
   ```

2. Check server logs for tool registration

3. Restart the connection in Claude:
   - Settings → Integrations
   - Disconnect and reconnect

### Performance Issues

**Problem:** Slow responses or timeouts

**Solutions:**
1. Check database performance:
   ```sql
   SELECT schemaname, tablename, n_live_tup
   FROM pg_stat_user_tables
   ORDER BY n_live_tup DESC;
   ```

2. Verify indexes exist:
   ```bash
   psql $DATABASE_URL -c "\di oauth*"
   ```

3. Monitor server resources:
   ```bash
   # Railway/Fly.io - check dashboard
   # VPS
   htop
   ```

4. Consider upgrading server resources if needed

---

## Security Best Practices

### Production Checklist

Before going live:

- [ ] Use strong `AUTH_TOKEN` (minimum 32 characters)
- [ ] Generate secure `OAUTH_JWT_SECRET` (64 characters)
- [ ] Set strong database password
- [ ] Enable HTTPS (required for OAuth)
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper CORS if needed
- [ ] Enable database SSL (`DB_SSL=true`)
- [ ] Set up database backups
- [ ] Monitor server logs
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)

### Token Security

**Access Tokens:**
- Short-lived (1 hour default)
- Signed with JWT
- Stored hashed in database
- Can be revoked

**Refresh Tokens:**
- Longer-lived (30 days default)
- Rotated on use (old token invalidated)
- Stored hashed in database
- Can be revoked

### Database Security

1. **Connection Security**
   ```bash
   DB_SSL=true  # Enable SSL/TLS
   ```

2. **Regular Backups**
   ```bash
   # Railway - automatic backups
   # Fly.io - configure Fly Postgres backups
   # VPS - set up cron job
   0 2 * * * /opt/mcp-markdown-manager/scripts/backup.sh
   ```

3. **Access Control**
   - Use dedicated database user
   - Grant minimal required permissions
   - Don't use database superuser

### Monitoring

**Health Checks:**
```bash
# Add to your monitoring service
GET https://your-domain.com/health

# Expected: 200 OK
# {"status":"healthy","database":"connected"}
```

**Log Monitoring:**
- Monitor for authentication failures
- Watch for unusual activity
- Set up alerts for errors

**Token Cleanup:**
Set up periodic cleanup of expired tokens:
```sql
-- Run weekly via cron
DELETE FROM oauth_authorization_codes WHERE expires_at < NOW() - INTERVAL '1 day';
DELETE FROM oauth_access_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
DELETE FROM oauth_refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
```

---

## Next Steps

Once your integration is working:

1. **Import Your Articles**
   - Use the web UI to import markdown files
   - Or use the import script: `bun scripts/import-articles.ts`

2. **Enable Semantic Search (Optional)**
   ```bash
   SEMANTIC_SEARCH_ENABLED=true
   EMBEDDING_PROVIDER=ollama  # or openai
   EMBEDDING_MODEL=nomic-embed-text
   ```

3. **Customize OAuth Flow**
   - Edit `src/frontend/OAuthConsent.tsx` for custom branding
   - Adjust token lifetimes for your needs

4. **Set Up Monitoring**
   - Add UptimeRobot for uptime monitoring
   - Configure log aggregation (LogTail, Papertrail)
   - Set up error tracking (Sentry)

5. **Scale as Needed**
   - Monitor resource usage
   - Upgrade server/database tier if needed
   - Consider adding Redis for caching

---

## Support and Resources

### Documentation
- [OAuth Implementation Details](../OAUTH_IMPLEMENTATION.md)
- [Project Instructions](../AGENTS.md)
- [API Documentation](./API.md)

### Useful Links
- [Claude Custom Connectors Guide](https://support.claude.com/en/articles/11175166)
- [MCP Protocol Spec](https://modelcontextprotocol.io/)
- [OAuth 2.0 RFC](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC](https://tools.ietf.org/html/rfc7636)

### Getting Help
- Check server logs first
- Review this troubleshooting section
- Check GitHub issues
- Claude community forums

---

## Appendix: Environment Variable Reference

### Required Variables

```bash
# Authentication (choose one or both)
AUTH_TOKEN=your-secret-token          # Legacy auth
OAUTH_ENABLED=true                    # Enable OAuth 2.0

# OAuth Configuration (if OAUTH_ENABLED=true)
OAUTH_ISSUER=https://your-domain.com  # Must match public URL
OAUTH_JWT_SECRET=<64-char-random>     # openssl rand -hex 32

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=article_manager
DB_USER=article_user
DB_PASSWORD=<secure-password>
```

### Optional Variables

```bash
# Server
PORT=5000
NODE_ENV=production
MCP_SERVER_ENABLED=true

# OAuth Token Lifetimes (seconds)
OAUTH_ACCESS_TOKEN_TTL=3600           # 1 hour
OAUTH_REFRESH_TOKEN_TTL=2592000       # 30 days
OAUTH_AUTHORIZATION_CODE_TTL=600      # 10 minutes

# Backward Compatibility
OAUTH_LEGACY_TOKEN_ENABLED=true       # Keep AUTH_TOKEN working

# Database Advanced
DB_SSL=false                          # Enable for production
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000

# Semantic Search
SEMANTIC_SEARCH_ENABLED=false
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_BASE_URL=http://localhost:11434

# MCP Session Management
MCP_SESSION_IDLE_MS=900000            # 15 minutes
MCP_SESSION_TTL_MS=3600000            # 1 hour
MCP_MAX_SESSIONS_TOTAL=200
MCP_MAX_SESSIONS_PER_IP=50
MCP_MAX_SESSIONS_PER_TOKEN=100
MCP_BIND_SESSION_TO_IP=false

# Rate Limiting
MCP_RATE_LIMIT_WINDOW_MS=60000        # 1 minute
MCP_RATE_LIMIT_MAX_REQUESTS=100
API_RATE_LIMIT_MAX_REQUESTS=60

# Request Size Limits
MCP_MAX_REQUEST_SIZE_BYTES=10485760   # 10MB
API_MAX_REQUEST_SIZE_BYTES=10485760   # 10MB
```

---

**Congratulations!** 🎉

You now have a fully functional MCP server connected to Claude web with OAuth 2.0 authentication. Your articles are accessible from within Claude conversations, enabling powerful knowledge management workflows.

Happy building!
