#!/usr/bin/env bun

/**
 * Complete database setup script for deployment
 * This script handles the full database initialization process
 */

import { databaseInit } from '../src/backend/services/databaseInit.js';
import { schemaService } from '../src/backend/services/schema.js';
import { readlineSync } from './utils/readline.js';

interface SetupOptions {
  force?: boolean;
  skipConfirmation?: boolean;
  createSampleData?: boolean;
  environment?: 'development' | 'production' | 'test';
}

async function parseArgs(): Promise<SetupOptions> {
  const args = process.argv.slice(2);
  
  return {
    force: args.includes('--force'),
    skipConfirmation: args.includes('--yes') || args.includes('-y'),
    createSampleData: args.includes('--sample-data'),
    environment: (args.find(arg => arg.startsWith('--env='))?.split('=')[1] as any) || 'development'
  };
}

async function checkDatabaseExists(): Promise<boolean> {
  try {
    await databaseInit.initialize();
    const result = await schemaService.verifySchema();
    await databaseInit.shutdown();
    return result;
  } catch (error) {
    return false;
  }
}

async function setupDatabase(options: SetupOptions) {
  console.log('🚀 Database Setup Script');
  console.log('========================');
  console.log(`Environment: ${options.environment}`);
  console.log('');

  // Check if database already exists
  const dbExists = await checkDatabaseExists();
  
  if (dbExists && !options.force) {
    console.log('✓ Database already exists and is properly configured');
    
    if (!options.skipConfirmation) {
      const recreate = await readlineSync.askYesNo(
        'Do you want to recreate the database? (This will delete all data)',
        false
      );
      
      if (!recreate) {
        console.log('Setup cancelled.');
        return;
      }
    }
  }

  // Confirm setup in production
  if (options.environment === 'production' && !options.skipConfirmation) {
    const confirmed = await readlineSync.confirmAction(
      'set up database in PRODUCTION environment',
      [
        'This will create or recreate the database schema',
        options.createSampleData ? 'Sample data will be created' : 'No sample data will be created'
      ],
      dbExists ? 'Existing data will be permanently deleted!' : undefined
    );
    
    if (!confirmed) {
      console.log('Setup cancelled.');
      return;
    }
  }

  try {
    console.log('📊 Initializing database...');
    
    // Initialize database connection and schema
    await databaseInit.initialize();
    
    if (dbExists && options.force) {
      console.log('🗑️  Dropping existing schema...');
      await schemaService.dropSchema();
    }
    
    console.log('🏗️  Creating database schema...');
    await schemaService.initializeSchema();
    
    console.log('✅ Verifying schema...');
    const isValid = await schemaService.verifySchema();
    
    if (!isValid) {
      throw new Error('Schema verification failed');
    }
    
    // Create sample data if requested
    if (options.createSampleData) {
      console.log('📝 Creating sample data...');
      await createSampleData();
    }
    
    // Show final status
    const info = await schemaService.getSchemaInfo();
    console.log('');
    console.log('✅ Database setup completed successfully!');
    console.log('');
    console.log('Database Information:');
    console.log(`  Tables: ${info.tables.length}`);
    console.log(`  Extensions: ${info.extensions.map((ext: any) => ext.extname).join(', ')}`);
    
    if (info.poolStats) {
      console.log(`  Connection pool: ${info.poolStats.totalCount} connections`);
    }
    
    console.log('');
    console.log('Next steps:');
    console.log('  - Start the server: bun run start');
    console.log('  - Import existing articles: bun run import validate <directory>');
    console.log('  - Check database health: bun run db:health');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await databaseInit.shutdown();
  }
}

async function createSampleData() {
  const { databaseArticleService } = await import('../src/backend/services/databaseArticles.js');
  
  const sampleArticles = [
    {
      title: 'Welcome to Article Manager',
      content: `# Welcome to Article Manager

This is your new database-powered article management system!

## Features

- **Database Storage**: All articles are now stored in PostgreSQL
- **Version History**: Complete history of all changes
- **Semantic Search**: AI-powered search capabilities
- **Folder Organization**: Organize articles in hierarchical folders
- **MCP Integration**: Full AI agent compatibility

## Getting Started

1. Create your first article using the web interface
2. Import existing markdown files using the CLI
3. Set up semantic search with embeddings
4. Explore the MCP server for AI agent integration

Happy writing! 📝`,
      folder: ''
    },
    {
      title: 'Database Migration Guide',
      content: `# Database Migration Guide

This guide explains how to migrate from file-based storage to the database backend.

## Migration Process

### 1. Backup Your Data

Before starting, create a backup of your existing articles:

\`\`\`bash
cp -r ./data ./data-backup
\`\`\`

### 2. Validate Import

Check what will be imported:

\`\`\`bash
bun run import validate ./data
\`\`\`

### 3. Run Import

Import your articles:

\`\`\`bash
bun run import import ./data --conflict interactive
\`\`\`

## Troubleshooting

- **Conflicts**: Use interactive mode to resolve conflicts
- **Errors**: Check file permissions and markdown syntax
- **Performance**: Use batch processing for large datasets

## Rollback

If needed, you can restore from backup:

\`\`\`bash
bun run db:restore ./backups/backup-YYYY-MM-DD.sql
\`\`\``,
      folder: 'guides'
    },
    {
      title: 'API Reference',
      content: `# API Reference

Complete reference for the Article Manager API.

## Authentication

All API endpoints require authentication:

\`\`\`
Authorization: Bearer YOUR_AUTH_TOKEN
\`\`\`

## Endpoints

### Articles

#### List Articles
\`GET /api/articles\`

Query parameters:
- \`folder\`: Filter by folder path
- \`search\`: Search in titles and content

#### Get Article
\`GET /api/articles/:slug\`

#### Create Article
\`POST /api/articles\`

#### Update Article
\`PUT /api/articles/:slug\`

#### Delete Article
\`DELETE /api/articles/:slug\`

### Search

#### Semantic Search
\`POST /api/search\`

Body:
\`\`\`json
{
  "query": "search terms",
  "k": 10,
  "folder": "optional-folder"
}
\`\`\`

## Response Formats

All responses follow this structure:

\`\`\`json
{
  "success": true,
  "data": {...},
  "error": null
}
\`\`\``,
      folder: 'docs'
    }
  ];
  
  for (const article of sampleArticles) {
    await databaseArticleService.createArticle(
      article.title,
      article.content,
      article.folder,
      'Sample data creation'
    );
    console.log(`  ✓ Created: ${article.title}`);
  }
}

function showUsage() {
  console.log('Database Setup Script');
  console.log('Usage: bun scripts/setup-database.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --force            Force recreation of existing database');
  console.log('  --yes, -y          Skip confirmation prompts');
  console.log('  --sample-data      Create sample articles');
  console.log('  --env=<env>        Set environment (development|production|test)');
  console.log('');
  console.log('Examples:');
  console.log('  bun scripts/setup-database.ts');
  console.log('  bun scripts/setup-database.ts --force --sample-data');
  console.log('  bun scripts/setup-database.ts --env=production --yes');
}

async function main() {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      showUsage();
      return;
    }
    
    const options = await parseArgs();
    await setupDatabase(options);
    
  } catch (error) {
    console.error('Setup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await databaseInit.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await databaseInit.shutdown();
  process.exit(0);
});

// Run the setup
if (import.meta.main) {
  main();
}