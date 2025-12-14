#!/usr/bin/env bun
/**
 * Queue Management Administrative Tool
 * 
 * Provides comprehensive CLI commands for queue inspection, management,
 * manual task retry, cleanup operations, and debugging tools.
 * 
 * Usage:
 *   bun scripts/queue-admin.ts <command> [options]
 * 
 * Commands:
 *   stats                           Show queue statistics
 *   health                          Check queue health
 *   list <status> [limit] [offset]  List tasks by status
 *   inspect <task-id>               Inspect specific task details
 *   retry <task-id>                 Retry specific failed task
 *   retry-failed [max-attempts]     Retry all failed tasks
 *   cleanup [days]                  Clean up old completed tasks
 *   cleanup-stuck [timeout-minutes] Reset stuck processing tasks
 *   article <article-id>            Show all tasks for an article
 *   debug <task-id>                 Debug task with detailed information
 *   monitor [interval-seconds]      Monitor queue in real-time
 *   help                            Show help message
 */

import { embeddingQueueService, EmbeddingTask, QueueStats, QueueHealth } from '../src/backend/services/embeddingQueue.js';
import { database, getDatabaseConfig } from '../src/backend/services/database.js';

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
  cyan: '\x1b[36m',
  white: '\x1b[37m'
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
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else {
    return 'just now';
  }
}

function getStatusColor(status: string): keyof typeof colors {
  switch (status) {
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'processing': return 'blue';
    case 'pending': return 'yellow';
    default: return 'white';
  }
}

function getPriorityColor(priority: string): keyof typeof colors {
  switch (priority) {
    case 'high': return 'red';
    case 'normal': return 'yellow';
    case 'low': return 'dim';
    default: return 'white';
  }
}

async function showQueueStats(): Promise<void> {
  console.log(colorize('\n📊 Queue Statistics', 'cyan'));
  
  try {
    const detailedStats = await embeddingQueueService.getDetailedQueueStats();
    const { stats, tasksByPriority, tasksByOperation, recentActivity } = detailedStats;
    
    console.log(colorize('\n📈 Task Counts:', 'bright'));
    console.log(`  Pending:    ${colorize(stats.pending.toString().padStart(6), getStatusColor('pending'))}`);
    console.log(`  Processing: ${colorize(stats.processing.toString().padStart(6), getStatusColor('processing'))}`);
    console.log(`  Completed:  ${colorize(stats.completed.toString().padStart(6), getStatusColor('completed'))}`);
    console.log(`  Failed:     ${colorize(stats.failed.toString().padStart(6), getStatusColor('failed'))}`);
    console.log(`  ${colorize('Total:', 'bright')}      ${colorize(stats.total.toString().padStart(6), 'bright')}`);
    
    console.log(colorize('\n🎯 Active Tasks by Priority:', 'bright'));
    console.log(`  High:   ${colorize(tasksByPriority.high.toString().padStart(4), getPriorityColor('high'))}`);
    console.log(`  Normal: ${colorize(tasksByPriority.normal.toString().padStart(4), getPriorityColor('normal'))}`);
    console.log(`  Low:    ${colorize(tasksByPriority.low.toString().padStart(4), getPriorityColor('low'))}`);
    
    console.log(colorize('\n⚙️ Active Tasks by Operation:', 'bright'));
    console.log(`  Create: ${colorize(tasksByOperation.create.toString().padStart(4), 'green')}`);
    console.log(`  Update: ${colorize(tasksByOperation.update.toString().padStart(4), 'yellow')}`);
    console.log(`  Delete: ${colorize(tasksByOperation.delete.toString().padStart(4), 'red')}`);
    
    console.log(colorize('\n📅 Recent Activity (24h):', 'bright'));
    console.log(`  Completed: ${colorize(recentActivity.tasksCompletedLast24h.toString(), 'green')}`);
    console.log(`  Failed:    ${colorize(recentActivity.tasksFailedLast24h.toString(), 'red')}`);
    
    if (recentActivity.averageProcessingTime !== null) {
      console.log(`  Avg Time:  ${colorize(recentActivity.averageProcessingTime.toFixed(2) + 's', 'blue')}`);
    }
    
  } catch (error) {
    console.error(colorize('❌ Error retrieving queue statistics:', 'red'), error);
    process.exit(1);
  }
}

