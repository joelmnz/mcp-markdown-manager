import {
  listArticles,
  searchArticles,
  readArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  getFolders
} from '../services/articles';
import { semanticSearch, SearchResult } from '../services/vectorIndex';

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';
const MCP_MULTI_SEARCH_LIMIT = Number.parseInt(process.env.MCP_MULTI_SEARCH_LIMIT ?? '10', 10);

export const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  listArticles: async (args) => {
    const { folder, maxArticles } = args as { folder: string; maxArticles?: number };
    if (folder === undefined || folder === null || typeof folder !== 'string') {
      throw new Error('folder parameter is required and must be a string (use "" for all folders)');
    }
    const folderParam = folder === '' ? undefined : folder;
    const limit = maxArticles || 100;
    const articles = await listArticles(folderParam, limit);
    return {
      content: [{ type: 'text', text: JSON.stringify(articles, null, 2) }],
    };
  },

  listFolders: async () => {
    const folders = await getFolders();
    return {
      content: [{ type: 'text', text: JSON.stringify(folders, null, 2) }],
    };
  },

  searchArticles: async (args) => {
    const { query, folder } = args as { query: string; folder?: string };
    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new Error('query parameter is required and must be a non-empty string');
    }
    const folderParam = folder === '' ? undefined : folder;
    const results = await searchArticles(query, folderParam);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  },

  multiSearchArticles: async (args) => {
    const { titles, folder } = args as { titles: string[]; folder?: string };
    if (!Array.isArray(titles)) throw new Error('titles must be an array');
    if (titles.length === 0) throw new Error('titles array cannot be empty');
    if (titles.some(t => typeof t !== 'string' || t.trim() === '')) {
      throw new Error('all titles must be non-empty strings');
    }
    if (titles.length > MCP_MULTI_SEARCH_LIMIT) throw new Error(`titles array cannot exceed ${MCP_MULTI_SEARCH_LIMIT} items`);

    const allResults = await Promise.all(titles.map(title => searchArticles(title, folder)));
    const uniqueResults = Array.from(
      new Map(allResults.flat().map(article => [article.filename, article])).values()
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(uniqueResults, null, 2) }],
    };
  },

  semanticSearch: async (args) => {
    if (!SEMANTIC_SEARCH_ENABLED) throw new Error('Semantic search is not enabled');
    const { query, k, folder } = args as { query: string; k?: number; folder?: string };
    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new Error('query parameter is required and must be a non-empty string');
    }
    const folderParam = folder === '' ? undefined : folder;
    const results = await semanticSearch(query, k || 5, folderParam);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  },

  multiSemanticSearch: async (args) => {
    if (!SEMANTIC_SEARCH_ENABLED) throw new Error('Semantic search is not enabled');
    const { queries, k, folder } = args as { queries: string[]; k?: number; folder?: string };
    if (!Array.isArray(queries)) throw new Error('queries must be an array');
    if (queries.length === 0) throw new Error('queries array cannot be empty');
    if (queries.some(q => typeof q !== 'string' || q.trim() === '')) {
      throw new Error('all queries must be non-empty strings');
    }
    if (queries.length > MCP_MULTI_SEARCH_LIMIT) throw new Error(`queries array cannot exceed ${MCP_MULTI_SEARCH_LIMIT} items`);

    const resultsPerQuery = k || 5;
    const allResults = await Promise.all(queries.map(query => semanticSearch(query, resultsPerQuery, folder)));
    
    const seenChunks = new Map<string, SearchResult>();
    const uniqueResults: SearchResult[] = [];

    for (const results of allResults) {
      for (const result of results) {
        const key = `${result.chunk.filename}:${result.chunk.chunkIndex}`;
        if (!seenChunks.has(key)) {
          seenChunks.set(key, result);
          uniqueResults.push(result);
        }
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(uniqueResults, null, 2) }],
    };
  },

  readArticle: async (args) => {
    const { filename } = args as { filename: string };
    if (!filename || typeof filename !== 'string' || filename.trim() === '') {
      throw new Error('filename parameter is required and must be a non-empty string');
    }
    const article = await readArticle(filename);
    if (!article) throw new Error(`Article ${filename} not found`);
    return {
      content: [{ type: 'text', text: JSON.stringify(article, null, 2) }],
    };
  },

  createArticle: async (args) => {
    const { title, content, folder } = args as { title: string; content: string; folder?: string };
    if (!title || typeof title !== 'string' || title.trim() === '') {
      throw new Error('title parameter is required and must be a non-empty string');
    }
    if (!content || typeof content !== 'string' || content.trim() === '') {
      throw new Error('content parameter is required and must be a non-empty string');
    }
    const article = await createArticle(title, content, folder, undefined, { embeddingPriority: 'normal' });
    return {
      content: [{ type: 'text', text: JSON.stringify(article, null, 2) }],
    };
  },

  updateArticle: async (args) => {
    const { filename, title, content, folder } = args as { filename: string; title: string; content: string; folder?: string };
    if (!filename || typeof filename !== 'string' || filename.trim() === '') {
      throw new Error('filename parameter is required and must be a non-empty string');
    }
    if (!title || typeof title !== 'string' || title.trim() === '') {
      throw new Error('title parameter is required and must be a non-empty string');
    }
    if (!content || typeof content !== 'string' || content.trim() === '') {
      throw new Error('content parameter is required and must be a non-empty string');
    }
    const article = await updateArticle(filename, title, content, folder, undefined, { embeddingPriority: 'normal' });
    return {
      content: [{ type: 'text', text: JSON.stringify(article, null, 2) }],
    };
  },

  deleteArticle: async (args) => {
    const { filename } = args as { filename: string };
    if (!filename || typeof filename !== 'string' || filename.trim() === '') {
      throw new Error('filename parameter is required and must be a non-empty string');
    }
    await deleteArticle(filename);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, filename }, null, 2) }],
    };
  },
};
