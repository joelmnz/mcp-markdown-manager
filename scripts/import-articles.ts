#!/usr/bin/env bun

/**
 * CLI utility for importing markdown articles to database
 * Usage: bun scripts/import-articles.ts <directory> [options]
 */

import { importService } from '../src/backend/services/import.js';
import { databaseInit } from '../src/backend/services/databaseInit.js';
import { readlineSync } from './utils/readline.js';

const commands = {
  validate: 'Validate import without making changes',
  preview: 'Show detailed preview of what would be imported',
  import: 'Import articles to database',
  stats: 'Show import statistics',
} as const;

interface CliOptions {
  command: keyof typeof commands;
  directory: string;
  preserveFolders?: boolean;
  useFilenameAsSlug?: boolean;
  conflictResolution?: 'skip' | 'rename' | 'overwrite';
  batchSize?: number;
  dryRun?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    showUsage();
    process.exit(1);
  }
  
  const command = args[0] as keyof typeof commands;
  const directory = args[1];
  
  if (!Object.keys(commands).includes(command)) {
    console.error(`Unknown command: ${command}`);
    showUsage();
    process.exit(1);
  }
  
  const options: CliOptions = {
    command,
    directory,
    preserveFolders: args.includes('--preserve-folders'),
    useFilenameAsSlug: !args.includes('--use-title-slug'), // Default to filename
    dryRun: args.includes('--dry-run'),
  };
  
  // Parse conflict resolution
  const conflictIndex = args.indexOf('--conflict');
  if (conflictIndex >= 0 && conflictIndex + 1 < args.length) {
    const resolution = args[conflictIndex + 1];
    if (['skip', 'rename', 'overwrite', 'interactive'].includes(resolution)) {
      options.conflictResolution = resolution as 'skip' | 'rename' | 'overwrite';
    }
  }
  
  // Parse batch size
  const batchIndex = args.indexOf('--batch-size');
  if (batchIndex >= 0 && batchIndex + 1 < args.length) {
    const batchSize = parseInt(args[batchIndex + 1], 10);
    if (!isNaN(batchSize) && batchSize > 0) {
      options.batchSize = batchSize;
    }
  }
  
  return options;
}

function showUsage() {
  console.log('Article Import CLI');
  console.log('Usage: bun scripts/import-articles.ts <command> <directory> [options]');
  console.log('');
  console.log('Commands:');
  Object.entries(commands).forEach(([cmd, desc]) => {
    console.log(`  ${cmd.padEnd(10)} - ${desc}`);
  });
  console.log('');
  console.log('Options:');
  console.log('  --preserve-folders     Preserve directory structure as folders');
  console.log('  --use-title-slug       Generate slugs from titles instead of filenames');
  console.log('  --conflict <action>    How to handle conflicts: skip, rename, overwrite, interactive');
  console.log('  --batch-size <n>       Number of files to process per batch (default: 50)');
  console.log('  --dry-run              Show what would be imported without making changes');
  console.log('');
  console.log('Examples:');
  console.log('  bun scripts/import-articles.ts validate ./my-articles');
  console.log('  bun scripts/import-articles.ts preview ./my-articles --preserve-folders');
  console.log('  bun scripts/import-articles.ts import ./my-articles --conflict interactive --dry-run');
  console.log('  bun scripts/import-articles.ts import ./my-articles --preserve-folders --batch-size 25');
}

async function validateCommand(options: CliOptions) {
  console.log(`Validating import from: ${options.directory}`);
  console.log('Options:', {
    preserveFolders: options.preserveFolders,
    useFilenameAsSlug: options.useFilenameAsSlug,
  });
  console.log('');
  
  const result = await importService.validateImport(options.directory, {
    preserveFolderStructure: options.preserveFolders,
    useFilenameAsSlug: options.useFilenameAsSlug,
  });
  
  console.log('Validation Results:');
  console.log(`  Total files: ${result.totalFiles}`);
  console.log(`  Valid: ${result.valid ? 'Yes' : 'No'}`);
  console.log(`  Conflicts: ${result.conflicts.length}`);
  console.log(`  Errors: ${result.errors.length}`);
  
  if (result.conflicts.length > 0) {
    console.log('\nConflicts:');
    result.conflicts.forEach(conflict => {
      console.log(`  - ${conflict.sourceFilename}: ${conflict.type} conflict`);
      console.log(`    Existing: "${conflict.existingTitle}" (${conflict.existingSlug})`);
      console.log(`    New: "${conflict.newTitle}" (${conflict.newSlug})`);
    });
  }
  
  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(error => {
      console.log(`  - ${error.sourceFilename}: ${error.error} (${error.type})`);
    });
  }
}