async function showQueueHealth(): Promise<void> {
  console.log(colorize('\n🏥 Queue Health Check', 'cyan'));
  
  try {
    const health = await embeddingQueueService.getQueueHealth();
    
    const healthStatus = health.isHealthy ? 
      colorize('✅ HEALTHY', 'green') : 
      colorize('⚠️ ISSUES DETECTED', 'red');
    
    console.log(`\n${colorize('Status:', 'bright')} ${healthStatus}`);
    console.log(`${colorize('Total Tasks:', 'bright')} ${health.totalTasks}`);
    
    if (health.oldestPendingTask) {
      const age = formatRelativeTime(health.oldestPendingTask);
      console.log(`${colorize('Oldest Pending:', 'bright')} ${age} (${formatDate(health.oldestPendingTask)})`);
    }
    
    console.log(`${colorize('Failed (24h):', 'bright')} ${health.failedTasksLast24h}`);
    
    if (health.averageProcessingTime) {
      console.log(`${colorize('Avg Processing:', 'bright')} ${health.averageProcessingTime.toFixed(2)}s`);
    }
    
    if (health.issues.length > 0) {
      console.log(colorize('\n⚠️ Issues Found:', 'red'));
      health.issues.forEach(issue => {
        console.log(`  • ${issue}`);
      });
      
      console.log(colorize('\n💡 Recommendations:', 'blue'));
      if (health.issues.some(i => i.includes('High number of pending tasks'))) {
        console.log('  • Consider starting additional workers or checking worker status');
      }
      if (health.issues.some(i => i.includes('stuck tasks'))) {
        console.log('  • Run cleanup-stuck command to reset stuck processing tasks');
      }
      if (health.issues.some(i => i.includes('High failure rate'))) {
        console.log('  • Check error logs and consider retrying failed tasks');
      }
      if (health.issues.some(i => i.includes('Old pending tasks'))) {
        console.log('  • Check if background worker is running properly');
      }
    }
    
  } catch (error) {
    console.error(colorize('❌ Error checking queue health:', 'red'), error);
    process.exit(1);
  }
}

async function listTasksByStatus(status: string, limit: number = 20, offset: number = 0): Promise<void> {
  const validStatuses = ['pending', 'processing', 'completed', 'failed'];
  if (!validStatuses.includes(status)) {
    console.error(colorize(`❌ Invalid status. Must be one of: ${validStatuses.join(', ')}`, 'red'));
    process.exit(1);
  }
  
  console.log(colorize(`\n📋 Tasks with status: ${status.toUpperCase()}`, 'cyan'));
  console.log(colorize(`Showing ${limit} tasks (offset: ${offset})`, 'dim'));
  
  try {
    const tasks = await embeddingQueueService.getTasksByStatus(status as any, limit, offset);
    
    if (tasks.length === 0) {
      console.log(colorize(`No ${status} tasks found.`, 'yellow'));
      return;
    }
    
    console.log();
    tasks.forEach((task, index) => {
      const number = (offset + index + 1).toString().padStart(3);
      const statusColor = getStatusColor(task.status);
      const priorityColor = getPriorityColor(task.priority);
      
      console.log(`${colorize(number + '.', 'dim')} ${colorize(task.id.substring(0, 8), 'bright')} ${colorize(task.slug, 'cyan')}`);
      console.log(`     Status: ${colorize(task.status, statusColor)} | Priority: ${colorize(task.priority, priorityColor)} | Operation: ${task.operation}`);
      console.log(`     Created: ${formatRelativeTime(task.createdAt)} | Attempts: ${task.attempts}/${task.maxAttempts}`);
      
      if (task.errorMessage) {
        const shortError = task.errorMessage.length > 80 ? 
          task.errorMessage.substring(0, 80) + '...' : 
          task.errorMessage;
        console.log(`     ${colorize('Error:', 'red')} ${shortError}`);
      }
      
      if (task.processedAt) {
        console.log(`     Processed: ${formatRelativeTime(task.processedAt)}`);
      }
      
      if (task.completedAt) {
        const duration = task.processedAt ? 
          formatDuration(task.completedAt.getTime() - task.processedAt.getTime()) : 
          'unknown';
        console.log(`     Completed: ${formatRelativeTime(task.completedAt)} (took ${duration})`);
      }
      
      console.log();
    });
    
    if (tasks.length === limit) {
      console.log(colorize(`💡 Use offset ${offset + limit} to see more tasks`, 'blue'));
    }
    
  } catch (error) {
    console.error(colorize('❌ Error listing tasks:', 'red'), error);
    process.exit(1);
  }
}

