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
  function setLatestDescription(d){ var n=$('#latest-description'); if(n) n.textContent = d || ''; }
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
    fitTitleToWidth(titleEl);
  }
  function fitTitleToWidth(titleEl){
    try{
      var maxW = titleEl.clientWidth || titleEl.offsetWidth;
      if (!maxW) return;
      var fs = parseFloat(getComputedStyle(titleEl).fontSize)||16;
      var minFs = 12;
      for (var k=0;k<24 && titleEl.scrollWidth > maxW && fs > minFs; k++){
        fs -= 1; titleEl.style.fontSize = fs + 'px';
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
    var title = el('div', 'luna-title'); applyWaveAndFit(title, item.title || 'Video');
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
    setLatestEmbedIframe('https://www.youtube.com/embed/videoseries?list=' + encodeURIComponent(plId) + '&index=0');
    var grid = $('#recent-grid'); if(grid){ grid.innerHTML=''; for(var i=0;i<9;i++){ var src = 'https://www.youtube.com/embed/videoseries?list=' + encodeURIComponent(plId) + '&index=' + i; grid.appendChild(buildVideoWindow({ title: 'Upload #' + (i+1), embedSrc: src, isShort:false })); } }
    var sg = $('#shorts-grid'); if(sg){ sg.innerHTML=''; for(var j=9;j<12;j++){ var s = 'https://www.youtube.com/embed/videoseries?list=' + encodeURIComponent(plId) + '&index=' + j; sg.appendChild(buildVideoWindow({ title: 'Short #' + (j-8), embedSrc: s, isShort:true })); }} try{ if(window.__initYTPlayers) window.__initYTPlayers(); }catch(e){}
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
  var TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
  function cacheKey(channelId){ return 'yt:playlistItems:v3:' + channelId; }
  function loadCache(channelId){ try{ var s=localStorage.getItem(cacheKey(channelId)); if(!s) return null; var obj=JSON.parse(s); if(!obj||!obj.ts) return null; if((Date.now()-obj.ts) > (obj.ttl||TTL_MS)) return null; return obj; }catch(e){ return null; } }
  function saveCache(channelId, payload){ try{ var obj={ ts: Date.now(), ttl: TTL_MS, videos: payload.videos||[], shorts: payload.shorts||[] }; localStorage.setItem(cacheKey(channelId), JSON.stringify(obj)); }catch(e){} }

  function renderFromData(data){
    if(!data) return;
    var featured = (data.videos && data.videos[0]) || (data.shorts && data.shorts[0]);
    if(featured){
      setLatestTitle(featured.title || 'Latest Upload');
      setLatestDescription(featured.description || '');
      setLatestEmbedIframe('https://www.youtube.com/embed/' + encodeURIComponent(featured.id));
    }
    var grid = $('#recent-grid'); if(grid){ grid.innerHTML=''; (data.videos||[]).slice(0,9).forEach(function(it){ grid.appendChild(buildVideoWindow({ title: it.title||'Video', embedSrc: 'https://www.youtube.com/embed/' + encodeURIComponent(it.id), isShort:false })); }); }
    var sg = $('#shorts-grid'); if(sg){ sg.innerHTML=''; (data.shorts||[]).slice(0,3).forEach(function(it){ sg.appendChild(buildVideoWindow({ title: it.title||'Short', embedSrc: 'https://www.youtube.com/embed/' + encodeURIComponent(it.id), isShort:true })); }); } try{ if(window.__initYTPlayers) window.__initYTPlayers(); }catch(e){}
  }

  function isoToSeconds(iso){ if(!iso) return 0; var m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if(!m) return 0; var h=+m[1]||0, mi=+m[2]||0, s=+m[3]||0; return h*3600+mi*60+s; }

  async function renderWithApi(key, channelId){
    var cached = loadCache(channelId);
    if(cached){ renderFromData(cached); return; }
    try{
      var plId = uploadsPlaylistId(channelId);
      if(!plId) throw new Error('Missing uploads playlist');
      // Fetch more than needed to classify
      var url = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=25&playlistId=' + encodeURIComponent(plId) + '&key=' + encodeURIComponent(key);
      var res = await fetchJson(url);
      var items = (res.items||[]).map(function(x){ var sn = x && x.snippet || {}; var rid = sn.resourceId || {}; return { id: rid.videoId || '', title: sn.title || '', description: sn.description || '' }; }).filter(function(it){ return !!it.id; });
      if(!items.length){ showDebug('YouTube API returned no items. Using playlist fallback.'); throw new Error('No items'); }
      // Fetch contentDetails to detect shorts via duration (<= 180s) and tag fallback
      var ids = items.map(function(i){return i.id;}).join(',');
      var vurl = 'https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=' + ids + '&key=' + encodeURIComponent(key);
      var vres = await fetchJson(vurl);
      var byIdSecs = new Map(); (vres.items||[]).forEach(function(v){ if(v && v.id){ var dur = v.contentDetails && v.contentDetails.duration; byIdSecs.set(v.id, isoToSeconds(dur)); } });
      var normals = [], shorts = [];
      items.forEach(function(it){
        var secs = byIdSecs.get(it.id) || 0;
        var tagShort = /(^|\s)#shorts(\b|\s)/i.test((it.title+' '+it.description));
        var isShort = secs ? (secs <= 180) : tagShort; // <= 3 minutes as shorts
        (isShort ? shorts : normals).push(it);
      });
      var payload = { videos: normals.slice(0, 9), shorts: shorts.slice(0, 3) };
      renderFromData(payload);
      saveCache(channelId, payload);
    } catch(err){
      var reason = '';
      try{
        var info = err && err.info && err.info.error; if(info){ if(info.errors && info.errors.length){ reason = info.errors[0].reason || ''; } if(!reason && info.code) reason = String(info.code); }
      }catch{}
      if(err && (err.status===403 || err.status===429) && /quota|daily|rate/i.test(reason||'')){
        showDebug('YouTube API quota exceeded (' + (reason||err.status) + '). Using playlist fallback.');
      } else if(err && err.isNetwork){
        showDebug('Network error fetching YouTube API. Using playlist fallback.');
      } else {
        showDebug('YouTube API failed: ' + (reason || (err && err.message) || 'unknown') + '. Using playlist fallback.');
      }
      var pl = uploadsPlaylistId(channelId);
      renderFallback(pl, !!channelId);
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    var cfg = readConfig();
    var channelId = (cfg.channelId||'').trim() || extractChannelIdFromUrl(cfg.channelUrl||'');
    var apiKey = (cfg.apiKey||'').trim();
    if(apiKey && channelId){ renderWithApi(apiKey, channelId); return; }
    showDebug('Using playlist fallback (missing API key or channelId).');
    var plId = uploadsPlaylistId(channelId);
    renderFallback(plId, !!channelId);
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
  function initPlayers(){ document.querySelectorAll('.yt-card iframe, #latest-embed iframe').forEach(function(ifr){ try{ if(ifr.dataset.ytBoot==='1') return; var src=ifr.getAttribute('src')||''; if(src.indexOf('enablejsapi=1')===-1){ src=addParam(src,'enablejsapi','1'); ifr.setAttribute('src',src);} if(src.indexOf('playsinline=1')===-1){ src=addParam(src,'playsinline','1'); ifr.setAttribute('src',src);} ifr.dataset.ytBoot='1'; var p=new YT.Player(ifr,{ events:{ onStateChange:function(e){ if(e.data===YT.PlayerState.PLAYING){ playing.add(e.target); duck(); } else if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.ENDED||e.data===YT.PlayerState.UNSTARTED){ playing.delete(e.target); if(playing.size===0) unduck(); } } } }); players.push(p); }catch(err){} }); }
  window.__initYTPlayers = function(){ ensureApi(initPlayers); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ ensureApi(initPlayers); }); else ensureApi(initPlayers);
})();



