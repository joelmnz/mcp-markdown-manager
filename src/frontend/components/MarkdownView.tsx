import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownViewProps {
  content: string;
}

/**
 * Reusable component for rendering markdown with Mermaid diagram support
 */
export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          const isInline = !className;
          
          if (!isInline && language === 'mermaid') {
            return <MermaidDiagram chart={String(children).trim()} />;
          }
          
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