async function inspectTask(taskId: string): Promise<void> {
  console.log(colorize(`\n🔍 Task Inspection: ${taskId}`, 'cyan'));
  
  try {
    const task = await embeddingQueueService.getTaskStatus(taskId);
    
    if (!task) {
      console.log(colorize('Task not found.', 'red'));
      return;
    }
    
    console.log(`\n${colorize('Basic Information:', 'bright')}`);
    console.log(`  ID:         ${task.id}`);
    console.log(`  Article ID: ${task.articleId}`);
    console.log(`  Slug:       ${colorize(task.slug, 'cyan')}`);
    console.log(`  Operation:  ${task.operation}`);
    console.log(`  Priority:   ${colorize(task.priority, getPriorityColor(task.priority))}`);
    console.log(`  Status:     ${colorize(task.status, getStatusColor(task.status))}`);
    
    console.log(`\n${colorize('Timing Information:', 'bright')}`);
    console.log(`  Created:    ${formatDate(task.createdAt)} (${formatRelativeTime(task.createdAt)})`);
    console.log(`  Scheduled:  ${formatDate(task.scheduledAt)}`);
    
    if (task.processedAt) {
      const waitTime = formatDuration(task.processedAt.getTime() - task.createdAt.getTime());
      console.log(`  Processed:  ${formatDate(task.processedAt)} (waited ${waitTime})`);
    }
    
    if (task.completedAt) {
      const totalTime = formatDuration(task.completedAt.getTime() - task.createdAt.getTime());
      const processTime = task.processedAt ? 
        formatDuration(task.completedAt.getTime() - task.processedAt.getTime()) : 
        'unknown';
      console.log(`  Completed:  ${formatDate(task.completedAt)} (total: ${totalTime}, processing: ${processTime})`);
    }
    
    console.log(`\n${colorize('Execution Information:', 'bright')}`);
    console.log(`  Attempts:   ${task.attempts}/${task.maxAttempts}`);
    
    if (task.errorMessage) {
      console.log(`\n${colorize('Error Details:', 'red')}`);
      console.log(`  ${task.errorMessage}`);
    }
    
    if (task.metadata) {
      console.log(`\n${colorize('Metadata:', 'bright')}`);
      console.log(`  ${JSON.stringify(task.metadata, null, 2).split('\n').join('\n  ')}`);
    }
    
    // Show related tasks for the same article
    console.log(`\n${colorize('Related Tasks for Article:', 'bright')}`);
    const relatedTasks = await embeddingQueueService.getTasksForArticle(task.articleId);
    const otherTasks = relatedTasks.filter(t => t.id !== task.id);
    
    if (otherTasks.length === 0) {
      console.log('  No other tasks found for this article.');
    } else {
      otherTasks.slice(0, 5).forEach(relatedTask => {
        const statusColor = getStatusColor(relatedTask.status);
        console.log(`  • ${relatedTask.id.substring(0, 8)} - ${colorize(relatedTask.status, statusColor)} (${relatedTask.operation}, ${formatRelativeTime(relatedTask.createdAt)})`);
      });
      
      if (otherTasks.length > 5) {
        console.log(colorize(`  ... and ${otherTasks.length - 5} more`, 'dim'));
      }
    }
    
  } catch (error) {
    console.error(colorize('❌ Error inspecting task:', 'red'), error);
    process.exit(1);
  }
}

