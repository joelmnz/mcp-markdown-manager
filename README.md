# MCP Markdown Manager

A complete full-stack TypeScript monolithic markdown article management system designed for AI agents to save and manage research content. This self-hosted single-user system handles hundreds of markdown articles with PostgreSQL database backend and multiple interfaces: Web UI, REST API, and MCP server.

## 🔒 Security

This project implements comprehensive security measures. See our detailed security documentation:

- **[Security Guide](docs/SECURITY.md)** - Security best practices, configuration, and hardening

Key security features:
- **Scoped access token system** with read-only and write permissions
- Separate admin authentication (AUTH_TOKEN) and API/MCP access tokens
- Cryptographically secure token generation with sk-md- prefix
- Bearer token authentication for all interfaces
- Input validation and sanitization
- Rate limiting and DoS protection
- Parameterized database queries (SQL injection prevention)
- Path traversal prevention
- Session management with configurable limits and timeouts
- Security event logging
- Non-root container execution
- Request size limits

## Features

- 📝 **Database-backed articles** with structured metadata storage
- 📁 **Folder organization** for hierarchical article structure
- 🔍 **Search functionality** with title and content search
- 🧠 **Semantic search** with RAG-style vector embeddings (optional)
- 📚 **Version history** with comprehensive change tracking
- 🎨 **Dark/Light theme** toggle
- 📱 **Mobile-first responsive design**
- 📲 **Progressive Web App (PWA)** support for offline access
- 🔐 **Scoped access token system** with read-only and write permissions
- 🌐 **REST API** for programmatic access
- 🤖 **MCP server** integration for AI agent access
- 🐳 **Docker support** with PostgreSQL integration
- ⚡ **Bun runtime** for fast TypeScript execution
- 📊 **Request logging** for monitoring and debugging
- 📦 **Import utility** for migrating existing markdown files

## Architecture

### Monolithic Structure

```text
/src
  /backend
    /routes      - REST API endpoints
    /mcp         - MCP server tools
    /services    - Shared business logic (articles CRUD)
    /middleware  - Auth, error handling
    server.ts    - Main server (API + MCP + static serving)
  /frontend
    /components  - React components
    /pages       - Page components
    /styles      - CSS files
    App.tsx
```

### Technology Stack

- **Runtime**: Bun (fast TypeScript execution)
- **Backend**: TypeScript, @modelcontextprotocol/sdk
- **Frontend**: React, react-markdown
- **Database**: PostgreSQL with pgvector extension
- **Storage**: Database-backed with structured metadata
- **Deployment**: Docker with PostgreSQL integration

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) installed (v1.0+)
- Docker and Docker Compose (for containerized deployment)
- PostgreSQL 12+ with pgvector extension (for local development)

### Development Setup

#### 1. Clone and install dependencies

```bash
cd article_manager
bun install
```

#### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your AUTH_TOKEN (used for web UI admin login only)
```

#### 3. Start database

```bash
# Start PostgreSQL with Docker
bun run dc:db
```

Note: The application automatically initializes the database schema on startup.

#### 4. Run development servers

Using docker is easiest

```bash
bun run dc:ui
```

If you want to run locally without docker

```bash
# Start backend server
bun run dev:backend
# In another terminal, start frontend dev server
bun run dev:frontend
```

#### 5. Access the application and generate API keys

- Web UI: http://localhost:5000
- Log in with your AUTH_TOKEN
- Navigate to Settings (⚙️) to generate access tokens for API/MCP access
- Use generated tokens for API: http://localhost:5000/api/*
- Use generated tokens for MCP: http://localhost:5000/mcp

#### 6. Import existing articles (optional)

If you have existing markdown files to import:

```bash
# Validate import first
bun run import validate ./path/to/markdown/files

# Import with interactive conflict resolution
bun run import import ./path/to/markdown/files --conflict interactive
```

To test the MCP Server you can use the MCP inspector

```bash
npx @modelcontextprotocol/inspector
```

### MCP Testing

You can test the MCP server using the MCP Inspector tool:

```bash
bun run dc:db
bun run dc:ui
bun run mcp:inspect

