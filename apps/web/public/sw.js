/* Excess CRM service worker — conservative by design.
   Caches ONLY immutable, content-hashed static assets (Next chunks, icons) for fast
   repeat loads. Never caches /api or HTML pages, so dynamic/auth content is always
   fresh. */
const CACHE = 'excess-static-v1';
const STATIC = /\/_next\/static\/|\/icon-\d+\.png$|\/logo\.jpeg$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return; // never cache API
  if (!STATIC.test(url.pathname)) return; // pages/everything else → default network

  // Cache-first for immutable static assets.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((resp) => {
            if (resp.ok) cache.put(request, resp.clone());
            return resp;
          }),
      ),
    ),
  );
});
