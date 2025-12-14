# Import Utility Guide

The import utility allows you to migrate existing markdown files into the MCP Markdown Manager database backend. This guide covers all aspects of using the import system.

## Overview

The import utility processes markdown files with YAML frontmatter and imports them into the PostgreSQL database, extracting metadata into structured fields and storing clean markdown content.

## Quick Start

```bash
# Validate import (no changes made)
bun run import validate ./path/to/markdown/files

# Preview what would be imported
bun run import preview ./path/to/markdown/files

# Import with interactive conflict resolution
bun run import import ./path/to/markdown/files --conflict interactive
```

## Commands

### validate

Validates markdown files without making any changes to the database.

```bash
bun run import validate <directory> [options]
```

**Purpose**: Check if files can be imported and identify potential issues.

**Output**:
- Total files found
- Validation status
- Conflicts detected
- Parsing errors

**Example**:
```bash
bun run import validate ./articles
# Output:
# Validation Results:
#   Total files: 25
#   Valid: Yes
#   Conflicts: 2
#   Errors: 0
```

### preview

Shows detailed preview of what would be imported.

```bash
bun run import preview <directory> [options]
```

**Purpose**: Get detailed information about each file before importing.

**Output**:
- File-by-file breakdown
- Extracted metadata
- Conflict details
- Folder structure

**Example**:
```bash
bun run import preview ./articles --preserve-folders
# Shows detailed preview of each file with metadata
```

### stats

Displays import statistics and success rate.

```bash
bun run import stats <directory> [options]
```

**Purpose**: Get high-level statistics about the import.

**Output**:
- File counts
- Success rate
- Conflict summary

### import

Performs the actual import operation.

```bash
bun run import import <directory> [options]
```

**Purpose**: Import files into the database.

**Features**:
- Interactive conflict resolution
- Progress reporting
- Batch processing
- Dry-run mode

## Options

### Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--preserve-folders` | Maintain directory structure as article folders | false |
| `--use-title-slug` | Generate slugs from titles instead of filenames | false |
| `--dry-run` | Show what would be imported without making changes | false |

### Import-Specific Options

| Option | Description | Default |
|--------|-------------|---------|
| `--conflict <action>` | How to handle conflicts: skip, rename, overwrite, interactive | interactive |
| `--batch-size <n>` | Number of files to process per batch | 50 |

## Conflict Resolution

### Conflict Types

**Title Conflicts**: Multiple files with the same title
**Slug Conflicts**: Multiple files that would generate the same URL slug

### Resolution Strategies

#### interactive (Default)
Prompts for each conflict with options:
- Skip conflicting files
- Overwrite existing articles
- Cancel import

#### skip
Automatically skips conflicting files, keeping existing articles unchanged.

#### rename
Automatically renames conflicting articles by appending a number.

#### overwrite
Replaces existing articles with imported versions (use with caution).

### Interactive Resolution Example

```bash
bun run import import ./articles --conflict interactive

# Output:
# ⚠️  Found 2 conflicts:
# 
# 1. my-article.md
#    Existing: "My Article" (my-article)
#    New: "My Article" (my-article)
#    Conflict type: slug
# 
# How would you like to handle these conflicts?
# 1. Skip conflicting files (recommended for safety)
# 2. Overwrite existing articles (WARNING: will replace existing content)
# 3. Cancel import
```

## File Processing

### Supported Formats

**Markdown Files**: `.md` extension required
**YAML Frontmatter**: Optional but recommended for metadata

### Frontmatter Processing

The import utility extracts the following frontmatter fields:

```yaml
---
title: Article Title          # → articles.title
created: 2025-01-15T10:30:00Z # → articles.created_at
folder: projects/web-dev      # → articles.folder
public: true                  # → articles.is_public
---
```

### Content Processing

1. **Frontmatter Extraction**: YAML frontmatter is parsed and removed
2. **Title Detection**: If no frontmatter title, extracts from first `#` heading
3. **Slug Generation**: Creates URL-friendly slug from filename or title
4. **Content Cleaning**: Stores pure markdown without frontmatter

### Folder Structure

#### Without `--preserve-folders`
All articles imported to root level (folder = "")

#### With `--preserve-folders`
Directory structure preserved as folder hierarchy:

```
articles/
├── web-dev/
│   ├── react.md      → folder: "web-dev"
│   └── vue.md        → folder: "web-dev"
└── mobile/
    └── flutter.md    → folder: "mobile"
```

## Batch Processing

### Configuration

```bash
# Process 25 files at a time
bun run import import ./articles --batch-size 25
```

### Benefits

- **Memory Management**: Prevents memory issues with large datasets
- **Progress Tracking**: Shows progress through large imports
- **Error Recovery**: Continues processing if individual files fail

### Progress Output

```bash
# Example progress output:
Scanning: 150/150 (100.0%) - processing-file.md
Validating: 145/150 (96.7%) - validating-file.md
Importing: 120/145 (82.8%) - importing-file.md
```

