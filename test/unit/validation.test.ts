import { describe, expect, test } from "bun:test";
import {
  validateString,
  validateFilename,
  validateTitle,
  validateContent,
  validateFolder,
  validateQuery,
  validateArray,
  validateNumber,
  detectSecurityThreats,
} from "../../src/backend/mcp/validation";

describe("Validation Module", () => {
  describe("validateString", () => {
    test("should accept valid string", () => {
      const result = validateString("hello world", "test");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("hello world");
    });

    test("should trim whitespace", () => {
      const result = validateString("  hello  ", "test");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("hello");
    });

    test("should reject non-string values", () => {
      const result = validateString(123, "test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a string");
    });

    test("should reject undefined when required", () => {
      const result = validateString(undefined, "test", { required: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    test("should accept undefined when not required", () => {
      const result = validateString(undefined, "test", { required: false });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeUndefined();
    });

    test("should reject empty string when required", () => {
      const result = validateString("", "test", { required: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    test("should accept empty string when allowEmpty is true", () => {
      const result = validateString("", "test", { allowEmpty: true, required: false });
      expect(result.valid).toBe(true);
    });

    test("should enforce maxLength", () => {
      const result = validateString("hello", "test", { maxLength: 3 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum length");
    });

    test("should enforce minLength", () => {
      const result = validateString("hi", "test", { minLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least");
    });

    test("should validate with pattern", () => {
      const result = validateString("abc123", "test", { pattern: /^[a-z]+$/ });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("format is invalid");
    });

    test("should detect path traversal", () => {
      const result = validateString("../etc/passwd", "test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    test("should detect HTML injection in paths", () => {
      const result = validateString("file<script>", "test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    test("should allow dangerous patterns when checkDangerous is false", () => {
      const result = validateString("../path", "test", { checkDangerous: false });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateFilename", () => {
    test("should accept valid filename", () => {
      const result = validateFilename("my-article.md");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("my-article.md");
    });

    test("should reject filename without .md extension", () => {
      const result = validateFilename("my-article.txt");
      expect(result.valid).toBe(false);
      expect(result.error).toContain(".md");
    });

    test("should reject filename with path traversal", () => {
      const result = validateFilename("../etc/passwd.md");
      expect(result.valid).toBe(false);
    });

    test("should reject filename with uppercase letters", () => {
      const result = validateFilename("MyArticle.md");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("lowercase");
    });

    test("should reject filename starting with hyphen", () => {
      const result = validateFilename("-article.md");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot start");
    });

    test("should reject filename ending with hyphen (before .md)", () => {
      const result = validateFilename("article-.md");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot start or end");
    });

    test("should accept filename with numbers and hyphens", () => {
      const result = validateFilename("article-123-test.md");
      expect(result.valid).toBe(true);
    });

    test("should accept single character filename", () => {
      const result = validateFilename("a.md");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateTitle", () => {
    test("should accept valid title", () => {
      const result = validateTitle("My Great Article");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("My Great Article");
    });

    test("should reject empty title", () => {
      const result = validateTitle("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    test("should reject excessively long title", () => {
      const result = validateTitle("A".repeat(600));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum length");
    });

    test("should accept title with special characters", () => {
      const result = validateTitle("Article: A Study (2024)");
      expect(result.valid).toBe(true);
    });

    test("should accept title with unicode characters", () => {
      const result = validateTitle("文章标题 - Article Title");
      expect(result.valid).toBe(true);
    });

    test("should trim whitespace", () => {
      const result = validateTitle("  Title  ");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("Title");
    });
  });

  describe("validateContent", () => {
    test("should accept valid markdown content", () => {
      const content = "# Heading\n\nSome content here.";
      const result = validateContent(content);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(content);
    });

    test("should reject empty content", () => {
      const result = validateContent("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    test("should accept content with code blocks", () => {
      const content = "```javascript\nconst x = 1;\n```";
      const result = validateContent(content);
      expect(result.valid).toBe(true);
    });

    test("should accept content with special characters", () => {
      const content = "SELECT * FROM users; <script>alert('xss')</script>";
      const result = validateContent(content);
      expect(result.valid).toBe(true); // Content can contain code examples
    });

    test("should reject excessively large content", () => {
      const content = "A".repeat(15 * 1024 * 1024); // 15MB
      const result = validateContent(content);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum length");
    });

    test("should accept content up to 10MB", () => {
      const content = "A".repeat(5 * 1024 * 1024); // 5MB
      const result = validateContent(content);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateFolder", () => {
    test("should accept valid folder path", () => {
      const result = validateFolder("tech/ai");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("tech/ai");
    });

    test("should accept empty folder (root)", () => {
      const result = validateFolder("");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("");
    });

    test("should normalize slash to empty string", () => {
      const result = validateFolder("/");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("");
    });

    test("should reject folder with path traversal", () => {
      const result = validateFolder("tech/../etc");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    test("should reject folder with special characters", () => {
      const result = validateFolder("tech/<script>");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    test("should accept folder with underscores", () => {
      const result = validateFolder("tech_docs/ai_ml");
      expect(result.valid).toBe(true);
    });

    test("should accept nested folder paths", () => {
      const result = validateFolder("projects/web-dev/react");
      expect(result.valid).toBe(true);
    });

    test("should accept undefined as root", () => {
      const result = validateFolder(undefined);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("");
    });
  });

  describe("validateQuery", () => {
    test("should accept valid search query", () => {
      const result = validateQuery("artificial intelligence");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("artificial intelligence");
    });

    test("should reject empty query", () => {
      const result = validateQuery("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    test("should reject excessively long query", () => {
      const result = validateQuery("A".repeat(1500));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum length");
    });

    test("should accept query with special characters", () => {
      const result = validateQuery("C++ programming");
      expect(result.valid).toBe(true);
    });

    test("should accept query with numbers", () => {
      const result = validateQuery("ES2023 features");
      expect(result.valid).toBe(true);
    });

    test("should trim whitespace", () => {
      const result = validateQuery("  search term  ");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("search term");
    });
  });

  describe("validateArray", () => {
    test("should accept valid array", () => {
      const result = validateArray(["item1", "item2"], "test");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual(["item1", "item2"]);
    });

    test("should reject non-array value", () => {
      const result = validateArray("not-array", "test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be an array");
    });

    test("should reject empty array when minLength is 1", () => {
      const result = validateArray([], "test", { minLength: 1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least");
    });

    test("should accept empty array when minLength is 0", () => {
      const result = validateArray([], "test", { minLength: 0 });
      expect(result.valid).toBe(true);
    });

    test("should reject array exceeding maxLength", () => {
      const result = validateArray(Array(150).fill("item"), "test", { maxLength: 100 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum length");
    });

    test("should validate array items with custom validator", () => {
      const result = validateArray(["query1", "query2"], "queries", {
        itemValidator: (item) => validateQuery(item),
      });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual(["query1", "query2"]);
    });

    test("should reject array with invalid items", () => {
      const result = validateArray(["valid", ""], "queries", {
        itemValidator: (item) => validateQuery(item),
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("queries[1]");
    });

    test("should accept undefined when not required", () => {
      const result = validateArray(undefined, "test", { required: false });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeUndefined();
    });
  });

  describe("validateNumber", () => {
    test("should accept valid number", () => {
      const result = validateNumber(42, "count");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(42);
    });

    test("should convert string numbers", () => {
      const result = validateNumber("42", "count");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(42);
    });

    test("should reject non-numeric strings", () => {
      const result = validateNumber("abc", "count");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a number");
    });

    test("should enforce minimum value", () => {
      const result = validateNumber(0, "count", { min: 1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least");
    });

    test("should enforce maximum value", () => {
      const result = validateNumber(1001, "count", { max: 1000 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at most");
    });

    test("should validate integer requirement", () => {
      const result = validateNumber(3.14, "count", { integer: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be an integer");
    });

    test("should accept integers when integer is true", () => {
      const result = validateNumber(42, "count", { integer: true });
      expect(result.valid).toBe(true);
    });

    test("should accept floats when integer is false", () => {
      const result = validateNumber(3.14, "score", { integer: false });
      expect(result.valid).toBe(true);
    });

    test("should accept undefined when not required", () => {
      const result = validateNumber(undefined, "count", { required: false });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeUndefined();
    });

    test("should accept zero", () => {
      const result = validateNumber(0, "count", { min: 0 });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(0);
    });

    test("should accept negative numbers", () => {
      const result = validateNumber(-5, "value", { min: -10 });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(-5);
    });
  });

  describe("detectSecurityThreats", () => {
    test("should not flag SQL-like content (by design)", () => {
      const threats = detectSecurityThreats("'; DROP TABLE articles;--");
      expect(threats.length).toBe(0);
    });

    test("should not flag command-like content (by design)", () => {
      const threats = detectSecurityThreats("$(rm -rf /)");
      expect(threats.length).toBe(0);
    });

    test("should not flag path traversal (by design)", () => {
      const threats = detectSecurityThreats("../../../etc/passwd");
      expect(threats.length).toBe(0);
    });

    test("should not flag script tags (by design)", () => {
      const threats = detectSecurityThreats('<script>alert("xss")</script>');
      expect(threats.length).toBe(0);
    });

    test("should not flag normal content", () => {
      const threats = detectSecurityThreats("artificial intelligence research");
      expect(threats.length).toBe(0);
    });
  });
});
