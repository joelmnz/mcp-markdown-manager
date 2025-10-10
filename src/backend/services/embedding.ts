import { Ollama } from 'ollama';
import OpenAI from 'openai';

const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'ollama';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

let ollamaClient: Ollama | null = null;
let openaiClient: OpenAI | null = null;

// Initialize embedding client based on provider
function getEmbeddingClient() {
  if (EMBEDDING_PROVIDER === 'openai') {
    if (!openaiClient) {
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when using OpenAI provider');
      }
      openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    }
    return { type: 'openai' as const, client: openaiClient };
  } else {
    if (!ollamaClient) {
      ollamaClient = new Ollama({ host: OLLAMA_BASE_URL });
    }
    return { type: 'ollama' as const, client: ollamaClient };
  }
}

// Generate embedding for a single text
export async function generateEmbedding(text: string): Promise<number[]> {
  const { type, client } = getEmbeddingClient();
  
  try {
    if (type === 'openai') {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      });
      return response.data[0].embedding;
    } else {
      const response = await client.embed({
        model: EMBEDDING_MODEL,
        input: text,
      });
      return response.embeddings[0];
    }
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate embeddings for multiple texts in batch
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  // Process in batches to avoid overwhelming the API
  const batchSize = EMBEDDING_PROVIDER === 'openai' ? 100 : 10;
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchEmbeddings = await Promise.all(
      batch.map(text => generateEmbedding(text))
    );
    embeddings.push(...batchEmbeddings);
  }
  
  return embeddings;
}

// Calculate cosine similarity between two vectors
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}
