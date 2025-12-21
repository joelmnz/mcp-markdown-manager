# MCP Markdown Manager - AI Coding Instructions

## Project Overview
This is a **monolithic TypeScript full-stack application** for AI-powered markdown article management with three interfaces: Web UI, REST API, and MCP server. Built with Bun runtime for fast TypeScript execution.

## Quick Start Commands

### Essential Commands
```bash
# Install dependencies
bun install

# Development (requires two terminals)
bun run dev:backend    # Terminal 1 - Backend with auto-reload
bun run dev:frontend   # Terminal 2 - Frontend dev server

# Build
bun run build          # Builds frontend with hashed assets

# Production
bun run start          # Run production server

# Type checking
bun run typecheck      # TypeScript validation
```

### Environment Setup
Required environment variables (see `.env.example`):
- `AUTH_TOKEN` - Authentication token for all interfaces (required)
- `DB_PASSWORD` - Database password
- `DATA_DIR` - Optional, only required if you want to import markdown articles
- `PORT` - Server port (default: `5000`)
- `MCP_SERVER_ENABLED` - Enable/disable MCP server (default: `true`)

### Testing
No formal test suite (POC project). When adding features, manually test:
1. Web UI at `http://localhost:5000`
2. REST API at `http://localhost:5000/api/*`
3. MCP endpoint at `http://localhost:5000/mcp`

## Architecture Patterns

### Monolithic Structure with Clear Boundaries
```
src/backend/
├── server.ts        # Single entry point - handles all routing (API, MCP, static)
├── services/        # Shared business logic (articles CRUD)
├── mcp/            # MCP protocol implementation
├── routes/         # REST API endpoints  
└── middleware/     # Authentication layer
```

**Key Insight**: One server handles everything - API requests, MCP protocol, and static file serving. The routing logic in `server.ts` determines which handler processes each request based on URL patterns.

### File-Based Storage with Frontmatter
Articles are stored as markdown files with YAML frontmatter:
```markdown
---
title: Article Title
created: 2025-01-15T10:30:00Z  
---
# Article content...
```

**Critical Pattern**: Title extraction follows a hierarchy: frontmatter `title` → first `#` heading → "Untitled". Filename generation is automatic from titles using `generateFilename()` in `services/articles.ts`.

### Authentication Strategy
**Single Bearer Token** across all interfaces (Web, API, MCP). Token validation happens in:
- `middleware/auth.ts` - Core auth functions
- Individual handlers check `Authorization: Bearer <token>` header
- Frontend stores token in localStorage

## Development Workflows

### Development Setup (Two Terminals Required)
```bash
# Terminal 1 - Backend with auto-reload
bun run dev:backend

# Terminal 2 - Frontend dev server  
bun run dev:frontend
```

### Build Process (Multi-stage)
```bash
bun run build  # Builds frontend with hash-named chunks
# Generates: public/App.[hash].js, App.[hash].css, index.html
```

**Important**: Build script dynamically generates `index.html` with correct hash-named asset references via Node.js inline script.

### Docker Patterns
Multi-stage build separates frontend compilation from runtime:
1. Stage 1: Build frontend assets
2. Stage 2: Copy backend + built assets, run production

## Project-Specific Conventions

### MCP Integration (Unique Pattern)
The project implements **dual MCP interfaces**:
- HTTP endpoint (`/mcp`) for web-based AI agents
- Stdio transport for command-line MCP clients

Both share the same tool definitions in `mcp/server.ts` but handle transport differently.

### Frontend State Management
**No external state library** - uses built-in React patterns:
- Route state via custom router in `App.tsx`
- localStorage for persistence (token, theme)
- Props drilling for simple data flow

### CSS Architecture
**CSS Custom Properties** for theming with `data-theme` attribute:
```css
:root[data-theme="dark"] { --bg-primary: #1a1a1a; }
:root[data-theme="light"] { --bg-primary: #ffffff; }
```

