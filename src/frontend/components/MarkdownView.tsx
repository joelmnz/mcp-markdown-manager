import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownViewProps {
  content: string;
}

const PreBlock = ({ children, ...props }: React.DetailedHTMLProps<React.HTMLAttributes<HTMLPreElement>, HTMLPreElement>) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  // Check if children is a MermaidDiagram component
  if (React.isValidElement(children) && children.type === MermaidDiagram) {
    return <>{children}</>;
  }

  const handleCopy = () => {
    if (preRef.current) {
      const text = preRef.current.innerText;
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }
  };

  const showButton = isHovered || isFocused || copied;

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <pre ref={preRef} {...props}>
        {children}
      </pre>
      <button
        onClick={handleCopy}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        title="Copy code"
        aria-label={copied ? "Copied" : "Copy code"}
        style={{
          position: 'absolute',
          top: '5px',
          right: '5px',
          padding: '4px 8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: '0.8rem',
          zIndex: 10,
          opacity: showButton ? 1 : 0,
          transition: 'opacity 0.2s ease-in-out',
          pointerEvents: showButton ? 'auto' : 'none',
        }}
      >
        {copied ? '✓' : '📋'}
      </button>
    </div>
  );
};

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
        pre: PreBlock,
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
