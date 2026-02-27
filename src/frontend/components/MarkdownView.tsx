import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownViewProps {
  content: string;
}

function sanitizeUrl(rawUrl: string | undefined, kind: 'link' | 'image'): string | null {
  if (!rawUrl) {
    return null;
  }

  const url = rawUrl.trim();
  if (!url) {
    return null;
  }

  // Allow anchors and relative URLs
  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return url;
  }

  // Allow protocol-relative URLs
  if (url.startsWith('//')) {
    return url;
  }

  // Parse absolute URLs safely
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();

    // Disallow scriptable or unexpected schemes
    if (protocol === 'javascript:' || protocol === 'vbscript:' || protocol === 'file:') {
      return null;
    }

    if (kind === 'image') {
      // Keep images to http/https only to reduce edge-case SVG/data risks
      if (protocol !== 'http:' && protocol !== 'https:') {
        return null;
      }
      return url;
    }

    // Links: allow http(s), mailto, tel
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:') {
      return url;
    }

    return null;
  } catch {
    // If it isn't a valid absolute URL, treat as unsafe
    return null;
  }
}

function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

const PreBlock = ({ children, ...props }: React.DetailedHTMLProps<React.HTMLAttributes<HTMLPreElement>, HTMLPreElement>) => {
  const [copied, setCopied] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);

  // Check if child is MermaidDiagram to avoid double copy buttons
  const child = React.Children.toArray(children)[0];
  const isMermaid = React.isValidElement(child) && child.type === MermaidDiagram;

  if (isMermaid) {
    return <pre {...props}>{children}</pre>;
  }

  const handleCopy = async () => {
    if (!preRef.current) return;

    const text = preRef.current.textContent || '';
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy code:', err);
      }
    }
  };

  return (
    <div className="code-block-wrapper" style={{ position: 'relative', marginBottom: '1rem' }}>
      <button
        onClick={handleCopy}
        className="copy-code-button"
        aria-label={copied ? "Copied" : "Copy code"}
        title="Copy code"
      >
        {copied ? '✓' : '📋'}
      </button>
      <pre ref={preRef} {...props} style={{ marginBottom: 0 }}>{children}</pre>
    </div>
  );
};

/**
 * Reusable component for rendering markdown with Mermaid diagram support
 */
export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]}
      components={{
        a({ href, children, ...props }) {
          const safeHref = sanitizeUrl(href, 'link');
          if (!safeHref) {
            return <span>{children}</span>;
          }

          const external = isExternalUrl(safeHref);
          return (
            <a
              href={safeHref}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              {...props}
            >
              {children}
            </a>
          );
        },
        img({ src, alt, ...props }) {
          const safeSrc = sanitizeUrl(src, 'image');
          if (!safeSrc) {
            return null;
          }

          return <img src={safeSrc} alt={alt} loading="lazy" {...props} />;
        },
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
        },
        pre: PreBlock
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
