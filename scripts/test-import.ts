#!/usr/bin/env bun

/**
 * Simple test script for the import service
 * This is a basic verification script since there's no formal test framework
 */

import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { importService } from '../src/backend/services/import.js';
import { databaseArticleService } from '../src/backend/services/databaseArticles.js';
import { databaseInit } from '../src/backend/services/databaseInit.js';

const TEST_DIR = './test-import-data';

async function createTestFiles() {
  // Clean up any existing test directory
  if (existsSync(TEST_DIR)) {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
  
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(join(TEST_DIR, 'subfolder'), { recursive: true });
  
  // Create test markdown files
  const testFiles = [
    {
      path: join(TEST_DIR, 'simple-article.md'),
      content: `---
title: Simple Test Article
created: 2024-01-01T00:00:00.000Z
---

# Simple Test Article

This is a simple test article with frontmatter.

## Section 1

Some content here.`
    },
    {
      path: join(TEST_DIR, 'no-frontmatter.md'),
      content: `# Article Without Frontmatter

This article has no YAML frontmatter, so the title should be extracted from the heading.

## Content

Some content here.`
    },
    {
      path: join(TEST_DIR, 'subfolder', 'nested-article.md'),
      content: `---
title: Nested Article
created: 2024-01-02T00:00:00.000Z
---

# Nested Article

This article is in a subfolder.`
    }
  ];
  
  for (const file of testFiles) {
    await writeFile(file.path, file.content, 'utf-8');
  }
  
  console.log('✓ Created test files');
}

async function testImportValidation() {
  console.log('\n--- Testing Import Validation ---');
  
  const validation = await importService.validateImport(TEST_DIR, {
    preserveFolderStructure: true,
    useFilenameAsSlug: true
  });
  
  console.log('Validation result:', {
    valid: validation.valid,
    totalFiles: validation.totalFiles,
    conflicts: validation.conflicts.length,
    errors: validation.errors.length
  });
  
  if (validation.totalFiles !== 3) {
    throw new Error(`Expected 3 files, found ${validation.totalFiles}`);
  }
  
  console.log('✓ Validation test passed');
}

async function testImportPreview() {
  console.log('\n--- Testing Import Preview ---');
  
  const preview = await importService.getDetailedImportPreview(TEST_DIR, {
    preserveFolderStructure: true,
    useFilenameAsSlug: true
  });
  
  console.log('Preview summary:', preview.summary);
  console.log('Files:');
  for (const file of preview.files) {
    console.log(`  - ${file.sourceFilename}: ${file.title} (${file.slug}) [${file.folder || 'root'}]`);
  }
  
  if (preview.files.length !== 3) {
    throw new Error(`Expected 3 files in preview, found ${preview.files.length}`);
  }
  
  console.log('✓ Preview test passed');
}

async function testDryRunImport() {
  console.log('\n--- Testing Dry Run Import ---');
  
  const result = await importService.importFromDirectory(TEST_DIR, {
    preserveFolderStructure: true,
    useFilenameAsSlug: true,
    dryRun: true,
    progressCallback: (progress) => {
      console.log(`  ${progress.phase}: ${progress.processed}/${progress.total} - ${progress.currentFile}`);
    }
  });
  
  console.log('Dry run result:', {
    imported: result.imported,
    skipped: result.skipped,
    conflicts: result.conflicts.length,
    errors: result.errors.length
  });
  
  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
    throw new Error('Dry run should not have errors');
  }
  
  console.log('✓ Dry run test passed');
}

async function testActualImport() {
  console.log('\n--- Testing Actual Import ---');
  
  const result = await importService.importFromDirectory(TEST_DIR, {
    preserveFolderStructure: true,
    useFilenameAsSlug: true,
    batchSize: 2, // Test batch processing
    progressCallback: (progress) => {
      console.log(`  ${progress.phase}: ${progress.processed}/${progress.total} - ${progress.currentFile}`);
    }
  });
  
  console.log('Import result:', {
    imported: result.imported,
    skipped: result.skipped,
    conflicts: result.conflicts.length,
    errors: result.errors.length
  });
  
  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
    throw new Error('Import should not have errors');
  }
  
  if (result.imported !== 3) {
    throw new Error(`Expected 3 imported articles, got ${result.imported}`);
  }
  
  console.log('✓ Import test passed');
}

async function testImportedArticles() {
  console.log('\n--- Testing Imported Articles ---');
  
  // Check that articles were imported correctly
  const articles = await databaseArticleService.listArticles();
  console.log(`Found ${articles.length} articles in database`);
  
  // Check specific articles
  const simpleArticle = await databaseArticleService.readArticle('simple-test-article');
  if (!simpleArticle) {
    throw new Error('Simple article not found');
  }
  
  if (simpleArticle.title !== 'Simple Test Article') {
    throw new Error(`Expected title 'Simple Test Article', got '${simpleArticle.title}'`);
  }
  
  if (!simpleArticle.content.includes('This is a simple test article')) {
    throw new Error('Article content not preserved correctly');
  }
  
  // Check nested article
  const nestedArticle = await databaseArticleService.readArticle('nested-article');
  if (!nestedArticle) {
    throw new Error('Nested article not found');
  }
  
  if (nestedArticle.folder !== 'subfolder') {
    throw new Error(`Expected folder 'subfolder', got '${nestedArticle.folder}'`);
  }
  
  // Check article without frontmatter
  const noFrontmatterArticle = await databaseArticleService.readArticle('no-frontmatter');
  if (!noFrontmatterArticle) {
    throw new Error('No frontmatter article not found');
  }
  
  if (noFrontmatterArticle.title !== 'Article Without Frontmatter') {
    throw new Error(`Expected title extracted from heading, got '${noFrontmatterArticle.title}'`);
  }
  
  console.log('✓ Imported articles verification passed');
}

async function cleanup() {
  console.log('\n--- Cleanup ---');
  
  // Clean up test files
  if (existsSync(TEST_DIR)) {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
  
  // Clean up imported articles
  try {
    await databaseArticleService.deleteArticle('simple-test-article');
    await databaseArticleService.deleteArticle('no-frontmatter');
    await databaseArticleService.deleteArticle('nested-article');
  } catch (error) {
    // Ignore errors if articles don't exist
  }
  
  console.log('✓ Cleanup completed');
}

async function main() {
  try {
    console.log('🧪 Testing Import Service');
    console.log('========================');
    
    // Initialize database connection
    await databaseInit.initialize();
    
    await createTestFiles();
    await testImportValidation();
    await testImportPreview();
    await testDryRunImport();
    await testActualImport();
    await testImportedArticles();
    
    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
    await databaseInit.shutdown();
  }
}

// Run the test if this script is executed directly
if (import.meta.main) {
  main();
}