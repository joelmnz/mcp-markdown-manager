#!/usr/bin/env bun
import { rebuildIndex, getIndexStats } from '../src/backend/services/vectorIndex';

console.log('Starting vector index rebuild...\n');

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

if (!SEMANTIC_SEARCH_ENABLED) {
  console.error('Error: SEMANTIC_SEARCH_ENABLED is not set to true');
  console.error('Please set SEMANTIC_SEARCH_ENABLED=true in your environment or .env file');
  process.exit(1);
}

try {
  await rebuildIndex();
  
  const stats = await getIndexStats();
  console.log('\nIndex rebuild complete!');
  console.log(`Total chunks: ${stats.totalChunks}`);
  console.log(`Total articles: ${stats.totalArticles}`);
} catch (error) {
  console.error('Error rebuilding index:', error);
  process.exit(1);
}