async function retryTask(taskId: string): Promise<void> {
  console.log(colorize(`\n🔄 Retrying task: ${taskId}`, 'cyan'));
  
  try {
    const task = await embeddingQueueService.getTaskStatus(taskId);
    
    if (!task) {
      console.log(colorize('Task not found.', 'red'));
      return;
    }
    
    if (task.status !== 'failed') {
      console.log(colorize(`Task is not in failed status (current: ${task.status}). Only failed tasks can be retried.`, 'yellow'));
      return;
    }
    
    if (task.attempts >= task.maxAttempts) {
      console.log(colorize(`Task has already reached maximum attempts (${task.attempts}/${task.maxAttempts}).`, 'red'));
      console.log(colorize('Consider increasing max attempts or investigating the underlying issue.', 'yellow'));
      return;
    }
    
    // Reset the task to pending status
    await embeddingQueueService.updateTaskStatus(taskId, 'pending');
    
    // Update scheduled time to now
    await database.query(`
      UPDATE embedding_tasks 
      SET scheduled_at = NOW(), error_message = NULL
      WHERE id = $1
    `, [taskId]);
    
    console.log(colorize('✅ Task has been reset to pending status and will be retried.', 'green'));
    console.log(`   Attempts: ${task.attempts}/${task.maxAttempts}`);
    
  } catch (error) {
    console.error(colorize('❌ Error retrying task:', 'red'), error);
    process.exit(1);
  }
}

async function retryAllFailedTasks(maxAttempts?: number): Promise<void> {
  console.log(colorize('\n🔄 Retrying all failed tasks...', 'cyan'));
  
  try {
    let query = `
      UPDATE embedding_tasks 
      SET status = 'pending', 
          scheduled_at = NOW(),
          error_message = NULL
      WHERE status = 'failed'
    `;
    
    const params: any[] = [];
    
    if (maxAttempts !== undefined) {
      query += ` AND attempts < $1`;
      params.push(maxAttempts);
      console.log(colorize(`Only retrying tasks with attempts < ${maxAttempts}`, 'dim'));
    } else {
      query += ` AND attempts < max_attempts`;
      console.log(colorize('Only retrying tasks that haven\'t exceeded max attempts', 'dim'));
    }
    
    const result = await database.query(query, params);
    const retriedCount = result.rowCount || 0;
    
    if (retriedCount === 0) {
      console.log(colorize('No failed tasks found that can be retried.', 'yellow'));
    } else {
      console.log(colorize(`✅ ${retriedCount} failed task${retriedCount > 1 ? 's' : ''} have been reset to pending status.`, 'green'));
    }
    
  } catch (error) {
    console.error(colorize('❌ Error retrying failed tasks:', 'red'), error);
    process.exit(1);
  }
}

async function cleanupCompletedTasks(days: number = 30): Promise<void> {
  console.log(colorize(`\n🧹 Cleaning up completed tasks older than ${days} days...`, 'cyan'));
  
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    console.log(colorize(`Cutoff date: ${formatDate(cutoffDate)}`, 'dim'));
    
    const deletedCount = await embeddingQueueService.clearCompletedTasks(cutoffDate);
    
    if (deletedCount === 0) {
      console.log(colorize('No old completed tasks found to clean up.', 'yellow'));
    } else {
      console.log(colorize(`✅ Cleaned up ${deletedCount} completed task${deletedCount > 1 ? 's' : ''}.`, 'green'));
    }
    
  } catch (error) {
    console.error(colorize('❌ Error cleaning up completed tasks:', 'red'), error);
    process.exit(1);
  }
}

