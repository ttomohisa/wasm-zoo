/*
 * Legacy Playground-scoped isolation worker.
 *
 * v0.2.6 initially registered this file with /playground/ scope. That scope
 * does not cover Emscripten pthread worker clients loaded from /assets/**.
 * New code registers ../coi-serviceworker.js at the WASM Zoo site root.
 * Keep this tiny file temporarily so existing registrations can update while
 * coi-bootstrap.js explicitly unregisters the legacy scope before reloading.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  event.respondWith(fetch(request));
});
