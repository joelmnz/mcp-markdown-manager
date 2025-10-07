/**
 * Utility hook for detecting the current theme
 */
export function useTheme(): 'dark' | 'light' {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'dark' ? 'dark' : 'light';
}
