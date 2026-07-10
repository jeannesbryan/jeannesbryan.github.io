(() => {
	const CACHE_NAME = 'jeannes-bryan-bunker-v18';
	const ASSET_CHECKS = [
		{ name: 'index.html', path: './index.html' },
		{ name: 'sw.js', path: './sw.js' },
		{ name: 'assets/sw-core.js', path: './assets/sw-core.js' },
		{ name: 'assets/bunker-core.js', path: './assets/bunker-core.js' },
		{ name: 'assets/terminal.css', path: './assets/terminal.css' },
		{ name: 'assets/terminal.js', path: './assets/terminal.js' },
		{ name: 'assets/libsodium-wrappers-sumo+esm.js', path: './assets/libsodium-wrappers-sumo+esm.js' },
		{ name: 'assets/markdown-it.min.js', path: './assets/markdown-it.min.js' },
		{ name: 'assets/purify.min.js', path: './assets/purify.min.js' },
		{ name: 'assets/Sortable.min.js', path: './assets/Sortable.min.js' },
		{ name: 'assets/prism.min.js', path: './assets/prism.min.js' },
		{ name: 'assets/manifest.webmanifest', path: './assets/manifest.webmanifest' },
		{ name: 'assets/offline.html', path: './assets/offline.html' },
		{ name: 'bunker/auth.html', path: './bunker/auth.html' },
		{ name: 'bunker/board.html', path: './bunker/board.html' },
		{ name: 'bunker/bookmarks.html', path: './bunker/bookmarks.html' },
		{ name: 'bunker/contacts.html', path: './bunker/contacts.html' },
		{ name: 'bunker/ledger.html', path: './bunker/ledger.html' },
		{ name: 'bunker/notes.html', path: './bunker/notes.html' },
		{ name: 'bunker/planner.html', path: './bunker/planner.html' },
		{ name: 'bunker/snippets.html', path: './bunker/snippets.html' },
		{ name: 'bunker/vault.html', path: './bunker/vault.html' }
	];

	let deferredInstallPrompt = null;

	const byId = id => document.getElementById(id);
	const installPanel = byId('installPanel');
	const btnInstall = byId('btnInstall');
	const btnDismissInstall = byId('btnDismissInstall');
	const btnCheckAssets = byId('btnCheckAssets');
	const btnUpdateCache = byId('btnUpdateCache');
	const assetStatusList = byId('assetStatusList');
	const diagServiceWorker = byId('diagServiceWorker');
	const diagCache = byId('diagCache');
	const diagOffline = byId('diagOffline');

	function setText(element, text) {
		if (element) element.textContent = text;
	}

	function setAssetRow(name, status, detail = '') {
		if (!assetStatusList) return;
		let row = assetStatusList.querySelector(`[data-asset="${CSS.escape(name)}"]`);
		if (!row) {
			row = document.createElement('div');
			row.className = 'asset-status-row';
			row.dataset.asset = name;
			row.innerHTML = '<span class="asset-status-name"></span><span class="asset-status-badge"></span>';
			assetStatusList.appendChild(row);
		}
		row.querySelector('.asset-status-name').textContent = detail ? `${name} — ${detail}` : name;
		row.querySelector('.asset-status-badge').textContent = status;
	}

	async function registerServiceWorker() {
		if (!('serviceWorker' in navigator)) {
			setText(diagServiceWorker, 'UNSUPPORTED');
			setText(diagCache, 'UNAVAILABLE');
			setText(diagOffline, 'UNAVAILABLE');
			return;
		}

		try {
			const registration = await navigator.serviceWorker.register('./sw.js');
			await navigator.serviceWorker.ready;
			setText(diagServiceWorker, registration.active ? 'ACTIVE' : 'REGISTERED');
		} catch (error) {
			setText(diagServiceWorker, 'FAILED');
			console.warn('Service worker registration failed:', error);
		}
	}

	async function checkCache() {
		if (!('caches' in window)) {
			setText(diagCache, 'UNSUPPORTED');
			setText(diagOffline, 'UNSUPPORTED');
			return;
		}

		try {
			const keys = await caches.keys();
			const active = keys.includes(CACHE_NAME);
			setText(diagCache, active ? CACHE_NAME : `PENDING: ${CACHE_NAME}`);

			const cachedOffline = await caches.match('/assets/offline.html');
			setText(diagOffline, cachedOffline ? 'READY' : 'NOT_CACHED_YET');
		} catch (error) {
			setText(diagCache, 'FAILED');
			setText(diagOffline, 'FAILED');
			console.warn('Cache check failed:', error);
		}
	}

	async function checkAsset(asset) {
		try {
			let response = await fetch(asset.path, { method: 'HEAD', cache: 'no-store' });
			if (!response.ok || response.status === 405) response = await fetch(asset.path, { method: 'GET', cache: 'no-store' });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			setAssetRow(asset.name, 'OK');
			return true;
		} catch (error) {
			setAssetRow(asset.name, 'MISSING', error.message);
			return false;
		}
	}

	async function checkAssets() {
		if (!assetStatusList) return;
		assetStatusList.innerHTML = '';
		for (const asset of ASSET_CHECKS) setAssetRow(asset.name, 'WAIT');

		let ok = 0;
		for (const asset of ASSET_CHECKS) {
			if (await checkAsset(asset)) ok += 1;
		}
		setText(diagCache, `${ok}/${ASSET_CHECKS.length} ASSETS OK`);
		await checkCache();
	}

	async function updateCache() {
		const allowed = confirm('Clear Bunker PWA cache and reload this launcher? Unsaved in-memory app data can be lost. Export .enc files before continuing.');
		if (!allowed) return;

		try {
			if ('serviceWorker' in navigator) {
				const registrations = await navigator.serviceWorker.getRegistrations();
				await Promise.all(registrations.map(registration => registration.unregister()));
			}

			if ('caches' in window) {
				const keys = await caches.keys();
				await Promise.all(keys.filter(key => key.includes('bunker') || key.includes('jeannes-bryan')).map(key => caches.delete(key)));
			}
		} finally {
			location.reload();
		}
	}

	window.addEventListener('beforeinstallprompt', event => {
		event.preventDefault();
		deferredInstallPrompt = event;
		if (installPanel && !localStorage.getItem('bunker-install-dismissed')) installPanel.classList.add('is-visible');
	});

	if (btnInstall) {
		btnInstall.addEventListener('click', async () => {
			if (!deferredInstallPrompt) return;
			deferredInstallPrompt.prompt();
			await deferredInstallPrompt.userChoice;
			deferredInstallPrompt = null;
			if (installPanel) installPanel.classList.remove('is-visible');
		});
	}

	if (btnDismissInstall) {
		btnDismissInstall.addEventListener('click', () => {
			localStorage.setItem('bunker-install-dismissed', '1');
			if (installPanel) installPanel.classList.remove('is-visible');
		});
	}

	if (btnCheckAssets) btnCheckAssets.addEventListener('click', checkAssets);
	if (btnUpdateCache) btnUpdateCache.addEventListener('click', updateCache);

	window.addEventListener('load', async () => {
		await registerServiceWorker();
		await checkCache();
		await checkAssets();
	});
})();
