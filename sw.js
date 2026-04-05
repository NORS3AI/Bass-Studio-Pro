/**
 * sw.js — Service Worker for offline caching
 */
const CACHE_NAME = 'bass-studio-pro-v0.11.3';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/storage.js',
  '/js/id3-parser.js',
  '/js/file-loader.js',
  '/js/player.js',
  '/js/playlist.js',
  '/js/equalizer.js',
  '/js/visualizer.js',
  '/js/patch-notes.js',
  '/js/app.js',
  '/manifest.json',
  '/PATCH_NOTES.md',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for always-fresh content (patch notes), cache-first for app shell
const NETWORK_FIRST = ['/PATCH_NOTES.md'];

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isNetworkFirst = NETWORK_FIRST.some(p => url.pathname.endsWith(p));

  if (isNetworkFirst) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
