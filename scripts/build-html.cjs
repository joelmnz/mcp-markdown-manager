const fs = require('fs');
const path = require('path');

function newestFiles(dir, prefix, ext) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => x.f);
}

const publicDir = path.join(__dirname, '..', 'public');
const jsFiles = newestFiles(publicDir, 'App.', '.js');
const cssFiles = newestFiles(publicDir, 'App.', '.css');

if (!jsFiles.length || !cssFiles.length) {
  console.error('Missing built assets in public/');
  process.exit(1);
}

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="description" content="AI-powered markdown article management system"><meta name="theme-color" content="#4a9eff"><title>MCP Markdown Manager</title><link rel="manifest" href="/manifest.json"><link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png"><link rel="apple-touch-icon" href="/icon-192.png"><link rel="stylesheet" href="/${cssFiles[0]}"></head><body><div id="root"></div><script type="module" src="/${jsFiles[0]}"></script></body></html>`;
fs.writeFileSync(path.join(publicDir, 'index.html'), html);
console.log('public/index.html written ->', jsFiles[0], cssFiles[0]);