async function previewCommand(options: CliOptions) {
  console.log(`Generating preview for: ${options.directory}`);
  console.log('');
  
  const preview = await importService.getDetailedImportPreview(options.directory, {
    preserveFolderStructure: options.preserveFolders,
    useFilenameAsSlug: options.useFilenameAsSlug,
  });
  
  console.log('Import Preview:');
  console.log(`  Total files: ${preview.summary.totalFiles}`);
  console.log(`  Valid files: ${preview.summary.validFiles}`);
  console.log(`  Conflicts: ${preview.summary.conflicts}`);
  console.log(`  Errors: ${preview.summary.errors}`);
  console.log('');
  
  if (preview.files.length > 0) {
    console.log('Files to import:');
    preview.files.forEach(file => {
      const status = file.parseError ? '❌ ERROR' : 
                    file.hasConflict ? '⚠️  CONFLICT' : '✅ OK';
      const folder = file.folder ? ` [${file.folder}]` : ' [root]';
      
      console.log(`  ${status} ${file.sourceFilename}`);
      console.log(`      Title: "${file.title}"`);
      console.log(`      Slug: ${file.slug}${folder}`);
      
      if (file.parseError) {
        console.log(`      Error: ${file.parseError}`);
      }
      
      if (file.hasConflict) {
        console.log(`      Conflict: ${file.conflictType} already exists`);
      }
      
      console.log('');
    });
  }
}

async function statsCommand(options: CliOptions) {
  console.log(`Getting statistics for: ${options.directory}`);
  console.log('');
  
  const stats = await importService.getImportStats(options.directory, {
    preserveFolderStructure: options.preserveFolders,
    useFilenameAsSlug: options.useFilenameAsSlug,
  });
  
  console.log('Import Statistics:');
  console.log(`  Total files found: ${stats.totalFiles}`);
  console.log(`  Valid files: ${stats.validFiles}`);
  console.log(`  Files with conflicts: ${stats.conflicts}`);
  console.log(`  Files with errors: ${stats.errors}`);
  
  const successRate = stats.totalFiles > 0 ? 
    ((stats.validFiles - stats.conflicts - stats.errors) / stats.totalFiles * 100).toFixed(1) : 0;
  
  console.log(`  Success rate: ${successRate}%`);
}