Theme switching updates `document.documentElement.setAttribute('data-theme', theme)`.

## Integration Patterns

### Service Layer Pattern
`services/articles.ts` contains all business logic:
- File I/O operations
- Frontmatter parsing/generation
- Title extraction and filename generation
- Error handling

Both REST API and MCP server import and use these services directly - **no duplication**.

### Error Handling Strategy
- Services throw errors with descriptive messages
- HTTP handlers catch and return appropriate status codes
- MCP handlers catch and return `isError: true` responses
- Frontend shows user-friendly error messages

### File System Integration
Articles stored in configurable `DATA_DIR` (default `/data`):
- Server ensures directory exists at startup
- All file operations go through Node.js `fs/promises`
- Frontmatter parsing handles missing metadata gracefully

## Key Files for Understanding

- `src/backend/server.ts` - Main routing and server setup
- `src/backend/services/articles.ts` - Core business logic and file patterns
- `src/frontend/App.tsx` - Client-side routing and state management
- `src/frontend/styles/main.css` - CSS architecture and theming
- `package.json` - Build scripts and Bun-specific patterns

## Development Notes

- **Bun Runtime**: Use `bun run` for all scripts, not `npm`
- **TypeScript**: ESM modules with `"type": "module"` in package.json
- **No Database**: Intentionally file-based for simplicity
- **Single User**: No multi-tenancy - designed for personal/AI agent use
- **Mobile-First**: Responsive design starts with mobile styles

## Code Style and Conventions

### TypeScript Standards
- Strict mode enabled (`strict: true` in tsconfig.json)
- Explicit interfaces for data structures (e.g., `Article`, `ArticleMetadata`)
- ESM imports only - `.ts` extensions allowed in imports
- Node built-ins from `fs/promises`, `path`

### Naming Conventions
- `camelCase` for functions and variables
- `PascalCase` for React components and TypeScript interfaces
- Descriptive names that reflect purpose

### Import Organization
```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises';
import path from 'path';

// 2. External dependencies
import { Server } from '@modelcontextprotocol/sdk';

// 3. Internal modules
import { validateAuth } from './middleware/auth';
```

### Error Handling
- Services throw errors with descriptive messages
- HTTP handlers catch and return appropriate status codes (400, 401, 404, 500)
- MCP handlers catch and return `{ isError: true, content: [...] }` responses
- Frontend shows user-friendly error messages via alert/notification

## Testing Philosophy
This is a POC with no formal tests. When adding tests:
- Test business logic in `services/articles.ts`
- Mock file system operations
- Test MCP tool schemas and responses
- Test frontend component rendering and interactions

## Common Development Tasks

### Adding a New REST API Endpoint
1. Define route handler in `src/backend/routes/api.ts`
2. Add authentication check using `validateAuth()` from middleware
3. Use service functions from `services/articles.ts` for business logic
4. Return appropriate HTTP status codes and JSON responses

### Adding a New MCP Tool
1. Add tool definition to `mcp/server.ts` in the tools list
2. Implement handler in the switch statement
3. Use same service functions from `services/articles.ts`
4. Return MCP-formatted responses with `content` array

### Modifying the Frontend
1. React components in `src/frontend/components/`
2. Page components in `src/frontend/pages/`
3. All styles in `src/frontend/styles/main.css`
4. Update `App.tsx` for routing changes
5. Use `localStorage.getItem('auth-token')` for authentication

### Working with Articles
- All article operations go through `services/articles.ts`
- Articles are markdown files with YAML frontmatter
- Title extraction: frontmatter `title` → first `#` heading → "Untitled"
- Filenames auto-generated via `generateFilename()` - no manual naming

## Deployment
- Docker multi-stage build via `Dockerfile`
- Production uses `bun run start`
- See `DEPLOYMENT.md` for detailed deployment instructions
- All interfaces (Web, API, MCP) use same `AUTH_TOKEN` for security