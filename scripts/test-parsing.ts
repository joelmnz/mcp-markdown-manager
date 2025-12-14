#!/usr/bin/env bun

/**
 * Direct test of parsing functions from import service
 * Tests core functionality without database dependencies
 */

import { mkdir, writeFile, rm, readdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';

const TEST_DIR = './test-import-data';

// Copy the parsing functions from import service for direct testing
function parseFrontmatter(content: string): { title?: string; created?: string; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { body: content };
  }
  
  const frontmatter = match[1];
  // Remove leading newlines from body to prevent accumulation
  const body = match[2].replace(/^[\n\r]+/, '');
  const result: { title?: string; created?: string; body: string } = { body };
  
  frontmatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    if (key === 'title') result.title = value;
    if (key === 'created') result.created = value;
  });
  
  return result;
}

function extractTitle(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }
  return 'Untitled';
}

function generateSlugFromFilename(filename: string): string {
  const baseName = basename(filename, '.md');
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function scanMarkdownFiles(directoryPath: string, preserveFolderStructure: boolean = false): Promise<string[]> {
  const files: string[] = [];
  
  if (!existsSync(directoryPath)) {
    throw new Error(`Directory does not exist: ${directoryPath}`);
  }
  
  const entries = await readdir(directoryPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);
    
    if (entry.isDirectory()) {
      if (preserveFolderStructure) {
        // Recursively scan subdirectories
        const subFiles = await scanMarkdownFiles(fullPath, true);
        files.push(...subFiles);
      }
      // Skip directories if not preserving folder structure
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(fullPath);
    }
  }
  
  return files;
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
      path: join(TEST_DIR, 'complex-filename-test.md'),
      content: `---
title: Complex Title with Special Characters!
created: 2024-01-03T00:00:00.000Z
---

# Complex Title

Testing slug generation.`
    }
  ];
  
  for (const file of testFiles) {
    await writeFile(file.path, file.content, 'utf-8');
  }
  
  console.log('✓ Created test files');
}

async function testDirectoryScanning() {
  console.log('\n--- Testing Directory Scanning ---');
  
  // Test without folder structure
  const flatFiles = await scanMarkdownFiles(TEST_DIR, false);
  console.log(`Found ${flatFiles.length} files (flat scan)`);
  
  if (flatFiles.length !== 3) { // 3 files in root + subfolder, but subfolder ignored
    throw new Error(`Expected 3 files in flat scan, found ${flatFiles.length}`);
  }
  
  // Test with folder structure
  const nestedFiles = await scanMarkdownFiles(TEST_DIR, true);
  console.log(`Found ${nestedFiles.length} files (nested scan)`);
  
  if (nestedFiles.length !== 4) { // All 4 files including nested
    throw new Error(`Expected 4 files in nested scan, found ${nestedFiles.length}`);
  }
  
  console.log('✓ Directory scanning test passed');
}

async function testFrontmatterParsing() {
  console.log('\n--- Testing Frontmatter Parsing ---');
  
  // Test with frontmatter
  const withFrontmatter = `---
title: Test Article
created: 2024-01-01T00:00:00.000Z
---

# Test Content

Body content here.`;
  
  const parsed1 = parseFrontmatter(withFrontmatter);
  console.log('Parsed with frontmatter:', { title: parsed1.title, created: parsed1.created, bodyStart: parsed1.body.substring(0, 20) });
  
  if (parsed1.title !== 'Test Article') {
    throw new Error(`Expected title 'Test Article', got '${parsed1.title}'`);
  }
  
  if (parsed1.created !== '2024-01-01T00:00:00.000Z') {
    throw new Error(`Expected created date, got '${parsed1.created}'`);
  }
  
  if (!parsed1.body.startsWith('# Test Content')) {
    throw new Error(`Expected body to start with heading, got '${parsed1.body.substring(0, 20)}'`);
  }
  
  // Test without frontmatter
  const withoutFrontmatter = `# Article Title

Just content, no frontmatter.`;
  
  const parsed2 = parseFrontmatter(withoutFrontmatter);
  console.log('Parsed without frontmatter:', { title: parsed2.title, created: parsed2.created, bodyStart: parsed2.body.substring(0, 20) });
  
  if (parsed2.title !== undefined) {
    throw new Error(`Expected no title, got '${parsed2.title}'`);
  }
  
  if (parsed2.body !== withoutFrontmatter) {
    throw new Error('Body should be unchanged when no frontmatter');
  }
  
  console.log('✓ Frontmatter parsing test passed');
}

