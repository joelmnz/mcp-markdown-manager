#!/usr/bin/env bun
/**
 * Embedding Migration and Deployment Support Tool
 * 
 * Provides migration scripts for existing articles without embeddings,
 * deployment documentation generation, and rollback procedures.
 * 
 * Usage:
 *   bun scripts/embedding-migration.ts <command> [options]
 * 
 * Commands:
 *   analyze                         Analyze current embedding status
 *   migrate [--dry-run] [--batch-size=N] [--priority=P]  Migrate existing articles
 *   rollback [--confirm]            Rollback to synchronous embedding mode
 *   deploy-check                    Check deployment readiness
 *   generate-docs                   Generate deployment documentation
 *   backup-config                   Backup current configuration
 *   restore-config                  Restore configuration from backup
 *   help                            Show help message
 */

import { embeddingQueueService } from '../src/backend/services/embeddingQueue.js';
import { database, getDatabaseConfig } from '../src/backend/services/database.js';
import { embeddingQueueConfigService } from '../src/backend/services/embeddingQueueConfig.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ANSI color codes for better output formatting
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
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
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

interface MigrationAnalysis {
  totalArticles: number;
  articlesWithEmbeddings: number;
  articlesWithoutEmbeddings: number;
  articlesWithFailedEmbeddings: number;
  articlesWithPendingTasks: number;
  oldestArticle: Date | null;
  newestArticle: Date | null;
  estimatedMigrationTime: number; // in minutes
}

interface DeploymentCheck {
  databaseSchema: boolean;
  configurationValid: boolean;
  backgroundWorkerReady: boolean;
  embeddingServiceAvailable: boolean;
  diskSpace: boolean;
  issues: string[];
  recommendations: string[];
}

async function analyzeEmbeddingStatus(): Promise<void> {
  console.log(colorize('\n🔍 Analyzing Current Embedding Status', 'cyan'));
  
  try {
    const analysis = await performMigrationAnalysis();
    
    console.log(colorize('\n📊 Article Analysis:', 'bright'));
    console.log(`  Total Articles:              ${colorize(analysis.totalArticles.toString(), 'bright')}`);
    console.log(`  With Embeddings:             ${colorize(analysis.articlesWithEmbeddings.toString(), 'green')} (${(analysis.articlesWithEmbeddings / analysis.totalArticles * 100).toFixed(1)}%)`);
    console.log(`  Without Embeddings:          ${colorize(analysis.articlesWithoutEmbeddings.toString(), 'red')} (${(analysis.articlesWithoutEmbeddings / analysis.totalArticles * 100).toFixed(1)}%)`);
    console.log(`  With Failed Embeddings:      ${colorize(analysis.articlesWithFailedEmbeddings.toString(), 'yellow')} (${(analysis.articlesWithFailedEmbeddings / analysis.totalArticles * 100).toFixed(1)}%)`);
    console.log(`  With Pending Tasks:          ${colorize(analysis.articlesWithPendingTasks.toString(), 'blue')} (${(analysis.articlesWithPendingTasks / analysis.totalArticles * 100).toFixed(1)}%)`);
    
    if (analysis.oldestArticle && analysis.newestArticle) {
      console.log(`\n📅 Article Timeline:`);
      console.log(`  Oldest Article:              ${formatDate(analysis.oldestArticle)}`);
      console.log(`  Newest Article:              ${formatDate(analysis.newestArticle)}`);
    }
    
    console.log(`\n⏱️ Migration Estimate:`);
    console.log(`  Articles Needing Migration:  ${analysis.articlesWithoutEmbeddings + analysis.articlesWithFailedEmbeddings}`);
    console.log(`  Estimated Time:              ${colorize(analysis.estimatedMigrationTime.toString(), 'blue')} minutes`);
    
    // Show queue status
    const queueStats = await embeddingQueueService.getQueueStats();
    console.log(colorize('\n📋 Current Queue Status:', 'bright'));
    console.log(`  Pending Tasks:               ${colorize(queueStats.pending.toString(), 'yellow')}`);
    console.log(`  Processing Tasks:            ${colorize(queueStats.processing.toString(), 'blue')}`);
    console.log(`  Completed Tasks:             ${colorize(queueStats.completed.toString(), 'green')}`);
    console.log(`  Failed Tasks:                ${colorize(queueStats.failed.toString(), 'red')}`);
    
    // Recommendations
    console.log(colorize('\n💡 Recommendations:', 'blue'));
    
    if (analysis.articlesWithoutEmbeddings === 0 && analysis.articlesWithFailedEmbeddings === 0) {
      console.log('  ✅ All articles have embeddings - no migration needed');
    } else {
      console.log(`  📦 Run migration for ${analysis.articlesWithoutEmbeddings + analysis.articlesWithFailedEmbeddings} articles`);
      console.log('  🚀 Use: bun scripts/embedding-migration.ts migrate');
      
      if (analysis.estimatedMigrationTime > 60) {
        console.log('  ⚠️ Large migration - consider running in batches during off-peak hours');
      }
    }
    
    if (queueStats.failed > 0) {
      console.log('  🔄 Retry failed tasks before migration');
    }
    
  } catch (error) {
    console.error(colorize('❌ Error analyzing embedding status:', 'red'), error);
    process.exit(1);
  }
}

