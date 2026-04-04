/**
 * sw.js — Service Worker for offline caching
 */
const CACHE_NAME = 'bass-studio-pro-v0.6.6';
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

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
