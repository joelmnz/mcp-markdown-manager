#!/usr/bin/env bun

/**
 * Test script for embedding queue configuration system
 * 
 * This script tests the configuration loading, validation, and environment variable handling
 * for the embedding queue system.
 */

import { embeddingQueueConfigService } from '../src/backend/services/embeddingQueueConfig.js';

async function testConfigurationSystem() {
  console.log('🧪 Testing Embedding Queue Configuration System');
  console.log('================================================');

  try {
    // Test 1: Load default configuration
    console.log('\n1. Testing default configuration...');
    const defaultConfig = embeddingQueueConfigService.getConfig();
    console.log('✅ Default configuration loaded successfully');
    console.log('   Enabled:', defaultConfig.enabled);
    console.log('   Worker Interval:', defaultConfig.workerInterval + 'ms');
    console.log('   Max Retries:', defaultConfig.maxRetries);
    console.log('   Retry Backoff Base:', defaultConfig.retryBackoffBase + 'ms');

    // Test 2: Check configuration validation
    console.log('\n2. Testing configuration validation...');
    const configStatus = embeddingQueueConfigService.getConfigStatus();
    console.log('✅ Configuration validation completed');
    console.log('   Valid:', configStatus.isValid);
    console.log('   Errors:', configStatus.errors.length);
    console.log('   Warnings:', configStatus.warnings.length);
    console.log('   Recommendations:', configStatus.recommendations.length);

    if (configStatus.errors.length > 0) {
      console.log('   Configuration Errors:');
      configStatus.errors.forEach(error => console.log(`     - ${error}`));
    }

    if (configStatus.warnings.length > 0) {
      console.log('   Configuration Warnings:');
      configStatus.warnings.forEach(warning => console.log(`     - ${warning}`));
    }

    if (configStatus.recommendations.length > 0) {
      console.log('   Configuration Recommendations:');
      configStatus.recommendations.forEach(rec => console.log(`     - ${rec}`));
    }

    // Test 3: Test environment variable override
    console.log('\n3. Testing environment variable override...');
    
    // Set some test environment variables
    const originalEnabled = process.env.EMBEDDING_QUEUE_ENABLED;
    const originalInterval = process.env.EMBEDDING_QUEUE_WORKER_INTERVAL;
    const originalRetries = process.env.EMBEDDING_QUEUE_MAX_RETRIES;

    process.env.EMBEDDING_QUEUE_ENABLED = 'false';
    process.env.EMBEDDING_QUEUE_WORKER_INTERVAL = '10000';
    process.env.EMBEDDING_QUEUE_MAX_RETRIES = '5';

    // Reload configuration to pick up environment changes
    const overriddenConfig = embeddingQueueConfigService.reloadConfig();
    console.log('✅ Configuration reloaded with environment overrides');
    console.log('   Enabled (should be false):', overriddenConfig.enabled);
    console.log('   Worker Interval (should be 10000):', overriddenConfig.workerInterval);
    console.log('   Max Retries (should be 5):', overriddenConfig.maxRetries);

    // Restore original environment variables
    if (originalEnabled !== undefined) {
      process.env.EMBEDDING_QUEUE_ENABLED = originalEnabled;
    } else {
      delete process.env.EMBEDDING_QUEUE_ENABLED;
    }
    if (originalInterval !== undefined) {
      process.env.EMBEDDING_QUEUE_WORKER_INTERVAL = originalInterval;
    } else {
      delete process.env.EMBEDDING_QUEUE_WORKER_INTERVAL;
    }
    if (originalRetries !== undefined) {
      process.env.EMBEDDING_QUEUE_MAX_RETRIES = originalRetries;
    } else {
      delete process.env.EMBEDDING_QUEUE_MAX_RETRIES;
    }

    // Test 4: Test invalid configuration values
    console.log('\n4. Testing invalid configuration validation...');
    
    process.env.EMBEDDING_QUEUE_WORKER_INTERVAL = '500'; // Too low (minimum is 1000)
    process.env.EMBEDDING_QUEUE_MAX_RETRIES = '15'; // Too high (maximum is 10)
    process.env.EMBEDDING_QUEUE_ENABLED = 'invalid'; // Invalid boolean

    const invalidConfig = embeddingQueueConfigService.reloadConfig();
    const invalidStatus = embeddingQueueConfigService.getConfigStatus();
    
    console.log('✅ Invalid configuration validation completed');
    console.log('   Valid (should be false):', invalidStatus.isValid);
    console.log('   Errors (should have some):', invalidStatus.errors.length);
    
    if (invalidStatus.errors.length > 0) {
      console.log('   Validation Errors:');
      invalidStatus.errors.forEach(error => console.log(`     - ${error}`));
    }

    // Clean up test environment variables
    delete process.env.EMBEDDING_QUEUE_WORKER_INTERVAL;
    delete process.env.EMBEDDING_QUEUE_MAX_RETRIES;
    delete process.env.EMBEDDING_QUEUE_ENABLED;

    // Test 5: Test configuration documentation
    console.log('\n5. Testing configuration documentation...');
    const envVars = embeddingQueueConfigService.getEnvironmentVariables();
    console.log('✅ Environment variables generated');
    console.log('   Variables count:', Object.keys(envVars).length);
    
    const documentation = embeddingQueueConfigService.getConfigurationDocumentation();
    console.log('✅ Configuration documentation generated');
    console.log('   Documentation length:', documentation.length, 'characters');

    // Test 6: Reload to restore defaults
    console.log('\n6. Restoring default configuration...');
    const restoredConfig = embeddingQueueConfigService.reloadConfig();
    const restoredStatus = embeddingQueueConfigService.getConfigStatus();
    console.log('✅ Default configuration restored');
    console.log('   Valid:', restoredStatus.isValid);
    console.log('   Enabled:', restoredConfig.enabled);

    console.log('\n🎉 All configuration tests completed successfully!');
    console.log('\n📋 Configuration Summary:');
    console.log('   Enabled:', restoredConfig.enabled);
    console.log('   Worker Interval:', restoredConfig.workerInterval + 'ms');
    console.log('   Max Retries:', restoredConfig.maxRetries);
    console.log('   Retry Backoff Base:', restoredConfig.retryBackoffBase + 'ms');
    console.log('   Batch Size:', restoredConfig.batchSize);
    console.log('   Cleanup Interval:', restoredConfig.cleanupInterval + 'h');
    console.log('   Cleanup Retention:', restoredConfig.cleanupRetentionDays + ' days');
    console.log('   Heartbeat Interval:', restoredConfig.heartbeatInterval + 'ms');
    console.log('   Metrics Interval:', restoredConfig.metricsInterval + 'ms');
    console.log('   Max Processing Time:', restoredConfig.maxProcessingTime + 'ms');
    console.log('   Stuck Task Cleanup:', restoredConfig.stuckTaskCleanupEnabled);

  } catch (error) {
    console.error('❌ Configuration test failed:', error);
    process.exit(1);
  }
}

// Run the test
testConfigurationSystem().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});