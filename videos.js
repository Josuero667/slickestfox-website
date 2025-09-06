(function(){
  'use strict';
  // ===== helpers =====
  function $(s, r){ return (r||document).querySelector(s); }
  function el(tag, cls){ var e=document.createElement(tag); if(cls) e.className=cls; return e; }
  function readConfig(){ try{ var t=document.getElementById('youtube-config'); return t?JSON.parse(t.textContent||'{}'):{}; }catch(e){ return {}; } }
  function extractChannelIdFromUrl(url){ if(!url) return ''; var m=String(url).match(/\/channel\/([A-Za-z0-9_-]{10,})/); return m?m[1]:''; }
  function uploadsPlaylistId(channelId){ return (channelId && channelId.slice(0,2)==='UC') ? ('UU'+channelId.slice(2)) : ''; }

  // ===== debug banner =====
  function showDebug(msg){
    try{
      var box = document.getElementById('yt-debug');
      if(!box){
        box = document.createElement('div');
        box.id = 'yt-debug';
        box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;max-width:70vw;padding:8px 12px;background:rgba(0,0,0,0.65);border:1px solid rgba(255,255,255,0.18);border-radius:10px;color:#e9e9ef;font:600 12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,0.45)';
        document.body.appendChild(box);
      }
      box.textContent = String(msg||'');
    }catch{}
  }

  function setLatestTitle(t){ var a=$('#latest-title'); if(a) applyWaveAndFit(a, t||'Latest Upload'); var b=$('#latest-meta-title'); if(b) b.textContent=t||''; }
  function escapeHTML(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function linkify(text){
    var s = escapeHTML(text||'');
    // Make bare URLs clickable
    var re = /(https?:\/\/[^\s<>'\"]+)/g;
    return s.replace(re, function(m){
      var href = m;
      return '<a href="'+href+'" target="_blank" rel="noopener noreferrer">'+href+'</a>';
    });
  }
  function setLatestDescription(d){ var n=$('#latest-description'); if(n) n.innerHTML = linkify(d || ''); }
  function currentOrigin(){
    try {
      if (location && location.origin) return location.origin;
      return (location.protocol + '//' + location.host);
    } catch { return 'https://'+(document.domain||''); }
  }
  function ytBase(){ return 'https://www.youtube-nocookie.com'; }
  function addParam(url,key,value){ if(url.indexOf('?')===-1) return url+'?'+key+'='+value; return url+'&'+key+'='+value; }
  function buildVideoEmbedSrc(videoId){
    if(!videoId) return '';
    var src = ytBase() + '/embed/' + encodeURIComponent(videoId);
    src = addParam(src,'rel','0');
    src = addParam(src,'modestbranding','1');
    src = addParam(src,'iv_load_policy','3');
    src = addParam(src,'playsinline','1');
    src = addParam(src,'enablejsapi','1');
    src = addParam(src,'origin', encodeURIComponent(currentOrigin()));
    return src;
  }
  function buildPlaylistEmbedSrc(listId, index){
    if(!listId) return '';
    var src = ytBase() + '/embed/videoseries?list=' + encodeURIComponent(listId);
    if(typeof index==='number') src = addParam(src,'index', String(index));
    src = addParam(src,'rel','0');
    src = addParam(src,'modestbranding','1');
    src = addParam(src,'iv_load_policy','3');
    src = addParam(src,'playsinline','1');
    src = addParam(src,'enablejsapi','1');
    src = addParam(src,'origin', encodeURIComponent(currentOrigin()));
    return src;
  }
  function setLatestEmbedIframe(src){ var c=$('#latest-embed'); if(!c) return; c.innerHTML=''; var f=el('iframe'); f.loading='lazy'; f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'; f.referrerPolicy='strict-origin-when-cross-origin'; f.allowFullscreen=true; f.src=src; c.appendChild(f); try{ if(window.__initYTPlayers) window.__initYTPlayers(); }catch(e){} }

  // wave title builder + autofit with preserved spacing
  function applyWaveAndFit(titleEl, text){
    titleEl.classList.add('wave');
    titleEl.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i=0;i<text.length;i++){
      var ch = document.createElement('span');
      ch.className = 'char';
      ch.style.setProperty('--i', String(i));
      var c = text[i];
      ch.textContent = (c === ' ') ? '\u00A0' : c; // NBSP for space preservation
      frag.appendChild(ch);
    }
    titleEl.appendChild(frag);
    // Fit now, and also defer-fit to ensure it's measured after insertion
    fitTitleToWidth(titleEl);
    try{
      requestAnimationFrame(function(){ fitTitleToWidth(titleEl); });
      setTimeout(function(){ fitTitleToWidth(titleEl); }, 0);
    }catch{}
  }
  function fitTitleToWidth(titleEl){
    try{
      var maxW = titleEl.clientWidth || titleEl.offsetWidth;
      if (!maxW) return;
      var fs = parseFloat(getComputedStyle(titleEl).fontSize)||16;
      var fixed = titleEl.dataset.fixedSize === '1';
      if (fixed){
        // Keep a consistent size for card titles
        fs = 14; titleEl.style.fontSize = fs + 'px';
      } else {
        var minFs = 10;
        for (var k=0;k<36 && titleEl.scrollWidth > maxW && fs > minFs; k++){
          fs -= 1; titleEl.style.fontSize = fs + 'px';
        }
      }
      // Decide marquee threshold: for yt cards, start marquee earlier (e.g., >55% of width)
      var thresh = parseFloat(titleEl.dataset.marqueeThresh || '1');
      if (!(thresh > 0 && isFinite(thresh))) thresh = 1;
      var needMarquee = (titleEl.scrollWidth > (maxW * thresh));
      // Only marquee if meaningful length (ignore spaces)
      var charLen = (titleEl.textContent||'').replace(/\s+/g,'').length;
      if (charLen <= 16) needMarquee = false;
      if (needMarquee){
        // Apply marquee first so padding rules (CSS) are active, then measure
        titleEl.classList.add('marquee');
        var cs = getComputedStyle(titleEl);
        var padL = parseFloat(cs.paddingLeft)||0;
        var padR = parseFloat(cs.paddingRight)||0;
        // Travel should at least cover the overflow amount; add left padding so text fully clears from the left edge
        var overflow = Math.max(0, (titleEl.scrollWidth - titleEl.clientWidth));
        // Add small safety buffer so it never clips mid-way
        var dx = overflow + padL + padR + 40;
        titleEl.style.setProperty('--marquee-dx', dx + 'px');
        // period proportional to overflow distance (slower for longer strings)
        var T = 5 + Math.min(16, dx / 24); // a bit faster overall
        titleEl.style.setProperty('--marquee-t', T + 's');
      } else {
        titleEl.classList.remove('marquee');
        titleEl.style.removeProperty('--marquee-dx');
        titleEl.style.removeProperty('--marquee-t');
      }
    }catch{}
  }
  window.addEventListener('resize', function(){
    document.querySelectorAll('.luna-titlebar .luna-title').forEach(fitTitleToWidth);
  });

  // Build a LUNA window for a video card
  function buildVideoWindow(item){
    var win = el('div', 'luna-window yt-card' + (item.isShort ? ' shorts' : ''));
    var tb = el('div', 'luna-titlebar');
    var title = el('div', 'luna-title');
    // Mark as card title so marquee threshold is applied (narrow titlebars)
    title.dataset.marqueeThresh = '0.55';
    title.dataset.fixedSize = '1';
    applyWaveAndFit(title, item.title || 'Video');
    var ctrls = el('div', 'luna-controls'); ctrls.setAttribute('aria-hidden','true');
    ctrls.innerHTML = '<span class="luna-btn minimize" title="Minimize"></span><span class="luna-btn maximize" title="Maximize"></span><span class="luna-btn close" title="Close"></span>';
    tb.appendChild(title); tb.appendChild(ctrls);
    var frame = el('div', 'luna-frame');
    var body = el('div', 'luna-body');
    var ar = el('div', item.isShort ? 'aspect-9x16' : 'aspect-16x9');
    var f=el('iframe'); f.loading='lazy'; f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'; f.referrerPolicy='strict-origin-when-cross-origin'; f.allowFullscreen=true; f.src=item.embedSrc;
    ar.appendChild(f); body.appendChild(ar);
    win.appendChild(tb); win.appendChild(frame); win.appendChild(body);
    return win;
  }

  function renderFallback(plId, haveChannel){
    if(!haveChannel){
      setLatestTitle('Latest Upload');
      setLatestDescription('Please set your channelId or provide a YouTube API key in the config block on videos.html to fetch the latest video details.');
      showDebug('Using static playlist fallback (no channelId/API key).');
      return;
    }
    setLatestTitle('Latest Upload');
    setLatestDescription('');
    setLatestEmbedIframe(buildPlaylistEmbedSrc(plId, 0));
    var grid = $('#recent-grid'); if(grid){
      grid.innerHTML='';
      for(var i=1;i<=6;i++){ var src = buildPlaylistEmbedSrc(plId, i); grid.appendChild(buildVideoWindow({ title: 'Upload #' + (i+1), embedSrc: src, isShort:false })); }
    }
    var sg = $('#shorts-grid'); if(sg){ sg.innerHTML=''; for(var j=7;j<10;j++){ var s = buildPlaylistEmbedSrc(plId, j); sg.appendChild(buildVideoWindow({ title: 'Short #' + (j-6), embedSrc: s, isShort:true })); }}
    try{ if(window.__initYTPlayers) window.__initYTPlayers(); }catch(e){}
  }

  // RSS-based fallback (no API key, still newest-first and dedupe). Filters out shorts by hashtag.
  async function renderFromRss(channelId){
    var url = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channelId);
    try{
      var resp = await fetch(url, { cache: 'no-store' });
      if(!resp.ok) throw new Error('HTTP ' + resp.status);
      var txt = await resp.text();
      var doc = new DOMParser().parseFromString(txt, 'application/xml');
      var entries = Array.from(doc.getElementsByTagName('entry'));
      var items = entries.map(function(e){
        var id = (e.getElementsByTagName('yt:videoId')[0]||{}).textContent || '';
        var title = (e.getElementsByTagName('title')[0]||{}).textContent || '';
        var published = (e.getElementsByTagName('published')[0]||{}).textContent || '';
        var ts = published ? Date.parse(published) || 0 : 0;
        return { id:id, title:title, publishedAt:ts };
      }).filter(function(it){ return !!it.id; });
      // newest-first already, but sort to be safe
      items.sort(function(a,b){ return b.publishedAt - a.publishedAt; });
      // Filter out shorts heuristically by hashtag
      var normals = items.filter(function(it){ return !/(^|\s)#shorts(\b|\s)/i.test(it.title||''); });
      var featured = normals[0] || items[0];
      if(featured){ setLatestTitle(featured.title||'Latest Upload'); setLatestDescription(''); setLatestEmbedIframe(buildVideoEmbedSrc(featured.id)); }
      var recent = normals.filter(function(it){ return !featured || it.id !== featured.id; }).slice(0,6);
      var grid = $('#recent-grid'); if(grid){ grid.innerHTML=''; recent.forEach(function(it){ grid.appendChild(buildVideoWindow({ title: it.title||'Video', embedSrc: buildVideoEmbedSrc(it.id), isShort:false })); }); }
      var sg = $('#shorts-grid'); if(sg){ sg.innerHTML=''; /* leave empty when using RSS, or show last 3 shorts if desired */ }
      try{ if(window.__initYTPlayers) window.__initYTPlayers(); }catch(e){}
      showDebug('Using RSS fallback (no/failed API).');
    }catch(err){
      // fall back to playlist embed if RSS blocked by CORS or fails
      var pl = uploadsPlaylistId(channelId);
      renderFallback(pl, !!channelId);
    }
  }

  async function fetchJson(url){
    try{
      var r = await fetch(url);
      if(!r.ok){
        var info = null; try{ info = await r.json(); }catch{}
        var err = new Error('HTTP ' + r.status);
        err.status = r.status; err.info = info; throw err;
      }
      return await r.json();
    }catch(e){ if(typeof e.status === 'undefined') e.isNetwork = true; throw e; }
  }

  // ===== Caching (localStorage) =====
  var TTL_MS = 10 * 60 * 1000; // 10 minutes
  function cacheKey(channelId){ return 'yt:search:v3:' + channelId; }
  function loadCache(channelId){ try{ var s=localStorage.getItem(cacheKey(channelId)); if(!s) return null; var obj=JSON.parse(s); if(!obj||!obj.ts) return null; if((Date.now()-obj.ts) > (obj.ttl||TTL_MS)) return null; return obj; }catch(e){ return null; } }
  function saveCache(channelId, payload){ try{ var obj={ ts: Date.now(), ttl: TTL_MS, videos: payload.videos||[], shorts: payload.shorts||[] }; localStorage.setItem(cacheKey(channelId), JSON.stringify(obj)); }catch(e){} }

  function renderFromData(data){
    if(!data) return;
    var vids = Array.isArray(data.videos) ? data.videos.slice() : [];
    var shorts = Array.isArray(data.shorts) ? data.shorts.slice() : [];
    var featured = vids[0] || (shorts[0] || null);
    if(featured){
      setLatestTitle(featured.title || 'Latest Upload');
      setLatestDescription(featured.description || '');
      setLatestEmbedIframe(buildVideoEmbedSrc(featured.id));
    }
    // Build recent uploads: exclude the featured item if it came from videos
    var recent = [];
    if (vids.length){
      var startIdx = (featured && vids[0] && vids[0].id === featured.id) ? 1 : 0;
      recent = vids.slice(startIdx);
    }
    var grid = $('#recent-grid'); if(grid){ grid.innerHTML=''; recent.slice(0,6).forEach(function(it){ grid.appendChild(buildVideoWindow({ title: it.title||'Video', embedSrc: buildVideoEmbedSrc(it.id), isShort:false })); }); }
    // Shorts list (max 3)
    var sg = $('#shorts-grid'); if(sg){ sg.innerHTML=''; shorts.slice(0,3).forEach(function(it){ sg.appendChild(buildVideoWindow({ title: it.title||'Short', embedSrc: buildVideoEmbedSrc(it.id), isShort:true })); }); }
    try{ if(window.__initYTPlayers) window.__initYTPlayers(); }catch(e){}
  }

  function isoToSeconds(iso){ if(!iso) return 0; var m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if(!m) return 0; var h=+m[1]||0, mi=+m[2]||0, s=+m[3]||0; return h*3600+mi*60+s; }

  async function renderWithApi(key, channelId){
    var cached = loadCache(channelId);
    if(cached){ renderFromData(cached); return; }
    try{
      // Use Search API newest-first; page until we have enough long-form
      var accum = { videos: [], shorts: [] };
      var pageToken = '';
      var seen = new Set();
      for (var page=0; page<5; page++){
        var sUrl = 'https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=' + encodeURIComponent(channelId) + '&type=video&order=date&maxResults=50&key=' + encodeURIComponent(key) + (pageToken?('&pageToken='+encodeURIComponent(pageToken)):'');
        var sres = await fetchJson(sUrl);
        var sitems = (sres.items||[]).map(function(x){ var sn=x&&x.snippet||{}; var id=x&&x.id&&x.id.videoId||''; return { id:id, title:sn.title||'', description:sn.description||'', publishedAt: sn.publishedAt?Date.parse(sn.publishedAt)||0:0 }; }).filter(function(it){ return !!it.id && !seen.has(it.id); });
        if (!sitems.length){ pageToken = sres.nextPageToken || ''; if(!pageToken) break; continue; }
        sitems.forEach(function(it){
          if (seen.has(it.id)) return; seen.add(it.id);
          var tagShort = /(^|\s)#shorts(\b|\s)/i.test((it.title+' '+it.description));
          // Classify shorts by tag only (ignore duration to avoid false positives)
          var isShort = tagShort;
          (isShort ? accum.shorts : accum.videos).push(it);
        });
        if (accum.videos.length >= 8) break; // enough for featured + recent grid
        pageToken = sres.nextPageToken || '';
        if (!pageToken) break;
      }
      accum.videos.sort(function(a,b){ return b.publishedAt - a.publishedAt; });
      accum.shorts.sort(function(a,b){ return b.publishedAt - a.publishedAt; });
      var payload = { videos: accum.videos, shorts: accum.shorts.slice(0, 12) };
      renderFromData(payload);
      saveCache(channelId, payload);
    } catch(err){
      var reason = '';
      try{
        var info = err && err.info && err.info.error; if(info){ if(info.errors && info.errors.length){ reason = info.errors[0].reason || ''; } if(!reason && info.code) reason = String(info.code); }
      }catch{}
      if(err && (err.status===403 || err.status===429) && /quota|daily|rate/i.test(reason||'')){
        showDebug('YouTube API quota exceeded (' + (reason||err.status) + '). Trying RSS fallback.');
        await renderFromRss(channelId); return;
      } else if(err && err.isNetwork){
        showDebug('Network error fetching YouTube API. Trying RSS fallback.');
        await renderFromRss(channelId); return;
      } else {
        showDebug('YouTube API failed: ' + (reason || (err && err.message) || 'unknown') + '. Using playlist fallback.');
        var pl = uploadsPlaylistId(channelId);
        renderFallback(pl, !!channelId);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    var cfg = readConfig();
    var channelId = (cfg.channelId||'').trim() || extractChannelIdFromUrl(cfg.channelUrl||'');
    var apiKey = (cfg.apiKey||'').trim();
    // First, try site-managed JSON
    (async function(){
      try{
        var res = await fetch('assets/data/videos.json', { cache: 'no-store' });
        if(res.ok){ var dj = await res.json(); if(dj && (Array.isArray(dj.videos) || Array.isArray(dj.shorts))){ renderFromData(dj); return; } }
      }catch(e){}
      if(apiKey && channelId){ renderWithApi(apiKey, channelId); return; }
      if(channelId){ renderFromRss(channelId); return; }
      showDebug('Using playlist fallback (missing channelId).');
      var plId = uploadsPlaylistId(channelId);
      renderFallback(plId, !!channelId);
    })();
  });
})();

// ===== YouTube IFrame API integration (ducking + enablejsapi) =====
(function(){
  var players = []; var playing = new Set(); var ducked=false; var fadeRAF=0; var restoreVol=0.5;
  function siteAudio(){ return window.__siteAudioEl || null; }
  function fadeSiteTo(target, ms){ var a=siteAudio(); if(!a) return; if(fadeRAF) cancelAnimationFrame(fadeRAF); target=Math.max(0,Math.min(1,target)); var from=a.volume; var t0=performance.now(); function step(t){ var p=Math.min(1,(t-t0)/Math.max(1,ms||200)); a.volume=from+(target-from)*p; if(p<1) fadeRAF=requestAnimationFrame(step); else fadeRAF=0; } fadeRAF=requestAnimationFrame(step); }function rockAudio(){ return window.__rockAudioEl || null; } function fadeRockTo(target, ms){ var r=rockAudio(); if(!r) return; target=Math.max(0,Math.min(1,target)); var from=r.volume; var t0=performance.now(); function step(t){ var p=Math.min(1,(t-t0)/Math.max(1,ms||200)); r.volume=from+(target-from)*p; if(p<1) requestAnimationFrame(step); } requestAnimationFrame(step); }
  function duck(){ var a=siteAudio(); if(!a) return; if(!ducked){ ducked=true; restoreVol = a.muted ? 0 : a.volume; } fadeSiteTo(0,250); var r=rockAudio(); if(r){ fadeRockTo(0,250); } }
  function unduck(){ var a=siteAudio(); if(!a) return; if(ducked){ ducked=false; var v=(a.muted?0:(restoreVol||0.5)); fadeSiteTo(v,300); var r=rockAudio(); if(r){ var tv = window.__rockActive ? v : 0; fadeRockTo(tv,300); } } }
  function ensureApi(cb){ if(window.YT && YT.Player){ cb(); return; } var s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api'; s.async=true; var fired=false; window.onYouTubeIframeAPIReady=function(){ if(fired) return; fired=true; cb(); }; document.head.appendChild(s); }
  function addParam(url,key,value){ if(url.indexOf('?')===-1) return url+'?'+key+'='+value; return url+'&'+key+'='+value; }
  function ytHostForIframe(ifr){ try{ var src = ifr.getAttribute('src')||''; return (src.indexOf('youtube-nocookie.com')!==-1) ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com'; }catch{ return 'https://www.youtube-nocookie.com'; } }
  function initPlayers(){ document.querySelectorAll('.yt-card iframe, #latest-embed iframe').forEach(function(ifr){ try{ if(ifr.dataset.ytBoot==='1') return; var src=ifr.getAttribute('src')||''; if(src.indexOf('enablejsapi=1')===-1){ src=addParam(src,'enablejsapi','1'); ifr.setAttribute('src',src);} if(src.indexOf('playsinline=1')===-1){ src=addParam(src,'playsinline','1'); ifr.setAttribute('src',src);} if(ifr.referrerPolicy==null){ try{ ifr.referrerPolicy='strict-origin-when-cross-origin'; }catch{} } ifr.dataset.ytBoot='1'; var p=new YT.Player(ifr,{ host: ytHostForIframe(ifr), events:{ onStateChange:function(e){ if(e.data===YT.PlayerState.PLAYING){ playing.add(e.target); duck(); } else if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.ENDED||e.data===YT.PlayerState.UNSTARTED){ playing.delete(e.target); if(playing.size===0) unduck(); } } } }); players.push(p); }catch(err){} }); }
  window.__initYTPlayers = function(){ ensureApi(initPlayers); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ ensureApi(initPlayers); }); else ensureApi(initPlayers);
})();



