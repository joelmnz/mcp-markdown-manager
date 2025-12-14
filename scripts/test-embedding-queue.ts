#!/usr/bin/env bun

/**
 * Test script for the embedding queue service
 * Tests basic queue operations and statistics
 */

import { database, getDatabaseConfig } from '../src/backend/services/database.js';
import { embeddingQueueService } from '../src/backend/services/embeddingQueue.js';

// Disable semantic search for this test to avoid embedding issues
process.env.SEMANTIC_SEARCH_ENABLED = 'false';

import { createArticle } from '../src/backend/services/articles.js';

async function testEmbeddingQueue() {
  console.log('🧪 Testing Embedding Queue Service...\n');

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    await database.connect(getDatabaseConfig());
    console.log('✅ Database connected\n');

    // Test 1: Get initial queue stats
    console.log('📊 Getting initial queue statistics...');
    const initialStats = await embeddingQueueService.getQueueStats();
    console.log('Initial stats:', initialStats);
    console.log('✅ Queue stats retrieved\n');

    // Test 2: Create a test article first
    console.log('📝 Creating a test article...');
    const testArticle = await createArticle('Test Article for Queue', 'This is a test article for the embedding queue.', 'Test article creation');
    console.log('✅ Test article created:', testArticle.filename);

    // Get the article ID from the database
    const articleResult = await database.query('SELECT id FROM articles WHERE slug = $1', ['test-article-for-queue']);
    const articleId = articleResult.rows[0]?.id;
    
    if (!articleId) {
      throw new Error('Failed to get article ID');
    }

    // Test 3: Enqueue a test task
    console.log('📝 Enqueuing a test task...');
    const taskId = await embeddingQueueService.enqueueTask({
      articleId: articleId,
      slug: 'test-article-for-queue',
      operation: 'create',
      priority: 'normal',
      maxAttempts: 3,
      scheduledAt: new Date(),
      metadata: { test: true }
    });
    console.log('✅ Task enqueued with ID:', taskId);

    // Test 4: Get task status
    console.log('🔍 Getting task status...');
    const taskStatus = await embeddingQueueService.getTaskStatus(taskId);
    console.log('Task status:', {
      id: taskStatus?.id,
      status: taskStatus?.status,
      operation: taskStatus?.operation,
      priority: taskStatus?.priority
    });
    console.log('✅ Task status retrieved\n');

    // Test 5: Get updated queue stats
    console.log('📊 Getting updated queue statistics...');
    const updatedStats = await embeddingQueueService.getQueueStats();
    console.log('Updated stats:', updatedStats);
    console.log('✅ Updated stats retrieved\n');

    // Test 6: Get detailed queue stats
    console.log('📈 Getting detailed queue statistics...');
    const detailedStats = await embeddingQueueService.getDetailedQueueStats();
    console.log('Detailed stats:', {
      basicStats: detailedStats.stats,
      tasksByPriority: detailedStats.tasksByPriority,
      tasksByOperation: detailedStats.tasksByOperation,
      recentActivity: detailedStats.recentActivity
    });
    console.log('✅ Detailed stats retrieved\n');

    // Test 7: Get queue health
    console.log('🏥 Getting queue health...');
    const health = await embeddingQueueService.getQueueHealth();
    console.log('Queue health:', {
      isHealthy: health.isHealthy,
      totalTasks: health.totalTasks,
      issues: health.issues
    });
    console.log('✅ Queue health retrieved\n');

    // Test 8: Dequeue the task
    console.log('⬇️ Dequeuing task...');
    const dequeuedTask = await embeddingQueueService.dequeueTask();
    console.log('Dequeued task:', {
      id: dequeuedTask?.id,
      status: dequeuedTask?.status,
      attempts: dequeuedTask?.attempts
    });
    console.log('✅ Task dequeued\n');

    // Test 9: Update task status to completed
    if (dequeuedTask) {
      console.log('✅ Updating task status to completed...');
      await embeddingQueueService.updateTaskStatus(dequeuedTask.id, 'completed');
      console.log('✅ Task status updated\n');
    }

    // Test 10: Final queue stats
    console.log('📊 Getting final queue statistics...');
    const finalStats = await embeddingQueueService.getQueueStats();
    console.log('Final stats:', finalStats);
    console.log('✅ Final stats retrieved\n');

    // Test 11: Clean up completed tasks
    console.log('🧹 Cleaning up completed tasks...');
    const cleanedCount = await embeddingQueueService.clearCompletedTasks();
    console.log(`✅ Cleaned up ${cleanedCount} completed tasks\n`);

    console.log('🎉 All embedding queue tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await database.disconnect();
    console.log('📡 Database disconnected');
  }
}

// Run the test
testEmbeddingQueue().catch(console.error);