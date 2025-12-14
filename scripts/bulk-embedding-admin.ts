#!/usr/bin/env bun
/**
 * Administrative script for bulk embedding operations
 * 
 * Usage:
 *   bun scripts/bulk-embedding-admin.ts identify    # List articles needing embedding
 *   bun scripts/bulk-embedding-admin.ts queue       # Queue bulk embedding update
 *   bun scripts/bulk-embedding-admin.ts status      # Show recent bulk operations
 *   bun scripts/bulk-embedding-admin.ts progress <operation-id>  # Show operation progress
 */

import { embeddingQueueService } from '../src/backend/services/embeddingQueue.js';
import { database, getDatabaseConfig } from '../src/backend/services/database.js';

// ANSI color codes for better output formatting
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString();
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

async function identifyArticlesNeedingEmbedding(): Promise<void> {
  console.log(colorize('\n🔍 Identifying articles that need embedding updates...', 'cyan'));
  
  try {
    const articles = await embeddingQueueService.identifyArticlesNeedingEmbedding();
    
    if (articles.length === 0) {
      console.log(colorize('✅ All articles have up-to-date embeddings!', 'green'));
      return;
    }
    
    console.log(colorize(`\n📊 Found ${articles.length} articles needing embedding updates:\n`, 'yellow'));
    
    // Group by reason
    const byReason = articles.reduce((acc, article) => {
      if (!acc[article.reason]) {
        acc[article.reason] = [];
      }
      acc[article.reason].push(article);
      return acc;
    }, {} as Record<string, typeof articles>);
    
    for (const [reason, articleList] of Object.entries(byReason)) {
      const reasonLabel = {
        'no_completed_task': 'No embedding task found',
        'failed_embedding': 'Failed embedding task',
        'missing_embedding': 'Missing embedding data'
      }[reason] || reason;
      
      console.log(colorize(`${reasonLabel} (${articleList.length} articles):`, 'bright'));
      
      for (const article of articleList.slice(0, 10)) { // Show first 10
        const status = article.lastTaskStatus ? ` [${article.lastTaskStatus}]` : '';
        const error = article.lastError ? ` - ${article.lastError.substring(0, 50)}...` : '';
        console.log(`  • ${article.slug} - "${article.title}"${status}${error}`);
      }
      
      if (articleList.length > 10) {
        console.log(colorize(`  ... and ${articleList.length - 10} more`, 'yellow'));
      }
      console.log();
    }
    
    console.log(colorize(`💡 Run 'bun scripts/bulk-embedding-admin.ts queue' to queue updates for these articles.`, 'blue'));
    
  } catch (error) {
    console.error(colorize('❌ Error identifying articles:', 'red'), error);
    process.exit(1);
  }
}

async function queueBulkEmbeddingUpdate(): Promise<void> {
  console.log(colorize('\n🚀 Starting bulk embedding update...', 'cyan'));
  
  try {
    let lastProgressUpdate = 0;
    
    const result = await embeddingQueueService.queueBulkEmbeddingUpdate(
      'normal',
      (progress) => {
        // Update progress every 5 articles or at completion
        if (progress.processedArticles - lastProgressUpdate >= 5 || 
            progress.processedArticles === progress.totalArticles) {
          
          const percentage = progress.totalArticles > 0 
            ? Math.round((progress.processedArticles / progress.totalArticles) * 100)
            : 0;
          
          process.stdout.write(`\r📈 Progress: ${progress.processedArticles}/${progress.totalArticles} (${percentage}%) - Queued: ${progress.queuedTasks}, Skipped: ${progress.skippedArticles}`);
          
          lastProgressUpdate = progress.processedArticles;
        }
      }
    );
    
    console.log('\n'); // New line after progress
    
    if (result.totalArticles === 0) {
      console.log(colorize('✅ No articles need embedding updates!', 'green'));
      return;
    }
    
    console.log(colorize('\n📊 Bulk embedding update completed:', 'green'));
    console.log(`  • Total articles processed: ${result.totalArticles}`);
    console.log(`  • Tasks queued: ${colorize(result.queuedTasks.toString(), 'green')}`);
    console.log(`  • Articles skipped: ${colorize(result.skippedArticles.toString(), 'yellow')}`);
    
    if (result.errors.length > 0) {
      console.log(`  • Errors: ${colorize(result.errors.length.toString(), 'red')}`);
      console.log(colorize('\nErrors encountered:', 'red'));
      result.errors.forEach(error => console.log(`  • ${error}`));
    }
    
    if (result.queuedTasks > 0) {
      // Generate operation ID from first task metadata
      const operationId = `bulk_${Date.now()}`;
      console.log(colorize(`\n💡 Track progress with: bun scripts/bulk-embedding-admin.ts progress ${operationId}`, 'blue'));
    }
    
  } catch (error) {
    console.error(colorize('\n❌ Error queuing bulk update:', 'red'), error);
    process.exit(1);
  }
}

