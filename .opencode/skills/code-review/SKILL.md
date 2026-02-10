---
name: code-review
description: Code review checklist for this MCP Markdown Manager project (enforces AGENTS.md)
license: MIT
compatibility: opencode
metadata:
  audience: developers
  project: mcp-markdown-manager
  stack: bun-typescript-react
---

## What I Do

Enforce AGENTS.md rules during PR review (architecture layering, TypeScript discipline, DB safety, auth, MCP protocol, tests).

## Core Checklist (Must Enforce)

### Architecture / Boundaries
- Layering: Routes/Handlers (`routes/`) → Service Facade (`services/articles.ts`) → DB Services (`databaseArticles.ts`, `databaseVersionHistory.ts`, `databaseEmbedding.ts`) → PostgreSQL
- Single server: `src/backend/server.ts` handles API, MCP, and static serving
- Routes = orchestration only (auth check → validate input → call service → format response)
- Services throw descriptive errors; handlers catch and return HTTP status codes
- Use the facade: handlers call `articleService`, **never** import DB services directly
- Filenames are virtual: `slug` + `.md` (use `slugToFilename` / `filenameToSlug`)

### TypeScript / Imports (CRITICAL)
- Strict mode: no `any`, no `@ts-ignore`, no `@ts-expect-error`
- Explicit interfaces for all data structures
- ESM only with `.ts` extensions in imports (e.g., `from './file.ts'`)
- Node built-ins via bare specifiers (`fs/promises`, `path`)
- Naming: `camelCase` functions/vars, `PascalCase` Components/Interfaces, `SCREAMING_SNAKE_CASE` constants
- If you see type suppression: **block the review** until fixed

### Database Operations
- Parameterized queries only (`$1, $2` placeholders) — **never** string interpolation in SQL
- Connection pooling: use `databaseService.getClient()`, never create `Pool` instances
- Always `client.release()` in `finally` blocks — no resource leaks
- Wrap DB operations in try-catch, use `handleDatabaseError()`

### Authentication & Security
- All write endpoints: `requireAuth(request, 'write')` with scope check
- All read endpoints: `requireAuth(request)` (read-only scope minimum)
- Web-only endpoints (token management): `useWebAuth: true`
- Bearer tokens: `Authorization: Bearer <token>` — never log full tokens
- Input validation via `mcp/validation.ts` helpers
- Path traversal prevention (no `../` in filenames/slugs)
- DOMPurify for user content on frontend

### Frontend (React)
- State: `useState`, `useContext`, custom hooks — **no** Redux/Zustand/MobX
- API calls: use `apiClient` — **never** raw `fetch()` with hardcoded paths
- Theming: CSS variables + `data-theme` attribute — no inline theme colors
- Functional components with hooks only — no class components
- URL paths: use `buildRouteUrl` / `buildApiUrl` — **never** hardcode paths (breaks subpath deployment)

### MCP Protocol
- Tool definitions in `mcp/server.ts`, handlers in `mcp/handlers.ts`
- Filter tools by token scope (read-only vs write)
- Validate ALL tool arguments via `validation.ts`
- Return format: `{ content: [{ type: 'text', text: JSON.stringify(data) }] }`

### Embeddings / Performance
- Embedding operations **must not block** article CRUD — use `safelyHandleEmbeddingOperation()`
- Queue via `embeddingQueueService.enqueue()` with priority levels
- Article operations succeed even if embeddings fail (graceful degradation)

### Explicit Anti-patterns (Flag)
- `as any`, `@ts-ignore`, `@ts-expect-error` (type suppression)
- String concatenation in SQL queries (injection risk)
- `client.query()` without `try/finally` with `client.release()` (resource leak)
- Direct import of `databaseArticles.ts` from routes/handlers (bypass facade)
- Raw `fetch('/api/...')` in frontend (bypasses apiClient + base path)
- Hardcoded URL paths in frontend (breaks nginx subpath deployment)
- `await upsertArticleChunks()` synchronously blocking article CRUD
- Empty catch blocks `catch(e) {}` (swallowed errors)
- Unauthenticated write operations
- Unwanted files in git (logs, traces, `.env`, credentials)

## Review Flow (Fast)

1) Identify layer by path (Route / Service / DB Service / Frontend / MCP)
2) Apply the layer checks below + cross-cutting checks (TypeScript, auth, errors)
3) Report using the template; require `bun run typecheck` and `bun run precommit` for approval

## Layer Checks

**Routes/Handlers (`routes/`):** Auth check with correct scope; input validation; call `articleService` only; proper HTTP status codes; no business logic; no DB imports.

**Service Facade (`services/articles.ts`):** Throw descriptive errors; orchestrate DB services + embeddings; no HTTP objects; no raw DB queries.

**DB Services (`database*.ts`):** Parameterized queries only; `client.release()` in finally; `handleDatabaseError()` on catch; return domain objects.

**Frontend (`.tsx`):** React hooks only; `apiClient` for requests; CSS variables for theming; `buildRouteUrl`/`buildApiUrl` for paths; no state management libraries.

**MCP (`mcp/`):** Validate all args via `validation.ts`; scope-filtered tools; proper MCP response format; delegate to `articleService`.

## Review Output Template

```
## Summary
[Critical/High/Medium/Low] + 1-2 sentences

## Critical (Must Fix)
1. [file:line] problem → fix → AGENTS.md ref

## Recommendations
- ...

## Action Items
- [ ] ...

## Required Checks
- bun run typecheck
- bun run precommit
(- bun run build if frontend changed)
(- bun scripts/verify-mcp.ts <TOKEN> if MCP changed)
```