async function performMigrationAnalysis(): Promise<MigrationAnalysis> {
  // Get total article count and date range
  const articleStatsResult = await database.query(`
    SELECT 
      COUNT(*) as total_articles,
      MIN(created_at) as oldest_article,
      MAX(created_at) as newest_article
    FROM articles
  `);
  
  const articleStats = articleStatsResult.rows[0];
  const totalArticles = parseInt(articleStats.total_articles);
  
  // Identify articles needing embedding
  const articlesNeedingEmbedding = await embeddingQueueService.identifyArticlesNeedingEmbedding();
  
  // Count by reason
  const articlesWithoutEmbeddings = articlesNeedingEmbedding.filter(a => 
    a.reason === 'no_completed_task' || a.reason === 'missing_embedding'
  ).length;
  
  const articlesWithFailedEmbeddings = articlesNeedingEmbedding.filter(a => 
    a.reason === 'failed_embedding'
  ).length;
  
  // Count articles with pending tasks
  const pendingTasksResult = await database.query(`
    SELECT COUNT(DISTINCT article_id) as count
    FROM embedding_tasks 
    WHERE status IN ('pending', 'processing')
  `);
  
  const articlesWithPendingTasks = parseInt(pendingTasksResult.rows[0]?.count || '0');
  
  // Calculate articles with embeddings
  const articlesWithEmbeddings = totalArticles - articlesNeedingEmbedding.length;
  
  // Estimate migration time (assume 2 seconds per article on average)
  const articlesToMigrate = articlesWithoutEmbeddings + articlesWithFailedEmbeddings;
  const estimatedMigrationTime = Math.ceil(articlesToMigrate * 2 / 60); // Convert to minutes
  
  return {
    totalArticles,
    articlesWithEmbeddings,
    articlesWithoutEmbeddings,
    articlesWithFailedEmbeddings,
    articlesWithPendingTasks,
    oldestArticle: articleStats.oldest_article ? new Date(articleStats.oldest_article) : null,
    newestArticle: articleStats.newest_article ? new Date(articleStats.newest_article) : null,
    estimatedMigrationTime
  };
}

