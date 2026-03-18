import { describe, expect, test } from 'bun:test';
import { preprocessMarkdownForTts } from '../../../src/backend/services/tts';

describe('TTS preprocessing', () => {
  test('strips markdown syntax while preserving readable text', () => {
    const markdown = `---
title: Example
---

## Heading

This is **bold** and _italic_ with a [link](https://example.com).

> Quoted text

- First item
1. Second item

\`inline code\`

\`\`\`ts
const hidden = true;
\`\`\`
`;

    expect(preprocessMarkdownForTts(markdown)).toBe(
      'Heading.\n\nThis is bold and italic with a link.\nQuoted text\nFirst item.\nSecond item.\n\ninline code'
    );
  });

  test('keeps existing sentence punctuation on headings and list items', () => {
    const markdown = `### Already done!\n- Question?\n* Statement`;

    expect(preprocessMarkdownForTts(markdown)).toBe('Already done!\nQuestion?\nStatement.');
  });
});