async function cleanupStuckTasks(timeoutMinutes: number = 30): Promise<void> {
  console.log(colorize(`\n🔧 Cleaning up tasks stuck in processing for more than ${timeoutMinutes} minutes...`, 'cyan'));
  
  try {
    const result = await database.query(`
      UPDATE embedding_tasks 
      SET status = 'pending', 
          processed_at = NULL,
          error_message = 'Task was stuck in processing state and has been reset'
      WHERE status = 'processing' 
        AND processed_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
    `);
    
    const resetCount = result.rowCount || 0;
    
    if (resetCount === 0) {
      console.log(colorize('No stuck processing tasks found.', 'yellow'));
    } else {
      console.log(colorize(`✅ Reset ${resetCount} stuck task${resetCount > 1 ? 's' : ''} to pending status.`, 'green'));
    }
    
  } catch (error) {
    console.error(colorize('❌ Error cleaning up stuck tasks:', 'red'), error);
    process.exit(1);
  }
}

async function showArticleTasks(articleId: number): Promise<void> {
  console.log(colorize(`\n📄 Tasks for Article ID: ${articleId}`, 'cyan'));
  
  try {
    const tasks = await embeddingQueueService.getTasksForArticle(articleId);
    
    if (tasks.length === 0) {
      console.log(colorize('No tasks found for this article.', 'yellow'));
      return;
    }
    
    // Get article info
    const articleResult = await database.query(`
      SELECT slug, title FROM articles WHERE id = $1
    `, [articleId]);
    
    if (articleResult.rows.length > 0) {
      const article = articleResult.rows[0];
      console.log(`${colorize('Article:', 'bright')} ${colorize(article.slug, 'cyan')} - "${article.title}"`);
    }
    
    console.log(`\n${colorize('Task History:', 'bright')} (${tasks.length} tasks)`);
    
    tasks.forEach((task, index) => {
      const number = (index + 1).toString().padStart(2);
      const statusColor = getStatusColor(task.status);
      const priorityColor = getPriorityColor(task.priority);
      
      console.log(`\n${colorize(number + '.', 'dim')} ${colorize(task.id.substring(0, 8), 'bright')} - ${colorize(task.status.toUpperCase(), statusColor)}`);
      console.log(`    Operation: ${task.operation} | Priority: ${colorize(task.priority, priorityColor)} | Attempts: ${task.attempts}/${task.maxAttempts}`);
      console.log(`    Created: ${formatDate(task.createdAt)} (${formatRelativeTime(task.createdAt)})`);
      
      if (task.processedAt) {
        console.log(`    Processed: ${formatDate(task.processedAt)}`);
      }
      
      if (task.completedAt) {
        const duration = task.processedAt ? 
          formatDuration(task.completedAt.getTime() - task.processedAt.getTime()) : 
          'unknown';
        console.log(`    Completed: ${formatDate(task.completedAt)} (${duration})`);
      }
      
      if (task.errorMessage) {
        const shortError = task.errorMessage.length > 60 ? 
          task.errorMessage.substring(0, 60) + '...' : 
          task.errorMessage;
        console.log(`    ${colorize('Error:', 'red')} ${shortError}`);
      }
    });
    
  } catch (error) {
    console.error(colorize('❌ Error retrieving article tasks:', 'red'), error);
    process.exit(1);
  }
}

