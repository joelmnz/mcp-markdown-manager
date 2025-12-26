#!/usr/bin/env bun
/**
 * Security validation test script
 * Tests the input validation and security threat detection
 */

import {
  validateFilename,
  validateTitle,
  validateContent,
  validateFolder,
  validateQuery,
  validateArray,
  validateNumber,
  detectSecurityThreats,
} from '../src/backend/mcp/validation';

console.log('🔒 Testing Security Validation Functions\n');

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => boolean) {
  try {
    const result = fn();
    if (result) {
      console.log(`✅ PASS: ${name}`);
      passCount++;
    } else {
      console.log(`❌ FAIL: ${name}`);
      failCount++;
    }
  } catch (error) {
    console.log(`❌ ERROR: ${name} - ${error}`);
    failCount++;
  }
}

// Filename validation tests
console.log('\n📄 Filename Validation Tests');
test('Valid filename', () => {
  const result = validateFilename('my-article.md');
  return result.valid && result.sanitized === 'my-article.md';
});

test('Reject filename without .md extension', () => {
  const result = validateFilename('my-article.txt');
  return !result.valid;
});

test('Reject filename with path traversal', () => {
  const result = validateFilename('../etc/passwd.md');
  return !result.valid;
});

test('Reject filename with uppercase', () => {
  const result = validateFilename('MyArticle.md');
  return !result.valid;
});

test('Reject filename starting with hyphen', () => {
  const result = validateFilename('-article.md');
  return !result.valid;
});

// Title validation tests
console.log('\n📝 Title Validation Tests');
test('Valid title', () => {
  const result = validateTitle('My Great Article');
  return result.valid && result.sanitized === 'My Great Article';
});

test('Reject empty title', () => {
  const result = validateTitle('');
  return !result.valid;
});

test('Reject excessively long title', () => {
  const result = validateTitle('A'.repeat(600));
  return !result.valid;
});

test('Accept title with special characters', () => {
  const result = validateTitle('Article: A Study (2024)');
  return result.valid;
});

// Content validation tests
console.log('\n📄 Content Validation Tests');
test('Valid content', () => {
  const result = validateContent('# Heading\n\nSome content here.');
  return result.valid;
});

test('Reject empty content', () => {
  const result = validateContent('');
  return !result.valid;
});

test('Reject excessively large content', () => {
  const result = validateContent('A'.repeat(15 * 1024 * 1024)); // 15MB
  return !result.valid;
});

// Folder validation tests
console.log('\n📁 Folder Validation Tests');
test('Valid folder path', () => {
  const result = validateFolder('tech/ai');
  return result.valid && result.sanitized === 'tech/ai';
});

test('Accept empty folder (root)', () => {
  const result = validateFolder('');
  return result.valid && result.sanitized === '';
});

test('Accept slash as root', () => {
  const result = validateFolder('/');
  return result.valid && result.sanitized === '';
});

test('Reject folder with path traversal', () => {
  const result = validateFolder('tech/../etc');
  return !result.valid;
});

test('Reject folder with special characters', () => {
  const result = validateFolder('tech/<script>');
  return !result.valid;
});

// Query validation tests
console.log('\n🔍 Query Validation Tests');
test('Valid search query', () => {
  const result = validateQuery('artificial intelligence');
  return result.valid && result.sanitized === 'artificial intelligence';
});

test('Reject empty query', () => {
  const result = validateQuery('');
  return !result.valid;
});

test('Reject excessively long query', () => {
  const result = validateQuery('A'.repeat(1500));
  return !result.valid;
});

// Array validation tests
console.log('\n📋 Array Validation Tests');
test('Valid array', () => {
  const result = validateArray(['item1', 'item2'], 'test', {
    maxLength: 10,
    itemValidator: (item) => validateQuery(item),
  });
  return result.valid && result.sanitized?.length === 2;
});

test('Reject empty array', () => {
  const result = validateArray([], 'test', { minLength: 1 });
  return !result.valid;
});

test('Reject array exceeding max length', () => {
  const result = validateArray(Array(150).fill('item'), 'test', { maxLength: 100 });
  return !result.valid;
});

// Number validation tests
console.log('\n🔢 Number Validation Tests');
test('Valid number', () => {
  const result = validateNumber(42, 'count', { min: 1, max: 100 });
  return result.valid && result.sanitized === 42;
});

test('Reject number below minimum', () => {
  const result = validateNumber(0, 'count', { min: 1 });
  return !result.valid;
});

test('Reject number above maximum', () => {
  const result = validateNumber(1001, 'count', { max: 1000 });
  return !result.valid;
});

test('Validate integer requirement', () => {
  const result = validateNumber(3.14, 'count', { integer: true });
  return !result.valid;
});

// Security threat detection tests
console.log('\n🛡️  Security Threat Detection Tests');
test('Detect SQL injection attempt', () => {
  const threats = detectSecurityThreats("'; DROP TABLE articles;--");
  return threats.length > 0 && threats.some(t => t.includes('SQL injection'));
});

test('Detect command injection attempt', () => {
  const threats = detectSecurityThreats('$(rm -rf /)');
  return threats.length > 0 && threats.some(t => t.includes('command injection'));
});

test('Detect path traversal attempt', () => {
  const threats = detectSecurityThreats('../../../etc/passwd');
  return threats.length > 0 && threats.some(t => t.includes('Path traversal'));
});

test('Detect XSS attempt', () => {
  const threats = detectSecurityThreats('<script>alert("xss")</script>');
  return threats.length > 0 && threats.some(t => t.includes('XSS'));
});

test('No false positives for normal query', () => {
  const threats = detectSecurityThreats('artificial intelligence research');
  return threats.length === 0;
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${passCount} passed, ${failCount} failed`);
if (failCount === 0) {
  console.log('\n✅ All security validation tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Please review the validation implementation.');
  process.exit(1);
}
