#!/usr/bin/env bun

/**
 * Test script for API client runtime configuration support
 * 
 * This script tests that:
 * 1. API client correctly uses runtime configuration for URL building
 * 2. API client handles different base path configurations
 * 3. API client falls back gracefully when runtime config is unavailable
 * 4. All API methods (GET, POST, PUT, DELETE) respect base path configuration
 */

interface TestCase {
  name: string;
  baseUrl: string;
  apiBaseUrl: string;
  expectedUrlPrefix: string;
}

const testCases: TestCase[] = [
  {
    name: 'Root path deployment',
    baseUrl: '',
    apiBaseUrl: '',
    expectedUrlPrefix: '/api'
  },
  {
    name: 'Subpath deployment',
    baseUrl: '/md',
    apiBaseUrl: '/md',
    expectedUrlPrefix: '/md/api'
  },
  {
    name: 'Deep subpath deployment',
    baseUrl: '/apps/markdown',
    apiBaseUrl: '/apps/markdown',
    expectedUrlPrefix: '/apps/markdown/api'
  }
];

// Mock global window object for testing
const mockWindow = {
  __APP_CONFIG__: null as any
};

// Mock fetch to capture URL calls
const mockFetch = (url: string, options?: RequestInit): Promise<Response> => {
  console.log(`  📡 Mock fetch called with URL: ${url}`);
  console.log(`  📋 Method: ${options?.method || 'GET'}`);
  
  // Return a mock successful response
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
    text: () => Promise.resolve('{"success": true}')
  } as Response);
};

async function testApiClientConfiguration() {
  console.log('🔍 Testing API client runtime configuration...\n');
  
  let allTestsPassed = true;
  
  for (const testCase of testCases) {
    console.log(`--- Testing: ${testCase.name} ---`);
    
    try {
      // Set up mock runtime configuration
      mockWindow.__APP_CONFIG__ = {
        baseUrl: testCase.baseUrl,
        apiBaseUrl: testCase.apiBaseUrl,
        mcpBaseUrl: testCase.apiBaseUrl
      };
      
      // Mock global window
      (global as any).window = mockWindow;
      (global as any).fetch = mockFetch;
      
      // Import API client after setting up mocks
      const { ApiClient } = await import('../src/frontend/utils/apiClient');
      
      // Create new API client instance
      const apiClient = new ApiClient();
      
      console.log(`  🔧 Configuration: baseUrl="${testCase.baseUrl}", apiBaseUrl="${testCase.apiBaseUrl}"`);
      
      // Test different HTTP methods
      const testEndpoints = [
        { method: 'GET', endpoint: '/api/articles', expectedUrl: `${testCase.expectedUrlPrefix}/articles` },
        { method: 'POST', endpoint: '/api/articles', expectedUrl: `${testCase.expectedUrlPrefix}/articles` },
        { method: 'PUT', endpoint: '/api/articles/test.md', expectedUrl: `${testCase.expectedUrlPrefix}/articles/test.md` },
        { method: 'DELETE', endpoint: '/api/articles/test.md', expectedUrl: `${testCase.expectedUrlPrefix}/articles/test.md` }
      ];
      
      let testCasePassed = true;
      
      for (const test of testEndpoints) {
        console.log(`  🧪 Testing ${test.method} ${test.endpoint}`);
        
        // Capture the actual URL that would be called
        let capturedUrl = '';
        (global as any).fetch = (url: string, options?: RequestInit) => {
          capturedUrl = url;
          return mockFetch(url, options);
        };
        
        // Call the appropriate API client method
        try {
          switch (test.method) {
            case 'GET':
              await apiClient.get(test.endpoint, 'test-token');
              break;
            case 'POST':
              await apiClient.post(test.endpoint, { test: 'data' }, 'test-token');
              break;
            case 'PUT':
              await apiClient.put(test.endpoint, { test: 'data' }, 'test-token');
              break;
            case 'DELETE':
              await apiClient.delete(test.endpoint, 'test-token');
              break;
          }
          
          // Verify the URL matches expected pattern
          if (capturedUrl === test.expectedUrl) {
            console.log(`    ✅ ${test.method} URL correct: ${capturedUrl}`);
          } else {
            console.log(`    ❌ ${test.method} URL incorrect: expected "${test.expectedUrl}", got "${capturedUrl}"`);
            testCasePassed = false;
            allTestsPassed = false;
          }
        } catch (error) {
          console.log(`    ❌ ${test.method} failed with error: ${error}`);
          testCasePassed = false;
          allTestsPassed = false;
        }
      }
      
      if (testCasePassed) {
        console.log(`  ✅ ${testCase.name} - All API methods work correctly\n`);
      } else {
        console.log(`  ❌ ${testCase.name} - Some API methods failed\n`);
      }
      
    } catch (error) {
      console.log(`  ❌ ${testCase.name} - Setup failed: ${error}\n`);
      allTestsPassed = false;
    }
  }
  
  return allTestsPassed;
}

async function testFallbackBehavior() {
  console.log('🔍 Testing API client fallback behavior...\n');
  
  try {
    // Test with no runtime configuration
    console.log('--- Testing: No runtime configuration ---');
    
    mockWindow.__APP_CONFIG__ = undefined;
    (global as any).window = mockWindow;
    
    const { ApiClient } = await import('../src/frontend/utils/apiClient');
    const apiClient = new ApiClient();
    
    let capturedUrl = '';
    (global as any).fetch = (url: string, options?: RequestInit) => {
      capturedUrl = url;
      return mockFetch(url, options);
    };
    
    await apiClient.get('/api/articles', 'test-token');
    
    if (capturedUrl === '/api/articles') {
      console.log('  ✅ Fallback behavior works correctly - uses root path');
      return true;
    } else {
      console.log(`  ❌ Fallback behavior failed - expected "/api/articles", got "${capturedUrl}"`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ❌ Fallback test failed: ${error}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting API client runtime configuration tests...\n');
  
  const configTestPassed = await testApiClientConfiguration();
  const fallbackTestPassed = await testFallbackBehavior();
  
  const allPassed = configTestPassed && fallbackTestPassed;
  
  console.log('📊 Test Results:');
  console.log(`API Client Configuration: ${configTestPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Fallback Behavior: ${fallbackTestPassed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (allPassed) {
    console.log('\n🎉 All API client runtime configuration tests passed!');
    console.log('\n📝 Test Coverage:');
    console.log('   ✅ API client uses runtime configuration for URL building');
    console.log('   ✅ All HTTP methods (GET, POST, PUT, DELETE) respect base path');
    console.log('   ✅ API client handles different base path configurations');
    console.log('   ✅ API client falls back gracefully when runtime config is unavailable');
    
    console.log('\n🔧 Manual Testing Recommendations:');
    testCases.forEach(testCase => {
      console.log(`   • Test with BASE_PATH="${testCase.baseUrl}" - expect API URLs to start with "${testCase.expectedUrlPrefix}"`);
    });
    
    process.exit(0);
  } else {
    console.log('\n❌ Some API client tests failed. Please review the implementation.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
});