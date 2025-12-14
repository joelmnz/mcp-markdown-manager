#!/usr/bin/env bun

/**
 * Unit test for import service logic (without database dependency)
 * Tests the core parsing and validation functionality
 */

import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const TEST_DIR = './test-import-data';

// Mock the database article service for testing
const mockDatabaseArticleService = {
  readArticle: async (slug: string) => {
    // Return null for all slugs (no conflicts)
    return null;
  },
  generateSlug: (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
};

// Import the service and replace the database dependency
async function createMockedImportService() {
  // We'll test the parsing functions directly
  const { ImportService } = await import('../src/backend/services/import.js');
  
  // Create a new instance for testing
  const service = new ImportService();
  
  // Override the detectConflicts method to use our mock
  const originalDetectConflicts = (service as any).constructor.prototype.detectConflicts;
  (service as any).detectConflicts = async (parsedFiles: any[]) => {
    // No conflicts for testing
    return [];
  };
  
  return service;
}

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
    },
    {
      path: join(TEST_DIR, 'invalid-frontmatter.md'),
      content: `---
title: Invalid Frontmatter
created: not-a-date
---

# Invalid Article

This has invalid frontmatter.`
    }
  ];
  
  for (const file of testFiles) {
    await writeFile(file.path, file.content, 'utf-8');
  }
  
  console.log('✓ Created test files');
}

async function testDirectoryScanning() {
  console.log('\n--- Testing Directory Scanning ---');
  
  const importService = await createMockedImportService();
  
  // Test validation (which includes scanning)
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
  
  if (validation.totalFiles !== 4) {
    throw new Error(`Expected 4 files, found ${validation.totalFiles}`);
  }
  
  console.log('✓ Directory scanning test passed');
}

async function testFrontmatterParsing() {
  console.log('\n--- Testing Frontmatter Parsing ---');
  
  const importService = await createMockedImportService();
  
  const preview = await importService.getDetailedImportPreview(TEST_DIR, {
    preserveFolderStructure: true,
    useFilenameAsSlug: true
  });
  
  console.log('Preview files:');
  for (const file of preview.files) {
    console.log(`  - ${file.sourceFilename}: "${file.title}" -> ${file.slug} [${file.folder || 'root'}]`);
    if (file.parseError) {
      console.log(`    Error: ${file.parseError}`);
    }
  }
  
  // Verify specific parsing results
  const simpleArticle = preview.files.find(f => f.sourceFilename === 'simple-article.md');
  if (!simpleArticle) {
    throw new Error('Simple article not found in preview');
  }
  
  if (simpleArticle.title !== 'Simple Test Article') {
    throw new Error(`Expected title 'Simple Test Article', got '${simpleArticle.title}'`);
  }
  
  if (simpleArticle.slug !== 'simple-test-article') {
    throw new Error(`Expected slug 'simple-test-article', got '${simpleArticle.slug}'`);
  }
  
  // Test article without frontmatter
  const noFrontmatterArticle = preview.files.find(f => f.sourceFilename === 'no-frontmatter.md');
  if (!noFrontmatterArticle) {
    throw new Error('No frontmatter article not found in preview');
  }
  
  if (noFrontmatterArticle.title !== 'Article Without Frontmatter') {
    throw new Error(`Expected title extracted from heading, got '${noFrontmatterArticle.title}'`);
  }
  
  // Test nested article folder structure
  const nestedArticle = preview.files.find(f => f.sourceFilename === 'nested-article.md');
  if (!nestedArticle) {
    throw new Error('Nested article not found in preview');
  }
  
  if (nestedArticle.folder !== 'subfolder') {
    throw new Error(`Expected folder 'subfolder', got '${nestedArticle.folder}'`);
  }
  
  console.log('✓ Frontmatter parsing test passed');
}

