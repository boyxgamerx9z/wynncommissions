(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function api(method, url, body, isForm) {
    var opt = { method: method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
    if (body && !isForm) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    else if (body) { opt.body = body; }
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
  }
  function copyText(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || 'Copied!'); }, function () { toast('Could not copy. Please select the text and copy it.'); });
    } else { toast('Could not copy. Please select the text and copy it.'); }
  }
  function armDelete(btn, run) {
    var orig = btn.textContent, armed = false, t;
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!armed) {
        armed = true; btn.textContent = 'Tap again to confirm'; btn.classList.add('armed');
        t = setTimeout(function () { armed = false; btn.textContent = orig; btn.classList.remove('armed'); }, 3500);
        return;
      }
      clearTimeout(t); btn.disabled = true;
      run().catch(function () { btn.disabled = false; btn.textContent = 'Could not delete'; });
    });
  }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  function icon(item, cls) {
    var vb = item.icon === 'imp' ? '0 0 200 200' : '0 0 120 120';
    return '<svg class="' + cls + '" viewBox="' + vb + '" style="' + item.vars + '" aria-hidden="true"><use href="#' + item.icon + '"/></svg>';
  }
  function remember(k, v) { try { if (v == null) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  var STATUS = { received: 'Request received', accepted: 'Accepted', in_progress: 'Being made', ready: 'Ready', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
  var ART_KINDS = ['YCH', 'Couple art', 'Keychain', 'Bust', 'Full body', 'Head', 'Ita bag', 'Other'];
  var me = null;
  var settings = { open: true, slots: 5, taken: 0, total: 5, notice: '', paypal: '', cashapp: '' };
  var isOwner = function () { return !!me && me.role === 'owner'; };

  /* ---------- theme, menu button, mobile drawer ---------- */
  var ICONS = { dark: '☾', light: '☀', winter: '❄' };
  function showTheme() {
    var t = window.WynnTheme.get();
    $('#themeIcon').textContent = ICONS[t];
    $('#themeBtn').setAttribute('aria-label', 'Theme: ' + t + '. Tap to switch.');
    $('#themeBtn').title = 'Theme: ' + t;
  }
  $('#themeBtn').addEventListener('click', function () {
    var list = window.WynnTheme.list, next = list[(list.indexOf(window.WynnTheme.get()) + 1) % list.length];
    window.WynnTheme.set(next); showTheme(); toast(next.charAt(0).toUpperCase() + next.slice(1) + ' theme');
  });
  showTheme();

  function setDrawer(open) {
    document.body.classList.toggle('menu-open', open);
    $('#burger').setAttribute('aria-expanded', String(open));
    $('#burger').firstElementChild.textContent = open ? '✕' : '☰';
  }
  $('#burger').addEventListener('click', function () { setDrawer(!document.body.classList.contains('menu-open')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setDrawer(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 1100) setDrawer(false); });

  /* ---------- router ---------- */
  var ROUTES = ['home', 'menu', 'gallery', 'reviews', 'order', 'track', 'suggestions', 'terms', 'dashboard'];
  var onEnter = {};
  function parseHash() {
    var parts = location.hash.replace(/^#\/?/, '').split('?');
    return { name: parts[0] || 'home', q: new URLSearchParams(parts[1] || '') };
  }
  function route() {
    var r = parseHash(), name = ROUTES.indexOf(r.name) >= 0 ? r.name : 'home';
    if (name === 'dashboard' && !isOwner()) { location.replace('#/'); toast('The dashboard is for the artist. Please log in.'); openAuth('login'); return; }
    $$('.page').forEach(function (p) { p.hidden = p.dataset.page !== name; });
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.dataset.nav === name); });
    var page = $('.page[data-page="' + name + '"]');
    document.title = name === 'home' ? "Wynn's Commissions" : page.dataset.title + " · Wynn's Commissions";
    setDrawer(false);
    window.scrollTo(0, 0);
    if (onEnter[name]) onEnter[name](r.q);
  }
  window.addEventListener('hashchange', route);

  /* ---------- account area and login dialog ---------- */
  var dlg = $('#authDlg'), mode = 'login';
  function renderAccount() {
    var o = isOwner();
    $('#loginBtn').hidden = !!me;
    $('#logoutBtn').hidden = !me;
    $('#acctAv').hidden = !me;
    $('#acctRole').hidden = !me;
    $('#navDash').hidden = !o;
    $('#acctName').textContent = me ? me.name : '';
    if (me) {
      $('#acctAv').textContent = me.name.charAt(0).toUpperCase();
      var role = $('#acctRole');
      role.textContent = o ? 'Artist' : 'Guest';
      role.classList.toggle('owner', o);
    }
    $('#uploader').hidden = !o;
    $('#rvGate').hidden = !!me && !o;
    $('#rvForm').hidden = !me || o;
    $('#rvLogin').hidden = !!me;
    $('#rvGateText').textContent = o ? 'You are logged in as the artist. You can remove any review below.' : 'Log in or create an account to leave a review.';
  }
  function setMode(m) {
    mode = m;
    var signup = m === 'signup';
    $('#tabLogin').classList.toggle('on', !signup); $('#tabLogin').setAttribute('aria-selected', String(!signup));
    $('#tabSignup').classList.toggle('on', signup); $('#tabSignup').setAttribute('aria-selected', String(signup));
    $('#auNameWrap').hidden = !signup;
    $('#authTitle').textContent = signup ? 'Join the fun' : 'Welcome back';
    $('#auGo').textContent = signup ? 'Create account' : 'Log in';
    $('#auLoginLabel').firstChild.nodeValue = signup ? 'Email' : 'Username or email';
    $('#auLogin').type = signup ? 'email' : 'text';
    $('#auLogin').autocomplete = signup ? 'email' : 'username';
    $('#auPass').autocomplete = signup ? 'new-password' : 'current-password';
    $('#auMsg').textContent = '';
  }
  function openAuth(m) {
    setMode(m || 'login');
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    setTimeout(function () { (m === 'signup' ? $('#auName') : $('#auLogin')).focus(); }, 30);
  }
  $('#loginBtn').addEventListener('click', function () { openAuth('login'); });
  $('#rvLogin').addEventListener('click', function () { openAuth('signup'); });
  $('#tabLogin').addEventListener('click', function () { setMode('login'); });
  $('#tabSignup').addEventListener('click', function () { setMode('signup'); });
  $('#auClose').addEventListener('click', function () { dlg.close(); });
  $('#authForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#auGo'), msg = $('#auMsg');
    var body = { login: $('#auLogin').value, password: $('#auPass').value };
    if (mode === 'signup') { body.name = $('#auName').value; body.email = $('#auLogin').value; }
    btn.disabled = true; msg.textContent = '';
    api('POST', mode === 'signup' ? '/api/register' : '/api/login', body).then(function (r) {
      me = r.user; $('#auPass').value = ''; dlg.close();
      renderAccount();
      toast('Welcome, ' + me.name + '!');
      if (isOwner()) { if (parseHash().name === 'dashboard') route(); else location.hash = '#/dashboard'; } else route();
    }).catch(function (err) { msg.textContent = err.message; }).then(function () { btn.disabled = false; });
  });
  $('#logoutBtn').addEventListener('click', function () {
    api('POST', '/api/logout').catch(function () {}).then(function () {
      me = null; renderAccount(); toast('Logged out. See you soon!');
      if (parseHash().name === 'dashboard') location.hash = '#/'; else route();
    });
  });

  /* ---------- shop settings (status, payments) ---------- */
  function applySettings() {
    var s = settings;
    var full = s.open && s.total > 0 && s.slots <= 0;
    $('#shopStatus').classList.toggle('closed', !s.open || full);
    $('#shopStatusText').textContent = !s.open ? 'Commissions are closed for now'
      : full ? 'Slots full · 0 of ' + s.total + ' open'
      : (s.total > 0 ? 'Commissions open · ' + s.slots + ' of ' + s.total + ' slots open' : 'Commissions open');
    var ob = $('#oSend'); if (ob) { ob.disabled = !s.open || full; }
    var om = $('#oMsg'); if (om && (!s.open || full)) om.textContent = full ? 'All slots are full right now (0 of ' + s.total + ' open). Check back soon!' : 'Commissions are closed right now.'; else if (om && /slots are full|closed right now/.test(om.textContent)) om.textContent = '';
    var n = $('#shopNotice'); n.hidden = !s.notice; n.textContent = s.notice || '';
    function pay(id, v) {
      var p = $(id); p.textContent = '';
      if (v) { p.appendChild(document.createTextNode('Send payments to ')); p.appendChild(el('b', '', v)); }
      else p.textContent = 'Details are sent with your quote.';
    }
    pay('#payPaypal', s.paypal); pay('#payCash', s.cashapp);
  }
  function loadSettings() {
    return api('GET', '/api/settings').then(function (r) { settings = r.settings; applySettings(); }).catch(function () { applySettings(); });
  }

  /* ---------- home and menu (rendered from menu.js) ---------- */
  var KIND_TEXT = { art: 'Art', physical: 'Handmade', either: 'Anything' };
  function renderMenu() {
    var mk = $('#makes'), grid = $('#menuGrid'), sel = $('#oType');
    window.MENU.forEach(function (m) {
      var a = el('a', 'make'); a.href = '#/menu';
      a.innerHTML = icon(m, '');
      var t = el('span'); t.appendChild(el('b', '', m.name)); t.appendChild(el('small', '', KIND_TEXT[m.kind]));
      a.appendChild(t); mk.appendChild(a);

      var c = el('article', 'card');
      c.innerHTML = icon(m, 'pic');
      c.appendChild(el('h2', '', m.name));
      c.appendChild(el('span', 'badge ' + m.kind, KIND_TEXT[m.kind]));
      c.appendChild(el('p', 'blurb', m.blurb));
      var p = el('div', 'price', m.price == null ? 'Ask for a quote' : 'From $' + m.price);
      if (m.price != null && m.unit) p.appendChild(el('small', '', ' ' + m.unit));
      c.appendChild(p);
      c.appendChild(el('p', 'days', 'About ' + m.days.toLowerCase().replace(/^about /, '')));
      var b = el('a', 'btn primary small', 'Order this'); b.href = '#/order?type=' + m.id; c.appendChild(b);
      grid.appendChild(c);

      var o = el('option', '', m.name + (m.price == null ? ' (ask for a quote)' : ' (from $' + m.price + ')')); o.value = m.id; sel.appendChild(o);
    });
    window.ADDONS.forEach(function (t) { $('#addons').appendChild(el('span', '', t)); });
    ART_KINDS.forEach(function (k) { var o = el('option', '', k); $('#artKind').appendChild(o); });
  }

  /* ---------- gallery ---------- */
  var SAMPLE = [
    { g: 'linear-gradient(160deg,#ff7ac8,#a77bff)', v: '--body:#1b1230;--ear:#ff7ac8;--accent:#ff7ac8;--line:#fff1fb;--blush:#ff7ac8', t: 'Night Imp', k: 'Head', d: '0s' },
    { g: 'linear-gradient(160deg,#6fc7ff,#a77bff)', v: '--body:#6a4cff;--ear:#fff1fb;--accent:#ff7ac8;--line:#fff1fb;--blush:#ff7ac8', t: 'Grape Soda', k: 'Bust', d: '.5s' },
    { g: 'linear-gradient(160deg,#a77bff,#1b1230)', v: '--body:#ff7ac8;--ear:#1b1230;--accent:#6fc7ff;--line:#fff1fb;--blush:#fff1fb', t: 'Bubblegum', k: 'YCH', d: '1s' },
    { g: 'linear-gradient(160deg,#1b1230,#6fc7ff)', v: '--body:#10091f;--ear:#6fc7ff;--accent:#6fc7ff;--line:#6fc7ff;--blush:#ff7ac8', t: 'Midnight', k: 'Full body', d: '1.5s' }
  ];
  var grads = ['linear-gradient(160deg,#ff7ac8,#a77bff)', 'linear-gradient(160deg,#6fc7ff,#a77bff)', 'linear-gradient(160deg,#a77bff,#1b1230)', 'linear-gradient(160deg,#1b1230,#6fc7ff)'];
  var art = [], galFilter = 'All', grid = $('#galleryGrid'), lb = $('#lightbox');

  function renderGallery() {
    var o = isOwner();
    grid.textContent = '';
    var chips = $('#galFilters'); chips.textContent = '';
    if (!art.length) {
      $('#galLead').textContent = o ? 'These are sample pieces. Upload your first artwork above and they will be replaced.' : 'Sample pieces for now. My own artwork appears here as soon as it is uploaded.';
      SAMPLE.forEach(function (s) {
        var f = el('figure', 'tile'); f.style.setProperty('--bg-g', s.g); f.style.cursor = 'default';
        f.innerHTML = '<span class="sp" style="top:10%;left:12%"></span><span class="sp" style="top:22%;right:10%;animation-delay:.7s"></span>' +
          '<svg class="mascot" viewBox="0 0 200 200" style="--dl:' + s.d + ';' + s.v + '" aria-hidden="true"><use href="#imp"/></svg>';
        var c = el('figcaption'); c.appendChild(el('span', '', s.t)); c.appendChild(el('span', '', s.k)); f.appendChild(c);
        grid.appendChild(f);
      });
      return;
    }
    $('#galLead').textContent = 'Fresh from the sketchbook. Tap any piece to look closer.';
    var kinds = ['All'];
    ART_KINDS.forEach(function (k) { if (art.some(function (a) { return a.kind === k; })) kinds.push(k); });
    if (kinds.indexOf(galFilter) < 0) galFilter = 'All';
    if (kinds.length > 2) kinds.forEach(function (k) {
      var b = el('button', 'chip' + (k === galFilter ? ' on' : ''), k); b.type = 'button';
      b.addEventListener('click', function () { galFilter = k; renderGallery(); });
      chips.appendChild(b);
    });
    art.filter(function (a) { return galFilter === 'All' || a.kind === galFilter; }).forEach(function (a, i) {
      var f = el('figure', 'tile'); f.style.setProperty('--bg-g', grads[i % grads.length]);
      f.tabIndex = 0; f.setAttribute('role', 'button'); f.setAttribute('aria-label', 'View ' + a.title);
      var img = document.createElement('img'); img.className = 'art'; img.loading = 'lazy'; img.alt = a.title; img.src = a.url; f.appendChild(img);
      var c = el('figcaption'); c.appendChild(el('span', '', a.title)); c.appendChild(el('span', '', a.kind)); f.appendChild(c);
      if (o) {
        var del = el('button', 'del', 'Delete'); del.type = 'button';
        armDelete(del, function () { return api('DELETE', '/api/artworks/' + a.id).then(loadArt); });
        f.appendChild(del);
      }
      function open() { $('#lbImg').src = a.url; $('#lbImg').alt = a.title; $('#lbCap').textContent = a.title + ' · ' + a.kind; if (lb.showModal) lb.showModal(); }
      f.addEventListener('click', open);
      f.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      grid.appendChild(f);
    });
  }
  function loadArt() {
    return api('GET', '/api/artworks').then(function (r) { art = r.artworks; renderGallery(); }).catch(function () { renderGallery(); });
  }
  $('#lbClose').addEventListener('click', function () { lb.close(); });
  lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });

  /* owner upload; big images are shrunk first so they fit the host's request limit */
  var fileIn = $('#artFile'), prev = $('#artPrev'), box = $('#artBox'), upMsg = $('#upMsg'), upBtn = $('#artUp'), objUrl = null;
  fileIn.addEventListener('change', function () {
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    var f = fileIn.files[0];
    if (f) { objUrl = URL.createObjectURL(f); prev.src = objUrl; prev.hidden = false; box.hidden = true; }
    else { prev.hidden = true; box.hidden = false; }
  });
  function shrink(file) {
    return new Promise(function (resolve) {
      var LIMIT = 4.5 * 1024 * 1024, MAXPX = 2400;
      if (file.type === 'image/gif') { resolve(file); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, MAXPX / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale === 1 && file.size <= LIMIT) { resolve(file); return; }
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          if (b && b.type === 'image/webp') { resolve(b.size < file.size || file.size > LIMIT ? b : file); return; }
          c.toBlob(function (j) { resolve(j && (j.size < file.size || file.size > LIMIT) ? j : file); }, 'image/jpeg', 0.9);
        }, 'image/webp', 0.9);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  upBtn.addEventListener('click', function () {
    var f = fileIn.files[0];
    if (!f) { upMsg.textContent = 'Choose an image first.'; return; }
    upBtn.disabled = true; upMsg.textContent = 'Uploading...';
    shrink(f).then(function (small) {
      var fd = new FormData();
      fd.append('title', $('#artTitle').value); fd.append('kind', $('#artKind').value); fd.append('file', small, 'art');
      return api('POST', '/api/artworks', fd, true);
    }).then(function () {
      upMsg.textContent = 'Added to your gallery!';
      fileIn.value = ''; $('#artTitle').value = ''; prev.hidden = true; box.hidden = false;
      loadArt();
    }).catch(function (e) { upMsg.textContent = e.message; }).then(function () { upBtn.disabled = false; });
  });
  onEnter.gallery = function () { renderGallery(); loadArt(); };

  /* ---------- reviews ---------- */
  var list = $('#rvList'), rvMsg = $('#rvMsg'), rating = 0, dirty = false;
  var sb = $$('#rvPick .sb');
  function setRating(n) {
    rating = n;
    sb.forEach(function (b) { var on = Number(b.dataset.n) <= n; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  sb.forEach(function (b) { b.addEventListener('click', function () { dirty = true; setRating(Number(b.dataset.n)); }); });
  $('#rvText').addEventListener('input', function () { dirty = true; });
  function loadReviews(resetForm) {
    return api('GET', '/api/reviews').then(function (r) {
      var rows = r.reviews, sum = rows.reduce(function (s, x) { return s + x.rating; }, 0), avg = rows.length ? sum / rows.length : 0;
      $('#rvAvg').textContent = rows.length ? avg.toFixed(1) : '–';
      $('#rvStars').textContent = stars(Math.round(avg));
      $('#rvCount').textContent = rows.length ? rows.length + (rows.length === 1 ? ' review' : ' reviews') : 'No reviews yet';
      list.textContent = '';
      if (!rows.length) list.appendChild(el('p', 'empty', 'No reviews yet. Be the first to leave one.'));
      var mine = null;
      rows.forEach(function (x) {
        if (x.mine) mine = x;
        var card = el('article', 'rv'), head = el('header');
        head.appendChild(el('span', 'av', x.name.charAt(0).toUpperCase()));
        var who = el('div', 'who');
        who.appendChild(el('b', '', x.name + (x.mine ? ' (you)' : ''))); who.appendChild(el('small', '', fmtDate(x.created)));
        head.appendChild(who);
        if (isOwner()) {
          var del = el('button', 'del', 'Remove'); del.type = 'button';
          armDelete(del, function () { return api('DELETE', '/api/reviews/' + x.userId).then(function () { loadReviews(); }); });
          head.appendChild(del);
        }
        card.appendChild(head);
        var st = el('div', 'stars', stars(x.rating)); st.setAttribute('aria-label', x.rating + ' out of 5 stars'); card.appendChild(st);
        if (x.text) card.appendChild(el('p', '', x.text));
        list.appendChild(card);
      });
      if (me && !isOwner()) {
        if (mine && (!dirty || resetForm)) { setRating(mine.rating); $('#rvText').value = mine.text; dirty = false; }
        if (!mine && resetForm) { setRating(0); $('#rvText').value = ''; }
        $('#rvSend').textContent = mine ? 'Update review' : 'Post review';
        $('#rvRemove').hidden = !mine;
      }
    }).catch(function () {
      list.textContent = ''; list.appendChild(el('p', 'empty', 'Reviews cannot be loaded right now. Please try again in a bit.'));
    });
  }
  $('#rvForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!rating) { rvMsg.textContent = 'Pick 1 to 5 stars first.'; return; }
    var btn = $('#rvSend'); btn.disabled = true; rvMsg.textContent = 'Posting...';
    api('PUT', '/api/reviews', { rating: rating, text: $('#rvText').value }).then(function () {
      dirty = false; rvMsg.textContent = 'Thank you! Your review is posted.'; loadReviews(true);
    }).catch(function (err) { rvMsg.textContent = err.message; }).then(function () { btn.disabled = false; });
  });
  armDelete($('#rvRemove'), function () {
    return api('DELETE', '/api/reviews/' + me.id).then(function () {
      dirty = false; setRating(0); $('#rvText').value = ''; rvMsg.textContent = 'Your review was removed.'; loadReviews(true);
    });
  });
  onEnter.reviews = function () { loadReviews(true); };

  /* ---------- order form ---------- */
  var typeSel = $('#oType');
  function menuItem(id) { return window.MENU.filter(function (m) { return m.id === id; })[0]; }
  function currentDM() { var c = $('input[name="dm"]:checked'); return c ? c.value : ''; }
  function showPanes() {
    var v = currentDM();
    $('#paneMail').hidden = v !== 'mail'; $('#paneStation').hidden = v !== 'station'; $('#paneDigital').hidden = v !== 'digital';
  }
  function updateType() {
    var m = menuItem(typeSel.value), physical = m && m.kind === 'physical';
    $('#dDigital').disabled = !!physical;
    if (physical && currentDM() === 'digital') { $('#dDigital').checked = false; showPanes(); }
    var h = $('#oTypeHint');
    h.hidden = !(m && (physical || m.kind === 'either'));
    h.textContent = physical ? 'This item is handmade and is mailed to you or handed over at a station (Houston, Pearland and Galveston area only).' : 'Tell me what you have in mind below, and I will let you know if I can make it.';
  }
  typeSel.addEventListener('change', updateType);
  $$('input[name="dm"]').forEach(function (r) { r.addEventListener('change', showPanes); });
  function prefillOrder() {
    $('#oName').value = $('#oName').value || (me && !isOwner() ? me.name : remember('wynn-name') || '');
    $('#oEmail').value = $('#oEmail').value || (me && me.email) || remember('wynn-email') || '';
    $('#oHandle').value = $('#oHandle').value || remember('wynn-handle') || '';
  }
  onEnter.order = function (q) {
    var t = q.get('type'); if (t && menuItem(t)) typeSel.value = t;
    updateType(); showPanes(); prefillOrder();
  };
  $('#orderForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('#oMsg'), btn = $('#oSend'), dm = currentDM(), delivery = { method: dm };
    if (dm === 'mail') delivery = { method: dm, fullName: $('#aName').value, line1: $('#aLine1').value, line2: $('#aLine2').value, city: $('#aCity').value, region: $('#aRegion').value, postal: $('#aPostal').value, country: $('#aCountry').value };
    if (dm === 'station') delivery = { method: dm, station: $('#sName').value, note: $('#sNote').value };
    msg.textContent = ''; btn.disabled = true;
    api('POST', '/api/orders', {
      type: typeSel.value, name: $('#oName').value, email: $('#oEmail').value, handle: $('#oHandle').value,
      characters: Number($('#oChars').value), details: $('#oDetails').value, refs: $('#oRefs').value,
      agree: $('#oAgree').checked, delivery: delivery
    }).then(function (r) {
      remember('wynn-name', $('#oName').value); remember('wynn-email', $('#oEmail').value); remember('wynn-handle', $('#oHandle').value);
      $('#doneId').textContent = r.id;
      $('#doneTrack').href = '#/track?id=' + r.id;
      var ret = $('#doneReturn'); ret.textContent = ''; ret.hidden = !r.returnAddress;
      if (r.returnAddress) { var b = el('div', 'retbox'); b.appendChild(el('b', '', 'My return address')); b.appendChild(document.createTextNode(r.returnAddress)); ret.appendChild(b); }
      $('#orderForm').hidden = true; $('#orderDone').hidden = false; window.scrollTo(0, 0);
      ['oDetails', 'oRefs'].forEach(function (id) { $('#' + id).value = ''; }); $('#oAgree').checked = false;
    }).catch(function (err) { msg.textContent = err.message; }).then(function () { btn.disabled = false; loadSettings(); });
  });
  $('#doneCopy').addEventListener('click', function () { copyText($('#doneId').textContent, 'Order ID copied'); });
  $('#doneAgain').addEventListener('click', function () { $('#orderDone').hidden = true; $('#orderForm').hidden = false; });

  /* ---------- tracking ---------- */
  function addressText(d) {
    if (d.method === 'mail') return [d.fullName, d.line1, d.line2, d.city + ', ' + d.region + ' ' + d.postal, d.country].filter(Boolean).join('\n');
    if (d.method === 'station') return 'Station meetup: ' + d.station + (d.note ? '\n' + d.note : '');
    return 'Digital copy (scan or photo) by email';
  }
  function renderTrack(o) {
    var res = $('#trackResult'); res.textContent = ''; res.hidden = false;
    var c = el('div', 'rcard');
    var head = el('div', 'rhead'); head.appendChild(el('h2', '', o.type)); head.appendChild(el('span', '', o.id + ' · ' + fmtDate(o.created)));
    c.appendChild(head);
    var method = o.delivery.method;
    var stages = method === 'mail' ? ['received', 'accepted', 'in_progress', 'ready', 'shipped', 'delivered'] : ['received', 'accepted', 'in_progress', 'ready', 'delivered'];
    var labels = { received: 'Request received', accepted: 'Accepted', in_progress: 'Being made', ready: 'Ready', shipped: 'Shipped', delivered: method === 'station' ? 'Handed over' : method === 'digital' ? 'Copy sent' : 'Delivered' };
    if (o.status === 'cancelled') c.appendChild(el('div', 'banner', 'This order was cancelled.'));
    else {
      var cur = stages.indexOf(o.status), ol = el('ol', 'tl');
      stages.forEach(function (s, i) {
        var li = el('li', o.status === 'delivered' || i < cur ? 'complete' : i === cur ? 'now' : '', labels[s]);
        if (li.className === 'now') li.setAttribute('aria-current', 'step');
        ol.appendChild(li);
      });
      c.appendChild(ol);
    }
    if (o.tracking) {
      var t = el('div', 'trk'); t.appendChild(el('b', '', (o.carrier || 'Tracking') + ' tracking number'));
      t.appendChild(el('code', '', o.tracking));
      var cp = el('button', 'btn ghost small', 'Copy'); cp.type = 'button'; cp.addEventListener('click', function () { copyText(o.tracking, 'Tracking number copied'); }); t.appendChild(cp);
      if (o.trackingUrl) { var a = el('a', 'btn primary small', 'Track package'); a.href = o.trackingUrl; a.target = '_blank'; a.rel = 'noopener'; t.appendChild(a); }
      c.appendChild(t);
    }
    var kv = el('dl', 'kv');
    kv.appendChild(el('dt', '', 'Sending to')); kv.appendChild(el('dd', '', addressText(o.delivery)));
    kv.appendChild(el('dt', '', 'Status')); kv.appendChild(el('dd', '', STATUS[o.status]));
    c.appendChild(kv);
    var hist = el('ul', 'hist');
    o.history.slice().reverse().forEach(function (h) {
      var li = el('li'); li.appendChild(el('b', '', STATUS[h.status] || h.status)); li.appendChild(document.createTextNode(' · ' + fmtDate(h.at) + (h.note ? ' · ' + h.note : '')));
      hist.appendChild(li);
    });
    c.appendChild(hist);
    res.appendChild(c);
    if (o.returnAddress) {
      var r = el('div', 'rcard'); r.appendChild(el('h2', '', 'Return address'));
      r.appendChild(el('p', 'hint', 'Message me before sending anything back. Then ship it to:'));
      r.appendChild(el('div', 'retbox', o.returnAddress));
      var rb = el('button', 'btn ghost small', 'Copy address'); rb.type = 'button'; rb.addEventListener('click', function () { copyText(o.returnAddress, 'Return address copied'); });
      r.appendChild(rb); res.appendChild(r);
    }
  }
  function runTrack(id, email) {
    var msg = $('#tMsg'), btn = $('#tGo'); msg.textContent = ''; btn.disabled = true;
    api('GET', '/api/orders/track?id=' + encodeURIComponent(id) + '&email=' + encodeURIComponent(email)).then(function (r) { renderTrack(r.order); })
      .catch(function (err) { $('#trackResult').hidden = true; msg.textContent = err.message; }).then(function () { btn.disabled = false; });
  }
  $('#trackForm').addEventListener('submit', function (e) { e.preventDefault(); runTrack($('#tId').value, $('#tEmail').value); });
  onEnter.track = function (q) {
    if (q.get('id')) $('#tId').value = q.get('id');
    if (!$('#tEmail').value) $('#tEmail').value = (me && me.email) || remember('wynn-email') || '';
    var mineBox = $('#myOrders'), chips = $('#myOrdersList');
    mineBox.hidden = true; chips.textContent = '';
    if (me && !isOwner()) api('GET', '/api/orders/mine').then(function (r) {
      if (!r.orders.length) return;
      mineBox.hidden = false;
      r.orders.forEach(function (o) {
        var b = el('button', 'chip', o.id + ' · ' + o.type + ' · ' + STATUS[o.status]); b.type = 'button';
        b.addEventListener('click', function () { $('#tId').value = o.id; $('#tEmail').value = me.email; runTrack(o.id, me.email); });
        chips.appendChild(b);
      });
    }).catch(function () {});
  };

  /* ---------- suggestion box ---------- */
  $('#sugForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#sSend'), msg = $('#sMsg'); btn.disabled = true; msg.textContent = '';
    api('POST', '/api/suggestions', { kind: $('#sKind').value, text: $('#sText').value, name: $('#sFrom').value }).then(function () {
      $('#sText').value = ''; toast('Thank you! Your suggestion is in the box.'); msg.textContent = 'Sent. Thank you!';
    }).catch(function (err) { msg.textContent = err.message; }).then(function () { btn.disabled = false; });
  });
  onEnter.suggestions = function () { $('#sMsg').textContent = ''; if (me && !$('#sFrom').value && !isOwner()) $('#sFrom').value = me.name; };

  /* ---------- terms ---------- */
  onEnter.terms = function () { loadSettings(); };

  /* ---------- artist dashboard ---------- */
  var orders = [], tab = 'orders';
  var isOpenOrder = function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; };
  function showTab(t) {
    tab = t;
    $$('#dashTabs .tab').forEach(function (b) { var on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    $('#tabOrders').hidden = t !== 'orders'; $('#tabSug').hidden = t !== 'sug'; $('#tabSettings').hidden = t !== 'settings';
    if (t === 'orders') loadOrders(); if (t === 'sug') loadSug(); if (t === 'settings') loadSettingsForm();
  }
  $$('#dashTabs .tab').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });
  onEnter.dashboard = function () { $('#dashName').textContent = me.name; showTab(tab); loadOrders(true); loadSug(true); };

  function loadOrders(quiet) {
    return api('GET', '/api/orders').then(function (r) {
      orders = r.orders; $('#cOrders').textContent = String(orders.filter(isOpenOrder).length || '');
      if (!quiet || tab === 'orders') renderOrders();
    }).catch(function (e) { toast(e.message); });
  }
  function opt(sel, val, label) { var o = el('option', '', label); o.value = val; sel.appendChild(o); }
  function renderOrders() {
    var f = $('#oFilter').value, box = $('#dashOrders'); box.textContent = '';
    var rows = orders.filter(function (o) { return f === 'all' || (f === 'open' ? isOpenOrder(o) : !isOpenOrder(o)); });
    if (!rows.length) { box.appendChild(el('p', 'empty', f === 'open' ? 'No open orders right now.' : 'Nothing here yet.')); return; }
    rows.forEach(function (o) {
      var c = el('article', 'ord'), top = el('div', 'top2');
      top.appendChild(el('h3', '', o.id + ' · ' + o.typeLabel)); top.appendChild(el('span', 'pillstat ' + o.status, STATUS[o.status])); c.appendChild(top);
      c.appendChild(el('p', 'meta', o.name + ' · ' + o.email + (o.handle ? ' · ' + o.handle : '') + ' · ' + o.characters + ' character' + (o.characters === 1 ? '' : 's') + ' · ' + fmtDate(o.created)));
      c.appendChild(el('pre', '', o.details));
      if (o.refs) c.appendChild(el('pre', '', 'References: ' + o.refs));
      var addr = el('div', 'retbox'); addr.appendChild(el('b', '', 'Send to')); addr.appendChild(document.createTextNode(addressText(o.delivery))); c.appendChild(addr);
      var ctrl = el('div', 'ctrl');
      var l1 = el('label', '', 'Status'), st = el('select'); Object.keys(STATUS).forEach(function (k) { opt(st, k, STATUS[k]); }); st.value = o.status; l1.appendChild(st);
      var l2 = el('label', '', 'Carrier'), ca = el('select'); [['', 'None yet'], ['USPS', 'USPS'], ['UPS', 'UPS'], ['FedEx', 'FedEx'], ['Other', 'Other']].forEach(function (p) { opt(ca, p[0], p[1]); }); ca.value = o.carrier || ''; l2.appendChild(ca);
      var l3 = el('label', '', 'Tracking number'), tr = el('input'); tr.type = 'text'; tr.maxLength = 40; tr.value = o.tracking || ''; l3.appendChild(tr);
      var l4 = el('label', '', 'Note for the customer'), no = el('input'); no.type = 'text'; no.maxLength = 300; no.placeholder = 'Optional'; l4.appendChild(no);
      [l1, l2, l3, l4].forEach(function (l) { ctrl.appendChild(l); }); c.appendChild(ctrl);
      var row = el('div', 'rowbtns'), save = el('button', 'btn primary small', 'Save update'); save.type = 'button';
      var cp = el('button', 'btn ghost small', 'Copy address'); cp.type = 'button'; cp.addEventListener('click', function () { copyText(addressText(o.delivery), 'Address copied'); });
      var del = el('button', 'del', 'Delete order'), msg = el('span', 'msg'); del.type = 'button';
      save.addEventListener('click', function () {
        save.disabled = true; msg.textContent = '';
        api('PATCH', '/api/orders/' + o.id, { status: st.value, carrier: ca.value, tracking: tr.value, note: no.value })
          .then(function () { toast('Order ' + o.id + ' updated'); loadOrders(); loadSettings(); }).catch(function (e) { msg.textContent = e.message; }).then(function () { save.disabled = false; });
      });
      armDelete(del, function () { return api('DELETE', '/api/orders/' + o.id).then(function () { loadOrders(); loadSettings(); }); });
      [save, cp, del, msg].forEach(function (x) { row.appendChild(x); }); c.appendChild(row);
      box.appendChild(c);
    });
  }
  $('#oFilter').addEventListener('change', renderOrders);

  function loadSug(quiet) {
    return api('GET', '/api/suggestions').then(function (r) {
      $('#cSug').textContent = String(r.suggestions.filter(function (s) { return !s.done; }).length || '');
      if (quiet && tab !== 'sug') return;
      var box = $('#dashSug'); box.textContent = '';
      if (!r.suggestions.length) { box.appendChild(el('p', 'empty', 'The suggestion box is empty.')); return; }
      r.suggestions.forEach(function (s) {
        var c = el('article', 'ord'), top = el('div', 'top2');
        top.appendChild(el('h3', '', s.kind)); top.appendChild(el('span', 'pillstat' + (s.done ? ' delivered' : ''), s.done ? 'Done' : 'New')); c.appendChild(top);
        c.appendChild(el('p', 'meta', (s.name || 'Anonymous') + ' · ' + fmtDate(s.created)));
        c.appendChild(el('pre', '', s.text));
        var row = el('div', 'rowbtns'), tg = el('button', 'btn ghost small', s.done ? 'Mark as new' : 'Mark as done'); tg.type = 'button';
        var del = el('button', 'del', 'Delete'); del.type = 'button';
        tg.addEventListener('click', function () { api('PATCH', '/api/suggestions/' + s.id, { done: !s.done }).then(function () { loadSug(); }); });
        armDelete(del, function () { return api('DELETE', '/api/suggestions/' + s.id).then(function () { loadSug(); }); });
        row.appendChild(tg); row.appendChild(del); c.appendChild(row); box.appendChild(c);
      });
    }).catch(function (e) { toast(e.message); });
  }

  function loadSettingsForm() {
    api('GET', '/api/settings').then(function (r) {
      var s = r.settings;
      $('#stOpen').checked = !!s.open; $('#stTotal').value = s.total; $('#stNotice').value = s.notice || '';
      $('#stTaken').textContent = 'Right now ' + s.taken + ' of ' + s.total + ' slots are taken. This updates by itself as orders come in. An order holds a slot until you mark it delivered or cancelled.';
      $('#stPaypal').value = s.paypal || ''; $('#stCash').value = s.cashapp || ''; $('#stReturn').value = s.returnAddress || '';
    }).catch(function (e) { toast(e.message); });
  }
  $('#setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#stSave'), msg = $('#stMsg'); btn.disabled = true; msg.textContent = '';
    api('PUT', '/api/settings', {
      open: $('#stOpen').checked, total: $('#stTotal').value, notice: $('#stNotice').value,
      paypal: $('#stPaypal').value, cashapp: $('#stCash').value, returnAddress: $('#stReturn').value
    }).then(function (r) { settings = r.settings; applySettings(); msg.textContent = 'Saved!'; toast('Shop settings saved'); })
      .catch(function (err) { msg.textContent = err.message; }).then(function () { btn.disabled = false; });
  });

  /* ---------- start ---------- */
  renderMenu(); updateType(); applySettings(); renderGallery();
  /* keep the slot count live: refresh every 30 seconds and whenever the tab comes back */
  function refreshSlots() { if (!document.hidden) api('GET', '/api/settings').then(function (r) { settings = r.settings; applySettings(); }).catch(function () {}); }
  setInterval(refreshSlots, 30000);
  document.addEventListener('visibilitychange', refreshSlots);
  Promise.all([
    api('GET', '/api/me').then(function (r) { me = r.user; }).catch(function () {}),
    loadSettings()
  ]).then(function () { renderAccount(); route(); });
})();
