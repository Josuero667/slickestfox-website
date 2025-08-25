/* global document, window, IntersectionObserver */
(() => {
	'use strict';

	// ===== Detect repo for GitHub Pages, else use defaults =====
	function guessRepoInfo(){
		let owner = 'josuero667';		// << change if different
		let repo = 'slickestfox-website';	// << change if different
		let branch = 'main';
		try{
			const { hostname, pathname } = window.location;
			if (hostname.endsWith('github.io')) {
				owner = hostname.split('.')[0] || owner;
				const parts = pathname.split('/').filter(Boolean);
				if (parts.length) repo = parts[0];
			}
		}catch{}
		return { owner, repo, branch };
	}

	const grid = document.getElementById('art-grid');

	// ===== Boot loader =====
	document.addEventListener('DOMContentLoaded', async () => {
		let items = [];

		if (location.protocol !== 'file:') {
			items = await tryGitHubFolder('assets/art/');
		}

		// Fallback to inline manifest on file:// or if API fails
		if (!items.length) {
			try {
				const el = document.getElementById('art-manifest');
				if (el?.textContent?.trim()) {
					const data = JSON.parse(el.textContent);
					if (Array.isArray(data?.images)) {
						items = data.images.map(x => ({ src: x.src, title: x.title || '' }));
					}
				}
			} catch {}
		}

		render(items);
	});

	// ===== GitHub API directory listing (top-level of assets/art) =====
	async function tryGitHubFolder(folderPath){
		const { owner, repo, branch } = guessRepoInfo();
		// /contents returns top-level listing (not recursive), perfect for a single folder
		const url = `https://api.github.com/repos/${owner}/${repo}/contents/${folderPath}?ref=${branch}`;
		try{
			const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
			if (!res.ok) throw new Error('HTTP '+res.status);
			const arr = await res.json();
			if (!Array.isArray(arr)) return [];
			const exts = new Set(['.jpg','.jpeg','.png','.webp','.avif','.gif']);
			const files = arr
				.filter(it => it.type === 'file' && exts.has(extOf(it.name)))
				.map(it => {
					// prefer relative repo path so it works on custom domains too
					return { src: it.path, title: niceTitle(it.name) };
				});
			// newest-ish first by name
			files.sort((a, b) => String(b.src).localeCompare(String(a.src)));
			return files;
		}catch{
			return [];
		}
	}

	function extOf(name){
		const i = name.lastIndexOf('.');
		return i >= 0 ? name.slice(i).toLowerCase() : '';
	}
	function niceTitle(name){
		return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
	}

	// ===== render masonry =====
	function render(items){
		if (!items || !items.length){
			grid.innerHTML = `<p class="muted">No images yet. Add files to <code>assets/art/</code>.</p>`;
			return;
		}

		// make them relative to page, no leading slash
		const frag = document.createDocumentFragment();
		for (const it of items){
			const rel = String(it.src).replace(/^\//,''); // ensure relative path
			const a = document.createElement('a');
			a.className = 'masonry-item';
			a.href = rel;
			a.dataset.src = rel;
			a.dataset.title = it.title || '';

			const img = document.createElement('img');
			img.loading = 'lazy';
			img.decoding = 'async';
			img.alt = it.title || '';
			img.dataset.src = rel; // lazy

			a.appendChild(img);
			frag.appendChild(a);
		}
		grid.innerHTML = '';
		grid.appendChild(frag);

		lazyLoadImages();
		wireLightbox();
	}

	// ===== lazy loader =====
	function lazyLoadImages(){
		const imgs = Array.from(grid.querySelectorAll('img[data-src]'));
		if (!imgs.length) return;

		if ('IntersectionObserver' in window){
			const io = new IntersectionObserver((entries, obs) => {
				for (const e of entries){
					if (!e.isIntersecting) continue;
					const img = e.target;
					img.src = img.dataset.src;
					img.removeAttribute('data-src');
					obs.unobserve(img);
				}
			}, { rootMargin: '200px' });
			imgs.forEach(img => io.observe(img));
		}else{
			imgs.forEach(img => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
		}
	}

	// ===== lightbox =====
	function wireLightbox(){
		const lb = document.getElementById('lightbox');
		const lbImg = document.getElementById('lb-img');
		const lbCap = document.getElementById('lb-cap');
		const btn = lb.querySelector('.lb-close');

		grid.addEventListener('click', (e) => {
			const a = e.target.closest('.masonry-item');
			if (!a) return;
			e.preventDefault();
			lbImg.src = a.dataset.src;
			lbImg.alt = a.dataset.title || '';
			lbCap.textContent = a.dataset.title || '';
			lb.hidden = false;
			document.documentElement.classList.add('no-scroll');
		});

		function close(){
			lb.hidden = true;
			lbImg.src = '';
			document.documentElement.classList.remove('no-scroll');
		}
		btn.addEventListener('click', close);
		lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
		document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lb.hidden) close(); });
	}
})();