# when you are done Ctrl+C to stop the inspector then
docker compose down
```

This will open the MCP Inspector connected to your running MCP Markdown Manager instance. To connect you will need the `AUTH_TOKEN` and `PORT` you set in your `.env` file.

### Production Build

```bash
# Build frontend
bun run build

# Start production server
bun run start
```

## Progressive Web App (PWA)

The MCP Markdown Manager includes full PWA support, allowing you to:

- **Install** the app on your device (mobile or desktop)
- **Work offline** with cached articles and assets
- **Access** the app from your home screen like a native app

### Installation

When you visit the web app in a supported browser, you'll see an install prompt. Click "Install" to add it to your home screen or desktop.

Alternatively, you can manually install:

- **Chrome/Edge**: Click the install icon in the address bar
- **Safari (iOS)**: Tap the Share button → "Add to Home Screen"
- **Firefox**: Look for the install banner at the bottom of the page

### PWA Features

- **Offline Mode**: Service worker caches static assets and API responses
- **App-like Experience**: Runs in standalone mode without browser UI
- **Custom Icons**: Optimized icons for different screen sizes (192x192, 512x512)
- **Theme Integration**: Matches your selected dark/light theme preference

### Technical Details

The PWA implementation includes:

- `manifest.json` - Web app manifest with metadata and icons
- `sw.js` - Service worker for offline caching and asset management
- PWA meta tags in HTML for proper installation behavior
- Automatic service worker registration on app load

## Docker Deployment

### Using Docker Compose (Recommended)

#### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and set AUTH_TOKEN
```

#### 2. Start the container

```bash
docker-compose up -d
```

#### 3. View logs

```bash
docker-compose logs -f
```

#### 4. Stop the container

```bash
docker-compose down
```

### Using Docker directly

```bash
# Build image
docker build -t article-manager .

# Run container
docker run -d \
  -p 5000:5000 \
  -e AUTH_TOKEN=your-secret-token \
  -v $(pwd)/data:/data \
  --name article-manager \
  article-manager
```

### Nginx Subpath Deployment

For deployment behind nginx on a subpath (e.g., `/md`, `/articles`):

#### Quick Start with Subpath

```bash
# 1. Configure environment for subpath
cp .env.example .env
echo "BASE_URL=http://localhost/md" >> .env

# 2. Deploy with nginx proxy
docker-compose -f docker-compose.subpath.yml up -d

# 3. Access application
# http://localhost/md
```

#### Production Deployment with SSL

```bash
# 1. Configure production environment
cp .env.example .env.production
# Edit .env.production with production values
echo "BASE_URL=https://yourdomain.com/articles" >> .env.production

# 2. Place SSL certificates in ./ssl/ directory
mkdir ssl
# Copy cert.pem and key.pem to ssl/

# 3. Deploy production stack
docker-compose -f docker-compose.production.yml --env-file .env.production up -d

# 4. Access application
# https://yourdomain.com/articles
```

#### Available Deployment Configurations

- `docker-compose.yml` - Standard deployment (root path)
- `docker-compose.subpath.yml` - Nginx subpath deployment with HTTP
- `docker-compose.production.yml` - Production deployment with SSL and security features

See the [Deployment Examples](docs/DEPLOYMENT_EXAMPLES.md) guide for more deployment scenarios and the [Nginx Subpath Deployment Guide](docs/nginx-subpath-deployment.md) for detailed configuration instructions.

### GitHub Container Registry

To push to GitHub Container Registry:

```bash
# Build and tag
docker build -t ghcr.io/YOUR_USERNAME/article-manager:latest .

# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Push
docker push ghcr.io/YOUR_USERNAME/article-manager:latest
```

## Environment Variables

### Required Variables

| Variable | Description |
|----------|-------------|
| `AUTH_TOKEN` | Admin authentication token for web UI login only |
| `DB_PASSWORD` | PostgreSQL database password |

### Authentication System

The application uses a two-tier authentication system:

1. **Admin Authentication (AUTH_TOKEN)**:
   - Used exclusively for web UI admin login
   - Set via environment variable
   - Grants access to Settings page for token management

