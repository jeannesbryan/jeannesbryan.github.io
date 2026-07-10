const CACHE_NAME = 'jeannes-bryan-bunker-v28';
const ASSETS = [
	'/',
	'/index.html',
	'/bunker/auth.html',
	'/bunker/board.html',
	'/bunker/bookmarks.html',
	'/bunker/contacts.html',
	'/bunker/ledger.html',
	'/bunker/notes.html',
	'/bunker/planner.html',
	'/bunker/snippets.html',
	'/bunker/vault.html',
	'/assets/terminal.css',
	'/assets/terminal.js',
	'/assets/bunker-root.js',
	'/assets/bunker-core.js',
	'/assets/libsodium-wrappers-sumo+esm.js',
	'/assets/markdown-it.min.js',
	'/assets/purify.min.js',
	'/assets/Sortable.min.js',
	'/assets/prism.min.js',
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

self.addEventListener('message', event => {
	if (!event.data || typeof event.data !== 'object') return;
	if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
	if (event.data.type === 'GET_CACHE_NAME' && event.source) event.source.postMessage({ type: 'CACHE_NAME', cacheName: CACHE_NAME });
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
