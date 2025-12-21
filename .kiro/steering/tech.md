---
inclusion: always
---

# Technology Stack & Build System

## Runtime & Package Manager
- **Runtime**: Bun exclusively (not npm/yarn)
- **Module System**: ESM only with TypeScript
- **Node Version**: Uses Bun's built-in Node.js compatibility

## Tech Stack
### Backend
- **TypeScript**: Strict mode enabled
- **Bun**: Server runtime and bundler e.g. `bun run dev:backend`
- **MCP SDK**: `@modelcontextprotocol/sdk` for AI agent integration
- **Database**: PostgreSQL with `pgvector` for article and vector storage
- **File System**: `fs/promises` used only for backups and imports

### Frontend
- **React 18**: With TypeScript and JSX
- **Bundling**: Bun build with code splitting and hashing e.g. `bun run build`
- **CSS**: Custom properties for theming, no frameworks
- **Markdown**: `react-markdown` with `remark-gfm` for GitHub flavored markdown
- **PWA**: Service worker and manifest for offline support

### Optional Features
- **Semantic Search**: Ollama or OpenAI embeddings
- **Diagrams**: Mermaid.js integration

## Common Commands
```bash
# Development
bun run dev:backend    # Start backend with watch mode
bun run dev:frontend   # Start frontend watcher
bun run dev           # Start both (parallel)

# Database
bun run db:health     # Check connectivity
bun run db:init       # Manual schema initialization (automated on startup)

# Building
bun run build         # Build frontend with hashed assets
bun run typecheck     # TypeScript type checking

# Production
bun run start         # Production server

# Utilities
bun run reindex       # Rebuild semantic search index
```

## Build Process
- **Frontend**: Bun bundles React app with code splitting and asset hashing
- **HTML Generation**: Custom script generates `index.html` with hashed asset references
- **CSS**: Bundled with JavaScript, no separate build step
- **Icons**: Generated programmatically for PWA support

## Environment Variables
- `AUTH_TOKEN`: Required authentication token
- `DB_HOST`: PostgreSQL host (default: localhost)
- `DB_PORT`: PostgreSQL port (default: 5432)
- `DB_NAME`: Database name
- `DB_USER`: Database user
- `DB_PASSWORD`: Database password
- `PORT`: Server port (default: `5000`)
- `MCP_SERVER_ENABLED`: Enable MCP server (default: `true`)
- `SEMANTIC_SEARCH_ENABLED`: Enable vector search (default: `false`)