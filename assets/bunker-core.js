/* Bunker Core v2
 * Shared helpers for Bunker static apps.
 * This file does not store data, phone home, or touch .enc contents by itself.
 */
(function () {
	'use strict';

	const APP_NAMES = Object.freeze({
		auth: 'Bunker Auth',
		board: 'Bunker Board',
		bookmarks: 'Bunker Bookmarks',
		contacts: 'Bunker Contacts',
		ledger: 'Bunker Ledger',
		notes: 'Bunker Notes',
		planner: 'Bunker Planner',
		snippets: 'Bunker Snippets',
		vault: 'Bunker Vault'
	});

	function masterPasswordAdvice(value) {
		const password = String(value || '');
		let score = 0;
		const issues = [];
		if (!password) {
			return {
				level: 'EMPTY',
				ok: false,
				className: 'warning',
				issues: ['EMPTY_PASSWORD'],
				lines: [
					'> MASTER_PASSWORD: EMPTY',
					'> Use a long unique password before creating or exporting an .enc file.'
				]
			};
		}
		if (password.length >= 12) score += 2; else issues.push('SHORT_LT_12');
		if (password.length >= 16) score += 1; else issues.push('RECOMMEND_16_PLUS');
		if (password.length >= 24) score += 1;
		if (/[a-z]/.test(password)) score += 1; else issues.push('NO_LOWERCASE');
		if (/[A-Z]/.test(password)) score += 1; else issues.push('NO_UPPERCASE');
		if (/\d/.test(password)) score += 1; else issues.push('NO_NUMBER');
		if (/[^A-Za-z0-9]/.test(password)) score += 1; else issues.push('NO_SYMBOL');
		if (/(.)\1{3,}/.test(password)) issues.push('REPEATED_CHAR');
		if (/password|admin|qwerty|letmein|welcome|bunker|master|secret/i.test(password)) issues.push('COMMON_WORD');
		if (/^(?:1234|abcd|qwer|asdf|zxcv)/i.test(password)) issues.push('SEQUENCE_LIKE');
		const hardIssues = issues.filter(issue => !['RECOMMEND_16_PLUS'].includes(issue));
		let level = 'WEAK';
		let className = 'danger';
		let ok = false;
		if (score >= 7 && !hardIssues.length) {
			level = 'STRONG';
			className = 'success';
			ok = true;
		} else if (score >= 5 && !issues.includes('COMMON_WORD') && !issues.includes('SEQUENCE_LIKE')) {
			level = 'MEDIUM';
			className = 'warning';
		}
		const lines = [
			`> MASTER_PASSWORD: ${level}`,
			'> This password protects an offline .enc file. If the file leaks, attackers can try guesses offline.',
			`ISSUES: ${issues.length ? issues.join(', ') : 'NONE'}`
		];
		if (!ok) lines.push('> Recommended: unique passphrase, 16+ characters, mixed words/symbols/numbers.');
		return { level, ok, className, issues, lines };
	}

	function create(options) {
		const sodium = options.sodium;
		if (!sodium) throw new Error('BUNKER_CORE_NEEDS_SODIUM');

		const appVersion = Number(options.appVersion || 2);
		const textEncoder = options.textEncoder || new TextEncoder();
		const textDecoder = options.textDecoder || new TextDecoder();
		const nowIso = typeof options.nowIso === 'function' ? options.nowIso : () => new Date().toISOString();
		const defaultOpslimit = Number(options.kdfOpslimit || 3);
		const defaultMemlimit = Number(options.kdfMemlimit || 67108864);
		const defaultKdf = Object.freeze({ name: 'argon2id', opslimit: defaultOpslimit, memlimit: defaultMemlimit, alg: 'argon2id13' });

		function appNameForKind(kind) {
			return APP_NAMES[kind] || `Bunker ${String(kind || 'App')}`;
		}

		function expectedEncFormat(kind, version = appVersion) {
			return `bunker-${kind}-v${version}-enc`;
		}

		function aadString(kind, version = appVersion) {
			return `BUNKER|${kind}|v${version}`;
		}

		function aadFor(kind, version = appVersion) {
			return textEncoder.encode(aadString(kind, version));
		}

		function encB64(bytes) {
			return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
		}

		function decB64(value) {
			return sodium.from_base64(value, sodium.base64_variants.ORIGINAL);
		}

		function makeEnvelope(kind, source, kdf, salt, nonce, cipher) {
			const stamp = nowIso();
			return {
				bunker: kind,
				app: appNameForKind(kind),
				version: appVersion,
				format: expectedEncFormat(kind),
				createdAt: source?.createdAt || stamp,
				updatedAt: source?.updatedAt || stamp,
				exportedAt: stamp,
				kdf: kdf || defaultKdf,
				crypto: {
					aead: 'xchacha20poly1305-ietf',
					nonceBytes: sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
					saltBytes: salt.length,
					aad: aadString(kind)
				},
				salt: encB64(salt),
				nonce: encB64(nonce),
				payload: encB64(cipher)
			};
		}

		function parseEnvelope(raw) {
			if (typeof raw === 'string') return JSON.parse(raw.trim());
			return raw;
		}

		function assertEnvelope(envelope, kind) {
			const parsed = parseEnvelope(envelope);
			if (!parsed || parsed.bunker !== kind || parsed.version !== appVersion || parsed.format !== expectedEncFormat(kind)) {
				throw new Error(`INVALID_BUNKER_${String(kind).toUpperCase()}_V${appVersion}_FILE`);
			}
			const aead = parsed.crypto?.aead || parsed.aead;
			if (aead !== 'xchacha20poly1305-ietf' && aead !== 'xchacha20-poly1305-ietf') throw new Error('UNSUPPORTED_CIPHER');
			if (!parsed.kdf || parsed.kdf.name !== 'argon2id') throw new Error('UNSUPPORTED_KDF');
			if (!parsed.salt || !parsed.nonce || !parsed.payload) throw new Error('BROKEN_BUNKER_ENVELOPE');
			return parsed;
		}

		function envelopeSummary(envelope) {
			const parsed = parseEnvelope(envelope);
			return {
				kind: parsed?.bunker || 'unknown',
				app: parsed?.app || appNameForKind(parsed?.bunker),
				version: parsed?.version || 0,
				format: parsed?.format || 'unknown',
				createdAt: parsed?.createdAt || '',
				updatedAt: parsed?.updatedAt || '',
				exportedAt: parsed?.exportedAt || '',
				kdf: parsed?.kdf?.name || 'unknown',
				crypto: parsed?.crypto?.aead || parsed?.aead || 'unknown'
			};
		}


		function inspectEnvelope(raw, expectedKind) {
			let parsed;
			try {
				parsed = parseEnvelope(raw);
			} catch (error) {
				return {
					ok: false,
					level: 'danger',
					issues: ['INVALID_JSON'],
					summary: {},
					lines: ['> HEADER_PREVIEW: INVALID_JSON', '> This file is not a readable Bunker .enc envelope.']
				};
			}

			const summary = envelopeSummary(parsed);
			const issues = [];
			const expectedFormat = expectedKind ? expectedEncFormat(expectedKind) : '';
			if (!parsed || typeof parsed !== 'object') issues.push('INVALID_HEADER');
			if (expectedKind && parsed?.bunker !== expectedKind) issues.push(`APP_MISMATCH_EXPECTED_${String(expectedKind).toUpperCase()}`);
			if (Number(parsed?.version) !== appVersion) issues.push(`SCHEMA_MISMATCH_EXPECTED_V${appVersion}`);
			if (expectedFormat && parsed?.format !== expectedFormat) issues.push(`FORMAT_MISMATCH_EXPECTED_${expectedFormat}`);
			if (parsed?.kdf?.name !== 'argon2id') issues.push('KDF_NOT_ARGON2ID');
			const aead = parsed?.crypto?.aead || parsed?.aead;
			if (aead !== 'xchacha20poly1305-ietf' && aead !== 'xchacha20-poly1305-ietf') issues.push('CIPHER_NOT_XCHACHA20_POLY1305');
			if (!parsed?.salt || !parsed?.nonce || !parsed?.payload) issues.push('MISSING_CRYPTO_PAYLOAD');

			const ok = issues.length === 0;
			const lines = [
				`> HEADER_PREVIEW: ${ok ? 'READY' : 'WARNING'}`,
				`APP: ${summary.app || 'unknown'} (${summary.kind || 'unknown'})`,
				`SCHEMA: v${summary.version || 'unknown'}`,
				`FORMAT: ${summary.format || 'unknown'}`,
				`EXPORTED: ${summary.exportedAt || 'unknown'}`,
				`UPDATED: ${summary.updatedAt || 'unknown'}`,
				`KDF: ${summary.kdf || 'unknown'}`,
				`CRYPTO: ${summary.crypto || 'unknown'}`
			];
			if (!ok) {
				lines.push(`ISSUES: ${issues.join(', ')}`);
				lines.push('> Do not unlock unless this is the intended file.');
			}
			return { ok, level: ok ? 'success' : 'danger', issues, summary, lines };
		}

		function deriveKey(password, salt, params = defaultKdf) {
			return sodium.crypto_pwhash(
				sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
				password,
				salt,
				Number(params.opslimit || defaultOpslimit),
				Number(params.memlimit || defaultMemlimit),
				sodium.crypto_pwhash_ALG_ARGON2ID13
			);
		}

		function encryptPayload(kind, payloadObject, password) {
			const salt = sodium.randombytes_buf(16);
			const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
			const kdf = { ...defaultKdf };
			const key = deriveKey(password, salt, kdf);
			try {
				const plaintext = textEncoder.encode(JSON.stringify(payloadObject));
				const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aadFor(kind), null, nonce, key);
				return makeEnvelope(kind, payloadObject, kdf, salt, nonce, cipher);
			} finally {
				if (key && key.fill) key.fill(0);
			}
		}

		function decryptPayload(kind, envelope, password) {
			const parsed = assertEnvelope(envelope, kind);
			const salt = decB64(parsed.salt);
			const nonce = decB64(parsed.nonce);
			const cipher = decB64(parsed.payload);
			const key = deriveKey(password, salt, parsed.kdf);
			try {
				const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, aadFor(kind), nonce, key);
				return JSON.parse(textDecoder.decode(plaintext));
			} finally {
				if (key && key.fill) key.fill(0);
			}
		}

		function readFileAsText(file) {
			return file.text();
		}

		function downloadText(filename, text, type = 'application/octet-stream') {
			const blob = new Blob([text], { type });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1200);
		}

		function stampName(kind, ext = 'enc') {
			const d = new Date();
			const pad = value => String(value).padStart(2, '0');
			return `bunker-${kind}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
		}

		function escapeHtml(value) {
			return String(value ?? '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		}

		function badgeKind(value) {
			return String(value || 'neutral').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'neutral';
		}

		function badgeHtml(label, kind = 'neutral') {
			return `<span class="bunker-badge bunker-badge-${badgeKind(kind)}" data-kind="${badgeKind(kind)}">${escapeHtml(label)}</span>`;
		}

		function badgesHtml(items = []) {
			return items
				.filter(item => item && item.label)
				.map(item => badgeHtml(item.label, item.kind || item.label))
				.join('');
		}

		function passwordStrength(value) {
			const password = String(value || '');
			let score = 0;
			const issues = [];
			if (!password) return { score: 0, level: 'EMPTY', issues: ['EMPTY_PASSWORD'] };
			if (password.length >= 12) score += 2; else issues.push('SHORT_LT_12');
			if (password.length >= 18) score += 1;
			if (/[a-z]/.test(password)) score += 1; else issues.push('NO_LOWERCASE');
			if (/[A-Z]/.test(password)) score += 1; else issues.push('NO_UPPERCASE');
			if (/\d/.test(password)) score += 1; else issues.push('NO_NUMBER');
			if (/[^A-Za-z0-9]/.test(password)) score += 1; else issues.push('NO_SYMBOL');
			if (/(.)\1{3,}/.test(password)) issues.push('REPEATED_CHAR');
			if (/password|admin|qwerty|letmein|welcome|bunker/i.test(password)) issues.push('COMMON_WORD');
			const level = score <= 3 || issues.includes('COMMON_WORD') ? 'WEAK' : score <= 5 ? 'MEDIUM' : 'STRONG';
			return { score, level, issues };
		}


		function clearClipboardNow() {
			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText('').catch(() => {});
				}
			} catch (error) {}
		}

		function scrubSensitiveDom(root = document) {
			root.querySelectorAll('input[type="password"], input[type="text"], input[type="search"], textarea').forEach(input => {
				if (input.id && /^importEnvelopeSummary$/.test(input.id)) return;
				input.value = '';
			});
			root.querySelectorAll('input[type="file"]').forEach(input => { input.value = ''; });
			root.querySelectorAll('.t-modal.active, .modal.active').forEach(modal => modal.classList.remove('active'));
		}

		function confirmDestructive(action, options = {}) {
			const phrase = String(options.phrase || 'DELETE');
			const label = String(action || 'DESTRUCTIVE ACTION');
			const input = window.prompt([
				`DESTRUCTIVE ACTION: ${label}`,
				'This changes memory immediately and requires a fresh .enc export to persist safely.',
				`Type ${phrase} to continue.`
			].join('\n'), '');
			return input === phrase;
		}

		return Object.freeze({
			appNameForKind,
			expectedEncFormat,
			aadString,
			aadFor,
			encB64,
			decB64,
			makeEnvelope,
			parseEnvelope,
			assertEnvelope,
			envelopeSummary,
			inspectEnvelope,
			deriveKey,
			encryptPayload,
			decryptPayload,
			readFileAsText,
			downloadText,
			stampName,
			badgeHtml,
			badgesHtml,
			passwordStrength,
			masterPasswordAdvice,
			confirmDestructive,
			scrubSensitiveDom,
			clearClipboardNow
		});
	}

	window.BunkerCore = Object.freeze({ create, appNames: APP_NAMES, masterPasswordAdvice });
}());
