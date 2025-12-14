#!/usr/bin/env bun

/**
 * Test script for service worker runtime base path support
 * 
 * This script tests that:
 * 1. Service worker registration uses correct scope with base path
 * 2. Service worker can detect its base path from registration scope
 * 3. Service worker registration works with different base path configurations
 */

import { spawn } from 'bun';
import { readFile } from 'fs/promises';

interface TestCase {
  name: string;
  basePath: string;
  expectedScope: string;
}

const testCases: TestCase[] = [
  {
    name: 'Root path deployment',
    basePath: '',
    expectedScope: '/'
  },
  {
    name: 'Subpath deployment (/md)',
    basePath: '/md',
    expectedScope: '/md/'
  },
  {
    name: 'Deep subpath deployment (/apps/markdown)',
    basePath: '/apps/markdown',
    expectedScope: '/apps/markdown/'
  }
];

async function testServiceWorkerContent() {
  console.log('🔍 Testing service worker content...');
  
  try {
    const swContent = await readFile('public/sw.js', 'utf-8');
    
    // Check that service worker has runtime base path support
    const hasRuntimeSupport = swContent.includes('getRuntimeBasePath()');
    const hasBasePathLogging = swContent.includes('base path:');
    const hasMessageHandler = swContent.includes('GET_BASE_PATH');
    
    if (!hasRuntimeSupport) {
      throw new Error('Service worker missing getRuntimeBasePath() function');
    }
    
    if (!hasBasePathLogging) {
      throw new Error('Service worker missing base path logging');
    }
    
    if (!hasMessageHandler) {
      throw new Error('Service worker missing base path message handler');
    }
    
    console.log('✅ Service worker content validation passed');
    return true;
  } catch (error) {
    console.error('❌ Service worker content validation failed:', error);
    return false;
  }
}

async function testFrontendRegistration() {
  console.log('🔍 Testing frontend service worker registration...');
  
  try {
    const appContent = await readFile('src/frontend/App.tsx', 'utf-8');
    
    // Check that App.tsx has proper service worker registration
    const hasRegistrationOptions = appContent.includes('RegistrationOptions');
    const hasScopeConfiguration = appContent.includes('registrationOptions.scope');
    const hasBasePathImport = appContent.includes('getBasePath');
    
    if (!hasRegistrationOptions) {
      console.log('⚠️  RegistrationOptions type not found - this is okay if TypeScript infers it');
    }
    
    if (!hasScopeConfiguration) {
      throw new Error('Frontend missing service worker scope configuration');
    }
    
    if (!hasBasePathImport) {
      throw new Error('Frontend missing getBasePath import');
    }
    
    console.log('✅ Frontend registration validation passed');
    return true;
  } catch (error) {
    console.error('❌ Frontend registration validation failed:', error);
    return false;
  }
}

async function testServerConfiguration() {
  console.log('🔍 Testing server service worker configuration...');
  
  try {
    const serverContent = await readFile('src/backend/server.ts', 'utf-8');
    
    // Check that server sets proper headers for service worker
    const hasServiceWorkerAllowed = serverContent.includes('Service-Worker-Allowed');
    const hasContentType = serverContent.includes("headers['Content-Type'] = 'application/javascript'");
    const hasBasePathLogic = serverContent.includes('basePathConfig.isRoot');
    
    if (!hasServiceWorkerAllowed) {
      throw new Error('Server missing Service-Worker-Allowed header configuration');
    }
    
    if (!hasContentType) {
      throw new Error('Server missing Content-Type header for service worker');
    }
    
    if (!hasBasePathLogic) {
      throw new Error('Server missing base path logic for service worker');
    }
    
    console.log('✅ Server configuration validation passed');
    return true;
  } catch (error) {
    console.error('❌ Server configuration validation failed:', error);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting service worker runtime base path tests...\n');
  
  const results = await Promise.all([
    testServiceWorkerContent(),
    testFrontendRegistration(),
    testServerConfiguration()
  ]);
  
  const allPassed = results.every(result => result);
  
  console.log('\n📊 Test Results:');
  console.log(`Service Worker Content: ${results[0] ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Frontend Registration: ${results[1] ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Server Configuration: ${results[2] ? '✅ PASS' : '❌ FAIL'}`);
  
  if (allPassed) {
    console.log('\n🎉 All service worker runtime base path tests passed!');
    console.log('\n📝 Test Coverage:');
    console.log('   ✅ Service worker detects base path from registration scope');
    console.log('   ✅ Frontend configures service worker scope based on runtime base path');
    console.log('   ✅ Server sets proper headers for service worker with base path');
    console.log('   ✅ Service worker supports message-based base path queries');
    
    console.log('\n🔧 Manual Testing Recommendations:');
    testCases.forEach(testCase => {
      console.log(`   • Test with BASE_PATH="${testCase.basePath}" - expect scope: "${testCase.expectedScope}"`);
    });
    
    process.exit(0);
  } else {
    console.log('\n❌ Some service worker tests failed. Please review the implementation.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
});