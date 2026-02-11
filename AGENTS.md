# Agent Instructions for MCP Markdown Manager

## Commands
- **Install**: `bun install` (install dependencies, run after git checkout or after adding new dependencies)
- **Build**: `bun run build` (builds frontend with hashed assets)
- **Typecheck**: `bun run typecheck` (run this after changes)
- **Dev**: `bun run dev:backend` (backend) and `bun run dev:frontend` (frontend, separate terminals)
- **Docker**:
  - `bun run dc:db` - Start the database for local testing
  - `bun run dc:ui` - Quick start (down, build, up in one command)
  - `docker compose down` - Stop containers, run when you're done testing.
  - `docker logs mcp-markdown-manager` - View backend logs
- **Tests**:
  - `bun test` - Run all unit tests (no database required)
  - `bun test --watch` - Run tests in watch mode
  - `bun test:integration` - Run integration tests (requires database via `bun run dc:db`)
  - `bun run precommit` - Full precommit suite (tests + typecheck + build)

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

Before committing code, run `bun run precommit` to ensure the project is in a valid state and has no build errors that would prevent it from running.

## Testing Strategy

The project uses a **hybrid testing approach** to balance coverage with CI/CD compatibility:

### Unit Tests (No Database Required)
Located in `test/unit/`, these tests run in CI/CD environments without docker/database:

- **Validation** (`test/unit/validation.test.ts`)
  - Input validation and sanitization
  - Security checks and boundary conditions
  - No external dependencies

- **Services** (`test/unit/services/`)
  - `articles.test.ts` - Article CRUD with mocked database
  - `accessTokens.test.ts` - Token management with mocked database
  - Tests business logic without actual database calls

- **Middleware** (`test/unit/middleware/`)
  - `auth.test.ts` - Authentication and authorization logic
  - Scope validation and token handling

- **Frontend** (`src/frontend/**/__tests__/`)
  - Component and utility tests using happy-dom

**Run unit tests:**
```bash
bun test              # Run all unit tests
bun test --watch      # Watch mode for development
```

### Integration Tests (Database Required)
Located in `test/integration/`, these tests require a PostgreSQL database:

- **Database Operations** (`test/integration/database.test.ts`)
  - Full CRUD operations with real database
  - Constraint validation
  - Migration verification
  - Access token operations

**Run integration tests:**
```bash
# 1. Start database
bun run dc:db

# 2. Run integration tests
bun test:integration

# 3. Stop database when done
docker compose down
```

### Test Coverage Focus

**Core functionality covered by unit tests:**
- ✅ Article CRUD business logic
- ✅ Input validation and security
- ✅ Authentication and authorization
- ✅ Access token management
- ✅ Slug generation and parsing

**Verified by integration tests:**
- ✅ Database schema and migrations
- ✅ SQL queries and constraints
- ✅ Transaction handling
- ✅ Real-world CRUD workflows

### When to Run Each Test Type

**During Development:**
- Run `bun test --watch` for fast feedback on logic changes
- Run `bun test:integration` before major features

**Before Committing:**
- Run `bun run precommit` which includes all unit tests

**CI/CD Pipeline:**
- Unit tests run automatically (no database required)
- Integration tests run in environments with PostgreSQL

### Writing New Tests

**Unit tests** for:
- Pure functions (parsing, validation, utilities)
- Business logic with mockable dependencies
- API/MCP handlers with mocked services

**Integration tests** for:
- Database schema changes
- Complex SQL queries
- End-to-end workflows requiring database

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