async function debugTask(taskId: string): Promise<void> {
  console.log(colorize(`\n🐛 Debug Analysis: ${taskId}`, 'cyan'));
  
  try {
    const task = await embeddingQueueService.getTaskStatus(taskId);
    
    if (!task) {
      console.log(colorize('Task not found.', 'red'));
      return;
    }
    
    // Show basic task info
    await inspectTask(taskId);
    
    // Additional debugging information
    console.log(colorize('\n🔍 Debug Analysis:', 'bright'));
    
    // Check if article still exists
    const articleResult = await database.query(`
      SELECT id, slug, title, created_at, updated_at FROM articles WHERE id = $1
    `, [task.articleId]);
    
    if (articleResult.rows.length === 0) {
      console.log(colorize('  ⚠️ Article no longer exists in database!', 'red'));
    } else {
      const article = articleResult.rows[0];
      console.log(`  ✅ Article exists: ${article.slug} - "${article.title}"`);
      console.log(`     Created: ${formatDate(new Date(article.created_at))}`);
      console.log(`     Updated: ${formatDate(new Date(article.updated_at))}`);
    }
    
    // Check for duplicate tasks
    const duplicateTasks = await database.query(`
      SELECT id, status, created_at FROM embedding_tasks 
      WHERE article_id = $1 AND operation = $2 AND id != $3
      ORDER BY created_at DESC
    `, [task.articleId, task.operation, task.id]);
    
    if (duplicateTasks.rows.length > 0) {
      console.log(colorize(`  ⚠️ Found ${duplicateTasks.rows.length} other ${task.operation} task(s) for this article:`, 'yellow'));
      duplicateTasks.rows.slice(0, 3).forEach(dup => {
        console.log(`     • ${dup.id.substring(0, 8)} - ${dup.status} (${formatRelativeTime(new Date(dup.created_at))})`);
      });
    } else {
      console.log(`  ✅ No duplicate ${task.operation} tasks found`);
    }
    
    // Check task age and scheduling
    const now = new Date();
    const ageMs = now.getTime() - task.createdAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    
    if (ageHours > 24) {
      console.log(colorize(`  ⚠️ Task is ${ageHours.toFixed(1)} hours old`, 'yellow'));
    }
    
    if (task.scheduledAt > now) {
      const delayMs = task.scheduledAt.getTime() - now.getTime();
      console.log(colorize(`  ⏰ Task is scheduled for future: ${formatDuration(delayMs)} from now`, 'blue'));
    }
    
    // Analyze failure patterns if failed
    if (task.status === 'failed') {
      console.log(colorize('\n🚨 Failure Analysis:', 'red'));
      
      if (task.attempts >= task.maxAttempts) {
        console.log('  • Task has exhausted all retry attempts');
      }
      
      if (task.errorMessage) {
        // Analyze common error patterns
        const error = task.errorMessage.toLowerCase();
        
        if (error.includes('timeout') || error.includes('timed out')) {
          console.log('  • Error type: Timeout - may indicate network or performance issues');
        } else if (error.includes('connection') || error.includes('network')) {
          console.log('  • Error type: Network - check connectivity to embedding service');
        } else if (error.includes('authentication') || error.includes('unauthorized')) {
          console.log('  • Error type: Authentication - check API keys and credentials');
        } else if (error.includes('rate limit') || error.includes('quota')) {
          console.log('  • Error type: Rate limiting - may need to reduce processing speed');
        } else if (error.includes('invalid') || error.includes('malformed')) {
          console.log('  • Error type: Data validation - check article content format');
        } else {
          console.log('  • Error type: Unknown - manual investigation required');
        }
      }
      
      // Check for similar failures
      const similarFailures = await database.query(`
        SELECT COUNT(*) as count FROM embedding_tasks 
        WHERE status = 'failed' 
          AND error_message LIKE $1
          AND created_at >= NOW() - INTERVAL '24 hours'
      `, [`%${task.errorMessage?.substring(0, 50) || ''}%`]);
      
      const similarCount = parseInt(similarFailures.rows[0]?.count || '0');
      if (similarCount > 1) {
        console.log(colorize(`  • ${similarCount} similar failures in last 24 hours - may be systemic issue`, 'yellow'));
      }
    }
    
    // Recommendations
    console.log(colorize('\n💡 Recommendations:', 'blue'));
    
    if (task.status === 'failed' && task.attempts < task.maxAttempts) {
      console.log('  • Retry the task: bun scripts/queue-admin.ts retry ' + task.id);
    }
    
    if (task.status === 'processing' && task.processedAt) {
      const processingTime = now.getTime() - task.processedAt.getTime();
      if (processingTime > 30 * 60 * 1000) { // 30 minutes
        console.log('  • Task may be stuck - consider running cleanup-stuck command');
      }
    }
    
    if (duplicateTasks.rows.length > 0) {
      console.log('  • Multiple tasks for same article/operation - check for race conditions');
    }
    
  } catch (error) {
    console.error(colorize('❌ Error debugging task:', 'red'), error);
    process.exit(1);
  }
}

