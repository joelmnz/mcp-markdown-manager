# Agent Instructions for MCP Markdown Manager

## Agent Steering
- Always check `.kiro/steering` dir for additional project documentation and rules before starting complex tasks.

## Commands
- **Build**: `bun run build` (builds frontend with hashed assets)
- **Typecheck**: `bun run typecheck`
- **Dev**: `bun run dev:backend` (backend) and `bun run dev:frontend` (frontend, separate terminals)
- **Tests**: Manual test scripts in `scripts/` directory (no formal test framework)
  - `bun scripts/test-parsing.ts` - Test markdown parsing functions
  - `bun scripts/test-import.ts` - Test article import functionality  
  - `bun scripts/test-import-logic.ts` - Test import logic without database
  - `bun scripts/test-error-handling.ts` - Test database error handling

## Environment Variables
- **AUTH_TOKEN**: Authentication token for all interfaces (required)
- **DATA_DIR**: Directory where markdown articles are stored (default: ./data)
- **PORT**: Server port (default: 5000)
- **MCP_SERVER_ENABLED**: Enable/disable MCP server (case insensitive: true/True/TRUE, default: true)

## Code Style
- **Runtime**: Bun (use `bun run`, not `npm`)
- **Modules**: ESM only (`"type": "module"` in package.json, `.ts` extensions in imports allowed)
- **Imports**: Node built-ins from `fs/promises`, `path`; React imports for frontend; MCP SDK for backend
- **Types**: Strict TypeScript (`strict: true`), explicit interfaces for data structures (e.g., `Article`, `ArticleMetadata`)
- **Naming**: camelCase for functions/variables, PascalCase for React components and interfaces
- **Error Handling**: Services throw descriptive errors; HTTP handlers return status codes; MCP handlers return `isError: true`
- **File System**: All article operations through `services/articles.ts` (DB-backed); `fs` used for imports/backups
- **Frontend**: No state library; localStorage for persistence; props drilling; custom routing in `App.tsx`
- **CSS**: Custom properties with `data-theme` attribute for theming; mobile-first responsive design

## Key Patterns
- **Monolithic**: Single server (`src/backend/server.ts`) handles API, MCP, and static serving
- **Auth**: Single bearer token validated in `middleware/auth.ts`, stored in localStorage on frontend
- **Title Hierarchy**: frontmatter `title` → first `#` heading → "Untitled"
- **Filename Generation**: Auto-generated from title via `generateFilename()` in `services/articles.ts`