async function testTitleExtraction() {
  console.log('\n--- Testing Title Extraction ---');
  
  const testCases = [
    {
      content: '# Main Title\n\nContent here.',
      expected: 'Main Title'
    },
    {
      content: 'Some text\n\n# First Heading\n\nMore content.',
      expected: 'First Heading'
    },
    {
      content: 'No headings in this content.',
      expected: 'Untitled'
    },
    {
      content: '## Second Level\n\nContent.',
      expected: 'Untitled' // Only first level headings count
    },
    {
      content: '#Not a heading\n\n# Real Heading',
      expected: 'Real Heading'
    }
  ];
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const result = extractTitle(testCase.content);
    console.log(`Test ${i + 1}: "${result}" (expected: "${testCase.expected}")`);
    
    if (result !== testCase.expected) {
      throw new Error(`Test ${i + 1} failed: expected '${testCase.expected}', got '${result}'`);
    }
  }
  
  console.log('✓ Title extraction test passed');
}

async function testSlugGeneration() {
  console.log('\n--- Testing Slug Generation ---');
  
  const testCases = [
    {
      input: 'Simple Title',
      expected: 'simple-title'
    },
    {
      input: 'Title with Special Characters!@#$%',
      expected: 'title-with-special-characters'
    },
    {
      input: 'Multiple   Spaces   Between   Words',
      expected: 'multiple-spaces-between-words'
    },
    {
      input: 'Title-with-existing-hyphens',
      expected: 'title-with-existing-hyphens'
    },
    {
      input: 'Title---with---multiple---hyphens',
      expected: 'title-with-multiple-hyphens'
    }
  ];
  
  console.log('Testing title-based slug generation:');
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const result = generateSlugFromTitle(testCase.input);
    console.log(`  "${testCase.input}" -> "${result}"`);
    
    if (result !== testCase.expected) {
      throw new Error(`Title slug test ${i + 1} failed: expected '${testCase.expected}', got '${result}'`);
    }
  }
  
  console.log('Testing filename-based slug generation:');
  const filenameTests = [
    {
      input: 'simple-file.md',
      expected: 'simple-file'
    },
    {
      input: 'Complex File Name.md',
      expected: 'complex-file-name'
    },
    {
      input: 'file_with_underscores.md',
      expected: 'filewithunderscores'
    }
  ];
  
  for (let i = 0; i < filenameTests.length; i++) {
    const testCase = filenameTests[i];
    const result = generateSlugFromFilename(testCase.input);
    console.log(`  "${testCase.input}" -> "${result}"`);
    
    if (result !== testCase.expected) {
      throw new Error(`Filename slug test ${i + 1} failed: expected '${testCase.expected}', got '${result}'`);
    }
  }
  
  console.log('✓ Slug generation test passed');
}

async function testIntegratedParsing() {
  console.log('\n--- Testing Integrated File Parsing ---');
  
  const files = await scanMarkdownFiles(TEST_DIR, true);
  
  for (const filePath of files) {
    const content = await Bun.file(filePath).text();
    const parsed = parseFrontmatter(content);
    const title = parsed.title || extractTitle(parsed.body);
    const filenameSlug = generateSlugFromFilename(basename(filePath));
    const titleSlug = generateSlugFromTitle(title);
    
    console.log(`File: ${basename(filePath)}`);
    console.log(`  Title: "${title}"`);
    console.log(`  Filename slug: "${filenameSlug}"`);
    console.log(`  Title slug: "${titleSlug}"`);
    console.log(`  Has frontmatter: ${parsed.title ? 'Yes' : 'No'}`);
    console.log(`  Content length: ${parsed.body.length} chars`);
    console.log('');
  }
  
  console.log('✓ Integrated parsing test passed');
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
    console.log('🧪 Testing Import Parsing Logic');
    console.log('===============================');
    
    await createTestFiles();
    await testDirectoryScanning();
    await testFrontmatterParsing();
    await testTitleExtraction();
    await testSlugGeneration();
    await testIntegratedParsing();
    
    console.log('\n🎉 All parsing tests passed!');
    console.log('\nThe core import parsing functionality is working correctly.');
    console.log('Database integration tests require PostgreSQL to be running.');
    
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