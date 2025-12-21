#!/usr/bin/env bun
/**
 * Emergency Rollback Script
 * 
 * Quick rollback to synchronous embedding mode for emergency situations.
 * This script provides a fast way to disable background processing when
 * critical issues arise.
 * 
 * Usage:
 *   bun scripts/emergency-rollback.ts [--force]
 * 
 * Options:
 *   --force    Skip confirmation prompts (use with caution)
 */

import { database, getDatabaseConfig } from '../src/backend/services/database.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

async function emergencyRollback(force: boolean = false): Promise<void> {
  console.log(colorize('\n🚨 EMERGENCY ROLLBACK TO SYNCHRONOUS MODE', 'red'));
  
  if (!force) {
    console.log(colorize('\n⚠️ WARNING: This will immediately disable background embedding!', 'yellow'));
    console.log('This action will:');
    console.log('  • Cancel all pending embedding tasks');
    console.log('  • Stop background worker processing');
    console.log('  • Revert to synchronous embedding (slower but immediate)');
    console.log('  • Require application restart to take effect');
    
    console.log(colorize('\n❓ Are you sure you want to proceed? (type "ROLLBACK" to confirm)', 'yellow'));
    
    // Simple confirmation without readline dependency
    const confirmation = await new Promise<string>((resolve) => {
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim());
      });
    });
    
    if (confirmation !== 'ROLLBACK') {
      console.log(colorize('❌ Rollback cancelled.', 'red'));
      return;
    }
  }
  
  try {
    console.log(colorize('\n🔄 Performing emergency rollback...', 'cyan'));
    
    // 1. Cancel all pending and processing tasks
    console.log('1. Cancelling active embedding tasks...');
    const cancelResult = await database.query(`
      UPDATE embedding_tasks 
      SET status = 'failed', 
          error_message = 'Emergency rollback - task cancelled',
          completed_at = NOW()
      WHERE status IN ('pending', 'processing')
    `);
    
    const cancelledTasks = cancelResult.rowCount || 0;
    console.log(`   ✅ Cancelled ${cancelledTasks} active tasks`);
    
    // 2. Update worker status to stopped
    console.log('2. Stopping background worker...');
    await database.query(`
      UPDATE embedding_worker_status 
      SET is_running = FALSE, 
          last_heartbeat = NOW()
      WHERE id = 1
    `);
    console.log('   ✅ Worker status updated to stopped');
    
    // 3. Create rollback marker file
    console.log('3. Creating rollback marker...');
    const fs = await import('fs/promises');
    const rollbackInfo = {
      timestamp: new Date().toISOString(),
      reason: 'Emergency rollback',
      cancelledTasks,
      instructions: [
        'Set EMBEDDING_QUEUE_ENABLED=false in environment',
        'Restart the application',
        'Verify synchronous embedding is working',
        'Monitor application performance'
      ]
    };
    
    await fs.writeFile(
      'EMERGENCY_ROLLBACK.json', 
      JSON.stringify(rollbackInfo, null, 2)
    );
    console.log('   ✅ Rollback information saved to EMERGENCY_ROLLBACK.json');
    
    console.log(colorize('\n✅ Emergency rollback completed successfully!', 'green'));
    
    console.log(colorize('\n📋 IMMEDIATE ACTIONS REQUIRED:', 'bright'));
    console.log('1. Set environment variable: EMBEDDING_QUEUE_ENABLED=false');
    console.log('2. Restart the application to apply changes');
    console.log('3. Test article creation/update to verify synchronous mode');
    console.log('4. Monitor application performance and response times');
    
    console.log(colorize('\n🔄 TO RESTORE BACKGROUND PROCESSING:', 'bright'));
    console.log('1. Investigate and fix the original issue');
    console.log('2. Set EMBEDDING_QUEUE_ENABLED=true');
    console.log('3. Restart the application');
    console.log('4. Run: bun scripts/embedding-migration.ts migrate');
    
    console.log(colorize('\n📞 If you need help, check the troubleshooting guide:', 'cyan'));
    console.log('   docs/embedding-queue/TROUBLESHOOTING.md');
    
  } catch (error) {
    console.error(colorize('\n❌ Error during emergency rollback:', 'red'), error);
    console.log(colorize('\n🆘 MANUAL ROLLBACK REQUIRED:', 'red'));
    console.log('1. Set EMBEDDING_QUEUE_ENABLED=false immediately');
    console.log('2. Restart the application');
    console.log('3. Manually cancel tasks in database if needed:');
    console.log('   UPDATE embedding_tasks SET status = \'failed\' WHERE status IN (\'pending\', \'processing\');');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  
  try {
    // Initialize database connection
    await database.connect(getDatabaseConfig());
    
    await emergencyRollback(force);
    
  } catch (error) {
    console.error(colorize('❌ Fatal error:', 'red'), error);
    process.exit(1);
  } finally {
    // Close database connection
    await database.disconnect();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(colorize('\n\n❌ Rollback interrupted. System may be in inconsistent state.', 'red'));
  console.log(colorize('Please run the rollback again or perform manual cleanup.', 'yellow'));
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error(colorize('❌ Unhandled error:', 'red'), error);
  process.exit(1);
});