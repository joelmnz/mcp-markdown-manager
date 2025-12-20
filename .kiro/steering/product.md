---
inclusion: always
---

# MCP Markdown Manager - Product Overview

A full-stack TypeScript monolithic markdown article management system designed for AI agents to save and manage research content. This self-hosted single-user system handles hundreds of markdown articles with dual interfaces for both human and AI interaction.

## Core Product Principles
- **AI-First Design**: Primary interface is MCP server for AI agents, web UI is secondary
- **Single User System**: No multi-tenancy, one bearer token for all access
- **Database-Driven**: PostgreSQL storage with full-text search capabilities
- **Monolithic Architecture**: Single server handles all concerns (API, MCP, static files)
- **Zero Configuration**: Works out-of-the-box with minimal setup

## Key Features & Capabilities
- **Article Management**: Create, read, update, delete markdown articles with metadata
- **Dual Interface**: REST API + MCP server for programmatic access, React web UI for humans
- **Search Systems**: PostgreSQL full-text search + optional semantic search with vector embeddings
- **Version Control**: Automatic version history tracking for all article changes
- **PWA Support**: Offline-capable web app with service worker and manifest
- **Theming**: Dark/light mode with CSS custom properties
- **Authentication**: Bearer token validation across all interfaces

## Architecture Constraints
- **Database Storage**: All articles stored in PostgreSQL with structured schema
- **Service Layer**: Business logic centralized in `src/backend/services/` for sharing between API and MCP
- **No External Dependencies**: Self-contained system with optional Ollama/OpenAI integration
- **Folder Organization**: Hierarchical structure with support for nested folders (e.g., "projects/web-dev")
- **Immutable History**: Version snapshots preserved, never deleted

## Content Management Rules
- **Title Resolution Priority**: `frontmatter.title` → first `# heading` → "Untitled"
- **Slug Generation**: Auto-generated from title, URL-safe, unique across system
- **Markdown Standard**: GitHub Flavored Markdown with YAML frontmatter support
- **Public/Private**: Articles can be marked public for unauthenticated access
- **Metadata Tracking**: Created/updated timestamps, change summaries, version numbers

## Interface Specifications
- **MCP Server**: Provides `create_article`, `get_article`, `update_article`, `delete_article`, `search_articles` tools
- **REST API**: Standard CRUD endpoints at `/api/articles/*` with JSON responses
- **Web UI**: Single-page React app with manual routing, no external state management
- **Authentication**: Bearer token in `Authorization` header or localStorage for web UI

## Development Guidelines
- **Database First**: Always implement database operations in services layer first
- **Error Handling**: Services throw errors, HTTP/MCP handlers convert to appropriate responses
- **Transaction Safety**: Use database transactions for multi-table operations
- **Search Integration**: Full-text search always available, vector search optional feature
- **Asset Management**: Frontend builds to hashed assets, never edit `public/` directly