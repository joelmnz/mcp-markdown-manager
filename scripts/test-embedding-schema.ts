#!/usr/bin/env bun

/**
 * Test script to verify the embedding queue schema
 */

import { databaseInit } from '../src/backend/services/databaseInit.js';
import { database } from '../src/backend/services/database.js';

async function testEmbeddingSchema() {
  try {
    console.log('Testing embedding queue schema...');
    await databaseInit.initialize();

    // Check embedding_tasks table structure
    console.log('\n=== EMBEDDING_TASKS TABLE ===');
    const tasksSchema = await database.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'embedding_tasks' 
      ORDER BY ordinal_position
    `);
    console.table(tasksSchema.rows);

    // Check embedding_worker_status table structure  
    console.log('\n=== EMBEDDING_WORKER_STATUS TABLE ===');
    const workerSchema = await database.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'embedding_worker_status' 
      ORDER BY ordinal_position
    `);
    console.table(workerSchema.rows);

    // Check indexes
    console.log('\n=== INDEXES ===');
    const indexes = await database.query(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes 
      WHERE tablename IN ('embedding_tasks', 'embedding_worker_status')
      ORDER BY tablename, indexname
    `);
    console.table(indexes.rows);

    // Check constraints
    console.log('\n=== CONSTRAINTS ===');
    const constraints = await database.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid IN (
        SELECT oid FROM pg_class WHERE relname IN ('embedding_tasks', 'embedding_worker_status')
      )
      ORDER BY conname
    `);
    console.table(constraints.rows);

    // Test inserting a sample task
    console.log('\n=== TESTING SAMPLE DATA ===');
    
    // First, create a sample article if none exists
    const articleCheck = await database.query('SELECT id FROM articles LIMIT 1');
    let articleId: number;
    
    if (articleCheck.rows.length === 0) {
      const newArticle = await database.query(`
        INSERT INTO articles (title, slug, content, folder) 
        VALUES ('Test Article', 'test-article', '# Test Content', '') 
        RETURNING id
      `);
      articleId = newArticle.rows[0].id;
      console.log(`Created test article with ID: ${articleId}`);
    } else {
      articleId = articleCheck.rows[0].id;
      console.log(`Using existing article with ID: ${articleId}`);
    }

    // Insert a test embedding task
    const taskResult = await database.query(`
      INSERT INTO embedding_tasks (article_id, slug, operation, priority) 
      VALUES ($1, 'test-article', 'create', 'normal') 
      RETURNING id, created_at, status
    `, [articleId]);
    
    console.log('✓ Successfully inserted test embedding task:');
    console.table(taskResult.rows);

    // Check worker status table
    const workerStatus = await database.query('SELECT * FROM embedding_worker_status');
    console.log('✓ Worker status table:');
    console.table(workerStatus.rows);

    // Clean up test data
    await database.query('DELETE FROM embedding_tasks WHERE slug = $1', ['test-article']);
    console.log('✓ Cleaned up test data');

    console.log('\n✅ All schema tests passed successfully!');

  } catch (error) {
    console.error('❌ Schema test failed:', error);
    process.exit(1);
  } finally {
    await databaseInit.shutdown();
  }
}

// Run the test
testEmbeddingSchema();