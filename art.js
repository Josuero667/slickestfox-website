/* global document, window */
(() => {
	'use strict';

	// Prefer inline JSON when present (works on file://), otherwise fetch
	const JSON_PATH = "assets/data/images.json";

	// ---------- DOM ----------
	const grid = document.getElementById("art-grid");
	const IS_FILE = location.protocol === "file:";

	// ---------- Audio gate ----------
	let userInteracted = false;
	const unlock = () => { userInteracted = true; };
	["pointerdown","touchstart","keydown","click"].forEach(ev =>
		document.addEventListener(ev, unlock, { once:true, passive:true })
	);

	// Single audio elements (no crossOrigin on file:// to avoid CORS)
	const noteAudio = new Audio();
	noteAudio.preload = "none";
	if (!IS_FILE) noteAudio.crossOrigin = "anonymous";
	noteAudio.volume = 0.9;

	const chordAudio = new Audio();
	chordAudio.preload = "none";
	if (!IS_FILE) chordAudio.crossOrigin = "anonymous";
	chordAudio.volume = 0.95;

	const sfxAudio = new Audio();
	sfxAudio.preload = "none";
	if (!IS_FILE) sfxAudio.crossOrigin = "anonymous";
	sfxAudio.volume = 1.0;

	function duckNotes(amount = 0.6, duration = 500){
	  const restores = [];
	  for (const a of playingNotes){
		const prev = a.volume;
		a.volume = Math.max(0, prev * amount);
		restores.push(()=>{ if (!a.paused) a.volume = prev; });
	  }
	  setTimeout(()=>restores.forEach(fn=>fn()), duration);
	}

	// ---------- Note stepping + SFX burst ----------
	let currentNote = 0;               // 0..6
	let lastHoverEl = null;

	const NOTE_BURST_WINDOW_MS = 1000;  // time window for burst
	const NOTE_BURST_THRESHOLD  = 10;   // notes inside window → trigger SFX
	const SFX_COOLDOWN_MS       = 2500;
	let noteTimes = [];
	let lastSfxAt = 0;

	function registerNoteAndMaybeSfx(){
		const now = performance.now();
		noteTimes.push(now);
		// keep only events in window
		noteTimes = noteTimes.filter(t => now - t <= NOTE_BURST_WINDOW_MS);
		if (noteTimes.length >= NOTE_BURST_THRESHOLD && (now - lastSfxAt) > SFX_COOLDOWN_MS){
		  lastSfxAt = now;

		  // don't stop everything — just duck what's playing:
		  duckNotes(0.2, 520);

		  // play a fun SFX over the ducked bed
		  const s = new Audio();
		  if (!IS_FILE) s.crossOrigin = "anonymous";
		  s.src = SFX_URLS[(Math.random()*SFX_URLS.length)|0];
		  s.volume = 1.0;
		  s.play().catch(()=>{});

		  noteTimes.length = 0;
		}
	}

	function playRandomSfx(){
		if (!userInteracted || !SFX_FILES.length) return;
		try{
			const pick = Math.floor(Math.random() * SFX_FILES.length);
			sfxAudio.pause(); sfxAudio.currentTime = 0;
			sfxAudio.src = SFX_FILES[pick];
			sfxAudio.play().catch(()=>{});
		}catch{}
	}

	// ---------- Weighted chord picker (I/IV/V favored) ----------
	// Weights sum ~1.00; tweak to taste
	const CHORD_WEIGHTS = [0.28, 0.10, 0.08, 0.22, 0.22, 0.09, 0.01]; // I,ii,iii,IV,V,vi,vii°
	function weightedPick(weights){
		const r = Math.random();
		let acc = 0;
		for (let i=0;i<weights.length;i++){
			acc += weights[i];
			if (r <= acc) return i;
		}
		return weights.length - 1;
	}

	// ---------- Color helpers ----------
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
		if (IS_FILE) return false; // canvas would be tainted on file://
		try{
			const u = new URL(url, location.href);
			return u.origin === location.origin;
		}catch{ return false; }
	}
	function avgColorFromLoadedImg(img){
		try{
			const c = document.createElement("canvas");
			const S = 24; c.width = S; c.height = S;
			const ctx = c.getContext("2d", { willReadFrequently:true });
			ctx.drawImage(img, 0, 0, S, S);
			const d = ctx.getImageData(0,0,S,S).data;
			let r=0,g=0,b=0,n=0;
			for (let i=0;i<d.length;i+=4){
				const a = d[i+3]/255;
				r += d[i]*a; g += d[i+1]*a; b += d[i+2]*a; n += a;
			}
			n = n||1;
			r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
			const mix = 0.14; // lift towards white a touch
			const rr = Math.round(r + (255-r)*mix);
			const gg = Math.round(g + (255-g)*mix);
			const bb = Math.round(b + (255-b)*mix);
			return `rgba(${rr}, ${gg}, ${bb}, 0.90)`;
		}catch{ return "rgba(255,209,102,0.90)"; }
	}

	// ---------- Sounds ----------
	function playHoverNote(el){
		if (!userInteracted || !NOTE_FILES.length) return;
		if (lastHoverEl === el && !noteAudio.paused) return; // don't retrigger while same one is still sounding
		lastHoverEl = el;

		// step with bias: 65% next, 20% stay, 15% previous
		const r = Math.random();
		if (r < 0.65) currentNote = (currentNote + 1) % NOTE_FILES.length;
		else if (r < 0.85) currentNote = currentNote;
		else currentNote = (currentNote - 1 + NOTE_FILES.length) % NOTE_FILES.length;

		try{
			noteAudio.pause();
			noteAudio.currentTime = 0;
			noteAudio.src = NOTE_FILES[currentNote];
			noteAudio.play().then(()=>{
				// tiny visual ping when sound starts
				el.classList.add("playing");
				setTimeout(()=>el.classList.remove("playing"), 220);
			}).catch(()=>{});
		}catch{}

		registerNoteAndMaybeSfx();
	}
	function playWeightedChord(){
		if (!userInteracted || !CHORD_FILES.length) return;
		try{
			const idx = weightedPick(CHORD_WEIGHTS);
			chordAudio.pause(); chordAudio.currentTime = 0;
			chordAudio.src = CHORD_FILES[idx];
			chordAudio.play().catch(()=>{});
		}catch{}
	}

	// ---------- Render ----------
	function render(items){
		const arr = Array.isArray(items) ? items.slice() : [];
		if (!arr.length){
			grid.innerHTML = `<p class="muted">No images yet. Add some to <code>assets/data/images.json</code> or inline script.</p>`;
			return;
		}
		// newest-ish first
		arr.sort((a,b)=>String(b.src).localeCompare(String(a.src)));

		const frag = document.createDocumentFragment();
		for (const it of arr){
			const a = document.createElement("a");
			a.className = "masonry-item";
			a.href = it.src;
			a.dataset.src = it.src;
			a.dataset.title = it.title || "";

			// set default gradient origin (bottom-ish) & tint
			a.style.setProperty("--gx", "50%");
			a.style.setProperty("--gy", "85%");
			if (it.color){
				const rgba = hexToRGBA(it.color, 0.90);
				if (rgba) a.style.setProperty("--tint", rgba);
			}

			const img = document.createElement("img");
			img.alt = it.title || "";
			img.decoding = "async";
			if (!IS_FILE) img.crossOrigin = "anonymous";
			img.src = it.src;

			// fallback: sample tint if allowed and not provided
			if (!it.color && canSampleImageColor(it.src)){
				if (img.complete && img.naturalWidth){
					a.style.setProperty("--tint", avgColorFromLoadedImg(img));
				}else{
					img.addEventListener("load", ()=> {
						a.style.setProperty("--tint", avgColorFromLoadedImg(img));
					}, { once:true });
				}
			}

			// interactions
			a.addEventListener("pointerenter", ()=> playHoverNote(a));
			a.addEventListener("pointerleave", ()=> { if (lastHoverEl === a) lastHoverEl = null; });
			a.addEventListener("pointermove", (e)=>{
				const r = a.getBoundingClientRect();
				const x = ((e.clientX - r.left) / r.width * 100).toFixed(2) + "%";
				const y = ((e.clientY - r.top)  / r.height* 100).toFixed(2) + "%";
				a.style.setProperty("--gx", x);
				a.style.setProperty("--gy", y);
			});
			a.addEventListener("click", (e)=>{
				// Let the lightbox open (your CSS/HTML handles it), but also play a chord
				e.preventDefault();
				playWeightedChord();
				openLightbox(a.dataset.src, a.dataset.title || "");
			});

			a.appendChild(img);
			frag.appendChild(a);
		}
		grid.innerHTML = "";
		grid.appendChild(frag);

		wireLightbox(); // hook close/esc once
	}

	// ---------- Lightbox (simple) ----------
	function wireLightbox(){
		const lb = document.getElementById("lightbox");
		const lbImg = document.getElementById("lb-img");
		const lbCap = document.getElementById("lb-cap");
		const btn = lb.querySelector(".lb-close");

		function close(){
			lb.hidden = true;
			lbImg.src = "";
			document.documentElement.classList.remove("no-scroll");
		}
		btn.addEventListener("click", close);
		lb.addEventListener("click", (e)=>{ if (e.target === lb) close(); });
		document.addEventListener("keydown", (e)=>{ if (e.key === "Escape" && !lb.hidden) close(); });
	}

	function openLightbox(src, title){
		const lb = document.getElementById("lightbox");
		const lbImg = document.getElementById("lb-img");
		const lbCap = document.getElementById("lb-cap");
		lbImg.src = src;
		lbImg.alt = title;
		lbCap.textContent = title;
		lb.hidden = false;
		document.documentElement.classList.add("no-scroll");
	}

	// ---------- Manifest load order (inline first for file://) ----------
	function readInlineManifest(){
		// support either id
		const elA = document.getElementById("art-manifest");
		const elB = document.getElementById("images-data");
		const raw = (elA && elA.textContent?.trim()) || (elB && elB.textContent?.trim()) || "";
		if (!raw) return null;
		try{
			const obj = JSON.parse(raw);
			return Array.isArray(obj?.images) ? obj : null;
		}catch{ return null; }
	}

	document.addEventListener("DOMContentLoaded", async () => {
		// 1) Try inline JSON (works locally)
		let inline = readInlineManifest();
		if (inline){
			render(inline.images);
			return;
		}

		// 2) If served via http(s), try to fetch the file
		if (!IS_FILE){
			try{
				const res = await fetch(JSON_PATH, { cache:"no-store" });
				if (res.ok){
					const data = await res.json();
					if (Array.isArray(data?.images)){ render(data.images); return; }
				}
			}catch{}
		}

		// 3) Fallback: nothing found
		render([]);
	});
})();