2. **Access Tokens (Generated via Settings)**:
   - Used for API and MCP server access
   - Generated through the Settings page in web UI
   - Scoped permissions:
     - **read-only**: Can list, read, and search articles
     - **write**: Full access (read + create/update/delete)
   - Prefixed with `sk-md-` for identification
   - Can be named, viewed (masked), and revoked
   - Track last usage timestamp

**Migration Note**: After upgrading, API and MCP endpoints use scoped access tokens by default. For backward compatibility, existing MCP/API integrations using `AUTH_TOKEN` may continue to work via a temporary fallback, but this behavior is **deprecated** and will be removed in a future release. Log into the web UI and generate new access tokens in the Settings page, then update your integrations to use those tokens.

### Base Path Configuration (Nginx Subpath Deployment)

The application supports runtime base path configuration for deployment behind nginx on subpaths (e.g., `/md`, `/articles`). This allows the same built frontend assets to work with different deployment paths without rebuilding.

| Variable | Description | Example |
|----------|-------------|---------|
| `BASE_URL` | Full URL including protocol and domain | `https://example.com/md` |
| `BASE_PATH` | Path portion only | `/md`, `/articles`, `/app/docs` |

**Configuration Priority**: `BASE_URL` takes precedence if both are set. The path portion is extracted from `BASE_URL`.

**Path Normalization**: The system automatically normalizes paths:
- `md` → `/md`
- `/md/` → `/md`
- `app/docs` → `/app/docs`

**Default Behavior**: If neither variable is set, the application runs at root path (`/`).

**Runtime Configuration**: The base path is injected into the frontend at request time, enabling deployment flexibility without rebuilding assets.

**Documentation**:
- [Nginx Subpath Deployment Guide](docs/nginx-subpath-deployment.md) - Comprehensive nginx configuration and deployment instructions
- [Deployment Examples](docs/DEPLOYMENT_EXAMPLES.md) - Quick deployment examples for different scenarios

### Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `article_manager` | Database name |
| `DB_USER` | `article_user` | Database user |
| `DB_SSL` | `false` | Enable SSL for database connections |
| `DB_MAX_CONNECTIONS` | `20` | Maximum database connections for app |
| `DATABASE_URL` | - | Complete database URL (alternative to individual DB_* vars) |

### Application Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `MCP_SERVER_ENABLED` | `true` | Enable MCP server |
| `DATA_DIR` | `/data` | Data directory (for Docker volumes) |

### Semantic Search (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `SEMANTIC_SEARCH_ENABLED` | `false` | Enable semantic search with vector embeddings |
| `EMBEDDING_PROVIDER` | `ollama` | Embedding provider: `ollama` or `openai` |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Model to use for embeddings |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OPENAI_API_KEY` | - | OpenAI API key (required if using OpenAI provider) |
| `CHUNK_SIZE` | `500` | Number of words per chunk for semantic search |
| `CHUNK_OVERLAP` | `50` | Number of overlapping words between chunks |

## Semantic Search (RAG)

The system supports optional semantic search using vector embeddings for more intelligent content discovery. When enabled, articles are automatically chunked and embedded, allowing similarity-based search across content.

### Setup

1. **Enable semantic search** in your `.env`:
   ```bash
   SEMANTIC_SEARCH_ENABLED=true
   ```

2. **Choose an embedding provider**:
   
   **Option A: Ollama (Local, Recommended)**
   ```bash
   EMBEDDING_PROVIDER=ollama
   EMBEDDING_MODEL=nomic-embed-text
   OLLAMA_BASE_URL=http://localhost:11434
   ```
   
   First, install and start Ollama:
   ```bash
   # Install Ollama (see https://ollama.ai)
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Pull the embedding model
   ollama pull nomic-embed-text
   ```
   
   **Option B: OpenAI**
   ```bash
   EMBEDDING_PROVIDER=openai
   EMBEDDING_MODEL=text-embedding-3-small
   OPENAI_API_KEY=your-api-key-here
   ```

3. **Build the initial index**:
   ```bash
   bun run reindex
   ```
   
   This will process all existing articles and create the vector index at `DATA_DIR/index.vectors.jsonl`.

### How It Works

- **Automatic indexing**: New articles are automatically chunked and embedded on creation/update
- **Chunk-based**: Articles are split by headings and then into smaller chunks with overlap
- **Vector storage**: Embeddings stored in JSONL format (`index.vectors.jsonl`) in data directory
- **Cosine similarity**: Search uses cosine similarity to find relevant chunks
- **Heading context**: Results include the heading path for better context

### Using Semantic Search

**Web UI**: Toggle between "Title Search" and "Semantic Search" in the search form

**REST API**:
```bash
GET /api/search?query=your+search&k=5
Authorization: Bearer YOUR_TOKEN
```

**MCP Tool**:
```json
{
  "method": "tools/call",
  "params": {
    "name": "semanticSearch",
    "arguments": {
      "query": "your search query",
      "k": 5
    }
  }
}
```

### Reindexing

If you change embedding models or need to rebuild the index:

```bash
bun run reindex
```

## Database Management

The system uses PostgreSQL with pgvector extension for structured storage and semantic search capabilities.

### Database Commands

Note: The application automatically initializes the schema on startup. These commands are for manual management.

```bash
# Manually initialize/update database schema
bun run db:init

