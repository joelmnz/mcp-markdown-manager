import { describe, expect, test } from "bun:test";

function parseFrontmatter(content: string): { 
  title?: string; 
  created?: string; 
  folder?: string;
  isPublic?: boolean;
  body: string 
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { body: content };
  }
  
  const frontmatter = match[1];
  const body = match[2].replace(/^[\n\r]+/, '');
  const result: { 
    title?: string; 
    created?: string; 
    folder?: string;
    isPublic?: boolean;
    body: string 
  } = { body };
  
  frontmatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (!key) return;
    
    const value = valueParts.join(':').trim();
    const lowerKey = key.trim().toLowerCase();
    
    if (lowerKey === 'title') result.title = value;
    if (lowerKey === 'created') result.created = value;
    if (lowerKey === 'folder') result.folder = value;
    if (lowerKey === 'public' || lowerKey === 'ispublic') {
      result.isPublic = value.toLowerCase() === 'true';
    }
  });
  
  return result;
}

function extractTitle(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }
  return 'Untitled';
}

function generateSlugFromFilename(filename: string): string {
  let baseName = filename;
  if (baseName.endsWith('.md')) {
    baseName = baseName.slice(0, -3);
  }
  
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

describe("Markdown Parsing Logic", () => {
  describe("parseFrontmatter", () => {
    test("should parse valid frontmatter", () => {
      const content = `---
title: Test Article
created: 2024-01-01T00:00:00.000Z
folder: test/folder
public: true
---

# Test Content

Body content here.`;

      const result = parseFrontmatter(content);
      
      expect(result.title).toBe("Test Article");
      expect(result.created).toBe("2024-01-01T00:00:00.000Z");
      expect(result.folder).toBe("test/folder");
      expect(result.isPublic).toBe(true);
      expect(result.body.startsWith("# Test Content")).toBe(true);
    });

    test("should handle content without frontmatter", () => {
      const content = `# Article Title

Just content, no frontmatter.`;

      const result = parseFrontmatter(content);
      
      expect(result.title).toBeUndefined();
      expect(result.body).toBe(content);
    });

    test("should handle messy frontmatter keys (case insensitivity)", () => {
      const content = `---
TiTlE: Messy Case
CREATED: 2024-01-01
isPublic: false
---
Content`;

      const result = parseFrontmatter(content);
      expect(result.title).toBe("Messy Case");
      expect(result.created).toBe("2024-01-01");
      expect(result.isPublic).toBe(false);
    });
  });

  describe("extractTitle", () => {
    test("should extract first h1 heading", () => {
      const content = `
some text

# First Heading

# Second Heading
`;
      expect(extractTitle(content)).toBe("First Heading");
    });

    test("should return Untitled if no heading found", () => {
      const content = `
some text
## Subheading
text
`;
      expect(extractTitle(content)).toBe("Untitled");
    });
  });

  describe("generateSlugFromFilename", () => {
    test("should slugify simple filename", () => {
      expect(generateSlugFromFilename("simple-file.md")).toBe("simple-file");
    });

    test("should handle spaces and special chars", () => {
      expect(generateSlugFromFilename("Complex File Name!.md")).toBe("complex-file-name");
    });
    
    test("should handle underscores", () => {
      expect(generateSlugFromFilename("file_with_underscores.md")).toBe("filewithunderscores");
    });
  });
  
  describe("generateSlugFromTitle", () => {
    test("should slugify simple title", () => {
      expect(generateSlugFromTitle("Simple Title")).toBe("simple-title");
    });
    
    test("should handle special characters", () => {
      expect(generateSlugFromTitle("Title with Special Characters!@#$%")).toBe("title-with-special-characters");
    });
    
    test("should collapse multiple dashes", () => {
      expect(generateSlugFromTitle("Title - with - dashes")).toBe("title-with-dashes");
    });
  });
});