async function importCommand(options: CliOptions) {
  const isDryRun = options.dryRun;
  
  console.log(`${isDryRun ? 'Dry run' : 'Importing'} from: ${options.directory}`);
  console.log('Options:', {
    preserveFolders: options.preserveFolders,
    useFilenameAsSlug: options.useFilenameAsSlug,
    conflictResolution: options.conflictResolution || 'interactive',
    batchSize: options.batchSize || 50,
    dryRun: isDryRun,
  });
  console.log('');

  // First, validate the import to check for conflicts
  console.log('Validating import...');
  const validation = await importService.validateImport(options.directory, {
    preserveFolderStructure: options.preserveFolders,
    useFilenameAsSlug: options.useFilenameAsSlug,
  });

  if (validation.errors.length > 0) {
    console.log('\n❌ Import validation failed:');
    validation.errors.forEach(error => {
      console.log(`  - ${error.sourceFilename}: ${error.error} (${error.type})`);
    });
    
    const continueAnyway = await readlineSync.askYesNo(
      'There are validation errors. Do you want to continue anyway?', 
      false
    );
    
    if (!continueAnyway) {
      console.log('Import cancelled.');
      return;
    }
  }

  // Handle conflicts interactively if needed
  let conflictResolution = options.conflictResolution || 'interactive';
  
  if (validation.conflicts.length > 0 && conflictResolution === 'interactive') {
    console.log(`\n⚠️  Found ${validation.conflicts.length} conflicts:`);
    validation.conflicts.forEach((conflict, index) => {
      console.log(`\n${index + 1}. ${conflict.sourceFilename}`);
      console.log(`   Existing: "${conflict.existingTitle}" (${conflict.existingSlug})`);
      console.log(`   New: "${conflict.newTitle}" (${conflict.newSlug})`);
      console.log(`   Conflict type: ${conflict.type}`);
    });

    console.log('\nHow would you like to handle these conflicts?');
    const choice = await readlineSync.askChoice(
      'Choose conflict resolution strategy:',
      [
        'Skip conflicting files (recommended for safety)',
        'Overwrite existing articles (WARNING: will replace existing content)',
        'Cancel import'
      ],
      0
    );

    switch (choice) {
      case 0:
        conflictResolution = 'skip';
        break;
      case 1:
        const confirmOverwrite = await readlineSync.confirmAction(
          'overwrite existing articles',
          validation.conflicts.map(c => `${c.sourceFilename} → ${c.existingTitle}`),
          'This will permanently replace existing article content!'
        );
        
        if (!confirmOverwrite) {
          console.log('Import cancelled.');
          return;
        }
        conflictResolution = 'overwrite';
        break;
      case 2:
      default:
        console.log('Import cancelled.');
        return;
    }
  }

  // Final confirmation for non-dry-run imports
  if (!isDryRun) {
    const importDetails = [
      `${validation.totalFiles} total files`,
      `${validation.totalFiles - validation.errors.length - validation.conflicts.length} will be imported`,
      `${validation.conflicts.length} conflicts (${conflictResolution})`,
      `${validation.errors.length} errors (will be skipped)`
    ];

    const confirmed = await readlineSync.confirmAction(
      'import articles to database',
      importDetails
    );

    if (!confirmed) {
      console.log('Import cancelled.');
      return;
    }
  }
  
  const startTime = Date.now();
  
  const result = await importService.importFromDirectory(options.directory, {
    preserveFolderStructure: options.preserveFolders,
    useFilenameAsSlug: options.useFilenameAsSlug,
    conflictResolution: conflictResolution as 'skip' | 'overwrite',
    batchSize: options.batchSize || 50,
    dryRun: isDryRun,
    continueOnError: true,
    progressCallback: (progress) => {
      const percent = progress.total > 0 ? 
        ((progress.processed / progress.total) * 100).toFixed(1) : '0.0';
      console.log(`  ${progress.phase}: ${progress.processed}/${progress.total} (${percent}%) - ${progress.currentFile}`);
    }
  });
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('');
  console.log(`${isDryRun ? 'Dry run' : 'Import'} Results:`);
  console.log(`  Imported: ${result.imported}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Conflicts: ${result.conflicts.length}`);
  console.log(`  Errors: ${result.errors.length}`);
  console.log(`  Duration: ${duration}s`);
  
  if (result.conflicts.length > 0) {
    console.log('\nConflicts:');
    result.conflicts.forEach(conflict => {
      console.log(`  - ${conflict.sourceFilename}: ${conflict.type} conflict with existing article`);
    });
  }
  
  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(error => {
      console.log(`  - ${error.sourceFilename}: ${error.error} (${error.type})`);
    });
  }
  
  if (!isDryRun && result.imported > 0) {
    console.log(`\n✅ Successfully imported ${result.imported} articles to database`);
  }
}

async function main() {
  try {
    const options = parseArgs();
    
    // Initialize database for all commands except validate (which might work without DB)
    if (options.command !== 'validate') {
      console.log('Initializing database connection...');
      await databaseInit.initialize();
      console.log('');
    }
    
    switch (options.command) {
      case 'validate':
        await validateCommand(options);
        break;
      case 'preview':
        await previewCommand(options);
        break;
      case 'stats':
        await statsCommand(options);
        break;
      case 'import':
        await importCommand(options);
        break;
      default:
        console.error(`Unknown command: ${options.command}`);
        process.exit(1);
    }
    
  } catch (error) {
    console.error('\nCommand failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await databaseInit.shutdown();
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await databaseInit.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await databaseInit.shutdown();
  process.exit(0);
});

// Run the CLI
if (import.meta.main) {
  main();
}