# Check database health and connectivity
bun run db:health

# Get database information and statistics
bun run db:info

# Verify database schema and constraints
bun run db:verify

# Create database backup
bun run db:backup

# Restore from backup
bun run db:restore ./backups/backup-file.sql

# Reset database (WARNING: destroys all data)
bun run db:reset --confirm
```

### Database Schema

The system uses three main tables:

- **articles**: Core article data with metadata fields
- **article_history**: Version history for all article changes
- **embeddings**: Vector embeddings for semantic search

## Import Utility

The import utility allows migration from file-based markdown systems or bulk import of existing content.

### Import Commands

```bash
# Validate import without making changes
bun run import validate ./markdown-directory

# Preview what would be imported
bun run import preview ./markdown-directory --preserve-folders

# Import with interactive conflict resolution
bun run import import ./markdown-directory --conflict interactive

# Import with automatic conflict handling
bun run import import ./markdown-directory --conflict skip --preserve-folders

# Get import statistics
bun run import stats ./markdown-directory
```

### Import Options

- `--preserve-folders`: Maintain directory structure as article folders
- `--conflict <action>`: Handle conflicts (skip, rename, overwrite, interactive)
- `--batch-size <n>`: Process files in batches (default: 50)
- `--dry-run`: Show what would be imported without making changes
- `--use-title-slug`: Generate slugs from titles instead of filenames

### Import Process

1. **Validation**: Scans directory for `.md` files and validates format
2. **Conflict Detection**: Identifies duplicate titles or slugs
3. **Frontmatter Processing**: Extracts YAML frontmatter into database fields
4. **Content Cleaning**: Stores pure markdown without frontmatter
5. **Batch Import**: Processes files in configurable batches
6. **Progress Reporting**: Shows real-time import progress

### Migration from File-Based System

If migrating from the previous file-based version:

1. **Backup existing data**:
   ```bash
   cp -r ./data ./data-backup-$(date +%Y%m%d)
   ```

2. **Validate migration**:
   ```bash
   bun run import validate ./data
   ```

3. **Import with conflict resolution**:
   ```bash
   bun run import import ./data --conflict interactive --preserve-folders
   ```

4. **Verify import**:
   ```bash
   bun run db:health
   bun run db:info
   ```

## REST API Documentation

All API endpoints require Bearer token authentication via the `Authorization` header using an access token generated from the Settings page:

```html
Authorization: Bearer sk-md-your-access-token-here
```

**Scope Requirements**:
- **Read operations** (GET): Require `read-only` or `write` scope
- **Write operations** (POST/PUT/DELETE): Require `write` scope
- **Token management**: Requires web UI admin login (AUTH_TOKEN)

### Access Token Management

#### List Access Tokens

```http
GET /api/access-tokens
Authorization: Bearer YOUR_AUTH_TOKEN
```

List all access tokens with masked values. Requires web UI admin authentication.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Claude Desktop",
    "scope": "write",
    "created_at": "2025-01-15T10:30:00Z",
    "last_used_at": "2025-01-15T12:00:00Z",
    "masked_token": "sk-md-****...a1b2"
  }
]
```

