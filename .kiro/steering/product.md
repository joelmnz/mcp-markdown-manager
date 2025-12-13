---
inclusion: always
---

# MCP Markdown Manager - Product Overview

A full-stack TypeScript monolithic markdown article management system designed for AI agents to save and manage research content. This self-hosted single-user system handles hundreds of markdown articles with multiple interfaces.

## Core Features
- **Markdown Articles**: File-based storage with YAML frontmatter
- **Dual Interface**: Web UI for humans, MCP server for AI agents
- **Search**: Title search + optional semantic search with vector embeddings
- **PWA Support**: Offline access, installable web app
- **Theming**: Dark/light mode with CSS custom properties
- **Authentication**: Single bearer token for all interfaces

## Architecture
- **Monolithic**: Single server handles API, MCP, and static serving
- **File-Based**: Articles stored as `.md` files in DATA_DIR
- **No Database**: Simple filesystem storage with version history
- **Single User**: Bearer token authentication only

## Content Management
- **Title Resolution**: frontmatter.title → first # heading → "Untitled"
- **Filename Generation**: Auto-generated from title, sanitized for filesystem
- **Flat Structure**: No nested folders in DATA_DIR
- **Version History**: Automatic snapshots in `.versions` directory