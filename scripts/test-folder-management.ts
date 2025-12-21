#!/usr/bin/env bun

/**
 * Test script for folder management endpoints
 */

import { fetch } from 'bun';

const PORT = process.env.PORT || '5000';
const API_URL = `http://localhost:${PORT}`;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dev-token';

async function runTests() {
  console.log('🧪 Testing Folder Management Endpoints');
  console.log('======================================');

  // Helper for API requests
  async function apiRequest(method: string, path: string, body?: any) {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return response;
  }

  try {
    // 1. Create an article in a folder
    console.log('\n1. Creating article in test-folder-1...');
    const createRes = await apiRequest('POST', '/api/articles', {
      title: 'Test Folder Article',
      content: '# Test Content',
      folder: 'test-folder-1'
    });
    
    if (!createRes.ok) {
      throw new Error(`Failed to create article: ${createRes.status} ${createRes.statusText}`);
    }
    const article = await createRes.json();
    console.log('✅ Article created:', article.filename);

    // 2. Verify folder exists
    console.log('\n2. Verifying test-folder-1 exists...');
    const foldersRes1 = await apiRequest('GET', '/api/folders');
    const folders1 = await foldersRes1.json();
    if (!folders1.includes('test-folder-1')) {
      throw new Error('test-folder-1 not found in folders list');
    }
    console.log('✅ test-folder-1 found');

    // 3. Rename folder
    console.log('\n3. Renaming test-folder-1 to test-folder-2...');
    const renameRes = await apiRequest('PUT', '/api/folders/manage/test-folder-1', {
      newName: 'test-folder-2'
    });
    
    if (!renameRes.ok) {
      const err = await renameRes.json();
      throw new Error(`Failed to rename folder: ${renameRes.status} ${JSON.stringify(err)}`);
    }
    console.log('✅ Folder renamed');

    // 4. Verify rename
    console.log('\n4. Verifying rename...');
    const foldersRes2 = await apiRequest('GET', '/api/folders');
    const folders2 = await foldersRes2.json();
    if (folders2.includes('test-folder-1')) {
      throw new Error('test-folder-1 still exists');
    }
    if (!folders2.includes('test-folder-2')) {
      throw new Error('test-folder-2 not found');
    }
    console.log('✅ Rename verified');

    // 5. Delete folder
    console.log('\n5. Deleting test-folder-2...');
    const deleteRes = await apiRequest('DELETE', '/api/folders/manage/test-folder-2');
    
    if (!deleteRes.ok) {
      const err = await deleteRes.json();
      throw new Error(`Failed to delete folder: ${deleteRes.status} ${JSON.stringify(err)}`);
    }
    console.log('✅ Folder deleted');

    // 6. Verify deletion
    console.log('\n6. Verifying deletion...');
    const foldersRes3 = await apiRequest('GET', '/api/folders');
    const folders3 = await foldersRes3.json();
    if (folders3.includes('test-folder-2')) {
      throw new Error('test-folder-2 still exists');
    }
    console.log('✅ Deletion verified');

    // 7. Cleanup article
    console.log('\n7. Cleaning up article...');
    // Note: Deleting the folder should have updated the article's folder to empty string
    // We need to find the article to delete it. The filename is derived from title.
    // Since we created it, we know the filename from step 1.
    
    const deleteArticleRes = await apiRequest('DELETE', `/api/articles/${article.filename}`);
    if (!deleteArticleRes.ok) {
      console.warn('Warning: Failed to delete test article');
    } else {
      console.log('✅ Article deleted');
    }

    console.log('\n🎉 All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
