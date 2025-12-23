/**
 * Migration 004: Add soft delete support
 * 
 * This migration adds soft delete functionality to the articles table:
 * - is_deleted: Boolean flag to mark articles as deleted
 * - deleted_at: Timestamp when the article was soft deleted
 * 
 * Deleted articles retain their slug to prevent name conflicts until permanently deleted.
 */

import { database } from '../../src/backend/services/database.js';

export const softDeleteMigration = {
  version: 4,
  description: 'Add soft delete support to articles table',
  
  async apply() {
    console.log('  Adding soft delete columns to articles table...');
    
    // Add is_deleted column (default FALSE)
    await database.query(`
      ALTER TABLE articles 
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE NOT NULL
    `);
    
    // Add deleted_at column
    await database.query(`
      ALTER TABLE articles 
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE
    `);
    
    console.log('  Creating indexes for soft delete columns...');
    
    // Create index for efficient querying of non-deleted articles
    await database.query(`
      CREATE INDEX IF NOT EXISTS idx_articles_is_deleted 
      ON articles(is_deleted)
    `);
    
    // Create index for trash listing (deleted articles ordered by deletion date)
    await database.query(`
      CREATE INDEX IF NOT EXISTS idx_articles_deleted_at 
      ON articles(deleted_at DESC) WHERE is_deleted = true
    `);
    
    console.log('  Soft delete migration completed successfully');
  }
};
