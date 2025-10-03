# Article Manager - AI Coding Instructions

## Project Overview
This is a **monolithic TypeScript full-stack application** for AI-powered article management with three interfaces: Web UI, REST API, and MCP server. Built with Bun runtime for fast TypeScript execution.

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

## Testing Philosophy
This is a POC with no formal tests. When adding tests:
- Test business logic in `services/articles.ts`
- Mock file system operations
- Test MCP tool schemas and responses
- Test frontend component rendering and interactions