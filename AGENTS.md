# Agent Instructions for MCP Markdown Manager

## Commands
- **Build**: `bun run build` (builds frontend with hashed assets)
- **Typecheck**: `bun run typecheck`
- **Dev**: `bun run dev:backend` (backend) and `bun run dev:frontend` (frontend, separate terminals)
- **Tests**: No formal test suite (POC project)

## Code Style
- **Runtime**: Bun (use `bun run`, not `npm`)
- **Modules**: ESM only (`"type": "module"` in package.json, `.ts` extensions in imports allowed)
- **Imports**: Node built-ins from `fs/promises`, `path`; React imports for frontend; MCP SDK for backend
- **Types**: Strict TypeScript (`strict: true`), explicit interfaces for data structures (e.g., `Article`, `ArticleMetadata`)
- **Naming**: camelCase for functions/variables, PascalCase for React components and interfaces
- **Error Handling**: Services throw descriptive errors; HTTP handlers return status codes; MCP handlers return `isError: true`
- **File System**: All article operations through `services/articles.ts`; markdown files with YAML frontmatter in `DATA_DIR`
- **Frontend**: No state library; localStorage for persistence; props drilling; custom routing in `App.tsx`
- **CSS**: Custom properties with `data-theme` attribute for theming; mobile-first responsive design

## Key Patterns
- **Monolithic**: Single server (`src/backend/server.ts`) handles API, MCP, and static serving
- **Auth**: Single bearer token validated in `middleware/auth.ts`, stored in localStorage on frontend
- **Title Hierarchy**: frontmatter `title` → first `#` heading → "Untitled"
- **Filename Generation**: Auto-generated from title via `generateFilename()` in `services/articles.ts`