#### Create Access Token

```http
POST /api/access-tokens
Authorization: Bearer YOUR_AUTH_TOKEN
Content-Type: application/json

{
  "name": "Production API",
  "scope": "read-only"
}
```

Generate a new access token. Requires web UI admin authentication. The full token is returned only once.

**Response (201):**
```json
{
  "id": 2,
  "token": "sk-md-1234567890abcdef...",
  "name": "Production API",
  "scope": "read-only",
  "created_at": "2025-01-15T10:30:00Z"
}
```

#### Delete Access Token

```http
DELETE /api/access-tokens/:id
Authorization: Bearer YOUR_AUTH_TOKEN
```

Revoke an access token by ID. Requires web UI admin authentication.

### Endpoints

#### Health Check

```http
GET /health
```

Returns server health status (no auth required).

**Response:**

```json
{
  "status": "ok"
}
```

#### List Articles

```http
GET /api/articles
```

Returns all articles with metadata, sorted by creation date (newest first).

**Response:**

```json
[
  {
    "filename": "my-article.md",
    "title": "My Article",
    "created": "2025-01-15T10:30:00Z"
  }
]
```

#### Search Articles

```http
GET /api/articles?q=search+term
```

Search articles by title (partial match, case-insensitive).

**Query Parameters:**

- `q` - Search query string

**Response:**

```json
[
  {
    "filename": "matching-article.md",
    "title": "Matching Article",
    "created": "2025-01-15T10:30:00Z"
  }
]
```

#### Semantic Search

```http
GET /api/search?query=search+query&k=5
```

Perform semantic search across article content using vector embeddings. Returns chunks of content ranked by similarity.

**Query Parameters:**

- `query` - Search query string (required)
- `k` - Number of results to return (default: 5)

**Response:**

```json
[
  {
    "chunk": {
      "filename": "article.md",
      "title": "Article Title",
      "headingPath": ["# Main Heading", "## Subheading"],
      "text": "Full chunk text..."
    },
    "score": 0.85,
    "snippet": "Truncated preview of the chunk..."
  }
]
```

**Note:** Requires `SEMANTIC_SEARCH_ENABLED=true` in environment.

#### Read Article

```http
GET /api/articles/:filename
```

Read a single article by filename.

**Response:**

```json
{
  "filename": "my-article.md",
  "title": "My Article",
  "content": "Article content in markdown...",
  "created": "2025-01-15T10:30:00Z"
}
```

**Error Response (404):**

```json
{
  "error": "Article not found"
}
```

#### Create Article

```http
POST /api/articles
Authorization: Bearer sk-md-your-write-token
Content-Type: application/json

{
  "title": "My New Article",
  "content": "Article content in markdown..."
}
```

Creates a new article. Filename is auto-generated from title (e.g., "My New Article" → "my-new-article.md"). **Requires `write` scope**.

**Response (201):**

```json
{
  "filename": "my-new-article.md",
  "title": "My New Article",
  "content": "Article content in markdown...",
  "created": "2025-01-15T10:30:00Z"
}
```

**Error Response (400):**

```json
{
  "error": "Title and content are required"
}
```

#### Update Article

```http
PUT /api/articles/:filename
Authorization: Bearer sk-md-your-write-token
Content-Type: application/json

{
  "title": "Updated Title",
  "content": "Updated content..."
}
```

Updates an existing article. Preserves original creation date. **Requires `write` scope**.

**Response:**

```json
{
  "filename": "my-article.md",
  "title": "Updated Title",
  "content": "Updated content...",
  "created": "2025-01-15T10:30:00Z"
}
```

#### Delete Article

```http
DELETE /api/articles/:filename
Authorization: Bearer sk-md-your-write-token
```

Deletes an article. **Requires `write` scope**.

**Response:**

```json
{
  "success": true
}
```

### Authentication Errors

All authenticated endpoints return 401 for invalid/missing tokens:

```json
{
  "error": "Unauthorized"
}
```

## MCP Server Documentation

The MCP (Model Context Protocol) server provides AI agents with tools to manage articles. Tools are filtered based on the access token's scope.

### Endpoint

