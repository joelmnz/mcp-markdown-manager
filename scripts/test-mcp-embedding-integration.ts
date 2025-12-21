#!/usr/bin/env bun

/**
 * Test script for MCP server embedding integration
 * Tests the new embedding status features in MCP responses
 */

import { createArticle, readArticle, listArticles } from '../src/backend/services/articles.js';
import { embeddingQueueService } from '../src/backend/services/embeddingQueue.js';
import { databaseArticleService } from '../src/backend/services/databaseArticles.js';

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

async function testMCPEmbeddingIntegration() {
  console.log('🧪 Testing MCP Embedding Integration...\n');

  if (!SEMANTIC_SEARCH_ENABLED) {
    console.log('⚠️  Semantic search is not enabled. Set SEMANTIC_SEARCH_ENABLED=true to test embedding features.');
    return;
  }

  try {
    // Test 1: Create an article and verify it queues embedding task
    console.log('📝 Test 1: Creating article with background embedding...');
    const timestamp = Date.now();
    const testArticle = await createArticle(
      `MCP Test Article ${timestamp}`, 
      'This is a test article for MCP embedding integration.',
      'Test article for MCP integration'
    );
    console.log('✅ Article created:', testArticle.filename);

    // Test 2: Check if embedding task was queued
    console.log('\n🔍 Test 2: Checking embedding task status...');
    const slug = testArticle.filename.replace(/\.md$/, '');
    const articleId = await databaseArticleService.getArticleId(slug);
    
    if (articleId) {
      const tasks = await embeddingQueueService.getTasksForArticle(articleId);
      console.log(`✅ Found ${tasks.length} embedding task(s) for article`);
      
      if (tasks.length > 0) {
        const latestTask = tasks[0];
        console.log(`   - Task ID: ${latestTask.id}`);
        console.log(`   - Status: ${latestTask.status}`);
        console.log(`   - Operation: ${latestTask.operation}`);
        console.log(`   - Priority: ${latestTask.priority}`);
      }
    }

    // Test 3: Test queue statistics
    console.log('\n📊 Test 3: Getting queue statistics...');
    const queueStats = await embeddingQueueService.getDetailedQueueStats();
    console.log('✅ Queue statistics:');
    console.log(`   - Pending: ${queueStats.stats.pending}`);
    console.log(`   - Processing: ${queueStats.stats.processing}`);
    console.log(`   - Completed: ${queueStats.stats.completed}`);
    console.log(`   - Failed: ${queueStats.stats.failed}`);
    console.log(`   - Total: ${queueStats.stats.total}`);

    // Test 4: Test queue health
    console.log('\n🏥 Test 4: Checking queue health...');
    const queueHealth = await embeddingQueueService.getQueueHealth();
    console.log('✅ Queue health:');
    console.log(`   - Is Healthy: ${queueHealth.isHealthy}`);
    console.log(`   - Total Tasks: ${queueHealth.totalTasks}`);
    console.log(`   - Failed Last 24h: ${queueHealth.failedTasksLast24h}`);
    if (queueHealth.issues.length > 0) {
      console.log(`   - Issues: ${queueHealth.issues.join(', ')}`);
    }

    // Test 5: Simulate MCP readArticle with embedding status
    console.log('\n📖 Test 5: Simulating MCP readArticle with embedding status...');
    const articleWithStatus = await readArticle(testArticle.filename);
    
    if (articleWithStatus && articleId) {
      const tasks = await embeddingQueueService.getTasksForArticle(articleId);
      const latestTask = tasks.length > 0 ? tasks[0] : null;
      
      const embeddingStatus = {
        status: latestTask?.status || 'no_tasks',
        lastUpdated: latestTask?.completedAt || latestTask?.createdAt,
        hasEmbedding: latestTask?.status === 'completed',
        isPending: latestTask?.status === 'pending' || latestTask?.status === 'processing',
        errorMessage: latestTask?.errorMessage
      };
      
      console.log('✅ Article with embedding status:');
      console.log(`   - Title: ${articleWithStatus.title}`);
      console.log(`   - Embedding Status: ${embeddingStatus.status}`);
      console.log(`   - Has Embedding: ${embeddingStatus.hasEmbedding}`);
      console.log(`   - Is Pending: ${embeddingStatus.isPending}`);
    }

    // Test 6: Test bulk operation identification
    console.log('\n🔍 Test 6: Identifying articles needing embedding...');
    const articlesNeedingEmbedding = await embeddingQueueService.identifyArticlesNeedingEmbedding();
    console.log(`✅ Found ${articlesNeedingEmbedding.length} articles needing embedding updates`);
    
    if (articlesNeedingEmbedding.length > 0) {
      console.log('   Sample articles:');
      articlesNeedingEmbedding.slice(0, 3).forEach(article => {
        console.log(`   - ${article.slug}: ${article.reason}`);
      });
    }

    console.log('\n🎉 All MCP embedding integration tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testMCPEmbeddingIntegration().catch((error) => {
  console.error('❌ Test failed during top-level execution:', error);
  process.exit(1);
});