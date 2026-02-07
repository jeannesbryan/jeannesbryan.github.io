const CACHE_NAME = 'npc-v2';
const urlsToCache = [
  '/',
  '/assets/style.css',
  '/assets/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/blog/'
];

// Install event - cache files
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('All files cached successfully');
        return self.skipWaiting(); // Activate immediately
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event - serve from cache or network (only cache same-origin requests)
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Parse the request URL
  const requestUrl = new URL(event.request.url);
  
  // Only cache same-origin requests to avoid CORS issues
  if (requestUrl.origin !== location.origin) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network
        return fetch(event.request).then(
          response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone response because it's a stream
            const responseClone = response.clone();
            
            // Cache the response for future use (only for same-origin)
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseClone);
              });
            
            return response;
          }
        );
      })
      .catch(error => {
        console.error('Fetch error:', error);
        // Return offline page or error message
        return new Response('Offline - Please check your connection', {
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});