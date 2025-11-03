import { requireAuth } from '../middleware/auth';
import {
  listArticles,
  searchArticles,
  readArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  isArticlePublic,
  setArticlePublic,
  getArticleBySlug,
  listArticleVersions,
  getArticleVersion,
  restoreArticleVersion,
  deleteArticleVersions
} from '../services/articles';
import { semanticSearch, hybridSearch, getDetailedIndexStats, rebuildIndex, indexUnindexedArticles } from '../services/vectorIndex';

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';

export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Health check endpoint (no auth required)
  if (path === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Public article endpoint (no auth required)
  if (path.startsWith('/api/public-articles/') && request.method === 'GET') {
    try {
      const slug = path.replace('/api/public-articles/', '');
      const article = await getArticleBySlug(slug);
      
      if (!article) {
        return new Response(JSON.stringify({ error: 'Article not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Public article error:', error);
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // All other API endpoints require authentication
  const authError = requireAuth(request);
  if (authError) return authError;
  
  try {
    // GET /api/search - Semantic or Hybrid search
    if (path === '/api/search' && request.method === 'GET') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({ error: 'Semantic search is not enabled' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const query = url.searchParams.get('query');
      const k = parseInt(url.searchParams.get('k') || '5', 10);
      const mode = url.searchParams.get('mode') || 'hybrid'; // 'semantic' or 'hybrid'
      
      if (!query) {
        return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const results = mode === 'semantic' 
        ? await semanticSearch(query, k)
        : await hybridSearch(query, k);
      
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/rag/status - Get RAG index status
    if (path === '/api/rag/status' && request.method === 'GET') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({ 
          enabled: false,
          message: 'Semantic search is not enabled'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const stats = await getDetailedIndexStats();
      return new Response(JSON.stringify({
        enabled: true,
        ...stats
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // POST /api/rag/reindex - Rebuild entire index
    if (path === '/api/rag/reindex' && request.method === 'POST') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({ error: 'Semantic search is not enabled' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      try {
        await rebuildIndex();
        const stats = await getDetailedIndexStats();
        return new Response(JSON.stringify({
          success: true,
          message: 'Index rebuilt successfully',
          ...stats
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to rebuild index'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // POST /api/rag/index-unindexed - Index only unindexed articles
    if (path === '/api/rag/index-unindexed' && request.method === 'POST') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({ error: 'Semantic search is not enabled' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      try {
        const result = await indexUnindexedArticles();
        const stats = await getDetailedIndexStats();
        return new Response(JSON.stringify({
          success: true,
          indexed: result.indexed,
          failed: result.failed,
          ...stats
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to index articles'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/articles - List all articles
    if (path === '/api/articles' && request.method === 'GET') {
      const query = url.searchParams.get('q');
      
      if (query) {
        // Search articles
        const results = await searchArticles(query);
        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // List all articles
        const articles = await listArticles();
        return new Response(JSON.stringify(articles), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/articles/:filename - Read single article or list versions
    if (path.startsWith('/api/articles/') && request.method === 'GET') {
      const fullPath = path.replace('/api/articles/', '');
      
      // Check if this is a versions endpoint using regex to avoid path parsing vulnerabilities
      // Matches: <filename>/versions or <filename>/versions/<versionId>
      const versionMatch = fullPath.match(/^(.+?)\/versions(?:\/([^\/]+))?$/);
      
      if (versionMatch) {
        const filename = versionMatch[1];
        const versionId = versionMatch[2];
        
        if (!versionId) {
          // List all versions
          const versions = await listArticleVersions(filename);
          return new Response(JSON.stringify(versions), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          // Get specific version
          const version = await getArticleVersion(filename, versionId);
          
          if (!version) {
            return new Response(JSON.stringify({ error: 'Version not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          return new Response(JSON.stringify(version), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Regular article read
      const filename = fullPath;
      const article = await readArticle(filename);
      
      if (!article) {
        return new Response(JSON.stringify({ error: 'Article not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // POST /api/articles - Create new article
    if (path === '/api/articles' && request.method === 'POST') {
      const body = await request.json();
      const { title, content, message } = body;
      
      if (!title || !content) {
        return new Response(JSON.stringify({ error: 'Title and content are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const article = await createArticle(title, content, message);
      return new Response(JSON.stringify(article), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // PUT /api/articles/:filename - Update article
    if (path.startsWith('/api/articles/') && request.method === 'PUT') {
      const filename = path.replace('/api/articles/', '');
      
      // Check if this is a version restore endpoint using regex to avoid path parsing vulnerabilities
      // Matches: <filename>/versions/<versionId>/restore
      const restoreMatch = filename.match(/^(.+?)\/versions\/([^\/]+)\/restore$/);
      
      if (restoreMatch) {
        const articleFilename = restoreMatch[1];
        const versionId = restoreMatch[2];
        
        const body = await request.json();
        const { message } = body;
        
        const article = await restoreArticleVersion(articleFilename, versionId, message);
        return new Response(JSON.stringify(article), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Regular article update
      const body = await request.json();
      const { title, content, message } = body;
      
      if (!title || !content) {
        return new Response(JSON.stringify({ error: 'Title and content are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const article = await updateArticle(filename, title, content, message);
      return new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // DELETE /api/articles/:filename - Delete article or versions
    if (path.startsWith('/api/articles/') && request.method === 'DELETE') {
      const fullPath = path.replace('/api/articles/', '');
      
      // Check if this is a versions delete endpoint using regex to avoid path parsing vulnerabilities
      // Matches: <filename>/versions or <filename>/versions/<versionId>
      const versionMatch = fullPath.match(/^(.+?)\/versions(?:\/([^\/]+))?$/);
      
      if (versionMatch) {
        const filename = versionMatch[1];
        const versionId = versionMatch[2];
        
        if (!versionId) {
          // Delete all versions
          await deleteArticleVersions(filename);
        } else {
          // Delete specific version
          await deleteArticleVersions(filename, [versionId]);
        }
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Regular article deletion
      const filename = fullPath;
      await deleteArticle(filename);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/articles/:filename/public-status - Get public status
    if (path.match(/^\/api\/articles\/[^\/]+\/public-status$/) && request.method === 'GET') {
      const filename = path.replace('/api/articles/', '').replace('/public-status', '');
      const isPublic = await isArticlePublic(filename);
      
      return new Response(JSON.stringify({ isPublic }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // POST /api/articles/:filename/public - Set public status
    if (path.match(/^\/api\/articles\/[^\/]+\/public$/) && request.method === 'POST') {
      const filename = path.replace('/api/articles/', '').replace('/public', '');
      const body = await request.json();
      const { isPublic } = body;
      
      if (typeof isPublic !== 'boolean') {
        return new Response(JSON.stringify({ error: 'isPublic must be a boolean' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      await setArticlePublic(filename, isPublic);
      
      return new Response(JSON.stringify({ success: true, isPublic }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Route not found
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
