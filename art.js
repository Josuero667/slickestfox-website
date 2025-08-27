/* global document, window */
(() => {
	'use strict';

	// ===== Audio config (point these to your files) =====
	const NOTE_FILES = [
		"assets/audio/notes/1.mp3",
		"assets/audio/notes/2.mp3",
		"assets/audio/notes/3.mp3",
		"assets/audio/notes/4.mp3",
		"assets/audio/notes/5.mp3",
		"assets/audio/notes/6.mp3",
		"assets/audio/notes/7.mp3"
	];
	const CHORD_FILES = [
		"assets/audio/chords/1.mp3",
		"assets/audio/chords/2.mp3",
		"assets/audio/chords/3.mp3",
		"assets/audio/chords/4.mp3",
		"assets/audio/chords/5.mp3",
		"assets/audio/chords/6.mp3",
		"assets/audio/chords/7.mp3"
	];

	const JSON_PATH = "assets/data/images.json";
	const grid = document.getElementById("art-grid");
	const IS_FILE = location.protocol === "file:";

	// ===== Autoplay gate =====
	let userInteracted = false;
	function unlockAudio(){ userInteracted = true; }
	document.addEventListener("click", unlockAudio, { once:true, capture:true });
	["keydown","touchstart","pointerdown"].forEach(ev => {
		document.addEventListener(ev, unlockAudio, { once:true, passive:true });
	});

	// Single players (NO crossOrigin on file://)
	const noteAudio = new Audio();
	noteAudio.preload = "none";
	if (!IS_FILE) noteAudio.crossOrigin = "anonymous";
	noteAudio.volume = 0.9;

	const chordAudio = new Audio();
	chordAudio.preload = "none";
	if (!IS_FILE) chordAudio.crossOrigin = "anonymous";
	chordAudio.volume = 0.95;

	let currentNote = 0;      // 0..6
	let lastHoverItem = null; // avoid retrigger on the same card

	function playNoteFromHover(targetEl){
		if (!userInteracted || !NOTE_FILES.length) return;
		if (lastHoverItem === targetEl && !noteAudio.paused) return;
		lastHoverItem = targetEl;

		// bias: 65% next, 20% stay, 15% previous
		const r = Math.random();
		if (r < 0.65) currentNote = (currentNote + 1) % NOTE_FILES.length;
		else if (r < 0.80) currentNote = currentNote;
		else currentNote = (currentNote - 1 + NOTE_FILES.length) % NOTE_FILES.length;

		try{
			noteAudio.pause();
			noteAudio.currentTime = 0;
			noteAudio.src = NOTE_FILES[currentNote];
			noteAudio.play().catch(()=>{});
		}catch{}
	}

	function playRandomChord(){
		if (!userInteracted || !CHORD_FILES.length) return;
		try{
			const pick = Math.floor(Math.random() * CHORD_FILES.length);
			chordAudio.pause();
			chordAudio.currentTime = 0;
			chordAudio.src = CHORD_FILES[pick];
			chordAudio.play().catch(()=>{});
		}catch{}
	}

	// ===== Manifest load =====
	document.addEventListener("DOMContentLoaded", async () => {
		let manifest = { images: [] };

		if (!IS_FILE) {
			try{
				const res = await fetch(JSON_PATH, { cache: "no-store" });
				if (!res.ok) throw new Error("HTTP " + res.status);
				const data = await res.json();
				if (Array.isArray(data?.images)) manifest = data;
			}catch{}
		}

		// Fallback to inline JSON <script id="art-manifest" type="application/json"> … </script>
		if (!Array.isArray(manifest.images)) {
			try{
				const el = document.getElementById("art-manifest");
				if (el?.textContent?.trim()) {
					const data = JSON.parse(el.textContent);
					if (Array.isArray(data?.images)) manifest = data;
				}
			}catch{}
		}

		render(manifest.images || []);
	});

	// ===== Color helpers =====
	function hexToRGBA(hex, alpha=0.9){
		let h = String(hex||"").trim();
		if (!h) return "";
		if (h.startsWith("#")) h = h.slice(1);
		if (h.length === 3) h = h.split("").map(c=>c+c).join("");
		if (h.length !== 6) return "";
		const r = parseInt(h.slice(0,2),16);
		const g = parseInt(h.slice(2,4),16);
		const b = parseInt(h.slice(4,6),16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function canSampleImageColor(url){
		// Never sample on file:// (will taint canvas).
		if (IS_FILE) return false;
		try{
			const u = new URL(url, location.href);
			return u.origin === location.origin; // only same-origin http(s)
		}catch{ return false; }
	}

	function extractAvgColorFromLoadedImg(imgEl){
		try{
			const c = document.createElement("canvas");
			const S = 24; c.width = S; c.height = S;
			const ctx = c.getContext("2d", { willReadFrequently:true });
			ctx.drawImage(imgEl, 0, 0, S, S);
			const data = ctx.getImageData(0,0,S,S).data;
			let r=0,g=0,b=0,n=0;
			for (let i=0;i<data.length;i+=4){
				const a = data[i+3]/255;
				r += data[i]*a; g += data[i+1]*a; b += data[i+2]*a; n += a;
			}
			n = n||1;
			r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
			const mix = 0.14;
			const rr = Math.round(r + (255-r)*mix);
			const gg = Math.round(g + (255-g)*mix);
			const bb = Math.round(b + (255-b)*mix);
			return `rgba(${rr}, ${gg}, ${bb}, 0.90)`;
		}catch{
			return "rgba(255,209,102,0.90)";
		}
	}

	// ===== Render masonry (no lazy — set src immediately) =====
	function render(items){
		const arr = Array.isArray(items) ? items.slice() : [];
		if (!arr.length){
			grid.innerHTML = `<p class="muted">No images yet. Add some to <code>assets/data/images.json</code> or inline script.</p>`;
			return;
		}

		// sort newest-ish first by src
		arr.sort((a, b) => String(b.src).localeCompare(String(a.src)));

		const frag = document.createDocumentFragment();
		for (const it of arr){
			const a = document.createElement("a");
			a.className = "masonry-item";
			a.href = it.src;
			a.dataset.src = it.src;
			a.dataset.title = it.title || "";

			// Prefer JSON color; fallback later if we can sample
			if (it.color){
				const rgba = hexToRGBA(it.color, 0.90);
				if (rgba) a.style.setProperty("--tint", rgba);
			}

			const img = document.createElement("img");
			img.alt = it.title || "";
			img.decoding = "async";
			// IMPORTANT: don't set crossOrigin on file://
			if (!IS_FILE) img.crossOrigin = "anonymous";
			img.src = it.src;

			// If no JSON color, try sampling only when allowed
			if (!it.color && canSampleImageColor(it.src)){
				if (img.complete && img.naturalWidth){
					a.style.setProperty("--tint", extractAvgColorFromLoadedImg(img));
				}else{
					img.addEventListener("load", () => {
						a.style.setProperty("--tint", extractAvgColorFromLoadedImg(img));
					}, { once:true });
				}
			}

			// Hover note + gradient origin follow pointer
			a.addEventListener("pointerenter", () => { playNoteFromHover(a); });
			a.addEventListener("pointermove", (e) => {
				const r = a.getBoundingClientRect();
				const x = ((e.clientX - r.left) / r.width * 100).toFixed(2) + "%";
				const y = ((e.clientY - r.top) / r.height * 100).toFixed(2) + "%";
				a.style.setProperty("--gx", x);
				a.style.setProperty("--gy", y);
			});
			// Click → chord (lightbox opens below)
			a.addEventListener("click", () => { playRandomChord(); });

			a.appendChild(img);
			frag.appendChild(a);
		}
		grid.innerHTML = "";
		grid.appendChild(frag);

		wireLightbox();
	}

	// ===== Lightbox =====
	function wireLightbox(){
		const lb = document.getElementById("lightbox");
		const lbImg = document.getElementById("lb-img");
		const lbCap = document.getElementById("lb-cap");
		const btn = lb.querySelector(".lb-close");

		grid.addEventListener("click", (e) => {
			const a = e.target.closest(".masonry-item");
			if (!a) return;
			e.preventDefault();
			lbImg.src = a.dataset.src;
			lbImg.alt = a.dataset.title || "";
			lbCap.textContent = a.dataset.title || "";
			lb.hidden = false;
			document.documentElement.classList.add("no-scroll");
		});

		function close(){
			lb.hidden = true;
			lbImg.src = "";
			document.documentElement.classList.remove("no-scroll");
		}
		btn.addEventListener("click", close);
		lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
		document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lb.hidden) close(); });
	}
})();
