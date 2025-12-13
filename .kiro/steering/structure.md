---
inclusion: always
---

# Project Structure & Organization

## Root Directory
```
article_manager/
├── src/                    # Source code
├── public/                 # Built frontend assets (generated)
├── scripts/                # Build and utility scripts
├── data/                   # Article storage (gitignored)
├── .kiro/                  # Kiro configuration
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── Dockerfile              # Container build
└── docker-compose.yml      # Container orchestration
```

## Source Structure
```
src/
├── backend/
│   ├── server.ts           # Main server (API + MCP + static)
│   ├── routes/
│   │   └── api.ts          # REST API endpoints
│   ├── mcp/
│   │   └── server.ts       # MCP server implementation
│   ├── middleware/
│   │   └── auth.ts         # Bearer token authentication
│   └── services/
│       ├── articles.ts     # Article CRUD operations
│       ├── chunking.ts     # Text chunking for search
│       ├── embedding.ts    # Vector embedding service
│       └── vectorIndex.ts  # Search index management
└── frontend/
    ├── App.tsx             # Main app with routing
    ├── components/         # Reusable React components
    ├── pages/              # Page-level components
    ├── hooks/              # Custom React hooks
    └── styles/
        └── main.css        # All CSS styles
```

## Key Patterns
- **Monolithic Server**: Single `server.ts` handles all requests
- **Service Layer**: Business logic in `services/` shared between API and MCP
- **Component Organization**: Pages vs reusable components
- **No State Library**: React hooks + localStorage for state
- **Custom Routing**: Manual routing in `App.tsx`, no React Router

## File Naming Conventions
- **Components**: PascalCase (e.g., `ArticleList.tsx`)
- **Services**: camelCase (e.g., `articles.ts`)
- **Interfaces**: PascalCase (e.g., `Article`, `ArticleMetadata`)
- **Functions**: camelCase (e.g., `generateFilename`)

## Data Storage
```
data/
├── article-1.md            # Markdown files with frontmatter
├── article-2.md
├── article-1.md.public     # Public marker files
└── .versions/              # Version history
    └── article-1/
        ├── manifest.json   # Version metadata
        ├── v1.md          # Version snapshots
        └── v2.md
```

## Generated Assets
```
public/
├── index.html              # Generated HTML with asset hashes
├── App.[hash].js           # Bundled JavaScript
├── App.[hash].css          # Bundled CSS
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── icon-192.png           # PWA icons
└── icon-512.png
```