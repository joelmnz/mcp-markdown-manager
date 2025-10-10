import { requireAuth } from '../middleware/auth';
import {
  listArticles,
  searchArticles,
  readArticle,
  createArticle,
  updateArticle,
  deleteArticle
} from '../services/articles';
import { semanticSearch } from '../services/vectorIndex';

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
  
  // All other API endpoints require authentication
  const authError = requireAuth(request);
  if (authError) return authError;
  
  try {
    // GET /api/search - Semantic search
    if (path === '/api/search' && request.method === 'GET') {
      if (!SEMANTIC_SEARCH_ENABLED) {
        return new Response(JSON.stringify({ error: 'Semantic search is not enabled' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const query = url.searchParams.get('query');
      const k = parseInt(url.searchParams.get('k') || '5', 10);
      
      if (!query) {
        return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const results = await semanticSearch(query, k);
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' }
      });
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
    
    // GET /api/articles/:filename - Read single article
    if (path.startsWith('/api/articles/') && request.method === 'GET') {
      const filename = path.replace('/api/articles/', '');
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
      const { title, content } = body;
      
      if (!title || !content) {
        return new Response(JSON.stringify({ error: 'Title and content are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const article = await createArticle(title, content);
      return new Response(JSON.stringify(article), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // PUT /api/articles/:filename - Update article
    if (path.startsWith('/api/articles/') && request.method === 'PUT') {
      const filename = path.replace('/api/articles/', '');
      const body = await request.json();
      const { title, content } = body;
      
      if (!title || !content) {
        return new Response(JSON.stringify({ error: 'Title and content are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const article = await updateArticle(filename, title, content);
      return new Response(JSON.stringify(article), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // DELETE /api/articles/:filename - Delete article
    if (path.startsWith('/api/articles/') && request.method === 'DELETE') {
      const filename = path.replace('/api/articles/', '');
      await deleteArticle(filename);
      
      return new Response(JSON.stringify({ success: true }), {
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
