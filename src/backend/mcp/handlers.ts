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
import {
  validateFilename,
  validateTitle,
  validateContent,
  validateFolder,
  validateQuery,
  validateArray,
  validateNumber,
} from './validation';

const SEMANTIC_SEARCH_ENABLED = process.env.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true';
const MCP_MULTI_SEARCH_LIMIT = Number.parseInt(process.env.MCP_MULTI_SEARCH_LIMIT ?? '10', 10);

export const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  listArticles: async (args) => {
    const { folder, maxArticles } = args as { folder?: string; maxArticles?: number };
    
    // Validate folder if provided
    let sanitizedFolder = folder;
    if (folder !== undefined && folder !== null) {
      const folderValidation = validateFolder(folder);
      if (!folderValidation.valid) {
        throw new Error(folderValidation.error);
      }
      sanitizedFolder = folderValidation.sanitized;
    }
    
    // Validate maxArticles if provided
    let limit = 100;
    if (maxArticles !== undefined) {
      const limitValidation = validateNumber(maxArticles, 'maxArticles', {
        required: false,
        min: 1,
        max: 1000,
        integer: true,
      });
      if (!limitValidation.valid) {
        throw new Error(limitValidation.error);
      }
      limit = limitValidation.sanitized || 100;
    }
    
    const articles = await listArticles(sanitizedFolder, limit);
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
    
    // Validate query
    const queryValidation = validateQuery(query);
    if (!queryValidation.valid) {
      throw new Error(queryValidation.error);
    }
    
    // Validate folder if provided
    let sanitizedFolder = folder;
    if (folder !== undefined && folder !== null) {
      const folderValidation = validateFolder(folder);
      if (!folderValidation.valid) {
        throw new Error(folderValidation.error);
      }
      sanitizedFolder = folderValidation.sanitized;
    }
    
    const results = await searchArticles(queryValidation.sanitized!, sanitizedFolder);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  },

  multiSearchArticles: async (args) => {
    const { titles, folder } = args as { titles: string[]; folder?: string };
    
    // Validate titles array
    const titlesValidation = validateArray(titles, 'titles', {
      required: true,
      maxLength: MCP_MULTI_SEARCH_LIMIT,
      minLength: 1,
      itemValidator: (item, index) => validateQuery(item),
    });
    
    if (!titlesValidation.valid) {
      throw new Error(titlesValidation.error);
    }
    
    // Validate folder if provided
    let sanitizedFolder = folder;
    if (folder !== undefined && folder !== null) {
      const folderValidation = validateFolder(folder);
      if (!folderValidation.valid) {
        throw new Error(folderValidation.error);
      }
      sanitizedFolder = folderValidation.sanitized;
    }

    const allResults = await Promise.all(
      titlesValidation.sanitized!.map((title: string) => searchArticles(title, sanitizedFolder))
    );
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
    
    // Validate query
    const queryValidation = validateQuery(query);
    if (!queryValidation.valid) {
      throw new Error(queryValidation.error);
    }
    
    // Validate k if provided
    let resultCount = 5;
    if (k !== undefined) {
      const kValidation = validateNumber(k, 'k', {
        required: false,
        min: 1,
        max: 100,
        integer: true,
      });
      if (!kValidation.valid) {
        throw new Error(kValidation.error);
      }
      resultCount = kValidation.sanitized || 5;
    }
    
    // Validate folder if provided
    let sanitizedFolder = folder;
    if (folder !== undefined && folder !== null) {
      const folderValidation = validateFolder(folder);
      if (!folderValidation.valid) {
        throw new Error(folderValidation.error);
      }
      sanitizedFolder = folderValidation.sanitized;
    }
    
    const results = await semanticSearch(queryValidation.sanitized!, resultCount, sanitizedFolder);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  },

  multiSemanticSearch: async (args) => {
    if (!SEMANTIC_SEARCH_ENABLED) throw new Error('Semantic search is not enabled');
    const { queries, k, folder } = args as { queries: string[]; k?: number; folder?: string };
    
    // Validate queries array
    const queriesValidation = validateArray(queries, 'queries', {
      required: true,
      maxLength: MCP_MULTI_SEARCH_LIMIT,
      minLength: 1,
      itemValidator: (item, index) => validateQuery(item),
    });
    
    if (!queriesValidation.valid) {
      throw new Error(queriesValidation.error);
    }
    
    // Validate k if provided
    let resultsPerQuery = 5;
    if (k !== undefined) {
      const kValidation = validateNumber(k, 'k', {
        required: false,
        min: 1,
        max: 100,
        integer: true,
      });
      if (!kValidation.valid) {
        throw new Error(kValidation.error);
      }
      resultsPerQuery = kValidation.sanitized || 5;
    }
    
    // Validate folder if provided
    let sanitizedFolder = folder;
    if (folder !== undefined && folder !== null) {
      const folderValidation = validateFolder(folder);
      if (!folderValidation.valid) {
        throw new Error(folderValidation.error);
      }
      sanitizedFolder = folderValidation.sanitized;
    }

    const allResults = await Promise.all(
      queriesValidation.sanitized!.map((query: string) => semanticSearch(query, resultsPerQuery, sanitizedFolder))
    );

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
    
    // Validate filename
    const filenameValidation = validateFilename(filename);
    if (!filenameValidation.valid) {
      throw new Error(filenameValidation.error);
    }
    
    const article = await readArticle(filenameValidation.sanitized!);
    if (!article) throw new Error(`Article ${filenameValidation.sanitized} not found`);
    return {
      content: [{ type: 'text', text: JSON.stringify(article, null, 2) }],
    };
  },

  createArticle: async (args) => {
    const { title, content, folder } = args as { title: string; content: string; folder?: string };
    
    // Validate title
    const titleValidation = validateTitle(title);
    if (!titleValidation.valid) {
      throw new Error(titleValidation.error);
    }
    
    // Validate content
    const contentValidation = validateContent(content);
    if (!contentValidation.valid) {
      throw new Error(contentValidation.error);
    }
    
    // Validate folder if provided
    let sanitizedFolder = undefined;
    if (folder !== undefined && folder !== null) {
      const folderValidation = validateFolder(folder);
      if (!folderValidation.valid) {
        throw new Error(folderValidation.error);
      }
      sanitizedFolder = folderValidation.sanitized;
    }
    
    const article = await createArticle(
      titleValidation.sanitized!,
      contentValidation.sanitized!,
      sanitizedFolder,
      undefined,
      { embeddingPriority: 'normal' }
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(article, null, 2) }],
    };
  },

  updateArticle: async (args) => {
    const { filename, title, content, folder } = args as { filename: string; title: string; content: string; folder?: string };
    
    // Validate filename
    const filenameValidation = validateFilename(filename);
    if (!filenameValidation.valid) {
      throw new Error(filenameValidation.error);
    }
    
    // Validate title
    const titleValidation = validateTitle(title);
    if (!titleValidation.valid) {
      throw new Error(titleValidation.error);
    }
    
    // Validate content
    const contentValidation = validateContent(content);
    if (!contentValidation.valid) {
      throw new Error(contentValidation.error);
    }
    
    // Validate folder if provided
    let sanitizedFolder = undefined;
    if (folder !== undefined && folder !== null) {
      const folderValidation = validateFolder(folder);
      if (!folderValidation.valid) {
        throw new Error(folderValidation.error);
      }
      sanitizedFolder = folderValidation.sanitized;
    }
    
    const article = await updateArticle(
      filenameValidation.sanitized!,
      titleValidation.sanitized!,
      contentValidation.sanitized!,
      sanitizedFolder,
      undefined,
      { embeddingPriority: 'normal' }
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(article, null, 2) }],
    };
  },

  deleteArticle: async (args) => {
    const { filename } = args as { filename: string };
    
    // Validate filename
    const filenameValidation = validateFilename(filename);
    if (!filenameValidation.valid) {
      throw new Error(filenameValidation.error);
    }
    
    await deleteArticle(filenameValidation.sanitized!);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, filename: filenameValidation.sanitized }, null, 2) }],
    };
  },
};