async function monitorQueue(intervalSeconds: number = 5): Promise<void> {
  console.log(colorize(`\n📺 Queue Monitor (updating every ${intervalSeconds}s, press Ctrl+C to stop)`, 'cyan'));
  
  let iteration = 0;
  
  const monitor = async () => {
    try {
      // Clear screen and show header
      if (iteration > 0) {
        process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen and move cursor to top
      }
      
      console.log(colorize(`Queue Monitor - ${formatDate(new Date())} (iteration ${iteration + 1})`, 'bright'));
      console.log('='.repeat(80));
      
      // Get current stats
      const stats = await embeddingQueueService.getQueueStats();
      const health = await embeddingQueueService.getQueueHealth();
      
      // Show compact stats
      const healthIcon = health.isHealthy ? '✅' : '⚠️';
      console.log(`${healthIcon} Status: ${health.isHealthy ? 'Healthy' : 'Issues'} | Total: ${stats.total} | ` +
                 `Pending: ${colorize(stats.pending.toString(), 'yellow')} | ` +
                 `Processing: ${colorize(stats.processing.toString(), 'blue')} | ` +
                 `Completed: ${colorize(stats.completed.toString(), 'green')} | ` +
                 `Failed: ${colorize(stats.failed.toString(), 'red')}`);
      
      if (health.oldestPendingTask) {
        console.log(`Oldest pending: ${formatRelativeTime(health.oldestPendingTask)}`);
      }
      
      if (health.issues.length > 0) {
        console.log(colorize('Issues:', 'red'));
        health.issues.forEach(issue => console.log(`  • ${issue}`));
      }
      
      // Show recent activity if there are active tasks
      if (stats.pending > 0 || stats.processing > 0) {
        console.log('\nRecent Tasks:');
        
        const recentTasks = await embeddingQueueService.getTasksByStatus('processing', 5);
        if (recentTasks.length > 0) {
          console.log(colorize('  Processing:', 'blue'));
          recentTasks.forEach(task => {
            const duration = task.processedAt ? formatDuration(Date.now() - task.processedAt.getTime()) : '';
            console.log(`    • ${task.slug} (${task.operation}, ${duration})`);
          });
        }
        
        const pendingTasks = await embeddingQueueService.getTasksByStatus('pending', 3);
        if (pendingTasks.length > 0) {
          console.log(colorize('  Next Pending:', 'yellow'));
          pendingTasks.forEach(task => {
            console.log(`    • ${task.slug} (${task.operation}, ${task.priority})`);
          });
        }
      }
      
      iteration++;
      
    } catch (error) {
      console.error(colorize('\n❌ Monitor error:', 'red'), error);
    }
  };
  
  // Initial run
  await monitor();
  
  // Set up interval
  const intervalId = setInterval(monitor, intervalSeconds * 1000);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log(colorize('\n\n👋 Monitor stopped.', 'cyan'));
    process.exit(0);
  });
}

