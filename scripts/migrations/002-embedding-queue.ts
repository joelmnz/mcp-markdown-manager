/**
 * Migration 002: Add background embedding queue tables
 * 
 * This migration adds the necessary database tables and indexes for the
 * background embedding queue system that processes article embeddings
 * asynchronously to prevent UI blocking.
 */

import { database } from '../../src/backend/services/database.js';

export const embeddingQueueMigration = {
  version: 2,
  description: 'Add background embedding queue tables',
  
  async apply() {
    console.log('  Creating embedding_tasks table...');
    
    // Create the main embedding tasks queue table
    await database.query(`
      CREATE TABLE IF NOT EXISTS embedding_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        slug VARCHAR(255) NOT NULL,
        operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
        priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        metadata JSONB
      )
    `);

    console.log('  Creating embedding_worker_status table...');
    
    // Create the worker status tracking table
    await database.query(`
      CREATE TABLE IF NOT EXISTS embedding_worker_status (
        id INTEGER PRIMARY KEY DEFAULT 1,
        is_running BOOLEAN NOT NULL DEFAULT FALSE,
        last_heartbeat TIMESTAMP WITH TIME ZONE,
        tasks_processed INTEGER NOT NULL DEFAULT 0,
        tasks_succeeded INTEGER NOT NULL DEFAULT 0,
        tasks_failed INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE,
        
        CONSTRAINT single_worker CHECK (id = 1)
      )
    `);

    console.log('  Creating indexes for embedding queue tables...');
    
    // Create performance indexes for the embedding tasks table
    await database.query('CREATE INDEX IF NOT EXISTS idx_embedding_tasks_status_priority ON embedding_tasks(status, priority, scheduled_at)');
    await database.query('CREATE INDEX IF NOT EXISTS idx_embedding_tasks_article_id ON embedding_tasks(article_id)');
    await database.query('CREATE INDEX IF NOT EXISTS idx_embedding_tasks_created_at ON embedding_tasks(created_at)');
    await database.query('CREATE INDEX IF NOT EXISTS idx_embedding_tasks_status ON embedding_tasks(status)');

    console.log('  Inserting initial worker status record...');
    
    // Insert the initial worker status record (enforced as single row by constraint)
    await database.query(`
      INSERT INTO embedding_worker_status (id, is_running) 
      VALUES (1, FALSE) 
      ON CONFLICT (id) DO NOTHING
    `);

    console.log('  Background embedding queue migration completed successfully');
  },

  async rollback() {
    console.log('  Rolling back embedding queue tables...');
    
    // Drop tables in reverse dependency order
    await database.query('DROP TABLE IF EXISTS embedding_tasks CASCADE');
    await database.query('DROP TABLE IF EXISTS embedding_worker_status CASCADE');
    
    console.log('  Embedding queue rollback completed');
  }
};