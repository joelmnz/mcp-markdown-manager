/**
 * Basic tests for runtime configuration utilities
 * These tests verify the core functionality without requiring a full test framework
 */

import { 
  initializeRuntimeConfig, 
  getRuntimeConfig, 
  isRuntimeConfigAvailable,
  updateRuntimeConfig,
  resetRuntimeConfig 
} from '../runtimeConfig';

// Mock window.__APP_CONFIG__ for testing
declare global {
  interface Window {
    __APP_CONFIG__: any;
  }
}

/**
 * Simple test runner
 */
function runTests() {
  console.log('🧪 Running Runtime Configuration Tests...\n');

  // Test 1: Default configuration when no runtime config is available
  resetRuntimeConfig();
  delete (window as any).__APP_CONFIG__;
  
  const result1 = initializeRuntimeConfig();
  console.log('Test 1 - No runtime config:', {
    isValid: result1.isValid,
    config: result1.config,
    expected: { baseUrl: '', apiBaseUrl: '', mcpBaseUrl: '' }
  });

  // Test 2: Valid runtime configuration
  resetRuntimeConfig();
  (window as any).__APP_CONFIG__ = {
    baseUrl: '/md',
    apiBaseUrl: '/md',
    mcpBaseUrl: '/md'
  };
  
  const result2 = initializeRuntimeConfig();
  console.log('Test 2 - Valid config:', {
    isValid: result2.isValid,
    config: result2.config,
    isAvailable: isRuntimeConfigAvailable()
  });

  // Test 3: Path normalization
  resetRuntimeConfig();
  (window as any).__APP_CONFIG__ = {
    baseUrl: 'md/',
    apiBaseUrl: '/md/',
    mcpBaseUrl: 'md'
  };
  
  const result3 = initializeRuntimeConfig();
  console.log('Test 3 - Path normalization:', {
    config: result3.config,
    expected: { baseUrl: '/md', apiBaseUrl: '/md', mcpBaseUrl: '/md' }
  });

  // Test 4: Invalid configuration
  resetRuntimeConfig();
  (window as any).__APP_CONFIG__ = {
    baseUrl: 123,
    apiBaseUrl: null,
    mcpBaseUrl: undefined
  };
  
  const result4 = initializeRuntimeConfig();
  console.log('Test 4 - Invalid config:', {
    isValid: result4.isValid,
    errors: result4.errors
  });

  // Test 5: Configuration update
  resetRuntimeConfig();
  initializeRuntimeConfig();
  
  const updateResult = updateRuntimeConfig({
    baseUrl: '/updated',
    apiBaseUrl: '/updated/api'
  });
  
  console.log('Test 5 - Configuration update:', {
    isValid: updateResult.isValid,
    config: updateResult.config
  });

  console.log('\n✅ Runtime Configuration Tests Complete');
}

// Export for manual testing
export { runTests };

// Auto-run if this file is executed directly
if (typeof window !== 'undefined') {
  runTests();
}