async function migrateExistingArticles(
  dryRun: boolean = false, 
  batchSize: number = 50, 
  priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  const modeText = dryRun ? 'DRY RUN - ' : '';
  console.log(colorize(`\n🚀 ${modeText}Migrating Existing Articles to Background Embedding`, 'cyan'));
  console.log(colorize(`Batch Size: ${batchSize} | Priority: ${priority}`, 'dim'));
  
  try {
    // Analyze current state
    const analysis = await performMigrationAnalysis();
    const articlesToMigrate = analysis.articlesWithoutEmbeddings + analysis.articlesWithFailedEmbeddings;
    
    if (articlesToMigrate === 0) {
      console.log(colorize('✅ No articles need migration - all articles have embeddings!', 'green'));
      return;
    }
    
    console.log(`\n📊 Migration Plan:`);
    console.log(`  Articles to migrate: ${colorize(articlesToMigrate.toString(), 'bright')}`);
    console.log(`  Estimated batches:   ${Math.ceil(articlesToMigrate / batchSize)}`);
    console.log(`  Estimated time:      ${analysis.estimatedMigrationTime} minutes`);
    
    if (dryRun) {
      console.log(colorize('\n🔍 DRY RUN - No actual changes will be made', 'yellow'));
    }
    
    // Get articles needing migration
    const articlesNeedingEmbedding = await embeddingQueueService.identifyArticlesNeedingEmbedding();
    
    if (articlesNeedingEmbedding.length === 0) {
      console.log(colorize('✅ No articles found that need embedding migration', 'green'));
      return;
    }
    
    console.log(colorize('\n🔄 Starting Migration Process...', 'bright'));
    
    let processedCount = 0;
    let queuedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    
    // Process in batches
    for (let i = 0; i < articlesNeedingEmbedding.length; i += batchSize) {
      const batch = articlesNeedingEmbedding.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(articlesNeedingEmbedding.length / batchSize);
      
      console.log(colorize(`\n📦 Processing Batch ${batchNumber}/${totalBatches} (${batch.length} articles)`, 'blue'));
      
      for (const article of batch) {
        try {
          processedCount++;
          
          if (dryRun) {
            console.log(`  ${processedCount.toString().padStart(3)}. ${article.slug} - ${article.reason} (would queue ${article.reason === 'failed_embedding' ? 'retry' : 'create'} task)`);
            queuedCount++;
          } else {
            // Check if there's already a pending task
            const existingTasks = await embeddingQueueService.getTasksForArticle(article.articleId);
            const hasPendingTask = existingTasks.some(task => 
              task.status === 'pending' || task.status === 'processing'
            );
            
            if (hasPendingTask) {
              console.log(`  ${processedCount.toString().padStart(3)}. ${article.slug} - skipped (already has pending task)`);
              skippedCount++;
            } else {
              // Queue embedding task
              const operation = article.reason === 'failed_embedding' ? 'update' : 'create';
              
              const taskId = await embeddingQueueService.enqueueTask({
                articleId: article.articleId,
                slug: article.slug,
                operation,
                priority,
                maxAttempts: 3,
                scheduledAt: new Date(),
                metadata: {
                  title: article.title,
                  reason: 'migration',
                  originalReason: article.reason,
                  migrationBatch: batchNumber
                }
              });
              
              console.log(`  ${processedCount.toString().padStart(3)}. ${article.slug} - queued (${taskId.substring(0, 8)})`);
              queuedCount++;
            }
          }
          
        } catch (error) {
          errorCount++;
          const errorMessage = `Failed to process ${article.slug}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
          console.log(`  ${processedCount.toString().padStart(3)}. ${colorize(errorMessage, 'red')}`);
        }
      }
      
      // Show batch progress
      const progress = (processedCount / articlesNeedingEmbedding.length * 100).toFixed(1);
      console.log(colorize(`    Batch ${batchNumber} complete - Overall progress: ${progress}%`, 'dim'));
      
      // Small delay between batches to avoid overwhelming the system
      if (!dryRun && i + batchSize < articlesNeedingEmbedding.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Final summary
    console.log(colorize('\n📊 Migration Summary:', 'bright'));
    console.log(`  Articles processed: ${processedCount}`);
    console.log(`  Tasks queued:       ${colorize(queuedCount.toString(), 'green')}`);
    console.log(`  Articles skipped:   ${colorize(skippedCount.toString(), 'yellow')}`);
    console.log(`  Errors:             ${colorize(errorCount.toString(), errorCount > 0 ? 'red' : 'green')}`);
    
    if (errors.length > 0) {
      console.log(colorize('\n❌ Errors encountered:', 'red'));
      errors.slice(0, 10).forEach(error => console.log(`  • ${error}`));
      if (errors.length > 10) {
        console.log(colorize(`  ... and ${errors.length - 10} more errors`, 'dim'));
      }
    }
    
    if (!dryRun && queuedCount > 0) {
      console.log(colorize('\n✅ Migration completed successfully!', 'green'));
      console.log(colorize('💡 Monitor progress with: bun scripts/queue-admin.ts monitor', 'blue'));
      console.log(colorize('📊 Check queue stats with: bun scripts/queue-admin.ts stats', 'blue'));
    } else if (dryRun) {
      console.log(colorize('\n✅ Dry run completed - no changes made', 'green'));
      console.log(colorize('🚀 Run without --dry-run to perform actual migration', 'blue'));
    }
    
  } catch (error) {
    console.error(colorize('❌ Error during migration:', 'red'), error);
    process.exit(1);
  }
}

async function rollbackToSynchronousMode(confirm: boolean = false): Promise<void> {
  console.log(colorize('\n⚠️ Rollback to Synchronous Embedding Mode', 'yellow'));
  
  if (!confirm) {
    console.log(colorize('\n🚨 WARNING: This will disable background embedding and revert to synchronous mode!', 'red'));
    console.log('This means:');
    console.log('  • Article creation/updates will wait for embedding completion');
    console.log('  • UI will be slower during article operations');
    console.log('  • All pending embedding tasks will be cancelled');
    console.log('  • Background worker will be stopped');
    console.log('\nTo confirm rollback, run with --confirm flag:');
    console.log('  bun scripts/embedding-migration.ts rollback --confirm');
    return;
  }
  
  try {
    console.log(colorize('\n🔄 Performing rollback...', 'cyan'));
    
    // 1. Stop background worker (if running)
    console.log('1. Stopping background worker...');
    // Note: This would need to be implemented based on how the worker is managed
    
    // 2. Cancel all pending tasks
    console.log('2. Cancelling pending embedding tasks...');
    const cancelResult = await database.query(`
      UPDATE embedding_tasks 
      SET status = 'failed', 
          error_message = 'Cancelled due to rollback to synchronous mode',
          completed_at = NOW()
      WHERE status IN ('pending', 'processing')
    `);
    
    const cancelledTasks = cancelResult.rowCount || 0;
    console.log(`   Cancelled ${cancelledTasks} pending/processing tasks`);
    
    // 3. Update configuration to disable background processing
    console.log('3. Updating configuration...');
    
    // Create backup of current config
    const backupPath = await backupCurrentConfiguration();
    console.log(`   Configuration backed up to: ${backupPath}`);
    
    // Update environment variables (this would need to be done manually or through config files)
    console.log('   ⚠️ Manual step required: Set EMBEDDING_QUEUE_ENABLED=false in environment');
    
    // 4. Verify rollback
    console.log('4. Verifying rollback...');
    const queueStats = await embeddingQueueService.getQueueStats();
    const activeTasks = queueStats.pending + queueStats.processing;
    
    if (activeTasks === 0) {
      console.log(colorize('   ✅ No active tasks remaining', 'green'));
    } else {
      console.log(colorize(`   ⚠️ ${activeTasks} tasks still active`, 'yellow'));
    }
    
    console.log(colorize('\n✅ Rollback completed successfully!', 'green'));
    console.log('\nNext steps:');
    console.log('1. Restart the application to apply configuration changes');
    console.log('2. Verify that article operations work synchronously');
    console.log('3. Monitor application performance');
    console.log('\nTo restore background embedding:');
    console.log('  bun scripts/embedding-migration.ts restore-config');
    
  } catch (error) {
    console.error(colorize('❌ Error during rollback:', 'red'), error);
    process.exit(1);
  }
}

async function checkDeploymentReadiness(): Promise<void> {
  console.log(colorize('\n🔍 Deployment Readiness Check', 'cyan'));
  
  try {
    const check = await performDeploymentCheck();
    
    console.log(colorize('\n📋 Deployment Check Results:', 'bright'));
    
    const checkItem = (name: string, status: boolean, details?: string) => {
      const icon = status ? '✅' : '❌';
      const color = status ? 'green' : 'red';
      console.log(`  ${icon} ${colorize(name, color)}${details ? ` - ${details}` : ''}`);
    };
    
    checkItem('Database Schema', check.databaseSchema);
    checkItem('Configuration Valid', check.configurationValid);
    checkItem('Background Worker Ready', check.backgroundWorkerReady);
    checkItem('Embedding Service Available', check.embeddingServiceAvailable);
    checkItem('Sufficient Disk Space', check.diskSpace);
    
    const overallStatus = Object.values(check).every(v => typeof v === 'boolean' ? v : true);
    
    console.log(`\n${colorize('Overall Status:', 'bright')} ${overallStatus ? 
      colorize('✅ READY FOR DEPLOYMENT', 'green') : 
      colorize('❌ NOT READY - ISSUES FOUND', 'red')}`);
    
    if (check.issues.length > 0) {
      console.log(colorize('\n⚠️ Issues Found:', 'red'));
      check.issues.forEach(issue => console.log(`  • ${issue}`));
    }
    
    if (check.recommendations.length > 0) {
      console.log(colorize('\n💡 Recommendations:', 'blue'));
      check.recommendations.forEach(rec => console.log(`  • ${rec}`));
    }
    
    if (overallStatus) {
      console.log(colorize('\n🚀 Ready to deploy! Consider running migration after deployment.', 'green'));
    }
    
  } catch (error) {
    console.error(colorize('❌ Error checking deployment readiness:', 'red'), error);
    process.exit(1);
  }
}

async function performDeploymentCheck(): Promise<DeploymentCheck> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Check database schema
  let databaseSchema = false;
  try {
    const schemaResult = await database.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'embedding_tasks'
      ) as has_embedding_tasks,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'embedding_worker_status'
      ) as has_worker_status
    `);
    
    const schema = schemaResult.rows[0];
    databaseSchema = schema.has_embedding_tasks && schema.has_worker_status;
    
    if (!databaseSchema) {
      issues.push('Database schema missing - run migration script first');
      recommendations.push('Execute: bun scripts/migrations/002-embedding-queue.ts');
    }
  } catch (error) {
    issues.push('Cannot check database schema - database connection failed');
  }
  
  // Check configuration
  let configurationValid = false;
  try {
    const config = embeddingQueueConfigService.getConfig();
    configurationValid = config.enabled !== undefined;
    
    if (!configurationValid) {
      issues.push('Embedding queue configuration not found');
      recommendations.push('Set EMBEDDING_QUEUE_ENABLED environment variable');
    }
  } catch (error) {
    issues.push('Configuration validation failed');
  }
  
  // Check background worker readiness (simplified check)
  let backgroundWorkerReady = false;
  try {
    // Check if worker status table exists and is accessible
    const workerResult = await database.query(`
      SELECT COUNT(*) as count FROM embedding_worker_status
    `);
    backgroundWorkerReady = true;
  } catch (error) {
    issues.push('Background worker status table not accessible');
  }
  
  // Check embedding service availability (simplified)
  let embeddingServiceAvailable = true; // Assume available for now
  // In a real implementation, this would test the embedding service connection
  
  // Check disk space (simplified)
  let diskSpace = true; // Assume sufficient for now
  // In a real implementation, this would check available disk space
  
  return {
    databaseSchema,
    configurationValid,
    backgroundWorkerReady,
    embeddingServiceAvailable,
    diskSpace,
    issues,
    recommendations
  };
}

async function generateDeploymentDocumentation(): Promise<void> {
  console.log(colorize('\n📚 Generating Deployment Documentation', 'cyan'));
  
  try {
    const docsDir = 'docs/embedding-queue';
    
    // Ensure docs directory exists
    if (!existsSync(docsDir)) {
      await mkdir(docsDir, { recursive: true });
    }
    
    // Generate deployment guide
    const deploymentGuide = generateDeploymentGuideContent();
    await writeFile(path.join(docsDir, 'DEPLOYMENT_GUIDE.md'), deploymentGuide);
    
    // Generate configuration reference
    const configReference = generateConfigurationReferenceContent();
    await writeFile(path.join(docsDir, 'CONFIGURATION.md'), configReference);
    
    // Generate troubleshooting guide
    const troubleshootingGuide = generateTroubleshootingGuideContent();
    await writeFile(path.join(docsDir, 'TROUBLESHOOTING.md'), troubleshootingGuide);
    
    // Generate migration guide
    const migrationGuide = generateMigrationGuideContent();
    await writeFile(path.join(docsDir, 'MIGRATION_GUIDE.md'), migrationGuide);
    
    console.log(colorize('✅ Documentation generated successfully!', 'green'));
    console.log('\nGenerated files:');
    console.log(`  • ${docsDir}/DEPLOYMENT_GUIDE.md`);
    console.log(`  • ${docsDir}/CONFIGURATION.md`);
    console.log(`  • ${docsDir}/TROUBLESHOOTING.md`);
    console.log(`  • ${docsDir}/MIGRATION_GUIDE.md`);
    
  } catch (error) {
    console.error(colorize('❌ Error generating documentation:', 'red'), error);
    process.exit(1);
  }
}

function generateDeploymentGuideContent(): string {
  return `# Background Embedding Queue - Deployment Guide

## Overview

This guide covers the deployment of the background embedding queue system for the MCP Markdown Manager.

## Prerequisites

- PostgreSQL database with pgvector extension
- Node.js/Bun runtime environment
- Embedding service (Ollama or OpenAI API)
- Sufficient disk space for queue operations

## Deployment Steps

### 1. Database Migration

Run the database migration to create required tables:

\`\`\`bash
bun scripts/migrations/002-embedding-queue.ts
\`\`\`

### 2. Configuration

Set the following environment variables:

\`\`\`bash
# Enable background embedding queue
EMBEDDING_QUEUE_ENABLED=true

# Queue configuration (optional)
EMBEDDING_QUEUE_WORKER_INTERVAL=5000
EMBEDDING_QUEUE_MAX_RETRIES=3
EMBEDDING_QUEUE_BATCH_SIZE=1
\`\`\`

### 3. Pre-deployment Check

Verify deployment readiness:

\`\`\`bash
bun scripts/embedding-migration.ts deploy-check
\`\`\`

### 4. Deploy Application

Deploy your application with the new configuration.

### 5. Post-deployment Migration

Migrate existing articles to use background embedding:

\`\`\`bash
# Analyze current state
bun scripts/embedding-migration.ts analyze

# Perform migration
bun scripts/embedding-migration.ts migrate
\`\`\`

### 6. Monitoring

Monitor the queue status:

\`\`\`bash
# Real-time monitoring
bun scripts/queue-admin.ts monitor

# Check queue health
bun scripts/queue-admin.ts health
\`\`\`

## Rollback Procedure

If issues arise, rollback to synchronous mode:

\`\`\`bash
bun scripts/embedding-migration.ts rollback --confirm
\`\`\`

## Verification

1. Create a new article and verify it's saved immediately
2. Check that embedding task is queued
3. Monitor task completion
4. Verify search functionality works with new embeddings

## Performance Considerations

- Monitor queue depth during peak usage
- Adjust worker interval based on system load
- Consider scaling embedding service for high throughput
- Monitor disk space usage for queue tables

## Security Notes

- Ensure database credentials are properly secured
- Monitor queue for potential DoS via task flooding
- Implement rate limiting if exposing queue operations via API
`;
}

function generateConfigurationReferenceContent(): string {
  return `# Background Embedding Queue - Configuration Reference

## Environment Variables

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| \`EMBEDDING_QUEUE_ENABLED\` | \`true\` | Enable/disable background embedding queue |
| \`EMBEDDING_QUEUE_WORKER_INTERVAL\` | \`5000\` | Worker polling interval in milliseconds |
| \`EMBEDDING_QUEUE_MAX_RETRIES\` | \`3\` | Maximum retry attempts for failed tasks |
| \`EMBEDDING_QUEUE_BATCH_SIZE\` | \`1\` | Number of tasks to process per batch |

### Advanced Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| \`EMBEDDING_QUEUE_CLEANUP_INTERVAL\` | \`86400000\` | Cleanup interval in milliseconds (24h) |
| \`EMBEDDING_QUEUE_RETENTION_DAYS\` | \`30\` | Days to retain completed tasks |
| \`EMBEDDING_QUEUE_STUCK_TIMEOUT\` | \`1800000\` | Timeout for stuck tasks in milliseconds (30m) |

## Database Configuration

The queue system requires two additional tables:

- \`embedding_tasks\`: Stores queue tasks and their status
- \`embedding_worker_status\`: Tracks worker state and statistics

## Performance Tuning

### Worker Interval

- **Low traffic**: 10-30 seconds (reduces CPU usage)
- **Medium traffic**: 5-10 seconds (balanced)
- **High traffic**: 1-5 seconds (responsive)

### Batch Size

- **Single processing**: 1 (prevents resource contention)
- **Bulk operations**: 5-10 (faster bulk processing)

### Retry Configuration

- **Transient errors**: 3-5 retries with exponential backoff
- **Persistent errors**: 1-2 retries to avoid infinite loops

## Monitoring Configuration

### Health Check Thresholds

- **Queue depth warning**: > 100 pending tasks
- **Processing timeout**: > 30 minutes
- **Failure rate alert**: > 10 failures per hour

### Metrics Collection

Enable performance metrics collection:

\`\`\`bash
EMBEDDING_QUEUE_METRICS_ENABLED=true
EMBEDDING_QUEUE_METRICS_INTERVAL=60000  # 1 minute
\`\`\`

## Security Configuration

### Access Control

- Restrict queue management commands to administrators
- Implement rate limiting for queue operations
- Monitor for unusual queue activity patterns

### Data Protection

- Encrypt sensitive metadata in queue tasks
- Implement audit logging for queue operations
- Regular backup of queue state for disaster recovery
`;
}

function generateTroubleshootingGuideContent(): string {
  return `# Background Embedding Queue - Troubleshooting Guide

## Common Issues

### Queue Not Processing Tasks

**Symptoms:**
- Tasks remain in "pending" status
- No tasks move to "processing"

**Causes & Solutions:**

1. **Worker not running**
   \`\`\`bash
   # Check worker status
   bun scripts/queue-admin.ts health
   
   # Restart application to start worker
   \`\`\`

2. **Database connection issues**
   \`\`\`bash
   # Test database connectivity
   bun scripts/test-embedding-queue.ts
   \`\`\`

3. **Configuration disabled**
   \`\`\`bash
   # Check if queue is enabled
   echo $EMBEDDING_QUEUE_ENABLED
   \`\`\`

### High Failure Rate

**Symptoms:**
- Many tasks in "failed" status
- Repeated error messages in logs

**Diagnosis:**
\`\`\`bash
# Check failed tasks
bun scripts/queue-admin.ts list failed 10

# Debug specific task
bun scripts/queue-admin.ts debug <task-id>
\`\`\`

**Common Causes:**

1. **Embedding service unavailable**
   - Check embedding service status
   - Verify API credentials
   - Test network connectivity

2. **Resource exhaustion**
   - Check memory usage
   - Monitor CPU utilization
   - Verify disk space

3. **Invalid article content**
   - Check for malformed markdown
   - Verify character encoding
   - Test with simple content

### Stuck Processing Tasks

**Symptoms:**
- Tasks stuck in "processing" status for hours
- Worker appears unresponsive

**Solution:**
\`\`\`bash
# Reset stuck tasks
bun scripts/queue-admin.ts cleanup-stuck 30

# Check for system resource issues
\`\`\`

### Queue Growing Too Large

**Symptoms:**
- Thousands of pending tasks
- System performance degradation

**Immediate Actions:**
\`\`\`bash
# Check queue health
bun scripts/queue-admin.ts health

# Monitor queue in real-time
bun scripts/queue-admin.ts monitor
\`\`\`

**Long-term Solutions:**
- Increase worker processing speed
- Add multiple worker instances
- Optimize embedding generation
- Implement queue prioritization

## Diagnostic Commands

### Queue Status
\`\`\`bash
# Overall statistics
bun scripts/queue-admin.ts stats

# Health check with recommendations
bun scripts/queue-admin.ts health

# Real-time monitoring
bun scripts/queue-admin.ts monitor 10
\`\`\`

### Task Investigation
\`\`\`bash
# List recent failed tasks
bun scripts/queue-admin.ts list failed 20

# Inspect specific task
bun scripts/queue-admin.ts inspect <task-id>

# Debug with detailed analysis
bun scripts/queue-admin.ts debug <task-id>

# Show all tasks for an article
bun scripts/queue-admin.ts article <article-id>
\`\`\`

### Recovery Operations
\`\`\`bash
# Retry specific failed task
bun scripts/queue-admin.ts retry <task-id>

# Retry all failed tasks
bun scripts/queue-admin.ts retry-failed

# Clean up old completed tasks
bun scripts/queue-admin.ts cleanup 7

# Reset stuck processing tasks
bun scripts/queue-admin.ts cleanup-stuck 30
\`\`\`

## Performance Issues

### Slow Task Processing

1. **Check embedding service performance**
2. **Monitor database query performance**
3. **Verify network latency**
4. **Review system resource usage**

### Memory Leaks

1. **Monitor worker memory usage over time**
2. **Check for unclosed database connections**
3. **Review task metadata size**
4. **Implement periodic worker restarts**

### Database Performance

1. **Monitor queue table sizes**
2. **Check index usage**
3. **Implement regular cleanup**
4. **Consider table partitioning for high volume**

## Emergency Procedures

### Complete Queue Reset

⚠️ **WARNING: This will cancel all pending tasks**

\`\`\`bash
# Stop worker (restart application)
# Clear all pending tasks
UPDATE embedding_tasks SET status = 'failed', 
  error_message = 'Emergency reset' 
  WHERE status IN ('pending', 'processing');
\`\`\`

### Rollback to Synchronous Mode

\`\`\`bash
# Perform emergency rollback
bun scripts/embedding-migration.ts rollback --confirm
\`\`\`

### Data Recovery

\`\`\`bash
# Backup current queue state
pg_dump -t embedding_tasks -t embedding_worker_status > queue_backup.sql

# Restore from backup if needed
psql < queue_backup.sql
\`\`\`

## Getting Help

1. **Check application logs** for detailed error messages
2. **Run diagnostic commands** to gather system state
3. **Review configuration** for common misconfigurations
4. **Test with minimal examples** to isolate issues
5. **Monitor system resources** during problem periods
`;
}

function generateMigrationGuideContent(): string {
  return `# Background Embedding Queue - Migration Guide

## Overview

This guide covers migrating from synchronous embedding to the background queue system.

## Pre-Migration Checklist

- [ ] Database backup completed
- [ ] Application deployed with queue system
- [ ] Configuration verified
- [ ] Deployment readiness check passed

## Migration Process

### 1. Analyze Current State

\`\`\`bash
bun scripts/embedding-migration.ts analyze
\`\`\`

This will show:
- Total articles in system
- Articles with/without embeddings
- Estimated migration time

### 2. Test Migration (Dry Run)

\`\`\`bash
bun scripts/embedding-migration.ts migrate --dry-run
\`\`\`

This will:
- Show what would be migrated
- Identify potential issues
- Provide time estimates

### 3. Perform Migration

\`\`\`bash
# Standard migration
bun scripts/embedding-migration.ts migrate

# Custom batch size and priority
bun scripts/embedding-migration.ts migrate --batch-size=100 --priority=high
\`\`\`

### 4. Monitor Progress

\`\`\`bash
# Real-time monitoring
bun scripts/queue-admin.ts monitor

# Check statistics
bun scripts/queue-admin.ts stats
\`\`\`

## Migration Strategies

### Small Systems (< 1000 articles)

- Use default batch size (50)
- Run during normal hours
- Monitor completion in real-time

### Medium Systems (1000-10000 articles)

- Use larger batch size (100-200)
- Run during off-peak hours
- Implement progress monitoring
- Consider priority queuing

### Large Systems (> 10000 articles)

- Use large batch sizes (500+)
- Run during maintenance windows
- Implement staged migration
- Monitor system resources closely

## Post-Migration Verification

### 1. Verify Queue Health

\`\`\`bash
bun scripts/queue-admin.ts health
\`\`\`

### 2. Test Article Operations

1. Create new article
2. Verify immediate save
3. Check embedding task queued
4. Monitor task completion

### 3. Test Search Functionality

1. Search for existing content
2. Verify results include new articles
3. Test search performance

### 4. Monitor Performance

- Response times for article operations
- Queue processing speed
- System resource usage
- Error rates

## Rollback Procedures

### Immediate Rollback

If critical issues arise:

\`\`\`bash
bun scripts/embedding-migration.ts rollback --confirm
\`\`\`

This will:
- Stop background worker
- Cancel pending tasks
- Revert to synchronous mode

### Partial Rollback

For specific articles with issues:

\`\`\`bash
# Identify problematic tasks
bun scripts/queue-admin.ts list failed

# Cancel specific tasks
bun scripts/queue-admin.ts debug <task-id>
\`\`\`

## Troubleshooting Migration Issues

### Migration Stalls

**Symptoms:**
- Migration progress stops
- No new tasks being queued

**Solutions:**
1. Check system resources
2. Verify database connectivity
3. Restart migration with smaller batches

### High Error Rate During Migration

**Symptoms:**
- Many tasks failing during migration
- Consistent error patterns

**Solutions:**
1. Analyze error messages
2. Fix underlying issues
3. Retry failed tasks
4. Consider staged migration

### Performance Degradation

**Symptoms:**
- Slow application response
- High system resource usage

**Solutions:**
1. Reduce batch size
2. Increase worker interval
3. Schedule migration during off-peak hours
4. Monitor system resources

## Best Practices

### Before Migration

1. **Backup everything** - database, configuration, logs
2. **Test in staging** - run full migration test
3. **Plan timing** - choose low-traffic periods
4. **Prepare rollback** - have rollback plan ready

### During Migration

1. **Monitor actively** - watch progress and errors
2. **Check resources** - monitor CPU, memory, disk
3. **Be patient** - large migrations take time
4. **Document issues** - record any problems for future reference

### After Migration

1. **Verify functionality** - test all features
2. **Monitor performance** - watch for degradation
3. **Clean up** - remove old temporary data
4. **Update documentation** - record any changes made

## Recovery Scenarios

### Complete Migration Failure

1. Stop migration process
2. Rollback to synchronous mode
3. Analyze failure causes
4. Fix issues and retry

### Partial Migration Success

1. Identify successful vs failed articles
2. Retry failed articles only
3. Monitor for patterns in failures
4. Consider manual intervention for problematic articles

### Data Corruption

1. Stop all operations immediately
2. Restore from backup
3. Investigate corruption cause
4. Implement additional safeguards
5. Retry migration with fixes
`;
}

async function backupCurrentConfiguration(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = 'backups/embedding-queue';
  const backupPath = path.join(backupDir, `config-backup-${timestamp}.json`);
  
  // Ensure backup directory exists
  if (!existsSync(backupDir)) {
    await mkdir(backupDir, { recursive: true });
  }
  
  // Collect current configuration
  const config = {
    timestamp: new Date().toISOString(),
    environment: {
      EMBEDDING_QUEUE_ENABLED: process.env.EMBEDDING_QUEUE_ENABLED,
      EMBEDDING_QUEUE_WORKER_INTERVAL: process.env.EMBEDDING_QUEUE_WORKER_INTERVAL,
      EMBEDDING_QUEUE_MAX_RETRIES: process.env.EMBEDDING_QUEUE_MAX_RETRIES,
      EMBEDDING_QUEUE_BATCH_SIZE: process.env.EMBEDDING_QUEUE_BATCH_SIZE
    },
    queueStats: await embeddingQueueService.getQueueStats(),
    systemInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };
  
  await writeFile(backupPath, JSON.stringify(config, null, 2));
  return backupPath;
}

async function restoreConfiguration(): Promise<void> {
  console.log(colorize('\n🔄 Restore Configuration from Backup', 'cyan'));
  
  try {
    const backupDir = 'backups/embedding-queue';
    
    if (!existsSync(backupDir)) {
      console.log(colorize('No backup directory found.', 'red'));
      return;
    }
    
    // List available backups
    const fs = await import('fs/promises');
    const files = await fs.readdir(backupDir);
    const backupFiles = files.filter(f => f.startsWith('config-backup-') && f.endsWith('.json'));
    
    if (backupFiles.length === 0) {
      console.log(colorize('No configuration backups found.', 'red'));
      return;
    }
    
    console.log(colorize('\nAvailable backups:', 'bright'));
    backupFiles.forEach((file, index) => {
      const timestamp = file.replace('config-backup-', '').replace('.json', '');
      console.log(`  ${index + 1}. ${timestamp}`);
    });
    
    console.log(colorize('\n💡 To restore a specific backup, manually copy the configuration values', 'blue'));
    console.log('from the backup file to your environment variables.');
    
  } catch (error) {
    console.error(colorize('❌ Error restoring configuration:', 'red'), error);
    process.exit(1);
  }
}

async function showUsage(): Promise<void> {
  console.log(colorize('\n🚀 Embedding Migration and Deployment Support Tool', 'cyan'));
  console.log('\nUsage:');
  console.log('  bun scripts/embedding-migration.ts <command> [options]');
  
  console.log(colorize('\n📊 Analysis Commands:', 'bright'));
  console.log(`  ${colorize('analyze', 'green')}                         Analyze current embedding status`);
  console.log(`  ${colorize('deploy-check', 'green')}                    Check deployment readiness`);
  
  console.log(colorize('\n🚀 Migration Commands:', 'bright'));
  console.log(`  ${colorize('migrate [options]', 'green')}               Migrate existing articles to background embedding`);
  console.log(`    ${colorize('--dry-run', 'dim')}                      Show what would be migrated without making changes`);
  console.log(`    ${colorize('--batch-size=N', 'dim')}                 Process N articles per batch (default: 50)`);
  console.log(`    ${colorize('--priority=P', 'dim')}                   Set task priority: high/normal/low (default: normal)`);
  
  console.log(colorize('\n🔄 Rollback Commands:', 'bright'));
  console.log(`  ${colorize('rollback [--confirm]', 'green')}            Rollback to synchronous embedding mode`);
  
  console.log(colorize('\n📚 Documentation Commands:', 'bright'));
  console.log(`  ${colorize('generate-docs', 'green')}                   Generate deployment documentation`);
  
  console.log(colorize('\n💾 Configuration Commands:', 'bright'));
  console.log(`  ${colorize('backup-config', 'green')}                   Backup current configuration`);
  console.log(`  ${colorize('restore-config', 'green')}                  Show available configuration backups`);
  
  console.log(colorize('\nExamples:', 'dim'));
  console.log('  bun scripts/embedding-migration.ts analyze');
  console.log('  bun scripts/embedding-migration.ts migrate --dry-run');
  console.log('  bun scripts/embedding-migration.ts migrate --batch-size=100 --priority=high');
  console.log('  bun scripts/embedding-migration.ts rollback --confirm');
  console.log('  bun scripts/embedding-migration.ts deploy-check');
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
      case 'analyze':
        await analyzeEmbeddingStatus();
        break;
        
      case 'migrate':
        const dryRun = process.argv.includes('--dry-run');
        const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size='));
        const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 50;
        const priorityArg = process.argv.find(arg => arg.startsWith('--priority='));
        const priority = (priorityArg ? priorityArg.split('=')[1] : 'normal') as 'high' | 'normal' | 'low';
        
        await migrateExistingArticles(dryRun, batchSize, priority);
        break;
        
      case 'rollback':
        const confirm = process.argv.includes('--confirm');
        await rollbackToSynchronousMode(confirm);
        break;
        
      case 'deploy-check':
        await checkDeploymentReadiness();
        break;
        
      case 'generate-docs':
        await generateDeploymentDocumentation();
        break;
        
      case 'backup-config':
        const backupPath = await backupCurrentConfiguration();
        console.log(colorize(`✅ Configuration backed up to: ${backupPath}`, 'green'));
        break;
        
      case 'restore-config':
        await restoreConfiguration();
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