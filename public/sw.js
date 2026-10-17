// Vite replaces the version and asset list with this build's content hashes.
// Only app resources enter Cache Storage. Recordings and sessions stay in IndexedDB.
const BUILD_VERSION = '__SPEAKGYM_BUILD_VERSION__';
const BUILD_ASSETS = /* __SPEAKGYM_PRECACHE__ */ [];
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `speakgym:${SCOPE.pathname}:`;
const CACHE = `${CACHE_PREFIX}${BUILD_VERSION}`;
const SHELL = new URL('index.html', SCOPE).href;
const ASSET_URLS = BUILD_ASSETS.map((path) => new URL(path, SCOPE).href);
const PRECACHED = new Set(ASSET_URLS);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSET_URLS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (request.mode === 'navigate') {
    // A fresh online shell can load the newest build. The offline shell stays paired
    // with its precached assets until a new worker finishes installing the whole build.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) return response;
        return (await cache.match(SHELL)) || response;
      } catch {
        return (await cache.match(SHELL)) || Response.error();
      }
    })());
    return;
  }

  if (!PRECACHED.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(request, { ignoreVary: true })) || fetch(request);
  })());
});
