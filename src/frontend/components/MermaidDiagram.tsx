import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Initialize mermaid
    mermaid.initialize({ 
      startOnLoad: false,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose'
    });

    // Generate unique ID for this diagram
    const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

    // Render the diagram
    mermaid.render(id, chart)
      .then(({ svg }) => {
        setSvg(svg);
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Failed to render diagram');
        console.error('Mermaid rendering error:', err);
      });
  }, [chart]);

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
      <div className="mermaid-container" ref={containerRef}>
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
          dangerouslySetInnerHTML={{ __html: svg }}
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
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  );
}