async function showRecentBulkOperations(): Promise<void> {
  console.log(colorize('\n📋 Recent bulk embedding operations:', 'cyan'));
  
  try {
    const operations = await embeddingQueueService.listRecentBulkOperations(10);
    
    if (operations.length === 0) {
      console.log(colorize('No recent bulk operations found.', 'yellow'));
      return;
    }
    
    console.log();
    for (const op of operations) {
      const statusColor = op.status === 'completed' ? 'green' : 
                         op.status === 'failed' ? 'red' : 'yellow';
      
      const duration = op.completedAt 
        ? formatDuration(op.completedAt.getTime() - op.startedAt.getTime())
        : 'ongoing';
      
      console.log(`${colorize('Operation ID:', 'bright')} ${op.operationId}`);
      console.log(`  Status: ${colorize(op.status.toUpperCase(), statusColor)}`);
      console.log(`  Started: ${formatDate(op.startedAt)}`);
      if (op.completedAt) {
        console.log(`  Completed: ${formatDate(op.completedAt)}`);
      }
      console.log(`  Duration: ${duration}`);
      console.log(`  Tasks: ${op.totalTasks} total, ${colorize(op.completedTasks.toString(), 'green')} completed, ${colorize(op.failedTasks.toString(), 'red')} failed`);
      console.log(`  Success Rate: ${op.successRate.toFixed(1)}%`);
      
      if (op.averageProcessingTime) {
        console.log(`  Avg Processing Time: ${op.averageProcessingTime.toFixed(2)}s`);
      }
      
      if (op.errors.length > 0) {
        console.log(colorize(`  Errors (${op.errors.length}):`, 'red'));
        op.errors.slice(0, 3).forEach(error => {
          console.log(`    • ${error.substring(0, 80)}...`);
        });
        if (op.errors.length > 3) {
          console.log(colorize(`    ... and ${op.errors.length - 3} more`, 'yellow'));
        }
      }
      
      console.log();
    }
    
  } catch (error) {
    console.error(colorize('❌ Error retrieving bulk operations:', 'red'), error);
    process.exit(1);
  }
}

