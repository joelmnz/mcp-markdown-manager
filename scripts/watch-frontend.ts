#!/usr/bin/env bun
import { watch } from 'fs';
import { spawn } from 'child_process';

let building = false;

const build = () => {
  if (building) return;
  building = true;
  
  console.log('🔨 Building frontend...');
  const proc = spawn('bun', ['run', 'build:frontend'], { stdio: 'inherit' });
  
  proc.on('close', (code) => {
    building = false;
    if (code === 0) {
      console.log('✅ Frontend built successfully');
    } else {
      console.error('❌ Frontend build failed');
    }
  });
};

// Initial build
build();

// Watch for changes
const watcher = watch('./src/frontend', { recursive: true }, (eventType, filename) => {
  if (filename && (filename.endsWith('.tsx') || filename.endsWith('.ts') || filename.endsWith('.css'))) {
    console.log(`📝 Changed: ${filename}`);
    build();
  }
});

console.log('👀 Watching src/frontend for changes...');

// Handle cleanup
process.on('SIGINT', () => {
  watcher.close();
  process.exit(0);
});
