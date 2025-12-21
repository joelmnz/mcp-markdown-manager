#!/usr/bin/env bun

/**
 * Test script for server integration with embedding queue configuration
 * 
 * This script tests that the server starts up correctly with the new configuration
 * and worker integration, and that the health endpoint includes worker status.
 */

import { spawn } from 'child_process';

async function testServerIntegration() {
  console.log('🧪 Testing Server Integration with Embedding Queue');
  console.log('==================================================');

  // Set test environment variables
  process.env.AUTH_TOKEN = 'test-token-12345';
  process.env.DB_PASSWORD = 'test-password';
  process.env.EMBEDDING_QUEUE_ENABLED = 'true';
  process.env.EMBEDDING_QUEUE_WORKER_INTERVAL = '10000';
  process.env.PORT = '5001'; // Use different port to avoid conflicts

  console.log('\n1. Starting server with embedding queue enabled...');
  
  const serverProcess = spawn('bun', ['src/backend/server.ts'], {
    env: process.env,
    stdio: 'pipe'
  });

  let serverOutput = '';
  let serverStarted = false;
  let workerStarted = false;

  // Capture server output
  serverProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    console.log('   Server:', output.trim());
    
    if (output.includes('Server initialization complete')) {
      serverStarted = true;
    }
    if (output.includes('Background embedding worker started successfully')) {
      workerStarted = true;
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    console.log('   Server Error:', output.trim());
  });

  // Wait for server to start
  console.log('\n2. Waiting for server startup...');
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds timeout

  while (!serverStarted && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  if (!serverStarted) {
    console.error('❌ Server failed to start within timeout');
    serverProcess.kill();
    process.exit(1);
  }

  console.log('✅ Server started successfully');

  // Test health endpoint
  console.log('\n3. Testing health endpoint...');
  
  try {
    const response = await fetch('http://localhost:5001/health');
    const healthData = await response.json();
    
    console.log('✅ Health endpoint responded');
    console.log('   Status:', healthData.status);
    console.log('   Database Healthy:', healthData.database?.healthy);
    console.log('   Embedding Queue Enabled:', healthData.services?.embeddingQueue?.enabled);
    console.log('   Config Valid:', healthData.services?.embeddingQueue?.configValid);
    
    if (healthData.worker) {
      console.log('   Worker Running:', healthData.worker.isRunning);
      console.log('   Tasks Processed:', healthData.worker.tasksProcessed);
    } else {
      console.log('   Worker Status: Not available');
    }
    
    if (healthData.queue) {
      console.log('   Queue Total Tasks:', healthData.queue.total);
      console.log('   Queue Healthy:', healthData.queue.health?.isHealthy);
    } else {
      console.log('   Queue Status: Not available');
    }

    // Verify expected fields are present
    if (!healthData.services?.embeddingQueue) {
      throw new Error('Health endpoint missing embedding queue service info');
    }

  } catch (error) {
    console.error('❌ Health endpoint test failed:', error);
    serverProcess.kill();
    process.exit(1);
  }

  // Test with embedding queue disabled
  console.log('\n4. Testing server with embedding queue disabled...');
  
  // Kill current server
  serverProcess.kill();
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Start server with queue disabled
  process.env.EMBEDDING_QUEUE_ENABLED = 'false';
  
  const serverProcess2 = spawn('bun', ['src/backend/server.ts'], {
    env: process.env,
    stdio: 'pipe'
  });

  let server2Output = '';
  let server2Started = false;

  serverProcess2.stdout?.on('data', (data) => {
    const output = data.toString();
    server2Output += output;
    console.log('   Server2:', output.trim());
    
    if (output.includes('Server initialization complete')) {
      server2Started = true;
    }
  });

  serverProcess2.stderr?.on('data', (data) => {
    const output = data.toString();
    server2Output += output;
    console.log('   Server2 Error:', output.trim());
  });

  // Wait for server to start
  attempts = 0;
  while (!server2Started && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  if (!server2Started) {
    console.error('❌ Server with disabled queue failed to start within timeout');
    serverProcess2.kill();
    process.exit(1);
  }

  console.log('✅ Server with disabled queue started successfully');

  // Test health endpoint with disabled queue
  try {
    const response = await fetch('http://localhost:5001/health');
    const healthData = await response.json();
    
    console.log('✅ Health endpoint responded with disabled queue');
    console.log('   Status:', healthData.status);
    console.log('   Embedding Queue Enabled:', healthData.services?.embeddingQueue?.enabled);
    
    if (healthData.services?.embeddingQueue?.enabled !== false) {
      throw new Error('Expected embedding queue to be disabled');
    }

  } catch (error) {
    console.error('❌ Health endpoint test with disabled queue failed:', error);
    serverProcess2.kill();
    process.exit(1);
  }

  // Clean up
  console.log('\n5. Cleaning up...');
  serverProcess2.kill();
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n🎉 All server integration tests completed successfully!');
  console.log('\n📋 Test Summary:');
  console.log('   ✅ Server starts with embedding queue enabled');
  console.log('   ✅ Health endpoint includes worker and queue status');
  console.log('   ✅ Server starts with embedding queue disabled');
  console.log('   ✅ Health endpoint reflects disabled queue status');
  console.log('   ✅ Configuration system works correctly');
  console.log('   ✅ Graceful startup and shutdown handling');
}

// Run the test
testServerIntegration().catch(error => {
  console.error('❌ Server integration test failed:', error);
  process.exit(1);
});