#!/usr/bin/env bun

/**
 * Manually run migration 002 to ensure all tables are created
 */

import { database } from '../src/backend/services/database.js';
import { embeddingQueueMigration } from './migrations/002-embedding-queue.js';

async function runMigration() {
  try {
    console.log('🔄 Running embedding queue migration...');
    
    // Connect to database
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'article_manager_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };
    
    await database.connect(config);
    console.log('✅ Connected to database');
    
    // Run the migration
    await embeddingQueueMigration.apply();
    
    // Verify tables were created
    const tableCheck = await database.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('embedding_tasks', 'embedding_worker_status', 'embedding_audit_logs', 'performance_metrics')
      ORDER BY table_name
    `);
    
    console.log('📊 Created tables:', tableCheck.rows.map(r => r.table_name));
    
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await database.disconnect();
    console.log('📡 Database disconnected');
  }
}

// Run the migration
runMigration().catch(console.error);