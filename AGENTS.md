# Agent Instructions for MCP Markdown Manager

## Commands
- **Build**: `bun run build` (builds frontend with hashed assets)
- **Typecheck**: `bun run typecheck` (run this after changes)
- **Dev**: `bun run dev:backend` (backend) and `bun run dev:frontend` (frontend, separate terminals)
- **Tests**: No formal test runner. Run individual scripts in `scripts/`:
  - `bun scripts/test-parsing.ts` - Markdown parsing
  - `bun scripts/test-import.ts` - Import functionality
  - `bun scripts/test-error-handling.ts` - DB error handling
  - `bun scripts/test-api-client-runtime.ts` - API Client tests

## Code Style & Conventions
- **Runtime**: Bun (`bun run`). ESM only (`"type": "module"`).
- **Imports**: Use `.ts` extensions. Node built-ins (`fs/promises`, `path`). React for frontend.
- **Types**: Strict TypeScript. Define explicit interfaces for data structures.
- **Naming**: `camelCase` for functions/vars, `PascalCase` for Components/Interfaces.
- **Error Handling**: Services throw descriptive errors. API/MCP handlers catch & return appropriate errors.
- **Architecture**: Monolithic. Single server (`src/backend/server.ts`) handles API, MCP, static.
- **Articles**: Stored as markdown with frontmatter. Operations via `services/articles.ts`.
- **Frontend**: No state lib. `apiClient` for requests. `data-theme` for CSS theming.

## Key Rules (from Copilot/Steering)
- **Auth**: Single `AUTH_TOKEN` (Bearer) for all interfaces.
- **MCP**: Dual interface (HTTP `/mcp` + Stdio).
- **Filenames**: Auto-generated from titles via `services/articles.ts`.
- Check `.kiro/steering` for deeper docs.
