// Service Worker for MCP Markdown Manager PWA
// OFFLINE SUPPORT DISABLED - Network Only Mode
// Runtime Base Path Support

// Get runtime base path configuration
function getRuntimeBasePath() {
  // Try to get base path from service worker registration scope
  const registration = self.registration;
  if (registration && registration.scope) {
    const url = new URL(registration.scope);
    const pathname = url.pathname;

    // If scope is not root, extract base path
    if (pathname !== '/') {
      // Remove trailing slash for consistency
      return pathname.replace(/\/$/, '');
    }
  }

  // Default to root path
  return '';
}

// Get the current base path
const basePath = getRuntimeBasePath();

// Install event - skip waiting immediately
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing service worker (No-Cache mode) with base path: ${basePath || '/'}`);
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up ALL caches
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating service worker & cleaning caches with base path: ${basePath || '/'}`);
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
// When caching is enabled in the future, this is where base path-aware
// resource URLs would be constructed using the basePath variable.

self.addEventListener('fetch', (event) => {
  // PWA requires a fetch handler to be installable.
  // We use a simple network-only strategy here to satisfy the requirement
  // without risking serving stale content.
  event.respondWith(fetch(event.request));
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Handle base path configuration requests from clients
  if (event.data && event.data.type === 'GET_BASE_PATH') {
    event.ports[0].postMessage({
      type: 'BASE_PATH_RESPONSE',
      basePath: basePath
    });
  }
});
