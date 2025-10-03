import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  listArticles,
  searchArticles,
  readArticle,
  createArticle,
  updateArticle,
  deleteArticle
} from '../services/articles';

const AUTH_TOKEN = process.env.AUTH_TOKEN;

// MCP Server for stdio transport (used by MCP clients)
export function createMCPServer() {
  const server = new Server(
    {
      name: 'article-manager',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'listArticles',
          description: 'List all articles with metadata (title, filename, creation date)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'searchArticles',
          description: 'Search articles by title (partial match)',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to match against article titles',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'readArticle',
          description: 'Read a single article by filename',
          inputSchema: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Filename of the article (e.g., my-article.md)',
              },
            },
            required: ['filename'],
          },
        },
        {
          name: 'createArticle',
          description: 'Create a new article with title and content',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Title of the article',
              },
              content: {
                type: 'string',
                description: 'Markdown content of the article',
              },
            },
            required: ['title', 'content'],
          },
        },
        {
          name: 'updateArticle',
          description: 'Update an existing article',
          inputSchema: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Filename of the article to update',
              },
              title: {
                type: 'string',
                description: 'New title of the article',
              },
              content: {
                type: 'string',
                description: 'New markdown content of the article',
              },
            },
            required: ['filename', 'title', 'content'],
          },
        },
        {
          name: 'deleteArticle',
          description: 'Delete an article by filename',
          inputSchema: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Filename of the article to delete',
              },
            },
            required: ['filename'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      switch (request.params.name) {
        case 'listArticles': {
          const articles = await listArticles();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(articles, null, 2),
              },
            ],
          };
        }

        case 'searchArticles': {
          const { query } = request.params.arguments as { query: string };
          const results = await searchArticles(query);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'readArticle': {
          const { filename } = request.params.arguments as { filename: string };
          const article = await readArticle(filename);
          if (!article) {
            throw new Error(`Article ${filename} not found`);
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(article, null, 2),
              },
            ],
          };
        }

        case 'createArticle': {
          const { title, content } = request.params.arguments as {
            title: string;
            content: string;
          };
          const article = await createArticle(title, content);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(article, null, 2),
              },
            ],
          };
        }

        case 'updateArticle': {
          const { filename, title, content } = request.params.arguments as {
            filename: string;
            title: string;
            content: string;
          };
          const article = await updateArticle(filename, title, content);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(article, null, 2),
              },
            ],
          };
        }

        case 'deleteArticle': {
          const { filename } = request.params.arguments as { filename: string };
          await deleteArticle(filename);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, filename }, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// HTTP endpoint handler for MCP protocol
export async function handleMCPRequest(request: Request): Promise<Response> {
  // Check authentication
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader.replace('Bearer ', '') !== AUTH_TOKEN) {
    console.log('MCP auth failed');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body: any;
  try {
    body = await request.json();
    console.log('MCP request received:', body);
    
    // Handle initialize request
    if (body.method === 'initialize') {
      console.log('Handling method: initialize');
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'mcp-markdown-manager',
            version: '1.0.0'
          }
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle list_tools request
    if (body.method === 'tools/list') {
      console.log('Handling method: tools/list');
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          tools: [
            {
              name: 'listArticles',
              description: 'List all articles with metadata (title, filename, creation date)',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
            {
              name: 'searchArticles',
              description: 'Search articles by title (partial match)',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search query to match against article titles',
                  },
                },
                required: ['query'],
              },
            },
            {
              name: 'readArticle',
              description: 'Read a single article by filename',
              inputSchema: {
                type: 'object',
                properties: {
                  filename: {
                    type: 'string',
                    description: 'Filename of the article (e.g., my-article.md)',
                  },
                },
                required: ['filename'],
              },
            },
            {
              name: 'createArticle',
              description: 'Create a new article with title and content',
              inputSchema: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Title of the article',
                  },
                  content: {
                    type: 'string',
                    description: 'Markdown content of the article',
                  },
                },
                required: ['title', 'content'],
              },
            },
            {
              name: 'updateArticle',
              description: 'Update an existing article',
              inputSchema: {
                type: 'object',
                properties: {
                  filename: {
                    type: 'string',
                    description: 'Filename of the article to update',
                  },
                  title: {
                    type: 'string',
                    description: 'New title of the article',
                  },
                  content: {
                    type: 'string',
                    description: 'New markdown content of the article',
                  },
                },
                required: ['filename', 'title', 'content'],
              },
            },
            {
              name: 'deleteArticle',
              description: 'Delete an article by filename',
              inputSchema: {
                type: 'object',
                properties: {
                  filename: {
                    type: 'string',
                    description: 'Filename of the article to delete',
                  },
                },
                required: ['filename'],
              },
            },
          ],
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Handle call_tool request
    if (body.method === 'tools/call') {
      console.log('Handling method: tools/call');
      const { name, arguments: args } = body.params;
      
      let result;
      switch (name) {
        case 'listArticles':
          result = await listArticles();
          break;
        case 'searchArticles':
          result = await searchArticles(args.query);
          break;
        case 'readArticle':
          result = await readArticle(args.filename);
          if (!result) throw new Error(`Article ${args.filename} not found`);
          break;
        case 'createArticle':
          result = await createArticle(args.title, args.content);
          break;
        case 'updateArticle':
          result = await updateArticle(args.filename, args.title, args.content);
          break;
        case 'deleteArticle':
          await deleteArticle(args.filename);
          result = { success: true, filename: args.filename };
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.log('MCP error:', error);
    const id = body?.id;
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : 'Internal server error',
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}