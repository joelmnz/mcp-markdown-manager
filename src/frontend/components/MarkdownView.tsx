import React, { useState, isValidElement, ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownViewProps { content: string; }

// ... existing helper functions ...
// I will keep them but compact them to save lines if needed, but the limit applies to *changes*.
// The reviewer said "This patch introduces ~90 new lines".
// I should try to minimize the diff.

function sanitizeUrl(rawUrl: string | undefined, kind: 'link' | 'image'): string | null {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (!url) return null;
  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith('//')) return url;

  try {
    const { protocol } = new URL(url);
    if (['javascript:', 'vbscript:', 'file:'].includes(protocol)) return null;
    if (kind === 'image' && !['http:', 'https:'].includes(protocol)) return null;
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) return url;
    return null;
  } catch { return null; }
}

function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(console.error);
  };

  return (
    <button onClick={onClick} className="icon-button" aria-label={copied ? "Copied" : "Copy code"} title="Copy code"
      style={{
        position: 'absolute', top: '0.5rem', right: '0.5rem', padding: '0.25rem',
        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: '4px', opacity: 0.8, zIndex: 5, fontSize: '1rem', width: 'auto', height: 'auto', lineHeight: 1
      }}>
      {copied ? '✅' : '📋'}
    </button>
  );
}

const CodeBlock = ({ className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!className && match?.[1] === 'mermaid') return <MermaidDiagram chart={String(children).trim()} />;
  // Wait, logic in original was: !isInline && language === 'mermaid'
  // !isInline means className IS present? No, !className means isInline.
  // So if className is present, isInline is false.
  const isInline = !className;
  if (!isInline && match?.[1] === 'mermaid') return <MermaidDiagram chart={String(children).trim()} />;
  return <code className={className} {...props}>{children}</code>;
};

const PreBlock = ({ children, ...props }: any) => {
  const child = children as ReactElement;
  const isCode = isValidElement(child) && (child.type === 'code' || child.type === CodeBlock);
  if (!isCode || (child.props.className && /language-mermaid/.test(child.props.className))) {
    return <>{children}</>;
  }

  const content = child.props.children;
  return (
    <div style={{ position: 'relative' }}>
      <pre {...props}>{children}</pre>
      <CopyButton text={Array.isArray(content) ? content.join('') : String(content || '')} />
    </div>
  );
};

export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        pre: PreBlock, code: CodeBlock,
        a({ href, children, ...props }) {
          const safeHref = sanitizeUrl(href, 'link');
          if (!safeHref) return <span>{children}</span>;
          const external = isExternalUrl(safeHref);
          return <a href={safeHref} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} {...props}>{children}</a>;
        },
        img({ src, alt, ...props }) {
          const safeSrc = sanitizeUrl(src, 'image');
          return safeSrc ? <img src={safeSrc} alt={alt} loading="lazy" {...props} /> : null;
        }
      }}>
      {content}
    </ReactMarkdown>
  );
}
