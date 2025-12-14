#!/usr/bin/env bun

/**
 * Test script for background worker task processing
 * Tests the actual embedding generation and retry logic
 */

import { database, getDatabaseConfig } from '../src/backend/services/database.js';
import { backgroundWorkerService } from '../src/backend/services/backgroundWorker.js';
import { embeddingQueueService } from '../src/backend/services/embeddingQueue.js';
import { databaseArticleService } from '../src/backend/services/databaseArticles.js';

async function testWorkerTaskProcessing() {
  console.log('🧪 Testing Background Worker Task Processing...\n');

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    const config = getDatabaseConfig();
    await database.connect(config);
    console.log('✅ Database connected\n');

    // Check if semantic search is enabled
    const semanticSearchEnabled = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';
    console.log('🔍 Semantic search enabled:', semanticSearchEnabled);
    
    if (!semanticSearchEnabled) {
      console.log('⚠️  Semantic search is disabled. Task processing will fail as expected.');
      console.log('   This is normal behavior when embedding services are not configured.\n');
    }

    // Test 1: Create a test article
    console.log('📝 Test 1: Creating Test Article');
    
    const testTitle = `Test Article ${Date.now()}`;
    const testContent = `# ${testTitle}\n\nThis is a test article for background worker processing.\n\nIt contains multiple paragraphs to test chunking and embedding generation.`;
    
    console.log('  Creating article...');
    const article = await databaseArticleService.createArticle(testTitle, testContent, '', 'Test article for worker');
    console.log('  ✅ Article created:', article.slug);

    // Test 2: Queue an embedding task
    console.log('\n📋 Test 2: Queuing Embedding Task');
    
    const articleId = await databaseArticleService.getArticleId(article.slug);
    if (!articleId) {
      throw new Error('Failed to get article ID');
    }

    const taskId = await embeddingQueueService.enqueueTask({
      articleId,
      slug: article.slug,
      operation: 'create',
      priority: 'normal',
      maxAttempts: 3,
      scheduledAt: new Date(),
      metadata: { test: true }
    });
    
    console.log('  ✅ Task queued with ID:', taskId);

    // Test 3: Check task status
    console.log('\n📊 Test 3: Checking Task Status');
    
    const taskStatus = await embeddingQueueService.getTaskStatus(taskId);
    console.log('  Task status:', {
      id: taskStatus?.id,
      status: taskStatus?.status,
      attempts: taskStatus?.attempts,
      operation: taskStatus?.operation
    });

    // Test 4: Process task manually (without starting the full worker)
    console.log('\n⚙️  Test 4: Manual Task Processing');
    
    const task = await embeddingQueueService.dequeueTask();
    if (task) {
      console.log('  Dequeued task:', task.id);
      console.log('  Task details:', {
        articleId: task.articleId,
        slug: task.slug,
        operation: task.operation,
        attempts: task.attempts
      });

      try {
        console.log('  Processing task...');
        await backgroundWorkerService.processTask(task);
        
        // Mark as completed if successful
        await embeddingQueueService.updateTaskStatus(task.id, 'completed');
        console.log('  ✅ Task processed successfully');
        
      } catch (error) {
        console.log('  ❌ Task processing failed (expected if semantic search disabled):', 
          error instanceof Error ? error.message : 'Unknown error');
        
        // Mark as failed
        await embeddingQueueService.updateTaskStatus(task.id, 'failed', 
          error instanceof Error ? error.message : 'Unknown error');
        console.log('  Task marked as failed');
      }
    } else {
      console.log('  No task available to process');
    }

    // Test 5: Check final queue stats
    console.log('\n📊 Test 5: Final Queue Statistics');
    
    const finalStats = await embeddingQueueService.getQueueStats();
    console.log('  Final queue stats:', finalStats);

    // Test 6: Clean up test article
    console.log('\n🧹 Test 6: Cleanup');
    
    console.log('  Deleting test article...');
    await databaseArticleService.deleteArticle(article.slug);
    console.log('  ✅ Test article deleted');

    console.log('\n✅ All task processing tests completed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Clean up
    try {
      await database.disconnect();
      console.log('📡 Database disconnected');
    } catch (error) {
      console.error('Error disconnecting from database:', error);
    }
  }
}

// Run the test
testWorkerTaskProcessing().catch(console.error);