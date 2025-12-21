#!/usr/bin/env bun
/**
 * Test script for bulk embedding operations
 */

import { embeddingQueueService } from '../src/backend/services/embeddingQueue.js';
import { database, getDatabaseConfig } from '../src/backend/services/database.js';

async function testBulkOperations(): Promise<void> {
  console.log('🧪 Testing bulk embedding operations...\n');
  
  try {
    // Initialize database connection
    await database.connect(getDatabaseConfig());
    
    // Test 1: Identify articles needing embedding
    console.log('1️⃣ Testing identifyArticlesNeedingEmbedding...');
    const articlesNeedingUpdate = await embeddingQueueService.identifyArticlesNeedingEmbedding();
    console.log(`   Found ${articlesNeedingUpdate.length} articles needing embedding updates`);
    
    if (articlesNeedingUpdate.length > 0) {
      console.log('   Sample articles:');
      articlesNeedingUpdate.slice(0, 3).forEach(article => {
        console.log(`   - ${article.slug}: ${article.reason}`);
      });
    }
    
    // Test 2: Get queue stats
    console.log('\n2️⃣ Testing queue statistics...');
    const stats = await embeddingQueueService.getQueueStats();
    console.log(`   Queue stats: ${stats.pending} pending, ${stats.processing} processing, ${stats.completed} completed, ${stats.failed} failed`);
    
    // Test 3: Get detailed queue stats
    console.log('\n3️⃣ Testing detailed queue statistics...');
    const detailedStats = await embeddingQueueService.getDetailedQueueStats();
    console.log(`   Tasks by priority: high=${detailedStats.tasksByPriority.high}, normal=${detailedStats.tasksByPriority.normal}, low=${detailedStats.tasksByPriority.low}`);
    console.log(`   Tasks by operation: create=${detailedStats.tasksByOperation.create}, update=${detailedStats.tasksByOperation.update}, delete=${detailedStats.tasksByOperation.delete}`);
    console.log(`   Recent activity: ${detailedStats.recentActivity.tasksCompletedLast24h} completed, ${detailedStats.recentActivity.tasksFailedLast24h} failed in last 24h`);
    
    // Test 4: List recent bulk operations
    console.log('\n4️⃣ Testing recent bulk operations...');
    const recentOperations = await embeddingQueueService.listRecentBulkOperations(5);
    console.log(`   Found ${recentOperations.length} recent bulk operations`);
    
    if (recentOperations.length > 0) {
      console.log('   Recent operations:');
      recentOperations.forEach(op => {
        console.log(`   - ${op.operationId}: ${op.status}, ${op.totalTasks} tasks, ${op.successRate.toFixed(1)}% success rate`);
      });
    }
    
    // Test 5: Queue health
    console.log('\n5️⃣ Testing queue health...');
    const health = await embeddingQueueService.getQueueHealth();
    console.log(`   Queue health: ${health.isHealthy ? '✅ Healthy' : '⚠️ Issues detected'}`);
    console.log(`   Total tasks: ${health.totalTasks}`);
    console.log(`   Failed tasks (24h): ${health.failedTasksLast24h}`);
    
    if (health.issues.length > 0) {
      console.log('   Issues:');
      health.issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    console.log('\n✅ All bulk operation tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await database.disconnect();
  }
}

// Run the test
testBulkOperations().catch(error => {
  console.error('❌ Unhandled test error:', error);
  process.exit(1);
});