/*
 * WASM Zoo cross-origin-isolation Service Worker.
 *
 * Keep this worker at the Pages site root. Emscripten pthread builds load their core scripts from /assets/**, so the
 * Service Worker must control both Playground documents and published assets.
 * This currently covers the FFmpeg pthread runtime. A Playground-only scope isolates the
 * document but leaves pthread worker clients outside the isolated scope.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  event.respondWith((async () => {
    const response = await fetch(request);
    if (!response || response.type === 'opaque') return response;

    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  })());
});
