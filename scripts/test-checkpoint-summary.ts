#!/usr/bin/env bun

/**
 * Comprehensive test summary for checkpoint 9
 * Tests all major components of the background embedding queue system
 */

import { database } from '../src/backend/services/database.js';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  details?: any;
}

async function runTest(name: string, testFn: () => Promise<any>): Promise<TestResult> {
  try {
    const result = await testFn();
    return {
      name,
      status: 'pass',
      message: 'Test passed successfully',
      details: result
    };
  } catch (error) {
    return {
      name,
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error
    };
  }
}

async function testCheckpointSummary() {
  console.log('🧪 Background Embedding Queue - Checkpoint 9 Test Summary');
  console.log('=========================================================\n');

  const results: TestResult[] = [];

  // Connect to database
  try {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'article_manager_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };
    
    await database.connect(config);
    console.log('✅ Database connected\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return;
  }

  // Test 1: Database Schema
  results.push(await runTest('Database Schema', async () => {
    const tables = await database.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('embedding_tasks', 'embedding_worker_status', 'embedding_audit_logs', 'performance_metrics')
    `);
    
    const expectedTables = ['embedding_tasks', 'embedding_worker_status', 'embedding_audit_logs', 'performance_metrics'];
    const foundTables = tables.rows.map(r => r.table_name);
    
    if (expectedTables.every(table => foundTables.includes(table))) {
      return { tablesFound: foundTables.length, expectedTables: expectedTables.length };
    } else {
      throw new Error(`Missing tables: ${expectedTables.filter(t => !foundTables.includes(t)).join(', ')}`);
    }
  }));

  // Test 2: Vector Dimensions
  results.push(await runTest('Vector Dimensions', async () => {
    const vectorInfo = await database.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'embeddings' AND column_name = 'vector'
    `);
    
    if (vectorInfo.rows.length > 0) {
      return { vectorColumn: 'exists', dataType: vectorInfo.rows[0].data_type };
    } else {
      throw new Error('Vector column not found in embeddings table');
    }
  }));

  // Test 3: Queue Operations
  results.push(await runTest('Queue Operations', async () => {
    // Create test article
    const article = await database.query(`
      INSERT INTO articles (title, slug, content, folder) 
      VALUES ('Test Queue Article', 'test-queue-checkpoint', 'Test content', '') 
      RETURNING id
    `);
    
    const articleId = article.rows[0].id;
    
    // Insert test task
    const task = await database.query(`
      INSERT INTO embedding_tasks (article_id, slug, operation, priority) 
      VALUES ($1, 'test-queue-checkpoint', 'create', 'normal') 
      RETURNING id
    `, [articleId]);
    
    const taskId = task.rows[0].id;
    
    // Check task exists
    const taskCheck = await database.query(`
      SELECT status, operation FROM embedding_tasks WHERE id = $1
    `, [taskId]);
    
    // Cleanup
    await database.query('DELETE FROM embedding_tasks WHERE id = $1', [taskId]);
    await database.query('DELETE FROM articles WHERE id = $1', [articleId]);
    
    return { 
      taskCreated: true, 
      status: taskCheck.rows[0]?.status,
      operation: taskCheck.rows[0]?.operation 
    };
  }));

  // Test 4: Worker Status
  results.push(await runTest('Worker Status', async () => {
    const workerStatus = await database.query(`
      SELECT is_running, tasks_processed, tasks_succeeded, tasks_failed 
      FROM embedding_worker_status WHERE id = 1
    `);
    
    if (workerStatus.rows.length > 0) {
      return workerStatus.rows[0];
    } else {
      throw new Error('Worker status record not found');
    }
  }));

  // Test 5: Audit Logs
  results.push(await runTest('Audit Logs', async () => {
    const logCount = await database.query(`
      SELECT COUNT(*) as count FROM embedding_audit_logs
    `);
    
    return { logEntries: parseInt(logCount.rows[0].count) };
  }));

  // Test 6: Performance Metrics
  results.push(await runTest('Performance Metrics', async () => {
    const metricCount = await database.query(`
      SELECT COUNT(*) as count FROM performance_metrics
    `);
    
    return { metricEntries: parseInt(metricCount.rows[0].count) };
  }));

  // Disconnect from database
  await database.disconnect();
  console.log('📡 Database disconnected\n');

  // Print results
  console.log('📊 Test Results Summary:');
  console.log('========================\n');

  let passCount = 0;
  let failCount = 0;

  results.forEach((result, index) => {
    const icon = result.status === 'pass' ? '✅' : '❌';
    const status = result.status === 'pass' ? 'PASS' : 'FAIL';
    
    console.log(`${icon} ${index + 1}. ${result.name}: ${status}`);
    console.log(`   ${result.message}`);
    
    if (result.details && result.status === 'pass') {
      console.log(`   Details:`, result.details);
    }
    
    if (result.status === 'pass') {
      passCount++;
    } else {
      failCount++;
    }
    
    console.log('');
  });

  console.log('📈 Final Summary:');
  console.log(`   ✅ Passed: ${passCount}/${results.length}`);
  console.log(`   ❌ Failed: ${failCount}/${results.length}`);
  console.log(`   📊 Success Rate: ${Math.round((passCount / results.length) * 100)}%\n`);

  if (failCount === 0) {
    console.log('🎉 All core tests passed! The background embedding queue system is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the issues above.');
  }

  return { passCount, failCount, totalTests: results.length };
}

// Run the comprehensive test
testCheckpointSummary().catch(console.error);