```http
POST /mcp
Authorization: Bearer sk-md-your-access-token
Content-Type: application/json
```

### Token Scopes

MCP tools are filtered based on access token scope:

**Read-Only Scope** - Available tools:
- `listArticles` - List all articles
- `listFolders` - List folder structure
- `searchArticles` - Search by title
- `multiSearchArticles` - Batch search
- `readArticle` - Read article content
- `semanticSearch` - Vector similarity search (if enabled)
- `multiSemanticSearch` - Batch semantic search (if enabled)

**Write Scope** - All read-only tools PLUS:
- `createArticle` - Create new articles
- `updateArticle` - Update existing articles
- `deleteArticle` - Delete articles

### Available Tools

#### listArticles

List all articles with metadata.

**Input Schema:**

```json
{
  "method": "tools/call",
  "params": {
    "name": "listArticles",
    "arguments": {}
  }
}
```

**Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "[{\"filename\":\"article.md\",\"title\":\"Article\",\"created\":\"2025-01-15T10:30:00Z\"}]"
    }
  ]
}
```

#### searchArticles

Search articles by title.

**Input Schema:**

```json
{
  "method": "tools/call",
  "params": {
    "name": "searchArticles",
    "arguments": {
      "query": "search term"
    }
  }
}
```

#### semanticSearch

Perform semantic search across article content using vector embeddings. Available when `SEMANTIC_SEARCH_ENABLED=true`.

**Input Schema:**

```json
{
  "method": "tools/call",
  "params": {
    "name": "semanticSearch",
    "arguments": {
      "query": "search query",
      "k": 5
    }
  }
}
```

**Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "[{\"chunk\":{\"filename\":\"article.md\",\"title\":\"Article\",\"headingPath\":[\"# Heading\"],\"text\":\"...\"},\"score\":0.85,\"snippet\":\"...\"}]"
    }
  ]
}
```

#### readArticle

Read a single article.

**Input Schema:**

```json
{
  "method": "tools/call",
  "params": {
    "name": "readArticle",
    "arguments": {
      "filename": "my-article.md"
    }
  }
}
```

#### createArticle

Create a new article. **Requires `write` scope**.

**Input Schema:**

```json
{
  "method": "tools/call",
  "params": {
    "name": "createArticle",
    "arguments": {
      "title": "New Article",
      "content": "Article content..."
    }
  }
}
```

#### updateArticle

Update an existing article. **Requires `write` scope**.

**Input Schema:**

```json
{
  "method": "tools/call",
  "params": {
    "name": "updateArticle",
    "arguments": {
      "filename": "my-article.md",
      "title": "Updated Title",
      "content": "Updated content..."
    }
  }
}
```

#### deleteArticle

Delete an article. **Requires `write` scope**.

**Input Schema:**

```json
{
  "method": "tools/call",
  "params": {
    "name": "deleteArticle",
    "arguments": {
      "filename": "my-article.md"
    }
  }
}
```

### List Available Tools

```json
{
  "method": "tools/list"
}
```

### Using with Agent Zero

