/* global document, window */
(function () {
	'use strict';

	// Basic env detection for mobile-style interaction (no hover)
	var isMobile = (window.matchMedia && window.matchMedia('(hover: none)').matches) || false;

	// ========= tiny DOM helpers =========
	function $(sel, root) { return (root || document).querySelector(sel); }
	function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

	// ========= config =========
	var FADE_IN_MS = 300;
	var FADE_OUT_MS = 500;
	// Global site volume/mute keys (shared with pages)
	var LS_MUTE_KEY = 'siteAudioMuted';
	var LS_VOL_KEY = 'siteAudioVolume';
	function loadSitePrefs(){
		var muted = false, vol = 0.5;
		try {
			var m = localStorage.getItem(LS_MUTE_KEY);
			var v = localStorage.getItem(LS_VOL_KEY);
			if (m !== null) muted = (m === '1');
			if (v !== null) {
				var nv = Math.max(0, Math.min(1, parseFloat(v)));
				if (!isNaN(nv)) vol = nv;
			}
		} catch {}
		return { muted: muted, vol: vol };
	}
	function targetVolume(){ var p = loadSitePrefs(); return p.muted ? 0 : p.vol; }
	var LEAVE_GRACE_MS = 0;            // close tracklist / stop a bit after leaving card
	var MIN_DURATION_FOR_END_FADE = 6;   // only near-end fade long clips

	// ========= first gesture gate =========
	var userInteracted = false;
	function unlockAudio(){ userInteracted = true; var g=$('#sound-gate'); if (g) g.parentNode.removeChild(g); }
	['pointerdown','keydown','touchstart'].forEach(function(e){
		document.addEventListener(e, unlockAudio, { once:true, passive:true });
	});
	function showGate(){
		if ($('#sound-gate')) return;
		var d=document.createElement('div');
		d.id='sound-gate';
		d.style.cssText=[
			'position:fixed','left:50%','bottom:18px','transform:translateX(-50%)',
			'z-index:9999','background:rgba(0,0,0,.6)','border:1px solid rgba(255,255,255,.18)',
			'backdrop-filter:saturate(130%) blur(6px)','color:#e9e9ef','padding:10px 14px',
			'border-radius:12px','font:600 14px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
			'cursor:pointer','user-select:none'
		].join(';');
		d.textContent='🔊 Click to enable sound previews';
		d.addEventListener('click', unlockAudio);
		document.body.appendChild(d);
	}

	// ========= audio (single <audio> with element-volume fades) =========
	var audio = new Audio();
	audio.preload = 'none';
	// initialize to saved prefs
	(function(){ var p = loadSitePrefs(); audio.volume = p.muted ? 0 : p.vol; audio.muted = !!p.muted; })();

	// (SFX removed by request)

	var fadeRAF = 0;
	function cancelFade(){ if (fadeRAF) cancelAnimationFrame(fadeRAF); fadeRAF = 0; }
	function fadeToVolume(target, ms){
		cancelFade();
		var to = Math.max(0, Math.min(1, target));
		var from = audio.volume;
		var t0 = performance.now();
		function step(t){
			var p = Math.min(1, (t - t0) / Math.max(1, ms));
			audio.volume = from + (to - from) * p;
			if (p < 1) fadeRAF = requestAnimationFrame(step);
			else fadeRAF = 0;
		}
		fadeRAF = requestAnimationFrame(step);
	}

	// ========= simple global flash (glow only; no dots for reliability) =========
	var flashRoot = null;
	var nowPlayingEl = null;

	function ensureFlashRoot(){
		if (flashRoot) return;
		flashRoot = document.createElement('div');
		flashRoot.id = 'global-flash';
		flashRoot.innerHTML = '\t<div class="glow"></div>';
		document.body.insertBefore(flashRoot, document.body.firstChild);
	}

	function startGlobalFlash(color, periodSec){
		ensureFlashRoot();
		document.documentElement.style.setProperty('--pulse-color-global', color || '#ffd166');
		document.documentElement.style.setProperty('--pulse-period-global', (Math.max(0.25, periodSec||0.6)) + 's');
		flashRoot.classList.add('on');
	}
	function stopGlobalFlash(){
		if (flashRoot) flashRoot.classList.remove('on');
		if (nowPlayingEl) nowPlayingEl.classList.remove('show');
	}

	// now-playing (bottom-left)
	function ensureNowPlaying(){
		if (nowPlayingEl) return;
		nowPlayingEl = document.createElement('div');
		nowPlayingEl.id = 'now-playing-text';
		document.body.appendChild(nowPlayingEl);
	}
	function setNowPlaying(trackTitle, releaseTitle, color, singleRelease){
		ensureNowPlaying();
		var text = singleRelease ? releaseTitle : (trackTitle ? (trackTitle + ' - ' + releaseTitle) : releaseTitle);
		nowPlayingEl.textContent = '♩ Now Playing: ' + text;
		nowPlayingEl.style.setProperty('--np-color', color || '#ffd166');
		nowPlayingEl.classList.add('show');
	}
	function hideNowPlaying(){ if (nowPlayingEl) nowPlayingEl.classList.remove('show'); }

	// ========= per-card pulse helpers =========
	function setPulsing(card, on){ if (card) card.classList.toggle('pulsing', !!on); }
	function setPulsePeriod(card, bpm){
		if (!card) return 0.6;
		var sec = Math.max(0.25, 60 / (Number(bpm) || 120));
		card.style.setProperty('--pulse-period', sec + 's');
		return sec;
	}

	// ========= recolor helpers (global hue for non-hover covers) =========
	function parseHex(c){
		c = String(c||'').trim();
		if (!c) return null;
		if (c[0] === '#') c = c.slice(1);
		if (c.length === 3){
			var r = parseInt(c[0]+c[0],16), g = parseInt(c[1]+c[1],16), b = parseInt(c[2]+c[2],16);
			if (isFinite(r)&&isFinite(g)&&isFinite(b)) return {r:r,g:g,b:b};
		}
		if (c.length === 6){
			var r6 = parseInt(c.slice(0,2),16), g6 = parseInt(c.slice(2,4),16), b6 = parseInt(c.slice(4,6),16);
			if (isFinite(r6)&&isFinite(g6)&&isFinite(b6)) return {r:r6,g:g6,b:b6};
		}
		return null;
	}
	function parseColorToHue(str){
		if (!str) return 0;
		// hex
		var rgb = parseHex(str);
		if (!rgb && /^rgb/i.test(str)){
			var m = str.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
			if (m){ rgb = { r: +m[1], g: +m[2], b: +m[3] }; }
		}
		if (!rgb && /^hsl/i.test(str)){
			var hm = str.match(/hsl\s*\(\s*([\-\d\.]+)\s*[,\s]/i);
			if (hm){ return ((+hm[1])%360+360)%360; }
		}
		if (!rgb) return 0;
		var r = rgb.r/255, g=rgb.g/255, b=rgb.b/255;
		var max = Math.max(r,g,b), min = Math.min(r,g,b);
		var h = 0, d = max - min;
		if (d === 0) h = 0;
		else if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h = Math.round(((h * 60) + 360) % 360);
		return h;
	}

	var BASE_SEPIA_HUE = 30; // CSS sepia(1) hue baseline is ~30deg (orange)
	function setRecolorForCard(card, colorStr){
		var hue = parseColorToHue(colorStr);
		var angle = ((hue - BASE_SEPIA_HUE) % 360 + 360) % 360;
		document.documentElement.style.setProperty('--recolor-angle', angle + 'deg');
		// Match audio fade-in time for visual recolor
		document.body.style.setProperty('--recolor-ms', (FADE_IN_MS|0) + 'ms');
		document.body.classList.add('recolor-active');
	}
	function clearRecolorForCard(card){
		// Use audio fade-out time for visual recolor fade
		document.body.style.setProperty('--recolor-ms', (FADE_OUT_MS|0) + 'ms');
		// Reset hue so base image colors are restored exactly
		document.documentElement.style.setProperty('--recolor-angle', '0deg');
		document.body.classList.remove('recolor-active');
	}

	// ========= playback state =========
	var currentUrl = '';
	var currentCard = null;
	var isFadingOut = false;
	var endFadeArmed = false;
	var endFadeAllowed = false;
	var leaveTimers = new WeakMap(); // card -> timeout
	// Guard against late timeouts from previous hovers cutting new audio
	var pauseTimer = 0;     // setTimeout id for fadeOutAndPause
	var startTimer = 0;     // setTimeout id for deferred start in playPreview
	var sessionId = 0;      // increments on each new play to invalidate old timers

	function normalize(url){ return encodeURI(String(url || '').trim()); }
	function armEndFade(){ if (endFadeAllowed) endFadeArmed = true; }
	function cancelEndFade(){ endFadeArmed = false; }

	audio.addEventListener('timeupdate', function(){
		if (!endFadeArmed) return;
		var d = audio.duration;
		if (!isFinite(d) || d <= 0) return;
		if (d < MIN_DURATION_FOR_END_FADE) return;
		var cap = FADE_OUT_MS / 1000;
		var th = Math.min(cap, d * 0.25);
		if ((d - audio.currentTime) <= th && audio.volume > 0.01){
			endFadeArmed = false;
			isFadingOut = true;
			fadeToVolume(0, FADE_OUT_MS);
		}
	});
	audio.addEventListener('ended', function(){
		isFadingOut = false;
		setPulsing(currentCard, false);
		stopGlobalFlash();
		hideNowPlaying();
		// ensure visuals fully reset when audio ends naturally
		clearRecolorForCard(null);
	});

	function fadeOutAndPause(){
		cancelEndFade();
		isFadingOut = true;
		fadeToVolume(0, FADE_OUT_MS);
		if (pauseTimer){ clearTimeout(pauseTimer); pauseTimer = 0; }
		var sid = sessionId;
		pauseTimer = setTimeout(function(){
			// If a new session started after this timeout was queued, ignore
			if (sid !== sessionId) return;
			try{ audio.pause(); }catch(e){}
			isFadingOut = false;
			setPulsing(currentCard, false);
			stopGlobalFlash();
			hideNowPlaying();
			// final safety: ensure recolor fades out when we stop previews
			clearRecolorForCard(null);
			pauseTimer = 0;
		}, FADE_OUT_MS + 30);
	}

	// ========= core play =========
	function playPreview(url, opts){
		opts = opts || {};
		var card = opts.card || null;
		var bpm = opts.bpm || 120;
		var autoEndFade = !!opts.autoEndFade;
		var trackTitle = opts.trackTitle || '';
		var releaseTitle = opts.releaseTitle || '';
		var singleRelease = !!opts.singleRelease;
		var flashColor = opts.flashColor || (card ? (card.dataset.flashColor || '').trim() : '');

		if (card) setPulsing(card, true);
		if (currentCard && currentCard !== card) setPulsing(currentCard, false);
		currentCard = card || currentCard;

			if (!userInteracted){
				// On desktop, attempt autoplay; if it fails the play() promise will reject gracefully.
				// On mobile, require explicit tap and show gate.
				if (isMobile) { showGate(); return; }
			}

		var candidate = normalize(url);
		if (!candidate) return;

		// same URL → don't restart; just bring it back up and update flash/label
		if (candidate === currentUrl && !audio.paused){
			if (isFadingOut){ isFadingOut = false; fadeToVolume(targetVolume(), 180); }
			var sec0 = setPulsePeriod(card, bpm) || 0.6;
			var color0 = flashColor || (getComputedStyle(card).getPropertyValue('--pulse-color').trim() || '#ffd166');
			startGlobalFlash(color0, sec0);
			setNowPlaying(trackTitle, releaseTitle, color0, singleRelease);
			return;
		}

		// Cancel any pending pause from a previous card hover
		if (pauseTimer){ clearTimeout(pauseTimer); pauseTimer = 0; }
		// Cancel any pending start from a previous quick switch
		if (startTimer){ clearTimeout(startTimer); startTimer = 0; }
		cancelEndFade();
		endFadeAllowed = !!autoEndFade;

		var sec = setPulsePeriod(card, bpm) || 0.6;
		var color = flashColor || (getComputedStyle(card).getPropertyValue('--pulse-color').trim() || '#ffd166');

		// New session: invalidate any previously queued fadeOutAndPause
		sessionId++;
		isFadingOut = true;
		fadeToVolume(0, 180);

		var sid = sessionId;
		startTimer = setTimeout(function(){
			// if a newer play session started, abandon this start
			if (sid !== sessionId) return;
			isFadingOut = false;
			currentUrl = candidate;
			audio.src = currentUrl;
			audio.currentTime = 0;
			audio.onloadedmetadata = function(){
				if (sid !== sessionId) return;
				endFadeAllowed = autoEndFade && isFinite(audio.duration) && audio.duration >= MIN_DURATION_FOR_END_FADE;
			};
			audio.play().then(function(){
				if (sid !== sessionId) return;
				fadeToVolume(targetVolume(), FADE_IN_MS);
				armEndFade();
				startGlobalFlash(color, sec);
				setNowPlaying(trackTitle, releaseTitle, color, singleRelease);
			}).catch(function(){ if (!userInteracted) showGate(); });
			startTimer = 0;
		}, 140);
	}

	// Reflect changes from other tabs or from page UI controls
	window.addEventListener('storage', function(e){
		if (!audio) return;
		if (e.key === LS_MUTE_KEY && e.newValue != null){
			audio.muted = (e.newValue === '1');
			if (!audio.muted && audio.paused){ /* do not auto-play previews */ }
		}
		if (e.key === LS_VOL_KEY && e.newValue != null){
			var v = Math.max(0, Math.min(1, parseFloat(e.newValue)));
			if (!isNaN(v)){
				if (!audio.muted){ audio.volume = v; }
			}
		}
	});

	// ========= utils =========
	function escapeHTML(str){
		return String(str)
			.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
			.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
	}
	function escapeAttr(str){
		return String(str)
			.replace(/&/g,'&amp;').replace(/"/g,'&quot;')
			.replace(/</g,'&lt;').replace(/>/g,'&gt;');
	}
function setOpen(card, open){
    var btn = card.querySelector('.toggle-tracks');
    var panel = card.querySelector('.tracklist');
    if (!btn || !panel) return;
    if (open){ card.classList.add('open'); panel.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true'); }
    else { card.classList.remove('open'); panel.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); }
}

// Close all other open release tracklists except the provided card
function closeOtherLists(exceptCard){
    var openCards = $$('.release.open');
    openCards.forEach(function(c){ if (c !== exceptCard) setOpen(c, false); });
}

	// ========= render grid =========
	function renderGrid(data){
		var grid = $('#releases-grid');
		if (!grid){
			var container = $('.container') || document.body;
			grid = document.createElement('div');
			grid.id = 'releases-grid';
			grid.className = 'releases-grid';
			container.appendChild(grid);
		}

		var releases = (data && Array.isArray(data.releases)) ? data.releases : [];
		var frag = document.createDocumentFragment();

		releases.forEach(function(rel, idx){
			var card = document.createElement('article');
			card.className = 'release';

			var idSafe = escapeAttr(rel.id || ('rel-' + idx));
			var title = escapeHTML(rel.title || 'Untitled');
			var year = rel.year ? String(rel.year) : '';
			var cover = (rel.cover || '').replace(/"/g,'&quot;');
			var tracks = Array.isArray(rel.tracks) ? rel.tracks : [];
			var single = tracks.length === 1;

			// prefer JSON flash_color; fallback to cover average later
			var flashColor = (rel && typeof rel.flash_color === 'string') ? rel.flash_color.trim() : '';
			if (flashColor){ card.dataset.flashColor = flashColor; card.style.setProperty('--pulse-color', flashColor); }

			// build markup: if single track → no dropdown markup at all
			var html =
				'\t<div class="cover-wrap">\n' +
				'\t\t<div class="cover" style="background-image:url(\'' + cover + '\')"></div>\n' +
				'\t\t<div class="pulse"></div>\n' +
				'\t\t<div class="shine"></div>\n' +
				'\t</div>\n' +
				'\t<div class="meta">\n' +
				'\t\t<h3 class="title">' + title + '</h3>\n' +
				'\t\t<p class="year">' + year + '</p>\n' +
				'\t</div>\n';

			if (!single){
				html +=
				'\t<button class="toggle-tracks" type="button" aria-expanded="false" aria-controls="list-' + idSafe + '">Tracklist</button>\n' +
				'\t<div id="list-' + idSafe + '" class="tracklist" hidden>\n' +
				'\t\t<ul>\n' +
				(tracks.map(function (t) {
					return '\t\t\t<li>\n' +
						'\t\t\t\t<button class="track" data-bpm="' + (Number(t.bpm) || '') + '" data-preview="' + escapeAttr(t.preview_url || '') + '" data-spotify="' + escapeAttr(t.spotify_url || '') + '" type="button" title="Play preview / Open Spotify">\n' +
						'\t\t\t\t\t<span class="dot"></span><span class="name">' + escapeHTML(t.title || 'Track') + '</span>\n' +
						'\t\t\t\t</button>\n' +
						'\t\t\t</li>\n';
				}).join('')) +
				'\t\t</ul>\n' +
				'\t\t<div class="album-links">\n' +
				(rel.spotify_album ? ('\t\t\t<a href="' + escapeAttr(rel.spotify_album) + '" target="_blank" rel="noopener noreferrer">Open album on Spotify ↗</a>\n') : '') +
				'\t\t</div>\n' +
				'\t</div>\n';
			}
			card.innerHTML = html;

			// if no explicit flash_color, compute once from cover
			if (!flashColor){
				var img = new Image();
				img.crossOrigin = 'anonymous';
				img.onload = function(){
					try{
						var c = document.createElement('canvas');
						var ctx = c.getContext('2d', { willReadFrequently:true });
						var S=24; c.width=S; c.height=S;
						ctx.drawImage(img,0,0,S,S);
						var d = ctx.getImageData(0,0,S,S).data;
						var r=0,g=0,b=0,n=0;
						for (var i=0;i<d.length;i+=4){ var a=d[i+3]/255; r+=d[i]*a; g+=d[i+1]*a; b+=d[i+2]*a; n+=a; }
						n=n||1; r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
						card.style.setProperty('--pulse-color','rgb('+r+' '+g+' '+b+')');
					}catch(e){}
				};
				img.src = rel.cover || '';
			}

			// ----- interactions -----
			var coverWrap = card.querySelector('.cover-wrap');

			// Hover cover → play: for single release, play its only track; for multi, pick random
			if (coverWrap){
				coverWrap.addEventListener('mouseenter', function(){
					// Activate global recolor to this card's hue
					setRecolorForCard(card, flashColor || getComputedStyle(card).getPropertyValue('--pulse-color'));
					if (single){
						var t = tracks[0] || {};
						var bpm = Number(t.bpm) || 120;
						playPreview(t.preview_url || '', {
							card: card,
							bpm: bpm,
							autoEndFade: false,
							trackTitle: '',                   // show only release title
							releaseTitle: rel.title || '',
							singleRelease: true,
							flashColor: flashColor
						});
					}else{
						setOpen(card, true); // reveal tracklist while hovering
						var withPrev = tracks.filter(function(t){ return (t.preview_url||'').trim() !== ''; });
						var pick = withPrev.length ? withPrev[Math.floor(Math.random()*withPrev.length)] : null;
						if (pick){
							var bpm2 = Number(pick.bpm) || 120;
							playPreview(pick.preview_url, {
								card: card,
								bpm: bpm2,
								autoEndFade: false,
								trackTitle: String(pick.title||''),
								releaseTitle: rel.title || '',
								singleRelease: false,
								flashColor: flashColor
							});
						}
					}
				});

				// NEW: click cover → open album on Spotify (if provided)
				var coverTapStage = 0;
				coverWrap.addEventListener('click', function(e){
						if (isMobile){
							e.preventDefault();
							e.stopPropagation();
							unlockAudio();
							// Close any other open tracklists when tapping any release (single or multi)
							closeOtherLists(card);
							// If no tracks have previews, open link immediately
							var hasAnyPreview = false;
							if (single){ hasAnyPreview = !!(tracks[0] && (String(tracks[0].preview_url||'').trim() !== '')); }
							else { for (var jj=0; jj<tracks.length; jj++){ if (String(tracks[jj].preview_url||'').trim() !== '') { hasAnyPreview = true; break; } } }
							if (!hasAnyPreview){
								if (rel && rel.spotify_album){ window.open(rel.spotify_album, '_blank', 'noopener'); }
								else if (single && tracks[0] && tracks[0].spotify_url){ window.open(tracks[0].spotify_url, '_blank', 'noopener'); }
								return;
							}
							// Only open link if this release is the one currently previewing
							var isCurrentRelease = false;
							if (single){
								var _t0 = tracks[0] || {};
								var _cand0 = normalize(_t0.preview_url || '');
								isCurrentRelease = !!_cand0 && _cand0 === currentUrl && !audio.paused;
							} else {
								for (var ii=0; ii<tracks.length; ii++){
									var _cand = normalize(tracks[ii].preview_url || '');
									if (_cand && _cand === currentUrl && !audio.paused){ isCurrentRelease = true; break; }
								}
							}
							if (!isCurrentRelease){
								setRecolorForCard(card, flashColor || getComputedStyle(card).getPropertyValue('--pulse-color'));
								if (single){
								var t0 = tracks[0] || {};
								var bpm0 = Number(t0.bpm) || 120;
								playPreview(t0.preview_url || '', {
									card: card,
									bpm: bpm0,
									autoEndFade: false,
									trackTitle: '',
									releaseTitle: rel.title || '',
									singleRelease: true,
									flashColor: flashColor
								});
							} else {
								// On mobile, ensure only one tracklist is open at a time
								if (isMobile) closeOtherLists(card);
								setOpen(card, true);
								var withPrevM = tracks.filter(function(t){ return (t.preview_url||'').trim() !== ''; });
								var pickM = withPrevM.length ? withPrevM[Math.floor(Math.random()*withPrevM.length)] : null;
								if (pickM){
									var bpmM = Number(pickM.bpm) || 120;
									playPreview(pickM.preview_url, {
										card: card,
										bpm: bpmM,
										autoEndFade: true,
										trackTitle: String(pickM.title||''),
										releaseTitle: rel.title || '',
										singleRelease: false,
										flashColor: flashColor
									});
								}
							}
							coverTapStage = 1;
							return;
						}
					}
					if (rel && rel.spotify_album){
						window.open(rel.spotify_album, '_blank', 'noopener');
						coverTapStage = 0;
					} else if (single && tracks[0] && tracks[0].spotify_url){
						window.open(tracks[0].spotify_url, '_blank', 'noopener');
						coverTapStage = 0;
					}
				});

				// stop shortly after leaving the card + hide any open list
				// On mobile, ignore mouseleave so a tap preview doesn't get cut immediately
				card.addEventListener('mouseleave', function(e){
					if (isMobile) return;
					// reset mobile two-tap state on leave
					try { coverTapStage = 0; } catch {}
					var t = leaveTimers.get(card);
					if (t) clearTimeout(t);
					// Determine if we're moving directly into another release card
					var to = e && e.relatedTarget ? (e.relatedTarget.closest ? e.relatedTarget.closest('.release') : null) : null;
					leaveTimers.set(card, setTimeout(function(){
						if (!single) setOpen(card, false);
						// If pointer is going to another release, let the next card's hover start handle transitions
						if (!to) fadeOutAndPause();
					}, LEAVE_GRACE_MS));
					// Remove recolor only when fully leaving the releases area
					if (!to) clearRecolorForCard(card);
				});
					card.addEventListener('mouseenter', function(){
						var t = leaveTimers.get(card);
						if (t){ clearTimeout(t); leaveTimers.delete(card); }
						// If a previous card scheduled a delayed pause, cancel it as soon as we enter a new card
						if (pauseTimer){ clearTimeout(pauseTimer); pauseTimer = 0; }
						// Entering anywhere on the card ensures recolor stays on
						setRecolorForCard(card, flashColor || getComputedStyle(card).getPropertyValue('--pulse-color'));
					});
			}


			// Multi only: toggle button (kept for mobile) + track hover/click
			if (!single){
				var btn = card.querySelector('.toggle-tracks');
				if (btn){
						btn.addEventListener('click', function(){
							unlockAudio();
							var open = card.classList.contains('open');
							if (!open && isMobile) closeOtherLists(card);
							setOpen(card, !open);
						if (!open){
							var withPrev2 = tracks.filter(function(t){ return (t.preview_url||'').trim() !== ''; });
							var pick2 = withPrev2.length ? withPrev2[Math.floor(Math.random()*withPrev2.length)] : null;
							if (pick2){
								var bpm3 = Number(pick2.bpm) || 120;
								playPreview(pick2.preview_url, {
									card: card,
									bpm: bpm3,
									autoEndFade: true,
									trackTitle: String(pick2.title||''),
									releaseTitle: rel.title || '',
									singleRelease: false,
									flashColor: flashColor
								});
							}
						}
					});
				}

				card.addEventListener('mouseover', function(e){
					var tBtn = e.target.closest ? e.target.closest('.track') : null;
					if (!tBtn || !card.contains(tBtn)) return;

					// cancel pending leave-close
					var pend = leaveTimers.get(card);
					if (pend){ clearTimeout(pend); leaveTimers.delete(card); }

					var url = tBtn.getAttribute('data-preview') || '';
					if (!url) return;
					var bpm4 = Number(tBtn.getAttribute('data-bpm')) || 120;
					var nameSpan = tBtn.querySelector('.name');
					var titleTxt = nameSpan ? (nameSpan.textContent||'').trim() : '';

					var candidate = normalize(url);
					if (candidate === currentUrl && !audio.paused){
						// just refresh the flash/label
						var sec0 = setPulsePeriod(card, bpm4) || 0.6;
						var color0 = flashColor || (getComputedStyle(card).getPropertyValue('--pulse-color').trim() || '#ffd166');
						startGlobalFlash(color0, sec0);
						setNowPlaying(titleTxt, rel.title || '', color0, false);
						return;
					}
					playPreview(url, {
						card: card,
						bpm: bpm4,
						autoEndFade: true,
						trackTitle: titleTxt,
						releaseTitle: rel.title || '',
						singleRelease: false,
						flashColor: flashColor
					});
				});

				var tapStageByTrack = new WeakMap();
					card.addEventListener('click', function(e){
						var tBtn = e.target.closest ? e.target.closest('.track') : null;
						if (!tBtn || !card.contains(tBtn)) return;
						if (isMobile){
							// Close others even when tapping a track inside this release
							closeOtherLists(card);
							e.preventDefault();
							e.stopPropagation();
							unlockAudio();
							var url = tBtn.getAttribute('data-preview') || '';
							var candidate = normalize(url);
							if (!url){
								var link0 = tBtn.getAttribute('data-spotify');
								if (link0) window.open(link0, '_blank', 'noopener');
								return;
							}
							var isCurrentTrack = !!candidate && candidate === currentUrl && !audio.paused;
							if (!isCurrentTrack){
							var bpm4 = Number(tBtn.getAttribute('data-bpm')) || 120;
							var nameSpan = tBtn.querySelector('.name');
							var titleTxt = nameSpan ? (nameSpan.textContent||'').trim() : '';
							if (url){
								playPreview(url, {
									card: card,
									bpm: bpm4,
									autoEndFade: true,
									trackTitle: titleTxt,
									releaseTitle: rel.title || '',
									singleRelease: false,
									flashColor: flashColor
								});
							}
							tapStageByTrack.set(tBtn, 1);
							return;
						}
						var linkM = tBtn.getAttribute('data-spotify');
						if (linkM) window.open(linkM, '_blank', 'noopener');
						tapStageByTrack.delete(tBtn);
						return;
					}
					var link = tBtn.getAttribute('data-spotify');
					if (link) window.open(link, '_blank', 'noopener');
				});
			}

			frag.appendChild(card);
		});

		grid.innerHTML = '';
		grid.appendChild(frag);
	}

	// close any open lists when clicking away
	document.addEventListener('click', function(e){
		var any = $$('.release.open');
		if (!any.length) return;
		var card = e.target.closest ? e.target.closest('.release') : null;
		if (!card){
			any.forEach(function(c){ setOpen(c, false); });
			// On mobile, also stop preview when tapping outside any release
			if (isMobile){
				fadeOutAndPause();
				clearRecolorForCard(null);
			}
		}
	});

	// ===== Boot (external JSON with inline fallback) =====
	document.addEventListener('DOMContentLoaded', async () => {
		ensureFlashRoot();

		let data = { releases: [] };
		// (SFX loading removed)

		// Adjust the path if music.html lives in a subfolder:
		// - if music.html is at site root → 'assets/data/releases.json'
		// - if music.html is in /music/  → '../assets/data/releases.json'
		const JSON_PATH = 'assets/data/releases.json';

		try {
			const res = await fetch(JSON_PATH, { cache: 'no-store' });
			if (!res.ok) throw new Error('HTTP ' + res.status);
			const fileData = await res.json();
			if (fileData && Array.isArray(fileData.releases)) data = fileData;
		} catch {
			// Fallback to inline JSON if present
			try {
				const el = document.getElementById('releases-data');
				if (el && el.textContent && el.textContent.trim()) {
					const inlineData = JSON.parse(el.textContent);
					if (inlineData && Array.isArray(inlineData.releases)) data = inlineData;
				}
			} catch {}
		}

		if (!Array.isArray(data.releases)) data.releases = [];
		renderGrid(data);
	});
})();