async function testSlugGeneration() {
  console.log('\n--- Testing Slug Generation ---');
  
  const importService = await createMockedImportService();
  
  const preview = await importService.getDetailedImportPreview(TEST_DIR, {
    preserveFolderStructure: false,
    useFilenameAsSlug: true // Use filename as slug
  });
  
  // Check that slugs are generated from filenames
  const simpleArticle = preview.files.find(f => f.sourceFilename === 'simple-article.md');
  if (simpleArticle?.slug !== 'simple-article') {
    throw new Error(`Expected slug from filename 'simple-article', got '${simpleArticle?.slug}'`);
  }
  
  // Test with title-based slug generation
  const titleBasedPreview = await importService.getDetailedImportPreview(TEST_DIR, {
    preserveFolderStructure: false,
    useFilenameAsSlug: false // Use title as slug
  });
  
  const titleBasedArticle = titleBasedPreview.files.find(f => f.sourceFilename === 'simple-article.md');
  if (titleBasedArticle?.slug !== 'simple-test-article') {
    throw new Error(`Expected slug from title 'simple-test-article', got '${titleBasedArticle?.slug}'`);
  }
  
  console.log('✓ Slug generation test passed');
}

async function testFolderStructurePreservation() {
  console.log('\n--- Testing Folder Structure Preservation ---');
  
  const importService = await createMockedImportService();
  
  // Test with folder structure preservation
  const withFolders = await importService.getDetailedImportPreview(TEST_DIR, {
    preserveFolderStructure: true
  });
  
  const nestedArticle = withFolders.files.find(f => f.sourceFilename === 'nested-article.md');
  if (nestedArticle?.folder !== 'subfolder') {
    throw new Error(`Expected folder 'subfolder', got '${nestedArticle?.folder}'`);
  }
  
  // Test without folder structure preservation
  const withoutFolders = await importService.getDetailedImportPreview(TEST_DIR, {
    preserveFolderStructure: false
  });
  
  const flatArticle = withoutFolders.files.find(f => f.sourceFilename === 'nested-article.md');
  if (flatArticle?.folder !== '') {
    throw new Error(`Expected empty folder, got '${flatArticle?.folder}'`);
  }
  
  console.log('✓ Folder structure preservation test passed');
}

async function testErrorHandling() {
  console.log('\n--- Testing Error Handling ---');
  
  const importService = await createMockedImportService();
  
  // Test with non-existent directory
  try {
    await importService.validateImport('./non-existent-directory');
    throw new Error('Should have thrown error for non-existent directory');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('does not exist')) {
      throw new Error(`Expected directory error, got: ${error}`);
    }
  }
  
  console.log('✓ Error handling test passed');
}

async function testImportStats() {
  console.log('\n--- Testing Import Statistics ---');
  
  const importService = await createMockedImportService();
  
  const stats = await importService.getImportStats(TEST_DIR, {
    preserveFolderStructure: true
  });
  
  console.log('Import stats:', stats);
  
  if (stats.totalFiles !== 4) {
    throw new Error(`Expected 4 total files, got ${stats.totalFiles}`);
  }
  
  if (stats.validFiles !== 4) {
    throw new Error(`Expected 4 valid files, got ${stats.validFiles}`);
  }
  
  if (stats.conflicts !== 0) {
    throw new Error(`Expected 0 conflicts, got ${stats.conflicts}`);
  }
  
  if (stats.errors !== 0) {
    throw new Error(`Expected 0 errors, got ${stats.errors}`);
  }
  
  console.log('✓ Import statistics test passed');
}

async function cleanup() {
  console.log('\n--- Cleanup ---');
  
  // Clean up test files
  if (existsSync(TEST_DIR)) {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
  
  console.log('✓ Cleanup completed');
}

async function main() {
  try {
    console.log('🧪 Testing Import Service Logic');
    console.log('===============================');
    
    await createTestFiles();
    await testDirectoryScanning();
    await testFrontmatterParsing();
    await testSlugGeneration();
    await testFolderStructurePreservation();
    await testErrorHandling();
    await testImportStats();
    
    console.log('\n🎉 All logic tests passed!');
    console.log('\nNote: Database integration tests require PostgreSQL to be running.');
    console.log('Run "bun scripts/test-import.ts" after setting up the database.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Run the test if this script is executed directly
if (import.meta.main) {
  main();
}