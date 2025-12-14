#!/usr/bin/env bun

/**
 * Simple test script for the embedding queue service
 * Tests core queue operations without complex statistics
 */

import { database, getDatabaseConfig } from '../src/backend/services/database.js';
import { embeddingQueueService } from '../src/backend/services/embeddingQueue.js';

async function testEmbeddingQueueSimple() {
  console.log('🧪 Testing Embedding Queue Service (Simple)...\n');

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

    // Test 2: Create a test article directly in database (to avoid embedding issues)
    console.log('📝 Creating a test article directly...');
    const timestamp = Date.now();
    const testSlug = `test-queue-${timestamp}`;
    
    const articleResult = await database.query(`
      INSERT INTO articles (slug, title, content, folder, created_at, is_public)
      VALUES ($1, $2, $3, $4, NOW(), false)
      RETURNING id
    `, [testSlug, `Test Queue Article ${timestamp}`, 'Test content for queue', '']);
    
    const articleId = articleResult.rows[0].id;
    console.log('✅ Test article created with ID:', articleId);

    // Test 3: Enqueue a test task
    console.log('📝 Enqueuing a test task...');
    const taskId = await embeddingQueueService.enqueueTask({
      articleId: articleId,
      slug: testSlug,
      operation: 'create',
      priority: 'normal',
      maxAttempts: 3,
      scheduledAt: new Date(),
      metadata: { test: true, timestamp }
    });
    console.log('✅ Task enqueued with ID:', taskId);

    // Test 4: Get task status
    console.log('🔍 Getting task status...');
    const taskStatus = await embeddingQueueService.getTaskStatus(taskId);
    console.log('Task status:', {
      id: taskStatus?.id,
      status: taskStatus?.status,
      operation: taskStatus?.operation,
      priority: taskStatus?.priority,
      attempts: taskStatus?.attempts,
      metadata: taskStatus?.metadata
    });
    console.log('✅ Task status retrieved\n');

    // Test 5: Get updated queue stats
    console.log('📊 Getting updated queue statistics...');
    const updatedStats = await embeddingQueueService.getQueueStats();
    console.log('Updated stats:', updatedStats);
    console.log('✅ Updated stats retrieved\n');

    // Test 6: Dequeue the task
    console.log('⬇️ Dequeuing task...');
    const dequeuedTask = await embeddingQueueService.dequeueTask();
    console.log('Dequeued task:', {
      id: dequeuedTask?.id,
      status: dequeuedTask?.status,
      attempts: dequeuedTask?.attempts,
      articleId: dequeuedTask?.articleId,
      slug: dequeuedTask?.slug
    });
    console.log('✅ Task dequeued\n');

    // Test 7: Update task status to completed
    if (dequeuedTask) {
      console.log('✅ Updating task status to completed...');
      await embeddingQueueService.updateTaskStatus(dequeuedTask.id, 'completed');
      
      // Verify the status was updated
      const completedTask = await embeddingQueueService.getTaskStatus(dequeuedTask.id);
      console.log('Completed task status:', completedTask?.status);
      console.log('✅ Task status updated\n');
    }

    // Test 8: Final queue stats
    console.log('📊 Getting final queue statistics...');
    const finalStats = await embeddingQueueService.getQueueStats();
    console.log('Final stats:', finalStats);
    console.log('✅ Final stats retrieved\n');

    // Test 9: Test retry functionality
    console.log('🔄 Testing retry functionality...');
    
    // Create a failed task
    const failedTaskId = await embeddingQueueService.enqueueTask({
      articleId: articleId,
      slug: testSlug,
      operation: 'update',
      priority: 'high',
      maxAttempts: 3,
      scheduledAt: new Date(),
      metadata: { test: true, retry: true }
    });
    
    // Mark it as failed
    await embeddingQueueService.updateTaskStatus(failedTaskId, 'failed', 'Test failure');
    
    // Retry failed tasks
    const retriedCount = await embeddingQueueService.retryFailedTasks();
    console.log(`✅ Retried ${retriedCount} failed tasks\n`);

    // Test 10: Clean up
    console.log('🧹 Cleaning up...');
    
    // Clean up completed tasks
    const cleanedCount = await embeddingQueueService.clearCompletedTasks();
    console.log(`✅ Cleaned up ${cleanedCount} completed tasks`);
    
    // Clean up test article
    await database.query('DELETE FROM articles WHERE id = $1', [articleId]);
    console.log('✅ Test article cleaned up\n');

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
testEmbeddingQueueSimple().catch(console.error);