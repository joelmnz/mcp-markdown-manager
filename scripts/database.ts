#!/usr/bin/env bun

/**
 * Database management CLI utility
 * Usage: bun scripts/database.ts <command> [options]
 */

import { databaseInit } from '../src/backend/services/databaseInit.js';
import { schemaService } from '../src/backend/services/schema.js';
import { database } from '../src/backend/services/database.js';
import { databaseArticleService } from '../src/backend/services/databaseArticles.js';
import { readlineSync } from './utils/readline.js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const commands = {
  init: 'Initialize database schema',
  reset: 'Reset database (WARNING: destroys all data)',
  verify: 'Verify database schema',
  info: 'Show database information',
  health: 'Check database health',
  migrate: 'Run database migrations',
  backup: 'Create database backup',
  restore: 'Restore database from backup',
  validate: 'Validate database data integrity',
  setup: 'Complete database setup with sample data',
  teardown: 'Safely remove database and all data',
} as const;

async function main() {
  const command = process.argv[2];

  if (!command || !Object.keys(commands).includes(command)) {
    console.log('Database Management CLI');
    console.log('Usage: bun scripts/database.ts <command>');
    console.log('\nAvailable commands:');
    Object.entries(commands).forEach(([cmd, desc]) => {
      console.log(`  ${cmd.padEnd(10)} - ${desc}`);
    });
    process.exit(1);
  }

  try {
    switch (command) {
      case 'init':
        await initCommand();
        break;
      case 'reset':
        await resetCommand();
        break;
      case 'verify':
        await verifyCommand();
        break;
      case 'info':
        await infoCommand();
        break;
      case 'health':
        await healthCommand();
        break;
      case 'migrate':
        await migrateCommand();
        break;
      case 'backup':
        await backupCommand();
        break;
      case 'restore':
        await restoreCommand();
        break;
      case 'validate':
        await validateCommand();
        break;
      case 'setup':
        await setupCommand();
        break;
      case 'teardown':
        await teardownCommand();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Command failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function initCommand() {
  console.log('Initializing database...');
  await databaseInit.initialize();
  console.log('Database initialization completed successfully');
}

async function resetCommand() {
  console.log('WARNING: This will destroy all data in the database!');
  
  // Simple confirmation (in a real CLI, you might want a proper prompt)
  const confirmReset = process.argv.includes('--confirm');
  if (!confirmReset) {
    console.log('Add --confirm flag to proceed with reset');
    console.log('Example: bun scripts/database.ts reset --confirm');
    process.exit(1);
  }

  await databaseInit.initialize();
  await databaseInit.reset();
  console.log('Database reset completed successfully');
}

async function verifyCommand() {
  console.log('Verifying database schema...');
  await databaseInit.initialize();
  
  const isValid = await schemaService.verifySchema();
  if (isValid) {
    console.log('✓ Database schema is valid');
  } else {
    console.log('✗ Database schema verification failed');
    process.exit(1);
  }
}

async function infoCommand() {
  console.log('Getting database information...');
  await databaseInit.initialize();
  
  const info = await schemaService.getSchemaInfo();
  console.log('\nDatabase Information:');
  console.log('Tables:');
  info.tables.forEach((table: any) => {
    console.log(`  - ${table.table_name} (${table.column_count} columns)`);
  });
  
  console.log('\nExtensions:');
  info.extensions.forEach((ext: any) => {
    console.log(`  - ${ext.extname} v${ext.extversion}`);
  });
  
  if (info.poolStats) {
    console.log('\nConnection Pool:');
    console.log(`  - Total connections: ${info.poolStats.totalCount}`);
    console.log(`  - Idle connections: ${info.poolStats.idleCount}`);
    console.log(`  - Waiting connections: ${info.poolStats.waitingCount}`);
  }
}

async function healthCommand() {
  console.log('Checking database health...');
  
  try {
    await databaseInit.initialize();
    const health = await databaseInit.healthCheck();
    
    if (health.healthy) {
      console.log('✓ Database is healthy');
      if (health.details) {
        console.log('Details:', JSON.stringify(health.details, null, 2));
      }
    } else {
      console.log('✗ Database health check failed:', health.message);
      process.exit(1);
    }
  } catch (error) {
    console.log('✗ Database health check failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function migrateCommand() {
  console.log('Running database migrations...');
  
  try {
    await databaseInit.initialize();
    
    // Check current schema version
    const currentVersion = await getCurrentSchemaVersion();
    console.log(`Current schema version: ${currentVersion}`);
    
    // Run any pending migrations
    const migrations = await getPendingMigrations(currentVersion);
    
    if (migrations.length === 0) {
      console.log('✓ No pending migrations');
      return;
    }
    
    console.log(`Found ${migrations.length} pending migrations:`);
    migrations.forEach(migration => {
      console.log(`  - ${migration.version}: ${migration.description}`);
    });
    
    const confirmed = await readlineSync.confirmAction(
      'apply these migrations',
      migrations.map(m => `${m.version}: ${m.description}`)
    );
    
    if (!confirmed) {
      console.log('Migration cancelled.');
      return;
    }
    
    // Apply migrations in transaction
    await database.transaction(async () => {
      for (const migration of migrations) {
        console.log(`Applying migration ${migration.version}...`);
        await migration.apply();
        await setSchemaVersion(migration.version);
        console.log(`✓ Migration ${migration.version} applied`);
      }
    });
    
    console.log('✅ All migrations applied successfully');
    
  } catch (error) {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function backupCommand() {
  console.log('Creating database backup...');
  
  try {
    const config = process.env.DATABASE_URL || 
      `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = './backups';
    const backupFile = join(backupDir, `backup-${timestamp}.sql`);
    
    // Create backups directory if it doesn't exist
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }
    
    console.log(`Creating backup: ${backupFile}`);
    
    // Use pg_dump to create backup
    const command = `pg_dump "${config}" > "${backupFile}"`;
    execSync(command, { stdio: 'inherit' });
    
    console.log(`✅ Backup created successfully: ${backupFile}`);
    
  } catch (error) {
    console.error('Backup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function restoreCommand() {
  const backupFile = process.argv[3];
  
  if (!backupFile) {
    console.error('Usage: bun scripts/database.ts restore <backup-file>');
    process.exit(1);
  }
  
  if (!existsSync(backupFile)) {
    console.error(`Backup file not found: ${backupFile}`);
    process.exit(1);
  }
  
  console.log(`Restoring database from: ${backupFile}`);
  
  try {
    const confirmed = await readlineSync.confirmAction(
      'restore database from backup',
      [`File: ${backupFile}`],
      'This will replace all current data in the database!'
    );
    
    if (!confirmed) {
      console.log('Restore cancelled.');
      return;
    }
    
    const config = process.env.DATABASE_URL || 
      `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    
    // Drop and recreate schema first
    await databaseInit.initialize();
    await schemaService.dropSchema();
    
    // Restore from backup
    const command = `psql "${config}" < "${backupFile}"`;
    execSync(command, { stdio: 'inherit' });
    
    // Verify restored schema
    const isValid = await schemaService.verifySchema();
    if (!isValid) {
      throw new Error('Schema verification failed after restore');
    }
    
    console.log('✅ Database restored successfully');
    
  } catch (error) {
    console.error('Restore failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function validateCommand() {
  console.log('Validating database data integrity...');
  
  try {
    await databaseInit.initialize();
    
    const validationResults = await runDataValidation();
    
    console.log('\nValidation Results:');
    console.log(`  Articles: ${validationResults.articles.total} total, ${validationResults.articles.valid} valid`);
    console.log(`  History: ${validationResults.history.total} total, ${validationResults.history.valid} valid`);
    console.log(`  Embeddings: ${validationResults.embeddings.total} total, ${validationResults.embeddings.valid} valid`);
    
    if (validationResults.errors.length > 0) {
      console.log('\nValidation Errors:');
      validationResults.errors.forEach(error => {
        console.log(`  - ${error.table}: ${error.message} (ID: ${error.id})`);
      });
    }
    
    const allValid = validationResults.errors.length === 0;
    console.log(`\n${allValid ? '✅' : '❌'} Database validation ${allValid ? 'passed' : 'failed'}`);
    
    if (!allValid) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Validation failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function setupCommand() {
  console.log('Setting up database with sample data...');
  
  try {
    // Initialize database
    await databaseInit.initialize();
    
    // Check if database already has data
    const articleCount = await database.query('SELECT COUNT(*) as count FROM articles');
    const hasData = parseInt(articleCount.rows[0].count) > 0;
    
    if (hasData) {
      const confirmed = await readlineSync.confirmAction(
        'setup database',
        [`Database already contains ${articleCount.rows[0].count} articles`],
        'This will add sample data to the existing database'
      );
      
      if (!confirmed) {
        console.log('Setup cancelled.');
        return;
      }
    }
    
    // Create sample articles
    const sampleArticles = [
      {
        title: 'Welcome to Article Manager',
        content: '# Welcome\n\nThis is a sample article to demonstrate the database backend.',
        folder: ''
      },
      {
        title: 'Getting Started Guide',
        content: '# Getting Started\n\n## Installation\n\nFollow these steps to get started...',
        folder: 'guides'
      },
      {
        title: 'API Documentation',
        content: '# API Documentation\n\n## Endpoints\n\n### Articles\n\n- GET /api/articles',
        folder: 'docs'
      }
    ];
    
    console.log('Creating sample articles...');
    for (const article of sampleArticles) {
      await databaseArticleService.createArticle(
        article.title,
        article.content,
        article.folder,
        'Initial setup'
      );
      console.log(`  ✓ Created: ${article.title}`);
    }
    
    console.log('✅ Database setup completed successfully');
    
  } catch (error) {
    console.error('Setup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function teardownCommand() {
  console.log('Tearing down database...');
  
  try {
    const confirmed = await readlineSync.confirmAction(
      'completely remove the database and all data',
      ['All articles, history, and embeddings will be permanently deleted'],
      'This action cannot be undone!'
    );
    
    if (!confirmed) {
      console.log('Teardown cancelled.');
      return;
    }
    
    await databaseInit.initialize();
    await schemaService.dropSchema();
    
    console.log('✅ Database teardown completed successfully');
    
  } catch (error) {
    console.error('Teardown failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Helper functions for migration system

async function getCurrentSchemaVersion(): Promise<number> {
  try {
    // Create schema_version table if it doesn't exist
    await database.query(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        description TEXT
      )
    `);
    
    const result = await database.query('SELECT MAX(version) as version FROM schema_version');
    return parseInt(result.rows[0].version) || 0;
  } catch (error) {
    return 0;
  }
}

async function setSchemaVersion(version: number): Promise<void> {
  await database.query(
    'INSERT INTO schema_version (version, description) VALUES ($1, $2)',
    [version, `Migration to version ${version}`]
  );
}

async function getPendingMigrations(currentVersion: number): Promise<Array<{
  version: number;
  description: string;
  apply: () => Promise<void>;
}>> {
  // Define available migrations
  const migrations = [
    {
      version: 1,
      description: 'Initial schema setup',
      apply: async () => {
        // This would be the initial schema - already handled by schemaService
        console.log('  Initial schema already applied');
      }
    },
    {
      version: 2,
      description: 'Add background embedding queue tables',
      apply: async () => {
        console.log('  Creating embedding_tasks table...');
        await database.query(`
          CREATE TABLE IF NOT EXISTS embedding_tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
            slug VARCHAR(255) NOT NULL,
            operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
            priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            processed_at TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE,
            error_message TEXT,
            metadata JSONB
          )
        `);

        console.log('  Creating embedding_worker_status table...');
        await database.query(`
          CREATE TABLE IF NOT EXISTS embedding_worker_status (
            id INTEGER PRIMARY KEY DEFAULT 1,
            is_running BOOLEAN NOT NULL DEFAULT FALSE,
            last_heartbeat TIMESTAMP WITH TIME ZONE,
            tasks_processed INTEGER NOT NULL DEFAULT 0,
            tasks_succeeded INTEGER NOT NULL DEFAULT 0,
            tasks_failed INTEGER NOT NULL DEFAULT 0,
            started_at TIMESTAMP WITH TIME ZONE,
            
            CONSTRAINT single_worker CHECK (id = 1)
          )
        `);

        console.log('  Creating indexes for embedding queue tables...');
        await database.query('CREATE INDEX IF NOT EXISTS idx_embedding_tasks_status_priority ON embedding_tasks(status, priority, scheduled_at)');
        await database.query('CREATE INDEX IF NOT EXISTS idx_embedding_tasks_article_id ON embedding_tasks(article_id)');
        await database.query('CREATE INDEX IF NOT EXISTS idx_embedding_tasks_created_at ON embedding_tasks(created_at)');
        await database.query('CREATE INDEX IF NOT EXISTS idx_embedding_tasks_status ON embedding_tasks(status)');

        console.log('  Inserting initial worker status record...');
        await database.query(`
          INSERT INTO embedding_worker_status (id, is_running) 
          VALUES (1, FALSE) 
          ON CONFLICT (id) DO NOTHING
        `);

        console.log('  Background embedding queue tables created successfully');
      }
    },
    {
      version: 4,
      description: 'Add soft delete support to articles table',
      apply: async () => {
        console.log('  Adding soft delete columns to articles table...');
        
        // Add is_deleted column (default FALSE)
        await database.query(`
          ALTER TABLE articles 
          ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE NOT NULL
        `);
        
        // Add deleted_at column
        await database.query(`
          ALTER TABLE articles 
          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE
        `);
        
        console.log('  Creating indexes for soft delete columns...');
        
        // Create index for efficient querying of non-deleted articles
        await database.query(`
          CREATE INDEX IF NOT EXISTS idx_articles_is_deleted 
          ON articles(is_deleted)
        `);
        
        // Create index for trash listing (deleted articles ordered by deletion date)
        await database.query(`
          CREATE INDEX IF NOT EXISTS idx_articles_deleted_at 
          ON articles(deleted_at DESC) WHERE is_deleted = true
        `);
        
        console.log('  Soft delete migration completed successfully');
      }
    }
    // Future migrations would be added here
  ];
  
  return migrations.filter(migration => migration.version > currentVersion);
}

async function runDataValidation(): Promise<{
  articles: { total: number; valid: number };
  history: { total: number; valid: number };
  embeddings: { total: number; valid: number };
  errors: Array<{ table: string; id: string; message: string }>;
}> {
  const errors: Array<{ table: string; id: string; message: string }> = [];
  
  // Validate articles
  const articles = await database.query('SELECT id, title, slug, content FROM articles');
  let validArticles = 0;
  
  for (const article of articles.rows) {
    if (!article.title || article.title.trim() === '') {
      errors.push({ table: 'articles', id: article.id, message: 'Empty title' });
    } else if (!article.slug || article.slug.trim() === '') {
      errors.push({ table: 'articles', id: article.id, message: 'Empty slug' });
    } else if (!article.content || article.content.trim() === '') {
      errors.push({ table: 'articles', id: article.id, message: 'Empty content' });
    } else {
      validArticles++;
    }
  }
  
  // Validate history
  const history = await database.query('SELECT id, article_id FROM article_history');
  let validHistory = 0;
  
  for (const historyRecord of history.rows) {
    const articleExists = await database.query('SELECT 1 FROM articles WHERE id = $1', [historyRecord.article_id]);
    if (articleExists.rows.length === 0) {
      errors.push({ table: 'article_history', id: historyRecord.id, message: 'References non-existent article' });
    } else {
      validHistory++;
    }
  }
  
  // Validate embeddings
  const embeddings = await database.query('SELECT id, article_id FROM embeddings');
  let validEmbeddings = 0;
  
  for (const embedding of embeddings.rows) {
    const articleExists = await database.query('SELECT 1 FROM articles WHERE id = $1', [embedding.article_id]);
    if (articleExists.rows.length === 0) {
      errors.push({ table: 'embeddings', id: embedding.id, message: 'References non-existent article' });
    } else {
      validEmbeddings++;
    }
  }
  
  return {
    articles: { total: articles.rows.length, valid: validArticles },
    history: { total: history.rows.length, valid: validHistory },
    embeddings: { total: embeddings.rows.length, valid: validEmbeddings },
    errors
  };
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

// Run the CLI
main().finally(async () => {
  await databaseInit.shutdown();
});