# Semantic Search Feature Guide

## Overview

The MCP Markdown Manager now includes optional RAG-style semantic search using vector embeddings. This allows you to search articles based on meaning rather than just keywords, providing more intelligent and context-aware results.

## Quick Start

### 1. Enable Semantic Search

Add to your `.env` file:

```bash
SEMANTIC_SEARCH_ENABLED=true
```

### 2. Choose Embedding Provider

**Option A: Ollama (Recommended - Local & Free)**

```bash
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_BASE_URL=http://localhost:11434
```

Install Ollama:
```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Pull the embedding model
ollama pull nomic-embed-text
```

**Option B: OpenAI**

```bash
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=sk-your-api-key-here
```

### 3. Build Initial Index

```bash
bun run reindex
```

This processes all existing articles and creates the vector index.

## How It Works

### Architecture

```
Article Creation/Update
       ↓
   Parse & Clean Content
       ↓
   Split into Chunks (by headings + size)
       ↓
   Generate Embeddings (Ollama/OpenAI)
       ↓
   Store in Vector Index (JSONL)
       ↓
   Ready for Semantic Search
```

### Chunking Strategy

1. **Heading-based splitting**: Content is first divided by markdown headings
2. **Size-based chunking**: Each section is further split into chunks of ~500 words
3. **Overlap**: 50-word overlap between chunks to preserve context
4. **Metadata preservation**: Each chunk retains filename, title, heading path, timestamps

### Vector Index Format

Stored in `DATA_DIR/index.vectors.jsonl`:

```json
{
  "id": "article.md#0",
  "filename": "article.md",
  "title": "Article Title",
  "headingPath": ["# Main", "## Section"],
  "chunkIndex": 0,
  "text": "Full chunk text...",
  "vector": [0.123, 0.456, ...],
  "contentHash": "a1b2c3...",
  "created": "2025-01-15T10:00:00Z",
  "modified": "2025-01-15T11:00:00Z"
}
```

### Search Process

1. User submits query
2. Query is embedded using same model
3. Cosine similarity computed against all chunk vectors
4. Top K results returned with scores
5. Results include snippet, heading path, and similarity score

## Usage Examples

### Web UI

1. Navigate to the home page
2. Toggle "Semantic Search" radio button
3. Enter your search query
4. Results show relevant chunks with similarity scores and context

### REST API

```bash
curl -X GET "http://localhost:5000/api/search?query=neural+networks&k=5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
[
  {
    "chunk": {
      "filename": "deep-learning.md",
      "title": "Deep Learning Neural Networks",
      "headingPath": ["# Deep Learning", "## Architecture", "### CNNs"],
      "text": "CNNs are particularly effective for image recognition..."
    },
    "score": 0.87,
    "snippet": "CNNs are particularly effective for image recognition and computer vision tasks. They use convolutional layers..."
  }
]
```

### MCP Tool

```json
{
  "method": "tools/call",
  "params": {
    "name": "semanticSearch",
    "arguments": {
      "query": "how to train machine learning models",
      "k": 10
    }
  }
}
```

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEMANTIC_SEARCH_ENABLED` | `false` | Enable/disable semantic search |
| `EMBEDDING_PROVIDER` | `ollama` | Provider: `ollama` or `openai` |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model name |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OPENAI_API_KEY` | - | OpenAI API key (if using OpenAI) |
| `CHUNK_SIZE` | `500` | Words per chunk |
| `CHUNK_OVERLAP` | `50` | Overlapping words between chunks |

### Recommended Settings

**For Research/Long Articles:**
```bash
CHUNK_SIZE=1000
CHUNK_OVERLAP=100
```

**For Short Notes:**
```bash
CHUNK_SIZE=300
CHUNK_OVERLAP=30
```

**For Maximum Precision:**
```bash
CHUNK_SIZE=200
CHUNK_OVERLAP=20
```

## Maintenance

### Reindexing

Rebuild the entire index:
```bash
bun run reindex
```

When to reindex:
- After changing embedding model
- After changing chunk size/overlap settings
- If index becomes corrupted
- To incorporate bulk-imported articles

### Index Statistics

Check index health via REST API:
```bash
curl -X GET "http://localhost:5000/api/index/stats" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Disk Usage

The vector index grows with your article collection:
- ~1KB per chunk (depends on embedding dimension)
- Average article: 5-10 chunks
- 100 articles ≈ 500-1000 chunks ≈ 500KB-1MB index

## Troubleshooting

### Ollama Connection Errors

**Problem**: `Error generating embedding: Failed to connect to Ollama`

**Solution**:
1. Check Ollama is running: `ollama list`
2. Verify base URL: `curl http://localhost:11434`
3. Pull model: `ollama pull nomic-embed-text`

### Slow Indexing

**Problem**: Reindexing takes too long

**Solutions**:
- Use local Ollama instead of OpenAI
- Reduce chunk overlap
- Increase chunk size
- Process in batches

### Empty Search Results

**Problem**: Semantic search returns no results

**Checks**:
1. Index exists: `ls -lh DATA_DIR/index.vectors.jsonl`
2. Index has content: `wc -l DATA_DIR/index.vectors.jsonl`
3. Semantic search enabled: check `.env`
4. Run reindex: `bun run reindex`

### High Memory Usage

**Problem**: Server uses too much memory

**Solutions**:
- Use streaming for large indices
- Reduce chunk size
- Consider SQLite vector store (future enhancement)

## Performance

### Benchmarks (1000 articles)

| Operation | Ollama (local) | OpenAI (API) |
|-----------|----------------|--------------|
| Embed single chunk | ~50ms | ~200ms |
| Reindex 1000 articles | ~5 min | ~15 min |
| Search query | ~100ms | ~100ms |
| Memory usage | ~200MB | ~150MB |

### Optimization Tips

1. **Use Ollama for development**: No API costs, faster iteration
2. **Batch processing**: Reindex during off-hours
3. **Index incrementally**: Auto-indexing on create/update
4. **Cache embeddings**: Content hash prevents re-embedding unchanged chunks

## Security Considerations

- Embedding vectors stored in plain JSONL (not encrypted)
- OpenAI API key should be kept secret
- Index file should not be publicly accessible
- Use local Ollama for sensitive content

## Future Enhancements

Potential improvements being considered:
- SQLite vector store for better performance
- Hybrid search (combine title + semantic)
- Multi-model embedding support
- Embedding cache layer
- Incremental index updates
- Vector compression
- GPU acceleration for embeddings

## API Reference

See main README.md for complete API documentation:
- REST endpoint: `GET /api/search`
- MCP tool: `semanticSearch`

## Support

For issues or questions:
- GitHub Issues: https://github.com/joelmnz/mcp-markdown-manager/issues
- Documentation: README.md
