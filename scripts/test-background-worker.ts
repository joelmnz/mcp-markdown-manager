#!/usr/bin/env bun

/**
 * Test script for background worker functionality
 * Tests worker lifecycle management and basic operations
 */

import { database, getDatabaseConfig } from '../src/backend/services/database.js';
import { backgroundWorkerService } from '../src/backend/services/backgroundWorker.js';
import { embeddingQueueService } from '../src/backend/services/embeddingQueue.js';

async function testBackgroundWorker() {
  console.log('🧪 Testing Background Worker Service...\n');

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    const config = getDatabaseConfig();
    await database.connect(config);
    console.log('✅ Database connected\n');

    // Test 1: Worker lifecycle management
    console.log('🔄 Test 1: Worker Lifecycle Management');
    
    // Check initial state
    console.log('  Checking initial worker state...');
    const initialStats = await backgroundWorkerService.getWorkerStats();
    console.log('  Initial stats:', {
      isRunning: initialStats.isRunning,
      tasksProcessed: initialStats.tasksProcessed
    });

    // Start worker
    console.log('  Starting worker...');
    await backgroundWorkerService.start();
    console.log('  ✅ Worker started');

    // Check running state
    const runningState = backgroundWorkerService.isRunning();
    console.log('  Worker running state:', runningState);

    // Get stats after start
    const runningStats = await backgroundWorkerService.getWorkerStats();
    console.log('  Running stats:', {
      isRunning: runningStats.isRunning,
      tasksProcessed: runningStats.tasksProcessed
    });

    // Test 2: Queue integration
    console.log('\n📋 Test 2: Queue Integration');
    
    // Get initial queue stats
    const initialQueueStats = await embeddingQueueService.getQueueStats();
    console.log('  Initial queue stats:', initialQueueStats);

    // Test 3: Worker stop
    console.log('\n🛑 Test 3: Worker Stop');
    
    // Stop worker
    console.log('  Stopping worker...');
    await backgroundWorkerService.stop();
    console.log('  ✅ Worker stopped');

    // Check stopped state
    const stoppedState = backgroundWorkerService.isRunning();
    console.log('  Worker running state after stop:', stoppedState);

    // Get final stats
    const finalStats = await backgroundWorkerService.getWorkerStats();
    console.log('  Final stats:', {
      isRunning: finalStats.isRunning,
      tasksProcessed: finalStats.tasksProcessed
    });

    console.log('\n✅ All background worker tests completed successfully!');

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
testBackgroundWorker().catch(console.error);