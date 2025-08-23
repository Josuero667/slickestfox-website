/* global document, window */
(() => {
	'use strict';

	// ===== DOM helpers =====
	const $ = (sel, root=document) => root.querySelector(sel);
	const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

	// ===== Config =====
	const FADE_IN_MS = 300;
	const FADE_OUT_MS = 2000;
	const FULL_VOL = 0.9;

	// ===== Audio unlock (one click/tap/keypress) =====
	let userInteracted = false;
	function unlockAudio() { userInteracted = true; const g = $('#sound-gate'); if (g) g.remove(); }
	['pointerdown','keydown','touchstart'].forEach(e => document.addEventListener(e, unlockAudio, { once:true, passive:true }));

	// Small chip to hint the unlock (optional)
	function showGate() {
		if ($('#sound-gate')) return;
		const d = document.createElement('div');
		d.id = 'sound-gate';
		d.style.cssText = [
			'position:fixed','left:50%','bottom:18px','transform:translateX(-50%)',
			'z-index:9999','background:rgba(0,0,0,.6)','border:1px solid rgba(255,255,255,.18)',
			'backdrop-filter:saturate(130%) blur(6px)','color:#e9e9ef','padding:10px 14px',
			'border-radius:12px','font:600 14px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
			'cursor:pointer','user-select:none'
		].join(';');
		d.textContent = '🔊 Click to enable sound previews';
		d.addEventListener('click', unlockAudio);
		document.body.appendChild(d);
	}

	// ===== Single shared audio element =====
	const audio = new Audio();
	audio.preload = 'none';
	audio.volume = 0; // we ramp with volume

	// Fade controller (element-volume only = most reliable on file://)
	let fadeRAF = 0;
	function cancelFade() { if (fadeRAF) cancelAnimationFrame(fadeRAF); fadeRAF = 0; }
	function fadeToVolume(target, ms) {
		cancelFade();
		const to = Math.max(0, Math.min(1, target));
		const from = audio.volume;
		const t0 = performance.now();
		function step(t) {
			const p = Math.min(1, (t - t0) / Math.max(1, ms));
			audio.volume = from + (to - from) * p;
			if (p < 1) fadeRAF = requestAnimationFrame(step);
			else fadeRAF = 0;
		}
		fadeRAF = requestAnimationFrame(step);
	}

	// ===== Pulse (BPM + color) =====
	function setPulsing(card, on) { if (card) card.classList.toggle('pulsing', !!on); }
	function setPulsePeriod(card, bpm) {
		if (!card) return;
		const sec = Math.max(0.2, 60 / (Number(bpm) || 120));
		card.style.setProperty('--pulse-period', `${sec}s`);
	}
	function extractCoverColor(url, cb) {
		try {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				try {
					const c = document.createElement('canvas');
					const ctx = c.getContext('2d', { willReadFrequently:true });
					const S = 24; c.width = S; c.height = S;
					ctx.drawImage(img, 0, 0, S, S);
					const data = ctx.getImageData(0,0,S,S).data;
					let r=0,g=0,b=0,n=0;
					for (let i=0;i<data.length;i+=4) {
						const a = data[i+3]/255; r+=data[i]*a; g+=data[i+1]*a; b+=data[i+2]*a; n+=a;
					}
					n = n || 1; r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
					cb(`rgb(${r} ${g} ${b})`);
				} catch { cb('rgb(255 209 102)'); }
			};
			img.onerror = () => cb('rgb(255 209 102)');
			img.src = url;
		} catch { cb('rgb(255 209 102)'); }
	}

	// ===== Playback state =====
	let currentUrl = '';
	let currentCard = null;
	let isFadingOut = false;
	let endFadeArmed = false;

	function armEndFade() { endFadeArmed = true; }
	function cancelEndFade() { endFadeArmed = false; }

	audio.addEventListener('timeupdate', () => {
		if (!endFadeArmed) return;
		const d = audio.duration;
		if (isFinite(d) && d > 0 && (d - audio.currentTime) <= (FADE_OUT_MS/1000 + 0.05)) {
			endFadeArmed = false;
			isFadingOut = true;
			fadeToVolume(0, FADE_OUT_MS);
		}
	});
	audio.addEventListener('ended', () => {
		isFadingOut = false;
		setPulsing(currentCard, false);
	});

	function fadeOutAndPause() {
		cancelEndFade();
		isFadingOut = true;
		fadeToVolume(0, FADE_OUT_MS);
		setTimeout(() => {
			try { audio.pause(); } catch {}
			isFadingOut = false;
			setPulsing(currentCard, false);
		}, FADE_OUT_MS + 30);
	}

	// ===== Core: play with safe fades; never restart same URL =====
	function playPreview(url, { card=null, bpm=120 } = {}) {
		// visuals first → flashes work even before audio unlock
		if (card) { setPulsePeriod(card, bpm); setPulsing(card, true); }
		if (currentCard && currentCard !== card) setPulsing(currentCard, false);
		currentCard = card || currentCard;

		// need one gesture for sound; keep visuals on
		if (!userInteracted) { showGate(); return; }

		// same url while fading out → cancel fade & ramp back; don't restart
		if (url && url === currentUrl && !audio.paused) {
			if (isFadingOut) { isFadingOut = false; fadeToVolume(FULL_VOL, 180); }
			return;
		}

		cancelEndFade();
		isFadingOut = true;
		fadeToVolume(0, Math.min(260, FADE_OUT_MS));

		setTimeout(() => {
			isFadingOut = false;
			currentUrl = url ? encodeURI(url) : '';
			if (!currentUrl) { try { audio.pause(); } catch {} setPulsing(currentCard, false); return; }

			audio.src = currentUrl;
			audio.currentTime = 0;
			audio.play().then(() => {
				fadeToVolume(FULL_VOL, FADE_IN_MS);
				armEndFade();
			}).catch(() => { /* ignore (user gesture not yet?) */ });
		}, 220);
	}

	// ===== Utils =====
	function escapeHTML(str) {
		return String(str)
			.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
			.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
	}
	function escapeAttr(str) {
		return String(str)
			.replace(/&/g,'&amp;').replace(/"/g,'&quot;')
			.replace(/</g,'&lt;').replace(/>/g,'&gt;');
	}
	function setOpen(card, open) {
		const btn = card.querySelector('.toggle-tracks');
		const panel = card.querySelector('.tracklist');
		if (!btn || !panel) return;
		if (open) { card.classList.add('open'); panel.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true'); }
		else { card.classList.remove('open'); panel.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); }
	}

	// ===== Render =====
	function renderGrid(data) {
		const grid = $('#releases-grid');
		if (!grid) return;

		const releases = Array.isArray(data?.releases) ? data.releases : [];
		const frag = document.createDocumentFragment();

		releases.forEach((rel, idx) => {
			const card = document.createElement('article');
			card.className = 'release';

			const idSafe = escapeAttr(rel.id || ('rel-' + idx));
			const title = escapeHTML(rel.title || 'Untitled');
			const year = rel.year ? String(rel.year) : '';
			const cover = (rel.cover || '').replace(/"/g,'&quot;');
			const tracks = Array.isArray(rel.tracks) ? rel.tracks : [];

			card.innerHTML =
				`\t<div class="cover-wrap">
\t\t<div class="cover" style="background-image:url('${cover}')"></div>
\t\t<div class="pulse"></div>
\t\t<div class="shine"></div>
\t</div>
\t<div class="meta">
\t\t<h3 class="title">${title}</h3>
\t\t<p class="year">${year}</p>
\t</div>
\t<button class="toggle-tracks" type="button" aria-expanded="false" aria-controls="list-${idSafe}">Tracklist</button>
\t<div id="list-${idSafe}" class="tracklist" hidden>
\t\t<ul>
\t\t\t${tracks.map(t => `
\t\t\t<li>
\t\t\t\t<button class="track" data-bpm="${Number(t.bpm)||''}" data-preview="${escapeAttr(t.preview_url || '')}" data-spotify="${escapeAttr(t.spotify_url || '')}" type="button" title="Play preview / Open Spotify">
\t\t\t\t\t<span class="dot"></span><span class="name">${escapeHTML(t.title || 'Track')}</span>
\t\t\t\t</button>
\t\t\t</li>`).join('')}
\t\t</ul>
\t\t<div class="album-links">
\t\t\t${rel.spotify_album ? `<a href="${escapeAttr(rel.spotify_album)}" target="_blank" rel="noopener noreferrer">Open album on Spotify ↗</a>` : ''}
\t\t</div>
\t</div>`;

			// tint pulse from cover
			extractCoverColor(rel.cover || '', col => card.style.setProperty('--pulse-color', col));

			// hover → open + random preview
			card.addEventListener('mouseenter', () => {
				card.classList.add('hovering');
				setOpen(card, true);
				const withPrev = tracks.filter(t => (t.preview_url || '').trim() !== '');
				const pick = withPrev.length ? withPrev[Math.floor(Math.random()*withPrev.length)] : null;
				const bpm = pick && Number(pick.bpm) > 0 ? Number(pick.bpm) : 120;
				if (pick) playPreview(pick.preview_url, { card, bpm });
			});
			card.addEventListener('mouseleave', () => {
				card.classList.remove('hovering');
				setOpen(card, false);
				fadeOutAndPause();
			});

			// mobile/any toggle
			const btn = card.querySelector('.toggle-tracks');
			if (btn) {
				btn.addEventListener('click', () => {
					unlockAudio();
					const open = card.classList.contains('open');
					setOpen(card, !open);
					if (!open) {
						const withPrev = tracks.filter(t => (t.preview_url || '').trim() !== '');
						const pick = withPrev.length ? withPrev[Math.floor(Math.random()*withPrev.length)] : null;
						const bpm = pick && Number(pick.bpm) > 0 ? Number(pick.bpm) : 120;
						if (pick) playPreview(pick.preview_url, { card, bpm });
					}
				});
			}

			// track hover / click
			card.addEventListener('mouseover', e => {
                const t = e.target.closest('.track');
                if (!t || !card.contains(t)) return;
				const url = t.getAttribute('data-preview') || '';
				const bpm = Number(t.getAttribute('data-bpm')) || 120;
				if (url) playPreview(url, { card, bpm });
			});
			card.addEventListener('click', e => {
				const t = e.target.closest('.track');
				if (!t || !card.contains(t)) return;
				const link = t.getAttribute('data-spotify');
				if (link) window.open(link, '_blank', 'noopener');
			});

			frag.appendChild(card);
		});

		grid.innerHTML = '';
		grid.appendChild(frag);
	}

	// Close open cards when clicking outside
	document.addEventListener('click', e => {
		const any = $$('.release.open');
		if (!any.length) return;
		const card = e.target.closest('.release');
		if (!card) {
			any.forEach(c => setOpen(c, false));
			fadeOutAndPause();
		}
	});

	// ===== Boot =====
	document.addEventListener('DOMContentLoaded', () => {
		if (location.protocol === 'file:') showGate();
		let data = {};
		try {
			const raw = $('#releases-data')?.textContent || '{}';
			data = JSON.parse(raw);
		} catch { data = { releases: [] }; }
		if (!Array.isArray(data.releases)) data.releases = [];
		renderGrid(data);
	});
})();
