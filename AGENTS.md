# Agent Instructions for MCP Markdown Manager

## Commands
- **Build**: `bun run build` (builds frontend with hashed assets)
- **Typecheck**: `bun run typecheck` (run this after changes)
- **Dev**: `bun run dev:backend` (backend) and `bun run dev:frontend` (frontend, separate terminals)
- **Docker**:
  - `bun run dc:ui` - Quick start (down, build, up in one command)
  - `docker compose up -d` - Start containers
  - `docker compose down` - Stop containers
  - `docker compose down && docker compose build --no-cache article-manager && docker compose up -d` - Full rebuild and restart
  - `docker logs mcp-markdown-manager` - View backend logs
- **Tests**: No formal test runner. Run individual scripts in `scripts/`:
  - `bun scripts/test-parsing.ts` - Markdown parsing
  - `bun scripts/test-import.ts` - Import functionality
  - `bun scripts/test-error-handling.ts` - DB error handling
  - `bun scripts/test-api-client-runtime.ts` - API Client tests
  - `bun scripts/verify-mcp.ts <AUTH_TOKEN>` - MCP server integration test (requires server running)

## Verification Strategy

### When Build/Typecheck Fails
1. **Dependency issues** (`Cannot find` or `Maybe you need to 'bun install'`):
   - Run `bun install` first, then retry verification
2. **Backend-only changes**: Use `bun run dev:backend` to verify syntax without frontend deps
3. **Frontend broken**: Backend changes can still be verified independently

### Verification Methods (in order of preference)
1. **Automated**: `bun run typecheck` (requires deps installed)
2. **Backend runtime**: `bun run dev:backend` (starts server, verifies syntax)
3. **MCP integration**:
   ```bash
   bun run dev:backend              # Terminal 1
   bun scripts/verify-mcp.ts <TOKEN> # Terminal 2
   ```
4. **Manual code review** (fallback):
   - Check matching braces/parentheses
   - Verify TypeScript type compatibility in changed sections
   - Look for similar patterns elsewhere in codebase for reference

### Pre-Commit Checklist
- [ ] Code is syntactically valid (automated or manual review)
- [ ] Changed functions maintain their interface contracts
- [ ] For critical paths (MCP init, auth, article ops): integration test when possible
- [ ] No unintended reverts of linter/formatter changes

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
