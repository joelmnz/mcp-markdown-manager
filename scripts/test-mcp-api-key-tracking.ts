#!/usr/bin/env bun
/**
 * Test script to verify that MCP operations properly track API key names
 * in the modifiedBy field when creating/updating articles.
 */

import { database } from '../src/backend/services/database';
import { databaseInit } from '../src/backend/services/databaseInit';
import { createAccessToken, deleteAccessTokenById } from '../src/backend/services/accessTokens';
import { databaseArticleService } from '../src/backend/services/databaseArticles';

const TEST_API_KEY_NAME = 'test-mcp-key';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TIMESTAMP = Date.now();

interface McpRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: any;
}

interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: any;
}

async function makeInitializeRequest(token: string): Promise<string> {
  const initRequest: McpRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    },
  };

  const response = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(initRequest),
  });

  if (!response.ok) {
    throw new Error(`Initialize failed: ${response.status} ${response.statusText}`);
  }

  // Extract session ID from the response header
  const sessionId = response.headers.get('mcp-session-id');
  if (!sessionId) {
    throw new Error('No session ID returned from initialize');
  }

  return sessionId;
}

async function callMcpTool(token: string, sessionId: string, toolName: string, args: any): Promise<any> {
  const toolRequest: McpRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const response = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify(toolRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tool call failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const responseText = await response.text();
  
  // Handle empty response (e.g., 202 Accepted)
  if (!responseText || responseText.trim() === '') {
    return { content: [] };
  }

  // Check if response is SSE format
  if (responseText.startsWith('event:') || responseText.startsWith('data:')) {
    // Parse SSE format
    const lines = responseText.split('\n');
    let jsonData = '';
    
    for (const line of lines) {
      if (line.startsWith('data:')) {
        jsonData += line.substring(5).trim();
      }
    }
    
    if (jsonData) {
      const mcpResponse: McpResponse = JSON.parse(jsonData);
      if (mcpResponse.error) {
        throw new Error(`MCP tool error: ${JSON.stringify(mcpResponse.error)}`);
      }
      return mcpResponse.result;
    }
    
    return { content: [] };
  }

  // Try parsing as JSON
  const result: McpResponse = JSON.parse(responseText);
  
  if (result.error) {
    throw new Error(`MCP tool error: ${JSON.stringify(result.error)}`);
  }

  return result.result;
}

async function getArticleFromDatabase(slug: string) {
  const result = await database.query(
    'SELECT slug, title, content, created_by, updated_by FROM articles WHERE slug = $1',
    [slug]
  );
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function cleanupTestArticle(slug: string) {
  try {
    await database.query('DELETE FROM articles WHERE slug = $1', [slug]);
  } catch (error) {
    console.error('Failed to cleanup test article:', error);
  }
}

async function runTest() {
  let tokenId: number | undefined;
  let token: string | undefined;
  let testSlug: string | undefined;

  try {
    console.log('🧪 Testing MCP API Key Name Tracking\n');

    // Step 0: Initialize database
    console.log('0️⃣  Initializing database connection...');
    await databaseInit.initialize();
    console.log(`   ✅ Database connected`);

    // Step 1: Create a test API key
    console.log('\n1️⃣  Creating test API key...');
    const accessToken = await createAccessToken(TEST_API_KEY_NAME, 'write');
    tokenId = accessToken.id;
    token = accessToken.token;
    console.log(`   ✅ Created API key: ${TEST_API_KEY_NAME} (ID: ${tokenId})`);

    // Step 2: Initialize MCP session
    console.log('\n2️⃣  Initializing MCP session...');
    const sessionId = await makeInitializeRequest(token);
    console.log(`   ✅ Session initialized: ${sessionId}`);

    // Step 3: Create an article via MCP
    console.log('\n3️⃣  Creating article via MCP...');
    const createResult = await callMcpTool(token, sessionId, 'createArticle', {
      title: `Test MCP API Key Tracking ${TEST_TIMESTAMP}`,
      content: '# Test Article\n\nThis article is created via MCP to test API key name tracking.',
      folder: '',
    });
    
    console.log('   Create result:', JSON.stringify(createResult, null, 2));
    
    const createResponse = JSON.parse(createResult.content[0].text);
    testSlug = createResponse.filename.replace('.md', '');
    console.log(`   ✅ Article created: ${testSlug}`);

    // Step 4: Check created_by field
    console.log('\n4️⃣  Verifying created_by field...');
    let article = await getArticleFromDatabase(testSlug);
    
    if (!article) {
      throw new Error('Article not found in database after creation');
    }
    
    console.log(`   Database record:`);
    console.log(`   - created_by: ${article.created_by || '(null)'}`);
    console.log(`   - updated_by: ${article.updated_by || '(null)'}`);
    
    if (article.created_by === TEST_API_KEY_NAME) {
      console.log(`   ✅ created_by correctly set to "${TEST_API_KEY_NAME}"`);
    } else {
      console.log(`   ❌ FAIL: created_by is "${article.created_by}", expected "${TEST_API_KEY_NAME}"`);
      throw new Error('created_by field not set correctly');
    }

    // Step 5: Update the article via MCP
    console.log('\n5️⃣  Updating article via MCP...');
    const updateResult = await callMcpTool(token, sessionId, 'updateArticle', {
      filename: `${testSlug}.md`,
      title: `Test MCP API Key Tracking ${TEST_TIMESTAMP} (Updated)`,
      content: '# Test Article (Updated)\n\nThis article has been updated via MCP to test API key name tracking.',
      folder: '',
    });
    console.log('   Update result:', JSON.stringify(updateResult, null, 2));
    
    const updateResponse = JSON.parse(updateResult.content[0].text);
    testSlug = updateResponse.filename.replace('.md', ''); // Update slug in case it changed
    console.log(`   ✅ Article updated (new slug: ${testSlug})`);

    // Step 6: Check updated_by field
    console.log('\n6️⃣  Verifying updated_by field...');
    article = await getArticleFromDatabase(testSlug);
    
    if (!article) {
      throw new Error('Article not found in database after update');
    }
    
    console.log(`   Database record:`);
    console.log(`   - created_by: ${article.created_by || '(null)'}`);
    console.log(`   - updated_by: ${article.updated_by || '(null)'}`);
    
    if (article.updated_by === TEST_API_KEY_NAME) {
      console.log(`   ✅ updated_by correctly set to "${TEST_API_KEY_NAME}"`);
    } else {
      console.log(`   ❌ FAIL: updated_by is "${article.updated_by}", expected "${TEST_API_KEY_NAME}"`);
      throw new Error('updated_by field not set correctly');
    }

    // Success!
    console.log('\n✅ All tests passed!');
    console.log('\nThe MCP operations now correctly track API key names in modifiedBy fields.');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    
    if (testSlug) {
      await cleanupTestArticle(testSlug);
      console.log('   ✅ Test article deleted');
    }
    
    if (tokenId) {
      await deleteAccessTokenById(tokenId);
      console.log('   ✅ Test API key deleted');
    }
    
    console.log('   ✅ Cleanup complete');
  }
}

// Run the test
runTest().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
