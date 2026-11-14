/* Twinkling stars (dark and light), falling snow (winter) and a sparkle cursor trail. */
(function () {
  'use strict';
  var colors = ['#ff7ac8', '#a77bff', '#6fc7ff', '#fff1fb'];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var stars = document.getElementById('stars');
  for (var i = 0; i < 38; i++) {
    var s = document.createElement('span');
    s.className = 'star';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.setProperty('--s', (6 + Math.random() * 14) + 'px');
    s.style.setProperty('--c', colors[i % colors.length]);
    s.style.setProperty('--d', (2 + Math.random() * 3) + 's');
    s.style.setProperty('--w', (-Math.random() * 4) + 's');
    stars.appendChild(s);
  }

  var snow = document.getElementById('snow');
  for (var j = 0; j < 46; j++) {
    var f = document.createElement('span');
    f.className = 'flake';
    f.style.left = Math.random() * 100 + '%';
    f.style.setProperty('--s', (3 + Math.random() * 6) + 'px');
    f.style.setProperty('--d', (9 + Math.random() * 9) + 's');
    f.style.setProperty('--w', (-Math.random() * 18) + 's');
    f.style.setProperty('--x', (Math.random() * 120 - 60) + 'px');
    snow.appendChild(f);
  }

  var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (!reduce && fine) {
    var last = 0;
    window.addEventListener('pointermove', function (e) {
      var now = Date.now();
      if (now - last < 70) return;
      last = now;
      var t = document.createElement('span');
      t.className = 'trail';
      t.style.left = (e.clientX - 8) + 'px';
      t.style.top = (e.clientY - 8) + 'px';
      t.style.setProperty('--c', colors[Math.floor(Math.random() * 3)]);
      document.body.appendChild(t);
      setTimeout(function () { t.remove(); }, 900);
    });
  }
})();
