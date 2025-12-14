#!/usr/bin/env bun

/**
 * Test script for base path environment variable configuration
 * 
 * This script tests the base path service with various environment variable
 * configurations to ensure proper validation and fallback behavior.
 */

import { BasePathServiceImpl } from '../src/backend/services/basePath.js';

interface TestCase {
  name: string;
  baseUrl?: string;
  basePath?: string;
  expectedNormalizedPath: string;
  expectedIsRoot: boolean;
  expectedIsValid: boolean;
  shouldHaveWarnings?: boolean;
}

const testCases: TestCase[] = [
  {
    name: 'No configuration (root path)',
    expectedNormalizedPath: '',
    expectedIsRoot: true,
    expectedIsValid: true
  },
  {
    name: 'BASE_PATH with leading slash',
    basePath: '/md',
    expectedNormalizedPath: '/md',
    expectedIsRoot: false,
    expectedIsValid: true
  },
  {
    name: 'BASE_PATH without leading slash',
    basePath: 'md',
    expectedNormalizedPath: '/md',
    expectedIsRoot: false,
    expectedIsValid: true,
    shouldHaveWarnings: true
  },
  {
    name: 'BASE_PATH with trailing slash',
    basePath: '/md/',
    expectedNormalizedPath: '/md',
    expectedIsRoot: false,
    expectedIsValid: true,
    shouldHaveWarnings: true
  },
  {
    name: 'BASE_URL with full URL',
    baseUrl: 'https://example.com/app',
    expectedNormalizedPath: '/app',
    expectedIsRoot: false,
    expectedIsValid: true
  },
  {
    name: 'BASE_URL as path only',
    baseUrl: '/docs',
    expectedNormalizedPath: '/docs',
    expectedIsRoot: false,
    expectedIsValid: true
  },
  {
    name: 'Both BASE_URL and BASE_PATH (BASE_URL takes precedence)',
    baseUrl: 'https://example.com/app',
    basePath: '/md',
    expectedNormalizedPath: '/app',
    expectedIsRoot: false,
    expectedIsValid: true,
    shouldHaveWarnings: true
  },
  {
    name: 'Invalid path with double slashes',
    basePath: '/invalid//path',
    expectedNormalizedPath: '',
    expectedIsRoot: true,
    expectedIsValid: false
  },
  {
    name: 'Invalid path with special characters',
    basePath: '/invalid@path',
    expectedNormalizedPath: '',
    expectedIsRoot: true,
    expectedIsValid: false
  },
  {
    name: 'Root path as BASE_PATH',
    basePath: '/',
    expectedNormalizedPath: '',
    expectedIsRoot: true,
    expectedIsValid: true
  },
  {
    name: 'Multi-level path',
    basePath: '/app/docs/articles',
    expectedNormalizedPath: '/app/docs/articles',
    expectedIsRoot: false,
    expectedIsValid: true
  }
];

function runTest(testCase: TestCase): boolean {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  
  // Set up environment variables
  if (testCase.baseUrl !== undefined) {
    process.env.BASE_URL = testCase.baseUrl;
  } else {
    delete process.env.BASE_URL;
  }
  
  if (testCase.basePath !== undefined) {
    process.env.BASE_PATH = testCase.basePath;
  } else {
    delete process.env.BASE_PATH;
  }
  
  console.log(`   BASE_URL: ${process.env.BASE_URL || 'Not set'}`);
  console.log(`   BASE_PATH: ${process.env.BASE_PATH || 'Not set'}`);
  
  // Create new service instance to pick up environment changes
  const service = new BasePathServiceImpl();
  const config = service.getConfig();
  const validation = service.validateEnvironmentConfiguration();
  
  // Check results
  let passed = true;
  
  if (config.normalizedPath !== testCase.expectedNormalizedPath) {
    console.log(`   ❌ Expected normalizedPath: "${testCase.expectedNormalizedPath}", got: "${config.normalizedPath}"`);
    passed = false;
  } else {
    console.log(`   ✅ normalizedPath: "${config.normalizedPath}"`);
  }
  
  if (config.isRoot !== testCase.expectedIsRoot) {
    console.log(`   ❌ Expected isRoot: ${testCase.expectedIsRoot}, got: ${config.isRoot}`);
    passed = false;
  } else {
    console.log(`   ✅ isRoot: ${config.isRoot}`);
  }
  
  if (config.isValid !== testCase.expectedIsValid) {
    console.log(`   ❌ Expected isValid: ${testCase.expectedIsValid}, got: ${config.isValid}`);
    passed = false;
  } else {
    console.log(`   ✅ isValid: ${config.isValid}`);
  }
  
  if (testCase.shouldHaveWarnings && validation.warnings.length === 0) {
    console.log(`   ❌ Expected warnings but got none`);
    passed = false;
  } else if (!testCase.shouldHaveWarnings && validation.warnings.length > 0) {
    console.log(`   ❌ Unexpected warnings: ${validation.warnings.join(', ')}`);
    passed = false;
  } else {
    console.log(`   ✅ Warnings: ${validation.warnings.length > 0 ? validation.warnings.join(', ') : 'None'}`);
  }
  
  return passed;
}

function main() {
  console.log('🚀 Base Path Configuration Test Suite');
  console.log('=====================================');
  
  let totalTests = 0;
  let passedTests = 0;
  
  for (const testCase of testCases) {
    totalTests++;
    if (runTest(testCase)) {
      passedTests++;
    }
  }
  
  console.log('\n📊 Test Results');
  console.log('===============');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  }
}

main();