[Agent Zero](https://github.com/agent0ai/agent-zero) is an AI agent framework that supports MCP servers via the Streamable HTTP transport. To connect this MCP server to Agent Zero:

1. **Start the MCP Markdown Manager** with a configured `AUTH_TOKEN`:
   ```bash
   docker run -d -p 8097:5000 \
     -e AUTH_TOKEN="your-secret-token-here" \
     -e MCP_SERVER_ENABLED="true" \
     -v $(pwd)/data:/data \
     ghcr.io/joelmnz/mcp-markdown-manager:latest
   ```

2. **Generate an access token**:
   - Log into the web UI at http://localhost:8097 with your `AUTH_TOKEN`
   - Navigate to Settings (⚙️ icon)
   - Create a new access token:
     - Name: "Agent Zero"
     - Scope: "write" (for full access) or "read-only" (for search/read only)
   - Copy the generated token (it will only be shown once)

3. **Configure Agent Zero** by adding the following to your `tmp/settings.json` under the `mcp_servers` key:
   ```json
   {
     "name": "mcp-markdown-manager",
     "description": "Markdown article manager for research and notes",
     "type": "streaming-http",
     "url": "http://localhost:8097/mcp",
     "headers": {
       "Authorization": "Bearer sk-md-your-generated-token-here"
     },
     "disabled": false
   }
   ```

   **Important Notes:**
   - Replace `sk-md-your-generated-token-here` with your actual access token from Settings
   - If running both Agent Zero and MCP server in Docker, use the appropriate network hostname instead of `localhost`
   - The `type: "streaming-http"` is required for proper MCP protocol support
   - The server uses the MCP Streamable HTTP transport specification with session management

4. **Verify the connection** by checking Agent Zero logs for successful tool discovery. Available tools depend on token scope:

   **With write scope** (7+ tools):
   - `mcp_markdown_manager.listArticles`
   - `mcp_markdown_manager.searchArticles`
   - `mcp_markdown_manager.readArticle`
   - `mcp_markdown_manager.createArticle`
   - `mcp_markdown_manager.updateArticle`
   - `mcp_markdown_manager.deleteArticle`
   - Plus semantic search tools if enabled

   **With read-only scope** (4+ tools):
   - `mcp_markdown_manager.listArticles`
   - `mcp_markdown_manager.searchArticles`
   - `mcp_markdown_manager.readArticle`
   - Plus semantic search tools if enabled

5. **Use the tools** by instructing Agent Zero, for example:
   - "Create a new article about Python decorators"
   - "List all my articles"
   - "Search for articles about machine learning"

**Transport Details:**
- The server implements the MCP Streamable HTTP transport protocol
- Session management is handled automatically with `mcp-session-id` headers
- POST requests are used for initialization and method calls
- GET requests establish Server-Sent Event (SSE) streams for real-time updates
- DELETE requests terminate sessions

## Article Format

Articles are stored in PostgreSQL database with structured metadata fields and clean markdown content.

### Database Storage

Articles are stored with the following structure:

- **Metadata Fields**: title, slug, folder, creation/modification dates, public status
- **Content**: Pure markdown without YAML frontmatter
- **Version History**: Complete change history with timestamps and messages
- **Embeddings**: Vector embeddings for semantic search (optional)

### Article Creation

When creating articles:

- **Title**: User-provided or extracted from first `#` heading
- **Slug**: Auto-generated from title for URL compatibility
- **Folder**: Optional hierarchical organization (e.g., "projects/web-dev")
- **Content**: Clean markdown without frontmatter

### Import Format

When importing existing markdown files, the system processes:

```markdown
---
title: Article Title
created: 2025-01-15T10:30:00Z
folder: projects/web-dev
---

# Article Title

Article content goes here...

## Section

More content...
```

The frontmatter is extracted into database fields, and only the clean markdown content is stored.

### Folder Organization

- **Root Level**: Articles without folder (folder = "")
- **Nested Folders**: Hierarchical structure (e.g., "projects/web-dev/react")
- **Folder Filtering**: Search and list articles by folder
- **Folder Migration**: Move articles between folders while preserving content

## Web UI Usage

### Login

1. Navigate to http://localhost:5000
2. Enter your AUTH_TOKEN (admin authentication)
3. Click "Login"

### Settings (Access Token Management)

After logging in with AUTH_TOKEN:

1. Click the Settings icon (⚙️) in the header
2. Generate new access tokens:
   - Enter a descriptive name (e.g., "Claude Desktop", "Production API")
   - Choose scope: `write` (full access) or `read-only` (search/read only)
   - Click "Generate Access Token"
3. **Important**: Copy the token immediately - it will only be shown once
4. Use the generated token for API and MCP access
5. View existing tokens (masked for security)
6. Delete tokens to revoke access

### Home Page

- View last 10 articles (newest first)
- Search articles by title
- Click "New Article" to create
- Click any article to view

### Article View

- Read rendered markdown
- See creation date
- Click "Edit" to modify
- Click "Delete" to remove

### Article Edit

- Edit title and content
- Live preview pane (desktop)
- Save or cancel changes

### Theme Toggle

- Click sun/moon icon in header
- Switches between dark and light themes
- Preference saved in browser

## Development

### Project Scripts

```bash
# Install dependencies
bun install

# Development (backend)
bun run dev:backend

# Development (frontend)
bun run dev:frontend

# Build frontend
bun run build

# Production server
bun run start

# Type checking
bun run typecheck
```

### File Structure

```text
article_manager/
├── src/
│   ├── backend/
│   │   ├── middleware/
│   │   │   └── auth.ts          # Authentication middleware
│   │   ├── mcp/
│   │   │   └── server.ts        # MCP server implementation
│   │   ├── routes/
│   │   │   └── api.ts           # REST API routes
│   │   ├── services/
│   │   │   └── articles.ts      # Article CRUD logic
│   │   └── server.ts            # Main server
│   └── frontend/
│       ├── components/
│       │   ├── ArticleList.tsx  # Article list component
│       │   ├── Header.tsx       # Header with theme toggle
│       │   └── Login.tsx        # Login page
│       ├── pages/
│       │   ├── ArticleEdit.tsx  # Edit/create page
│       │   ├── ArticleView.tsx  # Article view page
│       │   └── Home.tsx         # Home page
│       ├── styles/
│       │   └── main.css         # All styles
│       └── App.tsx              # Main app component
├── public/                      # Built frontend (generated)
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service worker
│   ├── icon-192.png             # PWA icon (192x192)
│   ├── icon-512.png             # PWA icon (512x512)
│   ├── index.html               # Main HTML (generated)
│   ├── App.[hash].js            # Bundled JS (generated)
│   └── App.[hash].css           # Bundled CSS (generated)
├── scripts/
│   ├── build-html.cjs           # Generate index.html
│   ├── generate-icons.cjs       # Generate PWA icons
│   └── watch-frontend.ts        # Frontend dev watcher
├── data/                        # Article storage (gitignored)
├── Dockerfile                   # Multi-stage Docker build
├── docker-compose.yml           # Docker Compose config
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript config
├── .env.example                 # Environment template
├── .gitignore                   # Git ignore rules
└── README.md                    # This file
```

## Troubleshooting

### Port already in use

```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>
```

### Permission denied on data directory

```bash
# Fix permissions
chmod -R 755 ./data
```

### Docker build fails

```bash
# Clean build cache
docker builder prune -a

# Rebuild without cache
docker-compose build --no-cache
```

### Frontend not loading

```bash
# Rebuild frontend
bun run build

# Check if public/index.html exists
ls -la public/
```

## Limitations

- Single user only (no multi-tenancy)
- Optimized for hundreds to thousands of articles
- Manual article creation (paste markdown or import)
- No image uploads or media management
- No tags or categories (use folders for organization)
- Bearer token auth only (no OAuth, sessions)
- Single Docker container deployment (not microservices)
- PostgreSQL dependency for all operations

## Security Considerations

- **Store AUTH_TOKEN securely** (use environment variables, never commit to git)
- **Generate unique access tokens** for each integration/client
- **Use read-only scope** when possible to limit permissions
- **Revoke unused tokens** immediately in Settings page
- **Copy access tokens immediately** - they're only shown once at creation
- **Use HTTPS in production** (reverse proxy recommended)
- **Monitor token usage** via last_used_at timestamps in Settings
- **Regularly backup** the database (includes token data)
- Keep dependencies updated
- Docker container runs as non-root user (UID 99, GID 100 - UNRAID compatible) for security
- Request logging enabled for monitoring and audit trails

### Token Security Best Practices

1. **Never share AUTH_TOKEN** - it grants admin access to token management
2. **Use descriptive token names** - helps identify which integration uses which token
3. **Rotate tokens periodically** - delete old tokens and generate new ones
4. **Use read-only tokens** for monitoring/search-only integrations
5. **Audit token usage** - check last_used_at to identify inactive tokens

## License

MIT License - feel free to use and modify as needed.

## Contributing

This project now includes database backend support. For enhanced production use, consider:

- Adding user management and multi-tenancy
- Implementing advanced full-text search features
- Adding role-based access control
- Implementing rate limiting and API quotas
- Adding comprehensive test coverage
- Setting up CI/CD pipelines
- Adding real-time collaboration features

## Support

For issues and questions, please open an issue on the GitHub repository.
