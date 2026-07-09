const CACHE_NAME = 'jeannes-bryan-bunker-v2';
const ASSETS = [
	'/',
	'/index.html',
	'/bunker/vault.html',
	'/bunker/auth.html',
	'/bunker/notes.html',
	'/bunker/contacts.html',
	'/bunker/ledger.html',
	'/assets/terminal.css',
	'/assets/terminal.js',
	'/assets/libsodium-wrappers-sumo+esm.js',
	'/assets/markdown-it.min.js',
	'/assets/purify.min.js',
	'/assets/manifest.webmanifest',
	'/assets/npc-icon.svg',
	'/assets/favicon-16x16.png',
	'/assets/favicon-32x32.png',
	'/assets/apple-touch-icon.png',
	'/assets/offline.html'
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(cache => Promise.allSettled(
				ASSETS.map(path => fetch(path, { cache: 'reload' })
					.then(response => {
						if (!response || !response.ok) throw new Error(`Cache failed: ${path}`);
						return cache.put(path, response);
					})
				)
			))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys()
			.then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', event => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.endsWith('.enc')) return;

	event.respondWith(
		caches.match(event.request)
			.then(cached => cached || fetch(event.request))
			.catch(() => {
				if (event.request.mode === 'navigate') return caches.match('/assets/offline.html');
				return new Response('', { status: 503, statusText: 'Offline' });
			})
	);
});
