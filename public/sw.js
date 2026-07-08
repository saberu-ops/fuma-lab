// Minimal service worker for PWA installability.
//
// A registered service worker with a `fetch` handler is one of the
// conditions Chromium uses to offer the address-bar "Install" action.
// We intentionally do NOT cache responses: this is a frequently-updated
// docs site, so aggressive caching would serve stale pages. The fetch
// handler is a pass-through. An offline caching strategy, if ever wanted,
// is a separate, deliberate change.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Pass-through: let the network handle every request normally.
});
