#!/usr/bin/env bun

/**
 * Fix vector dimensions from 512 to 768
 * This script updates the embeddings table to use 768-dimensional vectors
 */

import { database } from '../src/backend/services/database.js';

async function fixVectorDimensions() {
  try {
    console.log('🔧 Fixing vector dimensions from 512 to 768...');
    
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
    
    // Check if embeddings table exists and has vector column
    const tableCheck = await database.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'embeddings' AND column_name = 'vector'
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('ℹ️  No vector column found in embeddings table');
      return;
    }
    
    console.log('📊 Current vector column info:', tableCheck.rows[0]);
    
    // Check if we have any embeddings data
    const dataCheck = await database.query('SELECT COUNT(*) as count FROM embeddings');
    const embeddingCount = parseInt(dataCheck.rows[0].count);
    
    console.log(`📈 Found ${embeddingCount} existing embeddings`);
    
    if (embeddingCount > 0) {
      console.log('⚠️  Backing up existing embeddings...');
      // Clear existing embeddings since they have wrong dimensions
      await database.query('DELETE FROM embeddings');
      console.log('🗑️  Cleared existing embeddings (they will be regenerated)');
    }
    
    // Drop and recreate the vector column with correct dimensions
    console.log('🔄 Updating vector column to 768 dimensions...');
    
    await database.query('ALTER TABLE embeddings DROP COLUMN IF EXISTS vector');
    await database.query('ALTER TABLE embeddings ADD COLUMN vector VECTOR(768)');
    
    // Recreate the vector index
    console.log('📇 Recreating vector index...');
    await database.query('DROP INDEX IF EXISTS idx_embeddings_vector');
    await database.query('CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (vector vector_cosine_ops)');
    
    console.log('✅ Vector dimensions updated successfully!');
    console.log('ℹ️  Existing articles will need to have their embeddings regenerated');
    
  } catch (error) {
    console.error('❌ Error fixing vector dimensions:', error);
    throw error;
  } finally {
    await database.disconnect();
    console.log('📡 Database disconnected');
  }
}

// Run the fix
fixVectorDimensions().catch(console.error);