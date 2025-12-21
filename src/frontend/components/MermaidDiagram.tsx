import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import createDOMPurify from 'dompurify';
import { useTheme } from '../hooks/useTheme';

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const expandedDiagramRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    // Initialize mermaid
    mermaid.initialize({ 
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict'
    });

    // Generate unique ID for this diagram
    const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;

    // Render the diagram
    mermaid.render(id, chart)
      .then(({ svg }) => {
        let sanitizedSvg = '';
        try {
          const DOMPurify = createDOMPurify(window);
          sanitizedSvg = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_TAGS: ['foreignObject'],
            FORBID_TAGS: ['script'],
          });
        } catch (sanitizeError) {
          console.error('Failed to sanitize Mermaid SVG:', sanitizeError);
        }

        if (!sanitizedSvg) {
          setError('Failed to safely render diagram');
          return;
        }

        // Insert SVG into the DOM directly
        if (diagramRef.current) {
          diagramRef.current.innerHTML = sanitizedSvg;
        }
        // Only render to expanded ref if it exists (when expanded view is open)
        if (isExpanded && expandedDiagramRef.current) {
          expandedDiagramRef.current.innerHTML = sanitizedSvg;
        }
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Failed to render diagram');
        console.error('Mermaid rendering error:', err);
      });
  }, [chart, theme, isExpanded]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chart);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy diagram code:', err);
    }
  };

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleCloseExpanded = () => {
    setIsExpanded(false);
  };

  if (error) {
    return (
      <div className="mermaid-error">
        <strong>Mermaid Diagram Error:</strong>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <>
      <div className="mermaid-container">
        <div className="mermaid-controls">
          <button 
            className="mermaid-button" 
            onClick={handleExpand}
            title="Expand diagram"
          >
            ⛶ Expand
          </button>
          <button 
            className="mermaid-button" 
            onClick={handleCopy}
            title="Copy diagram code"
          >
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
        <div 
          className="mermaid-diagram"
          ref={diagramRef}
        />
      </div>

      {isExpanded && (
        <div className="mermaid-overlay" onClick={handleCloseExpanded}>
          <div className="mermaid-expanded" onClick={(e) => e.stopPropagation()}>
            <div className="mermaid-expanded-header">
              <h3>Diagram</h3>
              <div className="mermaid-expanded-controls">
                <button 
                  className="mermaid-button" 
                  onClick={handleCopy}
                  title="Copy diagram code"
                >
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
                <button 
                  className="mermaid-button" 
                  onClick={handleCloseExpanded}
                  title="Close"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <div 
              className="mermaid-expanded-content"
              ref={expandedDiagramRef}
            />
          </div>
        </div>
      )}
    </>
  );
}
