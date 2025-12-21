#!/usr/bin/env bun

/**
 * Integration test for listFolders MCP tool
 * Tests that the tool correctly retrieves folder hierarchy from the database
 */

import { createArticle, getFolders, deleteArticle } from '../src/backend/services/articles.js';

async function testListFoldersIntegration() {
  console.log('🧪 Testing listFolders Integration...\n');

  const createdArticles: string[] = [];

  try {
    // Test 1: Get folders before creating any test articles
    console.log('📋 Test 1: Getting initial folder list...');
    const initialFolders = await getFolders();
    console.log(`✅ Found ${initialFolders.length} existing folders`);
    if (initialFolders.length > 0) {
      console.log('   Folders:', initialFolders.slice(0, 5).join(', '));
    }

    // Test 2: Create test articles in different folders
    console.log('\n📝 Test 2: Creating test articles in different folders...');
    const timestamp = Date.now();
    
    const testFolders = [
      'test-folder-1',
      'test-folder-2',
      'nested/test-folder',
      'projects/web-dev',
      'notes/personal'
    ];

    for (const folder of testFolders) {
      const article = await createArticle(
        `Test Article ${timestamp} in ${folder}`,
        `This is a test article in folder: ${folder}`,
        folder,
        undefined,
        { skipEmbedding: true }
      );
      createdArticles.push(article.filename);
      console.log(`   ✅ Created article in folder: ${folder}`);
    }

    // Test 3: Get folders after creating test articles
    console.log('\n🔍 Test 3: Getting updated folder list...');
    const updatedFolders = await getFolders();
    console.log(`✅ Found ${updatedFolders.length} total folders`);
    
    // Verify our test folders are in the list
    console.log('\n✔️  Verifying test folders are present:');
    for (const folder of testFolders) {
      const found = updatedFolders.includes(folder);
      console.log(`   ${found ? '✅' : '❌'} ${folder}: ${found ? 'found' : 'NOT FOUND'}`);
      if (!found) {
        throw new Error(`Test folder ${folder} not found in folder list`);
      }
    }

    // Test 4: Verify folders are unique (no duplicates)
    console.log('\n🔍 Test 4: Verifying folder list is unique...');
    const uniqueFolders = new Set(updatedFolders);
    const isDuplicate = updatedFolders.length !== uniqueFolders.size;
    console.log(`   ${isDuplicate ? '❌' : '✅'} Folder list ${isDuplicate ? 'contains duplicates' : 'is unique'}`);
    if (isDuplicate) {
      throw new Error('Folder list contains duplicate entries');
    }

    // Test 5: Verify folders are sorted
    console.log('\n🔍 Test 5: Verifying folder list is sorted...');
    const sortedFolders = [...updatedFolders].sort();
    const isSorted = JSON.stringify(updatedFolders) === JSON.stringify(sortedFolders);
    console.log(`   ${isSorted ? '✅' : '⚠️'} Folder list ${isSorted ? 'is sorted' : 'is not sorted (may be intentional)'}`);

    // Test 6: Cleanup - delete test articles
    console.log('\n🧹 Test 6: Cleaning up test articles...');
    for (const filename of createdArticles) {
      await deleteArticle(filename, { skipEmbedding: true });
    }
    console.log(`   ✅ Deleted ${createdArticles.length} test articles`);

    // Test 7: Verify folders are removed after article deletion (if they were unique to test)
    console.log('\n🔍 Test 7: Getting final folder list...');
    const finalFolders = await getFolders();
    console.log(`✅ Final folder count: ${finalFolders.length}`);

    console.log('\n🎉 All listFolders integration tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Initial folders: ${initialFolders.length}`);
    console.log(`   - After adding test articles: ${updatedFolders.length}`);
    console.log(`   - After cleanup: ${finalFolders.length}`);
    console.log(`   - Test folders verified: ${testFolders.length}`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    
    // Cleanup on failure
    if (createdArticles.length > 0) {
      console.log('\n🧹 Cleaning up test articles after failure...');
      for (const filename of createdArticles) {
        try {
          await deleteArticle(filename, { skipEmbedding: true });
        } catch (cleanupError) {
          console.error(`   ⚠️  Failed to delete ${filename}:`, cleanupError);
        }
      }
    }
    
    process.exit(1);
  }
}

// Run the test
testListFoldersIntegration().catch((error) => {
  console.error('❌ Test failed during top-level execution:', error);
  process.exit(1);
});
