#!/usr/bin/env bun

/**
 * Migration 003: Embedding Migration for Existing Articles
 * 
 * This migration script identifies existing articles that don't have embeddings
 * and queues them for background embedding processing. This is essential when
 * enabling the background embedding queue system on an existing installation.
 */

import { database } from '../../src/backend/services/database.js';
import { embeddingQueueService } from '../../src/backend/services/embeddingQueue.js';
import { embeddingQueueConfigService } from '../../src/backend/services/embeddingQueueConfig.js';

export interface MigrationOptions {
  batchSize?: number;
  priority?: 'high' | 'normal' | 'low';
  dryRun?: boolean;
  skipConfirmation?: boolean;
  progressCallback?: (progress: {
    totalArticles: number;
    processedArticles: number;
    queuedTasks: number;
    skippedArticles: number;
    errors: string[];
  }) => void;
}

export const embeddingMigration = {
  version: 3,
  description: 'Queue embedding tasks for existing articles without embeddings',
  
  async apply(options: MigrationOptions = {}) {
    const {
      batchSize = 50,
      priority = 'normal',
      dryRun = false,
      skipConfirmation = false,
      progressCallback
    } = options;

    console.log('🔄 Starting embedding migration for existing articles...');
    console.log(`  Batch size: ${batchSize}`);
    console.log(`  Priority: ${priority}`);
    console.log(`  Dry run: ${dryRun ? 'Yes' : 'No'}`);
    console.log('');

    try {
      // Check if embedding queue system is available
      if (!embeddingQueueService) {
        throw new Error('Embedding queue service is not available');
      }

      // Check if background embedding is enabled
      const config = embeddingQueueConfigService.getConfig();
      if (!config.enabled) {
        console.log('⚠️  Background embedding is disabled in configuration');
        console.log('   Set SEMANTIC_SEARCH_ENABLED=true to enable embedding queue');
        return { success: false, reason: 'embedding_disabled' };
      }

      // Identify articles needing embeddings
      console.log('🔍 Identifying articles that need embeddings...');
      const articlesNeedingEmbedding = await embeddingQueueService.identifyArticlesNeedingEmbedding();
      
      if (articlesNeedingEmbedding.length === 0) {
        console.log('✅ All articles already have embeddings or pending tasks');
        return { success: true, articlesProcessed: 0, tasksQueued: 0 };
      }

      console.log(`📊 Found ${articlesNeedingEmbedding.length} articles needing embeddings:`);
      
      // Group by reason
      const byReason = articlesNeedingEmbedding.reduce((acc, article) => {
        acc[article.reason] = (acc[article.reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [reason, count] of Object.entries(byReason)) {
        console.log(`  - ${reason.replace(/_/g, ' ')}: ${count} articles`);
      }
      console.log('');

      // Show sample of articles if not too many
      if (articlesNeedingEmbedding.length <= 10) {
        console.log('Articles to process:');
        for (const article of articlesNeedingEmbedding) {
          console.log(`  - ${article.slug} (${article.title}) - ${article.reason}`);
        }
        console.log('');
      }

      // Confirmation prompt (unless skipped or dry run)
      if (!skipConfirmation && !dryRun) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(`Queue ${articlesNeedingEmbedding.length} embedding tasks? (y/N): `, resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log('Migration cancelled by user');
          return { success: false, reason: 'cancelled' };
        }
      }

      if (dryRun) {
        console.log('🔍 DRY RUN - No tasks will be queued');
        console.log(`Would queue ${articlesNeedingEmbedding.length} embedding tasks`);
        return { success: true, dryRun: true, articlesFound: articlesNeedingEmbedding.length };
      }

      // Process articles in batches
      console.log('📝 Queuing embedding tasks...');
      
      const results = {
        totalArticles: articlesNeedingEmbedding.length,
        processedArticles: 0,
        queuedTasks: 0,
        skippedArticles: 0,
        errors: [] as string[],
        taskIds: [] as string[]
      };

      const operationId = `migration_${Date.now()}`;
      
      for (let i = 0; i < articlesNeedingEmbedding.length; i += batchSize) {
        const batch = articlesNeedingEmbedding.slice(i, i + batchSize);
        
        console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(articlesNeedingEmbedding.length / batchSize)} (${batch.length} articles)...`);

        for (const article of batch) {
          try {
            // Check if there's already a pending or processing task for this article
            const existingTasks = await embeddingQueueService.getTasksForArticle(article.articleId);
            const hasPendingTask = existingTasks.some(task => 
              task.status === 'pending' || task.status === 'processing'
            );

            if (hasPendingTask) {
              results.skippedArticles++;
              console.log(`    ⏭️  Skipped ${article.slug} (already has pending task)`);
            } else {
              // Queue new embedding task
              const taskId = await embeddingQueueService.enqueueTask({
                articleId: article.articleId,
                slug: article.slug,
                operation: 'create', // Use 'create' for initial embedding generation
                priority,
                maxAttempts: config.maxRetries,
                scheduledAt: new Date(),
                metadata: {
                  title: article.title,
                  reason: 'migration',
                  originalReason: article.reason,
                  migrationOperationId: operationId,
                  batchNumber: Math.floor(i / batchSize) + 1
                }
              });

              results.queuedTasks++;
              results.taskIds.push(taskId);
              console.log(`    ✅ Queued ${article.slug} (task: ${taskId.substring(0, 8)}...)`);
            }

            results.processedArticles++;

            // Report progress
            if (progressCallback) {
              progressCallback({ ...results });
            }

          } catch (error) {
            const errorMessage = `Failed to queue task for article ${article.slug}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`;
            results.errors.push(errorMessage);
            console.error(`    ❌ ${errorMessage}`);
            results.processedArticles++;
          }
        }

        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < articlesNeedingEmbedding.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('');
      console.log('📊 Migration Summary:');
      console.log(`  Total articles: ${results.totalArticles}`);
      console.log(`  Tasks queued: ${results.queuedTasks}`);
      console.log(`  Articles skipped: ${results.skippedArticles}`);
      console.log(`  Errors: ${results.errors.length}`);

      if (results.errors.length > 0) {
        console.log('');
        console.log('❌ Errors encountered:');
        for (const error of results.errors) {
          console.log(`  - ${error}`);
        }
      }

      if (results.queuedTasks > 0) {
        console.log('');
        console.log('🚀 Background worker will process these tasks automatically');
        console.log('   Monitor progress with: bun scripts/queue-admin.ts status');
        console.log('   Check queue health with: bun scripts/queue-admin.ts health');
      }

      return {
        success: true,
        ...results
      };

    } catch (error) {
      console.error('❌ Migration failed:', error instanceof Error ? error.message : error);
      throw error;
    }
  },

  async rollback() {
    console.log('🔄 Rolling back embedding migration...');
    
    try {
      // Find and cancel pending migration tasks
      const result = await database.query(`
        UPDATE embedding_tasks 
        SET status = 'failed',
            error_message = 'Cancelled by migration rollback',
            completed_at = NOW()
        WHERE status IN ('pending', 'processing')
          AND metadata->>'reason' = 'migration'
        RETURNING id, slug
      `);

      console.log(`  Cancelled ${result.rowCount || 0} pending migration tasks`);
      
      if (result.rows.length > 0) {
        console.log('  Cancelled tasks:');
        for (const row of result.rows) {
          console.log(`    - ${row.slug} (${row.id.substring(0, 8)}...)`);
        }
      }

      console.log('✅ Migration rollback completed');
      
    } catch (error) {
      console.error('❌ Rollback failed:', error instanceof Error ? error.message : error);
      throw error;
    }
  }
};

// CLI interface when run directly
async function main() {
  const args = process.argv.slice(2);
  
  const options: MigrationOptions = {
    batchSize: 50,
    priority: 'normal',
    dryRun: false,
    skipConfirmation: false
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--yes':
      case '-y':
        options.skipConfirmation = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10) || 50;
        break;
      case '--priority':
        const priority = args[++i] as 'high' | 'normal' | 'low';
        if (['high', 'normal', 'low'].includes(priority)) {
          options.priority = priority;
        }
        break;
      case '--help':
      case '-h':
        showUsage();
        process.exit(0);
        break;
      case 'rollback':
        await embeddingMigration.rollback();
        process.exit(0);
        break;
    }
  }

  // Progress callback for CLI
  options.progressCallback = (progress) => {
    const percent = Math.round((progress.processedArticles / progress.totalArticles) * 100);
    process.stdout.write(`\r  Progress: ${progress.processedArticles}/${progress.totalArticles} (${percent}%) - Queued: ${progress.queuedTasks}, Skipped: ${progress.skippedArticles}, Errors: ${progress.errors.length}`);
  };

  try {
    const result = await embeddingMigration.apply(options);
    
    if (result.success) {
      console.log('\n✅ Embedding migration completed successfully');
      process.exit(0);
    } else {
      console.log(`\n⚠️  Migration not completed: ${result.reason || 'Unknown reason'}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function showUsage() {
  console.log('Embedding Migration Script');
  console.log('Usage: bun scripts/migrations/003-embedding-migration.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run              Show what would be done without making changes');
  console.log('  --yes, -y              Skip confirmation prompts');
  console.log('  --batch-size <n>       Process articles in batches of n (default: 50)');
  console.log('  --priority <level>     Set task priority: high, normal, low (default: normal)');
  console.log('  --help, -h             Show this help message');
  console.log('');
  console.log('Commands:');
  console.log('  rollback               Cancel pending migration tasks');
  console.log('');
  console.log('Examples:');
  console.log('  bun scripts/migrations/003-embedding-migration.ts --dry-run');
  console.log('  bun scripts/migrations/003-embedding-migration.ts --yes --priority high');
  console.log('  bun scripts/migrations/003-embedding-migration.ts --batch-size 25');
  console.log('  bun scripts/migrations/003-embedding-migration.ts rollback');
}

// Run CLI if this file is executed directly
if (import.meta.main) {
  main().catch(console.error);
}