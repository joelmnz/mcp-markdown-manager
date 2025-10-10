import { createHash } from 'crypto';

export interface Chunk {
  id: string;
  filename: string;
  title: string;
  headingPath: string[];
  chunkIndex: number;
  text: string;
  created: string;
  modified: string;
}

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '500', 10);
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '50', 10);

// Split text into chunks based on heading structure
export function chunkMarkdown(
  filename: string,
  title: string,
  content: string,
  created: string,
  modified: string
): Chunk[] {
  const chunks: Chunk[] = [];
  const sections = splitByHeadings(content);
  
  let globalChunkIndex = 0;
  
  for (const section of sections) {
    const { headingPath, text } = section;
    
    // Split section text into smaller chunks if needed
    const textChunks = splitTextIntoChunks(text, CHUNK_SIZE, CHUNK_OVERLAP);
    
    for (let i = 0; i < textChunks.length; i++) {
      const chunkText = textChunks[i];
      const chunkId = generateChunkId(filename, globalChunkIndex);
      
      chunks.push({
        id: chunkId,
        filename,
        title,
        headingPath,
        chunkIndex: globalChunkIndex,
        text: chunkText,
        created,
        modified,
      });
      
      globalChunkIndex++;
    }
  }
  
  return chunks;
}

// Split markdown content by headings
function splitByHeadings(content: string): Array<{ headingPath: string[]; text: string }> {
  const lines = content.split('\n');
  const sections: Array<{ headingPath: string[]; text: string }> = [];
  
  let currentHeadingPath: string[] = [];
  let currentText: string[] = [];
  let headingStack: Array<{ level: number; heading: string }> = [];
  
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headingMatch) {
      // Save previous section if it has content
      if (currentText.length > 0) {
        sections.push({
          headingPath: [...currentHeadingPath],
          text: currentText.join('\n').trim(),
        });
        currentText = [];
      }
      
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      
      // Update heading stack based on level
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, heading: headingMatch[0] });
      
      // Update current heading path
      currentHeadingPath = headingStack.map(h => h.heading);
    } else {
      currentText.push(line);
    }
  }
  
  // Save the last section
  if (currentText.length > 0) {
    sections.push({
      headingPath: currentHeadingPath,
      text: currentText.join('\n').trim(),
    });
  }
  
  // If no sections were created, create one with the entire content
  if (sections.length === 0 && content.trim()) {
    sections.push({
      headingPath: [],
      text: content.trim(),
    });
  }
  
  return sections;
}

// Split text into chunks with overlap
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }
  
  const words = text.split(/\s+/);
  if (words.length <= chunkSize) {
    return [text];
  }
  
  const chunks: string[] = [];
  let startIdx = 0;
  
  while (startIdx < words.length) {
    const endIdx = Math.min(startIdx + chunkSize, words.length);
    const chunk = words.slice(startIdx, endIdx).join(' ');
    chunks.push(chunk);
    
    if (endIdx >= words.length) {
      break;
    }
    
    startIdx = endIdx - overlap;
  }
  
  return chunks;
}

// Generate a unique chunk ID
function generateChunkId(filename: string, chunkIndex: number): string {
  return `${filename}#${chunkIndex}`;
}

// Calculate content hash for change detection
export function calculateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}
