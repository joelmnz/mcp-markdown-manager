#!/usr/bin/env bun

/**
 * Test script to verify database error handling and constraint validation
 */

import { 
  handleDatabaseError, 
  DatabaseServiceError, 
  DatabaseErrorType,
  PG_ERROR_CODES 
} from '../src/backend/services/databaseErrors.js';
import { databaseConstraintService } from '../src/backend/services/databaseConstraints.js';
import { DatabaseError } from 'pg';

async function testErrorHandling() {
  console.log('🧪 Testing Database Error Handling...\n');

  // Test 1: Handle PostgreSQL unique violation
  console.log('Test 1: PostgreSQL Unique Violation');
  try {
    const pgError = new DatabaseError('duplicate key value violates unique constraint "articles_slug_key"', 0, 'error');
    pgError.code = PG_ERROR_CODES.UNIQUE_VIOLATION;
    pgError.constraint = 'articles_slug_key';
    
    const handled = handleDatabaseError(pgError);
    console.log('✓ Error Type:', handled.type);
    console.log('✓ User Message:', handled.userMessage);
    console.log('✓ Code:', handled.code);
  } catch (error) {
    console.error('✗ Test 1 failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Validate article data
  console.log('Test 2: Article Data Validation');
  try {
    // Test valid data
    await databaseConstraintService.validateArticleData({
      title: 'Test Article',
      slug: 'test-article',
      content: 'This is test content.',
      folder: 'test-folder'
    });
    console.log('✓ Valid article data passed validation');

    // Test invalid slug
    try {
      await databaseConstraintService.validateArticleData({
        slug: 'INVALID_SLUG_WITH_CAPS'
      });
      console.error('✗ Invalid slug should have failed validation');
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        console.log('✓ Invalid slug correctly rejected:', error.userMessage);
      } else {
        console.error('✗ Unexpected error type:', error);
      }
    }

    // Test empty title
    try {
      await databaseConstraintService.validateArticleData({
        title: ''
      });
      console.error('✗ Empty title should have failed validation');
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        console.log('✓ Empty title correctly rejected:', error.userMessage);
      } else {
        console.error('✗ Unexpected error type:', error);
      }
    }

  } catch (error) {
    console.error('✗ Test 2 failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 3: Validate version data
  console.log('Test 3: Version Data Validation');
  try {
    // Test invalid version ID
    try {
      await databaseConstraintService.validateVersionData({
        versionId: -1
      });
      console.error('✗ Invalid version ID should have failed validation');
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        console.log('✓ Invalid version ID correctly rejected:', error.userMessage);
      } else {
        console.error('✗ Unexpected error type:', error);
      }
    }

    // Test long message
    try {
      await databaseConstraintService.validateVersionData({
        message: 'x'.repeat(1001) // Exceeds 1000 character limit
      });
      console.error('✗ Long message should have failed validation');
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        console.log('✓ Long message correctly rejected:', error.userMessage);
      } else {
        console.error('✗ Unexpected error type:', error);
      }
    }

  } catch (error) {
    console.error('✗ Test 3 failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 4: Validate embedding data
  console.log('Test 4: Embedding Data Validation');
  try {
    // Test valid vector
    await databaseConstraintService.validateEmbeddingData({
      chunkId: 'test-chunk',
      chunkIndex: 0,
      textContent: 'Test content',
      vector: new Array(512).fill(0.1) // Valid 512-dimension vector
    });
    console.log('✓ Valid embedding data passed validation');

    // Test invalid vector dimension
    try {
      await databaseConstraintService.validateEmbeddingData({
        vector: new Array(100).fill(0.1) // Invalid dimension
      });
      console.error('✗ Invalid vector dimension should have failed validation');
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        console.log('✓ Invalid vector dimension correctly rejected:', error.userMessage);
      } else {
        console.error('✗ Unexpected error type:', error);
      }
    }

    // Test empty chunk ID
    try {
      await databaseConstraintService.validateEmbeddingData({
        chunkId: ''
      });
      console.error('✗ Empty chunk ID should have failed validation');
    } catch (error) {
      if (error instanceof DatabaseServiceError) {
        console.log('✓ Empty chunk ID correctly rejected:', error.userMessage);
      } else {
        console.error('✗ Unexpected error type:', error);
      }
    }

  } catch (error) {
    console.error('✗ Test 4 failed:', error);
  }

  console.log('\n🎉 Error handling and constraint validation tests completed!');
}

// Run tests
testErrorHandling().catch(console.error);