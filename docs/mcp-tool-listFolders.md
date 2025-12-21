# listFolders MCP Tool

## Overview

The `listFolders` MCP tool provides a unique list of all article folders in the knowledge repository. This allows AI Agents to get a structural overview of the repository organization without having to list all articles.

## Tool Definition

**Name:** `listFolders`

**Description:** Get a unique list of all article folders to understand the knowledge repository structure

**Input Schema:**
```json
{
  "type": "object",
  "properties": {}
}
```

No input parameters are required.

## Response Format

The tool returns a JSON array of folder paths (strings):

```json
[
  "projects/web-dev",
  "notes/personal",
  "documentation",
  "nested/folder/path"
]
```

### Response Characteristics:
- **Unique**: No duplicate folders
- **Sorted**: Folders are alphabetically sorted
- **Excludes Empty**: Only folders with at least one article are included
- **Full Paths**: Complete folder paths including nested folders

## Usage Example

### MCP Protocol Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "listFolders",
    "arguments": {}
  }
}
```

### MCP Protocol Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[\n  \"documentation\",\n  \"notes/personal\",\n  \"projects/web-dev\"\n]"
      }
    ]
  }
}
```

## Use Cases

### 1. Repository Structure Discovery
AI Agents can quickly understand how the knowledge base is organized:
```
Agent: "What folders are available?"
Tool Response: ["documentation", "projects/web-dev", "notes"]
```

### 2. Navigation Assistance
Help users navigate to specific areas:
```
Agent: "Show me all available categories"
Tool Response: Lists all folders, allowing targeted article queries
```

### 3. Organization Planning
Before creating new articles, check existing folder structure:
```
Agent: "Where should I create an article about React?"
1. Call listFolders to see existing organization
2. Suggest appropriate folder based on existing structure
```

### 4. Bulk Operations
Identify folders for batch operations:
```
1. Call listFolders to get all folders
2. For each folder, call listArticles with folder filter
3. Perform operations on articles in specific folders
```

## Implementation Details

### Backend Service Chain

```
MCP Tool (listFolders)
  → articles.getFolders()
    → databaseArticleService.getFolderHierarchy()
      → SQL: SELECT DISTINCT folder FROM articles WHERE folder != '' ORDER BY folder
```

### Code Location

- **Tool Definition**: `src/backend/mcp/server.ts` (lines 186-194)
- **Tool Handler**: `src/backend/mcp/server.ts` (lines 399-411)
- **Service Function**: `src/backend/services/articles.ts` (line 191-193)
- **Database Query**: `src/backend/services/databaseArticles.ts` (line 495-504)

## Testing

### Unit Test
```bash
bun scripts/test-list-folders.ts
```

### Integration Test (requires database)
```bash
# Set up environment
cp .env.example .env
# Edit .env with AUTH_TOKEN and DB_PASSWORD

# Start database
docker-compose up -d postgres

# Run integration test
bun scripts/test-list-folders-integration.ts
```

## Error Handling

The tool gracefully handles error conditions:

- **Database Connection Error**: Returns empty array `[]`
- **No Folders**: Returns empty array `[]`
- **Permission Issues**: Returns MCP error response with details

## Related Tools

- **listArticles**: List all articles (optionally filtered by folder)
- **searchArticles**: Search articles by title
- **createArticle**: Create article with optional folder assignment
- **updateArticle**: Update article including folder changes

## Benefits for AI Agents

1. **Efficiency**: Get folder structure without fetching all article metadata
2. **Context**: Understand repository organization before querying
3. **Navigation**: Guide users to relevant content areas
4. **Organization**: Suggest appropriate folders for new content
5. **Discovery**: Help users explore available categories

## Example Workflow

```
1. Agent receives user query: "What's in this knowledge base?"

2. Call listFolders:
   Response: ["documentation", "projects", "notes", "tutorials"]

3. Agent responds: "This knowledge base has 4 main areas:
   - documentation
   - projects
   - notes
   - tutorials
   
   Would you like to explore any of these areas?"

4. User: "Show me projects"

5. Call listArticles with folder="projects":
   Response: [list of articles in projects folder]

6. Agent presents relevant articles to user
```
