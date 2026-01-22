const CACHE_NAME = 'secretnotes-v1';
const urlsToCache = [
  '/',
  'index.html',
  'assets/sql-wasm.min.js',
  'assets/sql-wasm.wasm',
  'assets/suneditor.min.js',
  'assets/suneditor.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});