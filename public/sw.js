/* Cache the installed application's static shell after an online visit. Never
   intercept live APIs, tiles, locations, model files, TTS, or route responses. */
const CACHE = 'leeway-maps-offline-v2';
const base = self.registration.scope;
const offline = new URL('offline.html', base).href;
const offlineAssets = [
  'offline.html',
  'icon-192.png',
  'offlineTripCore.js',
  'offlineTripPage.js',
].map((path) => new URL(path, base).href);
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(offlineAssets)),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('leeway-logistics-offline-') && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;
  const inScope = sameOrigin && requestUrl.pathname.startsWith(new URL(base).pathname);
  // Match shipped static directories only. A JSON suffix does not prove that a
  // response is public or static (API endpoints may contain private records).
  const staticAsset = inScope && (
    requestUrl.pathname.startsWith(new URL('assets/', base).pathname) ||
    requestUrl.pathname.startsWith(new URL('cesium/', base).pathname)
  );
  if (
    event.request.method === 'GET' &&
    offlineAssets.includes(event.request.url)
  ) {
    event.respondWith(
      caches
        .match(event.request)
        .then((cached) => cached || fetch(event.request)),
    );
    return;
  }
  if (event.request.method === 'GET' && event.request.mode === 'navigate' && inScope) {
    // A cached globe shell cannot guarantee cached imagery, terrain or its
    // original script graph. Open the self-contained saved-trip viewer directly
    // when navigation fails, including /index.html and shared-address launches.
    event.respondWith(fetch(event.request, { cache: 'no-store' })
      .then((response) => response.status >= 500
        ? caches.match(offline).then((saved) => saved || response)
        : response)
      .catch(() => caches.match(offline)));
    return;
  }
  if (event.request.method === 'GET' && staticAsset) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      }).catch(() => caches.match(event.request)),
    );
    return;
  }
});
