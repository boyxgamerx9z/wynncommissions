/* Lofi music from MP3 files you are allowed to use, kept in public/music and listed in public/music/tracks.json.
   The bar is docked at the bottom, so music keeps playing as people move between pages.
   If the list is empty, the music button and bar stay hidden. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var btn = $('#musicBtn'), bar = $('#player'), playBtn = $('#pPlay'), nextBtn = $('#pNext'), stopBtn = $('#pClose'),
      vol = $('#pVol'), title = $('#pTitle'), sub = $('#pSub');
  var tracks = [], i = 0, audio = new Audio(), playing = false, bubble = null;
  audio.preload = 'none'; audio.volume = 0.5;

  function hideBubble() { if (bubble) { bubble.remove(); bubble = null; } }
  function sync() {
    playBtn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
    playBtn.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    btn.classList.toggle('on', playing);
  }
  function load(n) {
    i = (n + tracks.length) % tracks.length;
    var t = tracks[i];
    audio.src = '/music/' + encodeURIComponent(t.file);
    title.textContent = t.title || t.file;
    sub.textContent = '';
    if (t.artist) sub.appendChild(document.createTextNode(t.artist));
    if (t.link) { var a = document.createElement('a'); a.href = t.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = (t.artist ? ' · ' : '') + 'source'; sub.appendChild(a); }
  }
  function play() {
    hideBubble(); bar.hidden = false;
    var p = audio.play();
    if (p && p.catch) p.catch(function () { playing = false; sync(); });
    playing = true; sync();
  }
  function pause() { audio.pause(); playing = false; sync(); }
  function toggle() { playing ? pause() : play(); }

  fetch('/music/tracks.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (list) {
    tracks = (Array.isArray(list) ? list : []).filter(function (t) { return t && typeof t.file === 'string'; });
    if (!tracks.length) return;
    load(Math.floor(Math.random() * tracks.length));
    btn.hidden = false;
    if (tracks.length < 2) nextBtn.hidden = true;
    btn.addEventListener('click', toggle);
    playBtn.addEventListener('click', toggle);
    nextBtn.addEventListener('click', function () { load(i + 1); if (playing) play(); });
    stopBtn.addEventListener('click', function () { pause(); bar.hidden = true; });
    audio.addEventListener('ended', function () { load(i + 1); play(); });
    audio.addEventListener('error', function () { if (tracks.length > 1) { load(i + 1); if (playing) play(); } else { pause(); sub.textContent = 'This track could not load.'; } });
    vol.addEventListener('input', function () { audio.volume = Number(vol.value) / 100; });
    setTimeout(function () {
      if (playing) return;
      bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = 'Tap ♪ for lofi beats';
      bubble.style.bottom = 'auto'; bubble.style.top = '74px';
      document.body.appendChild(bubble); setTimeout(hideBubble, 8000);
    }, 2500);
  });
  sync();
})();
