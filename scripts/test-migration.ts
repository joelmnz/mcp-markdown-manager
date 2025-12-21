#!/usr/bin/env bun

/**
 * Test script to demonstrate the embedding queue migration
 */

import { databaseInit } from '../src/backend/services/databaseInit.js';
import { database } from '../src/backend/services/database.js';

async function testMigration() {
  try {
    console.log('Testing embedding queue migration...');
    await databaseInit.initialize();

    // Check current schema version
    console.log('\n=== CHECKING SCHEMA VERSION ===');
    const versionResult = await database.query(`
      SELECT version, applied_at, description 
      FROM schema_version 
      ORDER BY version DESC 
      LIMIT 5
    `);
    
    if (versionResult.rows.length > 0) {
      console.log('Applied migrations:');
      console.table(versionResult.rows);
    } else {
      console.log('No migrations have been applied yet');
    }

    // Verify embedding queue tables exist
    console.log('\n=== VERIFYING EMBEDDING QUEUE TABLES ===');
    const tablesResult = await database.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name IN ('embedding_tasks', 'embedding_worker_status')
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length === 2) {
      console.log('✓ Embedding queue tables found:');
      console.table(tablesResult.rows);
    } else {
      console.log('❌ Embedding queue tables not found');
      return;
    }

    // Test basic queue operations
    console.log('\n=== TESTING QUEUE OPERATIONS ===');
    
    // Get or create a test article
    let articleResult = await database.query(`
      SELECT id FROM articles WHERE slug = 'migration-test' LIMIT 1
    `);
    
    let articleId: number;
    if (articleResult.rows.length === 0) {
      const newArticle = await database.query(`
        INSERT INTO articles (title, slug, content, folder) 
        VALUES ('Migration Test', 'migration-test', '# Migration Test Content', '') 
        RETURNING id
      `);
      articleId = newArticle.rows[0].id;
      console.log(`✓ Created test article with ID: ${articleId}`);
    } else {
      articleId = articleResult.rows[0].id;
      console.log(`✓ Using existing test article with ID: ${articleId}`);
    }

    // Test inserting different types of tasks
    const taskTypes = [
      { operation: 'create', priority: 'high' },
      { operation: 'update', priority: 'normal' },
      { operation: 'delete', priority: 'low' }
    ];

    console.log('\n✓ Inserting test tasks:');
    for (const taskType of taskTypes) {
      const taskResult = await database.query(`
        INSERT INTO embedding_tasks (article_id, slug, operation, priority) 
        VALUES ($1, $2, $3, $4) 
        RETURNING id, operation, priority, status, created_at
      `, [articleId, 'migration-test', taskType.operation, taskType.priority]);
      
      console.log(`  - ${taskType.operation} (${taskType.priority}): ${taskResult.rows[0].id}`);
    }

    // Test queue statistics
    console.log('\n=== QUEUE STATISTICS ===');
    const statsResult = await database.query(`
      SELECT 
        status,
        priority,
        COUNT(*) as count
      FROM embedding_tasks 
      WHERE slug = 'migration-test'
      GROUP BY status, priority
      ORDER BY priority, status
    `);
    console.table(statsResult.rows);

    // Test worker status update
    console.log('\n=== TESTING WORKER STATUS ===');
    await database.query(`
      UPDATE embedding_worker_status 
      SET is_running = true, 
          last_heartbeat = NOW(),
          started_at = NOW()
      WHERE id = 1
    `);
    
    const workerResult = await database.query('SELECT * FROM embedding_worker_status');
    console.table(workerResult.rows);

    // Clean up test data
    console.log('\n=== CLEANING UP ===');
    await database.query('DELETE FROM embedding_tasks WHERE slug = $1', ['migration-test']);
    await database.query('DELETE FROM articles WHERE slug = $1', ['migration-test']);
    await database.query(`
      UPDATE embedding_worker_status 
      SET is_running = false, 
          last_heartbeat = NULL,
          started_at = NULL
      WHERE id = 1
    `);
    console.log('✓ Test data cleaned up');

    console.log('\n✅ Migration test completed successfully!');

  } catch (error) {
    console.error('❌ Migration test failed:', error);
    process.exit(1);
  } finally {
    await databaseInit.shutdown();
  }
}

// Run the test
testMigration();