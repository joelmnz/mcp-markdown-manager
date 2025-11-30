// Service Worker for MCP Markdown Manager PWA
// OFFLINE SUPPORT DISABLED - Network Only Mode

// Install event - skip waiting immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker (No-Cache mode)...');
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up ALL caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker & cleaning caches...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            console.log('[SW] Deleting cache:', name);
            return caches.delete(name);
          })
        );
      })
      .then(() => {
        console.log('[SW] All caches deleted. Claims clients.');
        return self.clients.claim();
      })
  );
});

// No fetch listener -> Network Only
// The browser will handle all requests directly.

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
