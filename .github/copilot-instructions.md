# MCP Markdown Manager - AI Coding Instructions

## Project Overview
This is a **monolithic TypeScript full-stack application** for AI-powered markdown article management.
**Stack**: Bun runtime, React frontend, Node.js backend (API + MCP), PostgreSQL + pgvector database.

## Quick Start Commands

### Essential Commands
```bash
# Install dependencies
bun install

# Start Database (Required)
bun run dc:db        # Starts Postgres container
bun run db:health    # Verify DB connection

# Development (requires two terminals)
bun run dev:backend    # Terminal 1 - Backend with auto-reload
bun run dev:frontend   # Terminal 2 - Frontend dev server

# Build
bun run build          # Builds frontend with hashed assets

# Type checking
bun run typecheck      # TypeScript validation

# Testing (Individual scripts)
bun scripts/test-parsing.ts
bun scripts/test-import.ts
bun scripts/test-error-handling.ts
```

### Environment Setup
Required environment variables (see `.env.example`):
- `AUTH_TOKEN`: Bearer token for all interfaces (Web, API, MCP)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: PostgreSQL config
- `SEMANTIC_SEARCH_ENABLED`: Enable/disable vector embeddings (default: `false`)
- `MCP_SERVER_ENABLED`: Enable/disable MCP server (default: `true`)

## Architecture Patterns

### Monolithic Structure
```
src/backend/
├── server.ts        # Entry point (API, MCP, static)
├── services/        # Business logic
│   ├── articles.ts         # Main facade (CRUD + Embeddings)
│   ├── databaseArticles.ts # DB operations
│   └── database.ts         # DB connection pool
├── mcp/             # MCP protocol implementation
└── routes/          # REST API endpoints
```

### Database-First with Compatibility Layer
- **Storage**: PostgreSQL is the source of truth.
- **Compatibility**: `services/articles.ts` maintains a file-like interface (`Article` type) for backward compatibility.
- **Filenames**: Virtual concept derived from `slug` + `.md`.
- **Vector Search**: Uses `pgvector` for semantic search. Handled via `embedding.ts` and `vectorIndex.ts`.

### Authentication
**Single Bearer Token** across all interfaces.
- Middleware: `middleware/auth.ts`
- Frontend: Stored in localStorage, injected via `apiClient`.

## Development Workflows

### Database Management
Use the provided scripts for DB operations:
- `bun run db:init`: Initialize schema (optional, app will auto setup as needed)
- `bun run db:reset`: Reset database (destructive)
- `bun run db:migrate`: Run migrations

### Frontend
- **No external state library**: Uses React state + Context.
- **API Client**: ALWAYS use `src/frontend/utils/apiClient.ts` for backend requests. It handles auth and base URLs.
- **Theming**: CSS variables with `data-theme` attribute.

## Project-Specific Conventions

### Service Layer Pattern
- **Entry Point**: `services/articles.ts` is the high-level service. Use this for all article operations.
- **Delegation**: It delegates storage to `databaseArticles.ts` and search to `vectorIndex.ts`.
- **Error Handling**: Services throw typed errors. Handlers catch and format responses.

### MCP Integration
- **Dual Interface**: HTTP (`/mcp`) and Stdio.
- **Tools**: Defined in `mcp/server.ts`, using `services/articles.ts`.

### Code Style
- **Runtime**: Bun (use `bun run`).
- **Imports**: ESM with `.ts` extensions (e.g., `import { x } from './file.ts'`).
- **Types**: Strict TypeScript. Define interfaces for all data structures.

## Key Files
- `src/backend/server.ts`: Main server setup.
- `src/backend/services/articles.ts`: Core business logic facade.
- `src/backend/services/database.ts`: Database connection.
- `src/frontend/App.tsx`: Frontend routing and layout.