## Advanced Usage

### Dry Run Mode

Test imports without making database changes:

```bash
bun run import import ./articles --dry-run --conflict skip
```

**Benefits**:
- Test conflict resolution strategies
- Verify folder structure
- Check processing time
- Validate file formats

### Large Dataset Import

For importing thousands of files:

```bash
# Use smaller batches and skip conflicts for speed
bun run import import ./large-dataset \
  --batch-size 25 \
  --conflict skip \
  --preserve-folders
```

### Selective Import

Import specific subdirectories:

```bash
# Import only web development articles
bun run import import ./articles/web-dev --preserve-folders

# Import with specific conflict handling
bun run import import ./articles/important --conflict overwrite
```

## Error Handling

### Common Errors

**Parse Errors**: Invalid YAML frontmatter or markdown syntax
**Validation Errors**: Missing required fields or invalid data
**Database Errors**: Connection issues or constraint violations

### Error Output

```bash
# Example error output:
Errors:
  - broken-file.md: Invalid YAML frontmatter (parse)
  - empty-file.md: No content found (validation)
  - duplicate.md: Slug already exists (database)
```

### Recovery Strategies

1. **Fix Source Files**: Correct YAML syntax or markdown issues
2. **Skip Problematic Files**: Use `--conflict skip` to continue
3. **Batch Processing**: Use smaller batches to isolate issues
4. **Manual Resolution**: Import problematic files individually

## Performance Optimization

### Database Optimization

```bash
# Increase batch size for faster processing (if memory allows)
bun run import import ./articles --batch-size 100

# Use connection pooling for large imports
export DB_MAX_CONNECTIONS=50
```

### File System Optimization

- **SSD Storage**: Use SSD for source files and database
- **Local Processing**: Avoid network file systems for large imports
- **Parallel Processing**: Import different directories separately

## Monitoring and Logging

### Progress Monitoring

The import utility provides real-time progress updates:

```bash
# Example output:
Import Results:
  Imported: 145
  Skipped: 3
  Conflicts: 2
  Errors: 0
  Duration: 12.34s
```

### Database Monitoring

Monitor database during import:

```bash
# Check database health during import
bun run db:health

# Monitor database size growth
bun run db:info
```

## Best Practices

### Pre-Import

1. **Always backup** existing data before importing
2. **Validate first** with `validate` command
3. **Preview changes** with `preview` command
4. **Test with subset** before full import

### During Import

1. **Use interactive mode** for important data
2. **Monitor progress** for large imports
3. **Check for errors** in real-time
4. **Use appropriate batch sizes**

### Post-Import

1. **Verify results** with database queries
2. **Test application** functionality
3. **Rebuild search index** if using semantic search
4. **Archive source files** after successful import

## Troubleshooting

### Import Fails to Start

```bash
# Check database connection
bun run db:health

# Verify directory exists and is readable
ls -la ./path/to/articles

# Check permissions
whoami
ls -la ./path/to/articles
```

### Slow Import Performance

```bash
# Reduce batch size
--batch-size 10

# Check database performance
bun run db:info

# Monitor system resources
top
df -h
```

### Memory Issues

```bash
# Use smaller batches
--batch-size 5

# Monitor memory usage
free -h

# Check Node.js memory limits
node --max-old-space-size=4096
```

### Encoding Issues

```bash
# Check file encodings
file ./articles/*.md

# Convert to UTF-8 if needed
iconv -f ISO-8859-1 -t UTF-8 file.md > file-utf8.md
```

## Examples

### Basic Migration

```bash
# Simple migration from file-based system
bun run import validate ./data
bun run import import ./data --conflict interactive
```

### Complex Migration

```bash
# Migration with folder preservation and conflict handling
bun run import preview ./articles --preserve-folders
bun run import import ./articles \
  --preserve-folders \
  --conflict skip \
  --batch-size 25 \
  --dry-run
```

### Production Migration

```bash
# Large-scale production migration
bun run import validate ./production-articles
bun run import stats ./production-articles
bun run import import ./production-articles \
  --preserve-folders \
  --conflict skip \
  --batch-size 50
```

## Integration

### CI/CD Integration

```bash
#!/bin/bash
# Migration script for CI/CD

set -e

echo "Starting article import..."

# Validate first
bun run import validate ./articles
if [ $? -ne 0 ]; then
  echo "Validation failed, aborting import"
  exit 1
fi

# Import with automatic conflict resolution
bun run import import ./articles \
  --conflict skip \
  --preserve-folders \
  --batch-size 50

echo "Import completed successfully"
```

### Backup Integration

```bash
# Create backup before import
bun run db:backup

# Import articles
bun run import import ./articles --conflict interactive

# Verify import success
bun run db:validate
```

This comprehensive guide should help you effectively use the import utility for migrating your markdown content to the database backend.