async function showUsage(): Promise<void> {
  console.log(colorize('\n🛠️ Queue Management Administrative Tool', 'cyan'));
  console.log('\nUsage:');
  console.log('  bun scripts/queue-admin.ts <command> [options]');
  
  console.log(colorize('\n📊 Information Commands:', 'bright'));
  console.log(`  ${colorize('stats', 'green')}                           Show detailed queue statistics`);
  console.log(`  ${colorize('health', 'green')}                          Check queue health and issues`);
  console.log(`  ${colorize('list <status> [limit] [offset]', 'green')}  List tasks by status (pending/processing/completed/failed)`);
  console.log(`  ${colorize('inspect <task-id>', 'green')}               Show detailed task information`);
  console.log(`  ${colorize('article <article-id>', 'green')}            Show all tasks for specific article`);
  
  console.log(colorize('\n🔧 Management Commands:', 'bright'));
  console.log(`  ${colorize('retry <task-id>', 'green')}                 Retry specific failed task`);
  console.log(`  ${colorize('retry-failed [max-attempts]', 'green')}     Retry all failed tasks (optionally limit by attempts)`);
  console.log(`  ${colorize('cleanup [days]', 'green')}                  Clean up completed tasks older than N days (default: 30)`);
  console.log(`  ${colorize('cleanup-stuck [timeout-minutes]', 'green')} Reset stuck processing tasks (default: 30 min)`);
  
  console.log(colorize('\n🐛 Debugging Commands:', 'bright'));
  console.log(`  ${colorize('debug <task-id>', 'green')}                 Debug task with detailed analysis`);
  console.log(`  ${colorize('monitor [interval-seconds]', 'green')}      Monitor queue in real-time (default: 5s)`);
  
  console.log(colorize('\nExamples:', 'dim'));
  console.log('  bun scripts/queue-admin.ts stats');
  console.log('  bun scripts/queue-admin.ts list failed 10');
  console.log('  bun scripts/queue-admin.ts inspect 12345678-1234-1234-1234-123456789012');
  console.log('  bun scripts/queue-admin.ts retry-failed 2');
  console.log('  bun scripts/queue-admin.ts cleanup 7');
  console.log('  bun scripts/queue-admin.ts debug 12345678-1234-1234-1234-123456789012');
  console.log('  bun scripts/queue-admin.ts monitor 10');
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
      case 'stats':
        await showQueueStats();
        break;
        
      case 'health':
        await showQueueHealth();
        break;
        
      case 'list':
        const status = process.argv[3];
        if (!status) {
          console.error(colorize('❌ Status required for list command', 'red'));
          console.log('Usage: bun scripts/queue-admin.ts list <status> [limit] [offset]');
          console.log('Valid statuses: pending, processing, completed, failed');
          process.exit(1);
        }
        const limit = parseInt(process.argv[4]) || 20;
        const offset = parseInt(process.argv[5]) || 0;
        await listTasksByStatus(status, limit, offset);
        break;
        
      case 'inspect':
        const taskId = process.argv[3];
        if (!taskId) {
          console.error(colorize('❌ Task ID required for inspect command', 'red'));
          console.log('Usage: bun scripts/queue-admin.ts inspect <task-id>');
          process.exit(1);
        }
        await inspectTask(taskId);
        break;
        
      case 'retry':
        const retryTaskId = process.argv[3];
        if (!retryTaskId) {
          console.error(colorize('❌ Task ID required for retry command', 'red'));
          console.log('Usage: bun scripts/queue-admin.ts retry <task-id>');
          process.exit(1);
        }
        await retryTask(retryTaskId);
        break;
        
      case 'retry-failed':
        const maxAttempts = process.argv[3] ? parseInt(process.argv[3]) : undefined;
        await retryAllFailedTasks(maxAttempts);
        break;
        
      case 'cleanup':
        const days = parseInt(process.argv[3]) || 30;
        await cleanupCompletedTasks(days);
        break;
        
      case 'cleanup-stuck':
        const timeoutMinutes = parseInt(process.argv[3]) || 30;
        await cleanupStuckTasks(timeoutMinutes);
        break;
        
      case 'article':
        const articleId = parseInt(process.argv[3]);
        if (!articleId || isNaN(articleId)) {
          console.error(colorize('❌ Valid article ID required for article command', 'red'));
          console.log('Usage: bun scripts/queue-admin.ts article <article-id>');
          process.exit(1);
        }
        await showArticleTasks(articleId);
        break;
        
      case 'debug':
        const debugTaskId = process.argv[3];
        if (!debugTaskId) {
          console.error(colorize('❌ Task ID required for debug command', 'red'));
          console.log('Usage: bun scripts/queue-admin.ts debug <task-id>');
          process.exit(1);
        }
        await debugTask(debugTaskId);
        break;
        
      case 'monitor':
        const intervalSeconds = parseInt(process.argv[3]) || 5;
        await monitorQueue(intervalSeconds);
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