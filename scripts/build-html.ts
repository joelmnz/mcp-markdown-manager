import fs from 'fs';
import path from 'path';

function newestFiles(dir: string, prefix: string, ext: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => x.f);
}

function largestJsFile(dir: string, prefix: string, ext: string): string[] {
  // For JS files, we want the largest file which is the main entry point
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .map((f) => ({ f, size: fs.statSync(path.join(dir, f)).size }))
    .sort((a, b) => b.size - a.size);
  
  return files.length > 0 ? [files[0].f] : [];
}

function buildHtml() {
  const publicDir = path.join(import.meta.dir, '..', 'public');
  // Use largest file for JS (main entry point) and newest for CSS
  const jsFiles = largestJsFile(publicDir, 'App.', '.js');
  const cssFiles = newestFiles(publicDir, 'App.', '.css');

  if (!jsFiles.length || !cssFiles.length) {
    console.error('Missing built assets in public/');
    process.exit(1);
  }

  // Generate HTML template with placeholders for runtime base path injection
  // The server will replace these placeholders with actual base path values
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="description" content="AI-powered markdown article management system"><meta name="theme-color" content="#4a9eff"><title>MCP Markdown Manager</title><link rel="manifest" href="{{BASE_PATH}}/manifest.json"><link rel="icon" type="image/png" sizes="192x192" href="{{BASE_PATH}}/icon-192.png"><link rel="apple-touch-icon" href="{{BASE_PATH}}/icon-192.png"><link rel="stylesheet" href="{{BASE_PATH}}/${cssFiles[0]}"><script>window.__BASE_PATH_CONFIG__ = {{BASE_PATH_CONFIG}};</script></head><body><div id="root"></div><script type="module" src="{{BASE_PATH}}/${jsFiles[0]}"></script></body></html>`;
  
  fs.writeFileSync(path.join(publicDir, 'index.html'), html);
  console.log('public/index.html template written ->', jsFiles[0], cssFiles[0]);
}

// Run the build process
buildHtml();