async function showOperationProgress(operationId: string): Promise<void> {
  console.log(colorize(`\n📊 Progress for operation: ${operationId}`, 'cyan'));
  
  try {
    const summary = await embeddingQueueService.getBulkOperationSummary(operationId);
    
    if (!summary) {
      console.log(colorize('Operation not found.', 'red'));
      return;
    }
    
    const statusColor = summary.status === 'completed' ? 'green' : 
                       summary.status === 'failed' ? 'red' : 'yellow';
    
    console.log(`\n${colorize('Status:', 'bright')} ${colorize(summary.status.toUpperCase(), statusColor)}`);
    console.log(`${colorize('Started:', 'bright')} ${formatDate(summary.startedAt)}`);
    
    if (summary.completedAt) {
      const duration = formatDuration(summary.completedAt.getTime() - summary.startedAt.getTime());
      console.log(`${colorize('Completed:', 'bright')} ${formatDate(summary.completedAt)} (${duration})`);
    }
    
    console.log(`\n${colorize('Task Progress:', 'bright')}`);
    console.log(`  Total: ${summary.totalTasks}`);
    console.log(`  Completed: ${colorize(summary.completedTasks.toString(), 'green')}`);
    console.log(`  Failed: ${colorize(summary.failedTasks.toString(), 'red')}`);
    console.log(`  Pending: ${colorize(summary.pendingTasks.toString(), 'yellow')}`);
    console.log(`  Processing: ${colorize(summary.processingTasks.toString(), 'blue')}`);
    
    const progressPercentage = summary.totalTasks > 0 
      ? ((summary.completedTasks + summary.failedTasks) / summary.totalTasks * 100).toFixed(1)
      : '0';
    
    console.log(`\n${colorize('Overall Progress:', 'bright')} ${progressPercentage}%`);
    console.log(`${colorize('Success Rate:', 'bright')} ${summary.successRate.toFixed(1)}%`);
    
    if (summary.averageProcessingTime) {
      console.log(`${colorize('Avg Processing Time:', 'bright')} ${summary.averageProcessingTime.toFixed(2)}s`);
    }
    
    if (summary.errors.length > 0) {
      console.log(colorize(`\nErrors (${summary.errors.length}):`, 'red'));
      summary.errors.slice(0, 5).forEach(error => {
        console.log(`  • ${error}`);
      });
      if (summary.errors.length > 5) {
        console.log(colorize(`  ... and ${summary.errors.length - 5} more`, 'yellow'));
      }
    }
    
  } catch (error) {
    console.error(colorize('❌ Error retrieving operation progress:', 'red'), error);
    process.exit(1);
  }
}

async function showUsage(): Promise<void> {
  console.log(colorize('\n📚 Bulk Embedding Administration Tool', 'cyan'));
  console.log('\nUsage:');
  console.log('  bun scripts/bulk-embedding-admin.ts <command> [options]');
  console.log('\nCommands:');
  console.log(`  ${colorize('identify', 'green')}              List articles that need embedding updates`);
  console.log(`  ${colorize('queue', 'green')}                 Queue bulk embedding update for all articles`);
  console.log(`  ${colorize('status', 'green')}                Show recent bulk operations`);
  console.log(`  ${colorize('progress <operation-id>', 'green')} Show progress of specific operation`);
  console.log(`  ${colorize('help', 'green')}                  Show this help message`);
  console.log('\nExamples:');
  console.log('  bun scripts/bulk-embedding-admin.ts identify');
  console.log('  bun scripts/bulk-embedding-admin.ts queue');
  console.log('  bun scripts/bulk-embedding-admin.ts status');
  console.log('  bun scripts/bulk-embedding-admin.ts progress bulk_1703123456789');
}

async function main(): Promise<void> {
  const command = process.argv[2];
  
  if (!command || command === 'help') {
    await showUsage();
    return;
  }
  
  try {
    // Initialize database connection
    await database.connect(getDatabaseConfig());
    
    switch (command) {
      case 'identify':
        await identifyArticlesNeedingEmbedding();
        break;
        
      case 'queue':
        await queueBulkEmbeddingUpdate();
        break;
        
      case 'status':
        await showRecentBulkOperations();
        break;
        
      case 'progress':
        const operationId = process.argv[3];
        if (!operationId) {
          console.error(colorize('❌ Operation ID required for progress command', 'red'));
          console.log('Usage: bun scripts/bulk-embedding-admin.ts progress <operation-id>');
          process.exit(1);
        }
        await showOperationProgress(operationId);
        break;
        
      default:
        console.error(colorize(`❌ Unknown command: ${command}`, 'red'));
        await showUsage();
        process.exit(1);
    }
    
  } catch (error) {
    console.error(colorize('❌ Fatal error:', 'red'), error);
    process.exit(1);
  } finally {
    // Close database connection
    await database.disconnect();
  }
}

// Run the main function
main().catch(error => {
  console.error(colorize('❌ Unhandled error:', 'red'), error);
  process.exit(1);
});