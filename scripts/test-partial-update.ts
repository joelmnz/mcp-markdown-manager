#!/usr/bin/env bun
/**
 * Test script for partial article updates
 * Validates that updateArticle supports PATCH semantics
 */

import {
  createArticle,
  updateArticle,
  readArticle,
  deleteArticle
} from '../src/backend/services/articles';
import { databaseInit } from '../src/backend/services/databaseInit';

async function testPartialUpdate() {
  console.log('🧪 Testing Partial Article Updates\n');

  let testArticle: any = null;
  const timestamp = Date.now();
  const testTitle = `Test Article ${timestamp}`;
  const testContent = `# Test Article\n\nOriginal content for testing partial updates.`;
  const testFolder = 'test-partial-update';

  try {
    // Initialize database
    console.log('📦 Initializing database connection...');
    await databaseInit.initialize();
    console.log('   ✅ Database connected\n');

    // Create test article
    console.log('1️⃣ Creating test article...');
    testArticle = await createArticle(testTitle, testContent, testFolder);
    console.log(`   ✅ Created: ${testArticle.filename}`);
    console.log(`   Title: ${testArticle.title}`);
    console.log(`   Folder: ${testArticle.folder}`);
    console.log(`   Content length: ${testArticle.content.length}`);

    // Test 1: Update only title
    console.log('\n2️⃣ Test 1: Update only title...');
    const updatedTitle = `${testTitle} - Updated Title`;
    const result1 = await updateArticle(testArticle.filename, updatedTitle, undefined, undefined);
    console.log(`   ✅ Updated title: ${result1.title}`);
    console.log(`   Filename changed: ${testArticle.filename} -> ${result1.filename}`);
    
    // Update the filename reference since slug changes with title
    testArticle.filename = result1.filename;
    
    // Verify content and folder unchanged
    if (result1.content !== testContent) {
      throw new Error('Content should remain unchanged when only title is updated');
    }
    if (result1.folder !== testFolder) {
      throw new Error('Folder should remain unchanged when only title is updated');
    }
    console.log('   ✅ Content and folder preserved');

    // Test 2: Update only content
    console.log('\n3️⃣ Test 2: Update only content...');
    const updatedContent = `# Updated Content\n\nThis is new content for testing.`;
    const result2 = await updateArticle(testArticle.filename, undefined, updatedContent, undefined);
    console.log(`   ✅ Updated content length: ${result2.content.length}`);
    
    // Update the filename reference in case slug changed
    testArticle.filename = result2.filename;
    
    // Verify title and folder unchanged
    if (result2.title !== updatedTitle) {
      throw new Error('Title should remain unchanged when only content is updated');
    }
    if (result2.folder !== testFolder) {
      throw new Error('Folder should remain unchanged when only content is updated');
    }
    console.log('   ✅ Title and folder preserved');

    // Test 3: Update only folder
    console.log('\n4️⃣ Test 3: Update only folder...');
    const updatedFolder = 'test-partial-update/subfolder';
    const result3 = await updateArticle(testArticle.filename, undefined, undefined, updatedFolder);
    console.log(`   ✅ Updated folder: ${result3.folder}`);
    
    // Update the filename reference in case slug changed
    testArticle.filename = result3.filename;
    
    // Verify title and content unchanged
    if (result3.title !== updatedTitle) {
      throw new Error('Title should remain unchanged when only folder is updated');
    }
    if (result3.content !== updatedContent) {
      throw new Error('Content should remain unchanged when only folder is updated');
    }
    console.log('   ✅ Title and content preserved');

    // Test 4: Update multiple fields
    console.log('\n5️⃣ Test 4: Update multiple fields...');
    const finalTitle = `${testTitle} - Final`;
    const finalContent = `# Final Content\n\nAll fields updated.`;
    const finalFolder = 'test-partial-update/final';
    const result4 = await updateArticle(testArticle.filename, finalTitle, finalContent, finalFolder);
    console.log(`   ✅ Updated title: ${result4.title}`);
    console.log(`   ✅ Updated content length: ${result4.content.length}`);
    console.log(`   ✅ Updated folder: ${result4.folder}`);
    
    // Update the filename reference in case slug changed
    testArticle.filename = result4.filename;

    // Test 5: Verify error when no fields provided
    console.log('\n6️⃣ Test 5: Verify error when no fields provided...');
    try {
      await updateArticle(testArticle.filename, undefined, undefined, undefined);
      throw new Error('Should have thrown error when no fields provided');
    } catch (error) {
      if (error instanceof Error && error.message.includes('At least one field')) {
        console.log(`   ✅ Error thrown as expected: ${error.message}`);
      } else {
        throw error;
      }
    }

    // Test 6: Read final state
    console.log('\n7️⃣ Test 6: Verify final state by reading article...');
    const finalArticle = await readArticle(testArticle.filename);
    if (!finalArticle) {
      throw new Error('Article should exist');
    }
    console.log(`   ✅ Final title: ${finalArticle.title}`);
    console.log(`   ✅ Final folder: ${finalArticle.folder}`);
    console.log(`   ✅ Final content length: ${finalArticle.content.length}`);

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    // Cleanup
    if (testArticle) {
      console.log('\n🧹 Cleaning up test article...');
      try {
        await deleteArticle(testArticle.filename);
        console.log('   ✅ Cleanup complete');
      } catch (error) {
        console.error('   ⚠️  Cleanup failed:', error);
      }
    }

    // Shutdown database
    console.log('\n🔌 Closing database connection...');
    await databaseInit.shutdown();
    console.log('   ✅ Database closed');
  }
}

// Run the test
testPartialUpdate().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
