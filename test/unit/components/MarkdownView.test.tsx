import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'bun:test';
import { MarkdownView } from '../../../src/frontend/components/MarkdownView';

describe('MarkdownView Copy Button', () => {
  it('renders copy button for code blocks', () => {
    const markdown = "```javascript\nconsole.log('hello');\n```";
    const { container } = render(<MarkdownView content={markdown} />);

    // Check if button exists
    const button = container.querySelector('.code-copy-button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Copy code');
  });
});
