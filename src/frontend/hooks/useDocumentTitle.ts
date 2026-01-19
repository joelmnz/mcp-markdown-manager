import { useEffect, useRef } from 'react';

const DEFAULT_TITLE = 'MCP Markdown Manager';

export function useDocumentTitle(title?: string) {
  const defaultTitle = useRef(document.title || DEFAULT_TITLE);

  useEffect(() => {
    // Only set title if it's provided and not empty
    if (title) {
      document.title = title;
    }
  }, [title]);

  useEffect(() => {
    // Restore original title only on unmount
    return () => {
      document.title = defaultTitle.current;
    };
  }, []);
}
