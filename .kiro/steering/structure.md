---
inclusion: always
---

# Project Structure & Organization

## Architecture Rules
- **Monolithic Design**: Single server handles API, MCP, and static file serving
- **Service Layer Pattern**: All business logic in `src/backend/services/` - shared between API and MCP
- **Database Storage**: Articles stored in PostgreSQL database with full-text search
- **Structured Data**: Articles stored with metadata, content, and version history in database tables
- **Generated Assets**: Never edit files in `public/` - they're built by scripts

## Directory Structure
```
src/
├── backend/
│   ├── server.ts           # MAIN SERVER - handles all requests
│   ├── routes/api.ts       # REST API endpoints only
│   ├── mcp/server.ts       # MCP server implementation
│   ├── middleware/auth.ts  # Bearer token validation
│   └── services/           # BUSINESS LOGIC LAYER
│       ├── articles.ts     # Article CRUD - use for all database operations
│       ├── database.ts     # Database connection and query utilities
│       ├── embedding.ts    # Vector search functionality
│       └── vectorIndex.ts  # Search index management
└── frontend/
    ├── App.tsx             # Main app with manual routing
    ├── components/         # Reusable UI components
    ├── pages/              # Page-level components
    ├── hooks/              # Custom React hooks
    └── styles/main.css     # Single CSS file for all styles
```

## File Organization Rules
- **New Components**: Add to `src/frontend/components/` if reusable, `src/frontend/pages/` if page-specific
- **New Services**: Add to `src/backend/services/` - must be importable by both API and MCP
- **Imports**: Use relative paths within same layer, absolute from `src/` for cross-layer
- **No Nested Folders**: Keep component and service directories flat

## Naming Conventions
- **React Components**: PascalCase (e.g., `ArticleList.tsx`)
- **Services/Utilities**: camelCase (e.g., `articles.ts`, `generateFilename`)
- **Types/Interfaces**: PascalCase (e.g., `Article`, `ArticleMetadata`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_PORT`)

## Database Schema Patterns
```sql
-- Core articles table
articles (
  id, slug, title, content, 
  created_at, updated_at, is_public
)

-- Version history table
article_versions (
  id, article_id, version_number, title, content,
  created_at, change_summary
)

-- Full-text search indexes
CREATE INDEX articles_search_idx ON articles 
USING gin(to_tsvector('english', title || ' ' || content));
```

## Key Implementation Rules
- **Article Operations**: Always use `services/articles.ts` - never direct database access
- **Database Access**: All queries through `services/database.ts` connection pool
- **Authentication**: All routes except static files require bearer token validation
- **State Management**: React hooks + localStorage only - no Redux/Zustand
- **Routing**: Manual routing in `App.tsx` - no React Router dependency
- **CSS**: Single file with CSS custom properties for theming
- **Error Handling**: Services throw errors, HTTP handlers return status codes
- **Transactions**: Use database transactions for multi-table operations (articles + versions)

## Build System
- **Frontend Build**: `bun run build` generates hashed assets in `public/`
- **HTML Generation**: `scripts/build-html.cjs` creates `index.html` with asset references
- **Development**: Run `bun run dev:backend` and `bun run dev:frontend` in separate terminals
- **Asset Hashing**: All JS/CSS files get content-based hashes for cache busting