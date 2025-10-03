# Article Manager

A complete full-stack TypeScript monolithic article management system designed for AI agents to save and manage research content. This self-hosted single-user POC system handles hundreds of markdown articles with multiple interfaces: Web UI, REST API, and MCP server.

## Features

- 📝 **Markdown-based articles** with frontmatter support
- 🔍 **Search functionality** with partial title matching
- 🎨 **Dark/Light theme** toggle
- 📱 **Mobile-first responsive design**
- 🔐 **Bearer token authentication** for all interfaces
- 🌐 **REST API** for programmatic access
- 🤖 **MCP server** integration for AI agent access
- 🐳 **Docker support** with multi-stage builds and non-root user
- ⚡ **Bun runtime** for fast TypeScript execution
- 📊 **Request logging** for monitoring and debugging

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
- **Storage**: File-based markdown with frontmatter
- **Deployment**: Docker with oven/bun base image

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) installed (v1.0+)
- Docker and Docker Compose (for containerized deployment)

### Development Setup

#### 1. Clone and install dependencies

```bash
cd article_manager
bun install
```

#### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your AUTH_TOKEN
```

#### 3. Run development servers

Terminal 1 (Backend):

```bash
bun run dev:backend
```

Terminal 2 (Frontend):

```bash
bun run dev:frontend
```

#### 4. Access the application

- Web UI: http://localhost:5000
- API: http://localhost:5000/api/*
- MCP: http://localhost:5000/mcp

To test the MCP Server you can use the MCP inspector

```bash
npx @modelcontextprotocol/inspector
```

### Production Build

```bash
# Build frontend
bun run build

# Start production server
bun run start
```

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

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_TOKEN` | Yes | - | Authentication token for all interfaces |
| `DATA_DIR` | No | `/data` | Directory where markdown articles are stored |
| `PORT` | No | `5000` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |

## REST API Documentation

All API endpoints require Bearer token authentication via the `Authorization` header:

```html
Authorization: Bearer YOUR_AUTH_TOKEN
```

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
Content-Type: application/json

{
  "title": "My New Article",
  "content": "Article content in markdown..."
}
```

Creates a new article. Filename is auto-generated from title (e.g., "My New Article" → "my-new-article.md").

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
Content-Type: application/json

{
  "title": "Updated Title",
  "content": "Updated content..."
}
```

Updates an existing article. Preserves original creation date.

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
```

Deletes an article.

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

The MCP (Model Context Protocol) server provides AI agents with tools to manage articles.

### Endpoint

```http
POST /mcp
Authorization: Bearer YOUR_AUTH_TOKEN
Content-Type: application/json
```

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

Create a new article.

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

Update an existing article.

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

Delete an article.

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

## Article Format

Articles are stored as markdown files with YAML frontmatter:

```markdown
---
title: Article Title
created: 2025-01-15T10:30:00Z
---

# Article Title

Article content goes here...

## Section

More content...
```

### Filename Generation

- User provides title when creating articles
- Filename is auto-generated: "My Article Name" → "my-article-name.md"
- Title is extracted from first `#` heading in markdown for display
- Filename may differ from displayed title

### Frontmatter Fields

- `title`: Article title (string)
- `created`: ISO 8601 timestamp (string)

If frontmatter is missing, the system falls back to file system timestamps.

## Web UI Usage

### Login

1. Navigate to http://localhost:5000
2. Enter your AUTH_TOKEN
3. Click "Login"

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
- Optimized for hundreds of articles (not thousands)
- Simple partial text search (no full-text indexing)
- Manual article creation (paste markdown)
- No image uploads or media management
- No tags, categories, or advanced metadata
- File-based storage only (no database)
- Bearer token auth only (no OAuth, sessions)
- Single Docker container (not microservices)

## Security Considerations

- Store AUTH_TOKEN securely (use environment variables)
- Use HTTPS in production (reverse proxy recommended)
- Regularly backup the data directory
- Keep dependencies updated
- Docker container runs as non-root user (UID 1001) for security
- Request logging enabled for monitoring and audit trails

## License

MIT License - feel free to use and modify as needed.

## Contributing

This is a POC project. For production use, consider:

- Adding database support for better scalability
- Implementing full-text search (e.g., Elasticsearch)
- Adding user management and roles
- Implementing rate limiting
- Adding comprehensive test coverage
- Setting up CI/CD pipelines

## Support

For issues and questions, please open an issue on the GitHub repository.
