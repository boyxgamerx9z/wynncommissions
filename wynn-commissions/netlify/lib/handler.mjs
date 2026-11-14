// The whole backend. Storage comes in through `getStore`, so the same code runs on
// Netlify Blobs in production and on a fake in-memory store in tests.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BODY = 5.5 * 1024 * 1024; // Netlify Functions allow about 6 MB per request
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

// Keep these ids in sync with public/menu.js
const ART_KINDS = ['YCH', 'Couple art', 'Keychain', 'Bust', 'Full body', 'Head', 'Ita bag', 'Other'];
const ORDER_TYPES = {
  ych: 'YCH', couple: 'Couple art', 'key-leather': 'Keychain (leather)', 'key-wood': 'Keychain (wood)',
  bust: 'Bust', full: 'Full body', head: 'Head', ita: 'Ita bag', special: 'Special request'
};
const PHYSICAL = ['key-leather', 'key-wood', 'ita'];
const STATUSES = ['received', 'accepted', 'in_progress', 'ready', 'shipped', 'delivered', 'cancelled'];
const CARRIERS = ['', 'USPS', 'UPS', 'FedEx', 'Other'];
const SUGGESTION_KINDS = ['Art idea', 'Website', 'Prices or menu', 'Something else'];
const DEFAULT_SETTINGS = { open: true, total: 5, notice: '', paypal: '', cashapp: '', returnAddress: '' };

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const rid = (n) => crypto.randomBytes(n).toString('hex');
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return salt.toString('hex') + ':' + h.toString('hex');
}
async function checkPassword(pw, stored) {
  const [s, h] = String(stored).split(':');
  if (!s || !h) return false;
  const a = await scrypt(pw, Buffer.from(s, 'hex'), 64);
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function safeEqual(a, b) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
}
function newOrderId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(6);
  let s = 'WN-';
  for (let i = 0; i < 6; i++) s += abc[b[i] % abc.length];
  return s;
}

function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const fields = {}; let file = null, pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    const part = buf.subarray(pos + boundary.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8');
      const data = part.subarray(split + 4);
      const name = /name="([^"]*)"/.exec(head);
      if (name) {
        if (/filename="/.test(head)) file = { field: name[1], data };
        else fields[name[1]] = data.toString('utf8');
      }
    }
    pos = next;
  }
  return { fields, file };
}
function sniffImage(b) {
  if (b.length > 12 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'gif';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
function trackingUrl(carrier, num) {
  if (!num || !/^[A-Za-z0-9-]{5,40}$/.test(num)) return '';
  const n = encodeURIComponent(num);
  if (carrier === 'USPS') return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + n;
  if (carrier === 'UPS') return 'https://www.ups.com/track?tracknum=' + n;
  if (carrier === 'FedEx') return 'https://www.fedex.com/fedextrack/?trknbr=' + n;
  return '';
}

export function createHandler(getStore, getEnv = () => process.env) {
  const stores = {};
  const store = (name) => stores[name] || (stores[name] = getStore({ name, consistency: 'strong' }));
  const hits = new Map();

  function limited(req, key, max, windowMs) {
    const ip = String(req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    const k = key + ':' + ip, now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    arr.push(now); hits.set(k, arr);
    if (hits.size > 5000) hits.clear();
    return arr.length > max;
  }
  function json(status, obj, extra) {
    return new Response(JSON.stringify(obj), {
      status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) }
    });
  }
  const fail = (status, error) => json(status, { error });

  /* signed session cookie: no session storage needed */
  function sign(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
  }
  function verify(token, secret) {
    const [body, mac] = String(token || '').split('.');
    if (!body || !mac) return null;
    const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return p && p.exp > Date.now() ? p : null;
    } catch { return null; }
  }
  function cookieOf(req, name) {
    const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(req.headers.get('cookie') || '');
    return m ? decodeURIComponent(m[1]) : '';
  }
  function sessionCookie(req, token, maxAgeMs) {
    const secure = new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
    return 'sid=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(maxAgeMs / 1000) + (secure ? '; Secure' : '');
  }
  function loginCookie(req, user, secret) {
    const token = sign({ ...user, exp: Date.now() + SESSION_MS }, secret);
    return { 'Set-Cookie': sessionCookie(req, token, SESSION_MS) };
  }

  async function readBuffer(req) {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
    return buf;
  }
  async function readJson(req) {
    const buf = await readBuffer(req);
    if (buf.length > 30000) throw Object.assign(new Error('too large'), { status: 413 });
    try { const v = JSON.parse(buf.toString('utf8') || '{}'); return v && typeof v === 'object' ? v : {}; }
    catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
  }
  async function listAll(s, prefix) {
    const out = await s.list(prefix ? { prefix } : undefined);
    const rows = await Promise.all((out.blobs || []).slice(0, 400).map((b) => s.get(b.key, { type: 'json' })));
    return rows.filter(Boolean);
  }
  async function getSettings() {
    const saved = (await store('settings').get('main', { type: 'json' })) || {};
    return { ...DEFAULT_SETTINGS, ...saved };
  }
  /* Slots are automatic: every order that is not delivered or cancelled holds one slot. */
  async function slotInfo(s) {
    const total = Number(s.total) || 0;
    if (!total) return { total: 0, taken: 0, slots: 0 };
    const rows = await listAll(store('orders'), 'o/');
    const taken = rows.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;
    return { total, taken, slots: Math.max(0, total - taken) };
  }
  const publicSettings = (s, info) => ({ open: !!s.open, slots: info.slots, taken: info.taken, total: info.total, notice: s.notice, paypal: s.paypal, cashapp: s.cashapp });

  function orderView(o, returnAddress) {
    return {
      id: o.id, type: o.typeLabel, status: o.status, created: o.created, characters: o.characters,
      delivery: o.delivery, carrier: o.carrier, tracking: o.tracking, trackingUrl: trackingUrl(o.carrier, o.tracking),
      history: o.history, returnAddress: returnAddress || ''
    };
  }

  function readDelivery(b, typeId) {
    const d = b && typeof b === 'object' ? b : {};
    const method = ['mail', 'station', 'digital'].includes(d.method) ? d.method : '';
    if (!method) return { error: 'Please choose where I should send your art.' };
    if (method === 'digital' && PHYSICAL.includes(typeId)) return { error: 'That item is physical, so it needs a mailing address or a station meetup.' };
    if (method === 'digital') return { value: { method } };
    if (method === 'station') {
      const station = clean(d.station, 120), note = clean(d.note, 200);
      if (station.length < 2) return { error: 'Please type the station name for the meetup.' };
      return { value: { method, station, note } };
    }
    const a = {
      method, fullName: clean(d.fullName, 80), line1: clean(d.line1, 120), line2: clean(d.line2, 120),
      city: clean(d.city, 80), region: clean(d.region, 80), postal: clean(d.postal, 20), country: clean(d.country, 60)
    };
    if (a.fullName.length < 2 || a.line1.length < 3 || a.city.length < 2 || !a.region || a.postal.length < 2 || a.country.length < 2) {
      return { error: 'Please fill in the full mailing address (name, street, city, state or region, postal code and country).' };
    }
    return { value: a };
  }

  async function route(req) {
    const env = getEnv();
    const url = new URL(req.url);
    const path = url.pathname, method = req.method;

    /* uploaded images */
    if (path.startsWith('/uploads/') && (method === 'GET' || method === 'HEAD')) {
      const file = path.slice('/uploads/'.length);
      const m = /^[0-9a-f]{24}\.(png|jpg|gif|webp)$/.exec(file);
      if (!m) return new Response('Not found', { status: 404 });
      const data = await store('images').get(file, { type: 'arrayBuffer' });
      if (!data) return new Response('Not found', { status: 404 });
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': IMG_TYPES[m[1]], 'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    }
    if (!path.startsWith('/api/')) return fail(404, 'Not found.');
    if (method !== 'GET' && req.headers.get('x-requested-with') !== 'fetch') return fail(403, 'Blocked request.');

    const secret = env.SESSION_SECRET;
    if (!secret || secret.length < 16) {
      console.error('SESSION_SECRET is missing or too short (use 16+ characters).');
      return fail(500, 'The site is not set up yet. The owner needs to finish the Netlify settings.');
    }
    const ownerUser = norm(env.OWNER_USERNAME || 'wynn');
    const ownerEmail = norm(env.OWNER_EMAIL);
    const ownerName = clean(env.OWNER_NAME, 40) || 'Wynn';
    const session = verify(cookieOf(req, 'sid'), secret);
    const user = session ? { id: session.id, name: session.name, role: session.role, email: session.email || '' } : null;
    const isOwner = !!user && user.role === 'owner';
    const ownerOnly = () => fail(403, 'Only the artist can do that.');

    if (path === '/api/me' && method === 'GET') return json(200, { user });

    /* ---------- accounts ---------- */
    if (path === '/api/register' && method === 'POST') {
      if (limited(req, 'auth', 10, 600000)) return fail(429, 'Too many tries. Please wait a few minutes.');
      const b = await readJson(req);
      const name = clean(b.name, 40), email = clean(b.email, 254).toLowerCase(), pw = String(b.password || '');
      if (name.length < 2) return fail(400, 'Please enter a name (at least 2 characters).');
      if ([ownerUser, norm(ownerName)].includes(norm(name))) return fail(400, 'That name is reserved. Please pick another one.');
      if (!EMAIL.test(email)) return fail(400, 'Please enter a valid email address.');
      if (pw.length < 8 || pw.length > 200) return fail(400, 'Your password needs at least 8 characters.');
      const key = 'email/' + sha(email);
      if ((ownerEmail && email === ownerEmail) || (await store('users').get(key, { type: 'json' }))) {
        return fail(409, 'That email already has an account. Try logging in.');
      }
      const u = { id: 'u' + rid(8), name, email, pass: await hashPassword(pw), created: Date.now() };
      await store('users').setJSON(key, u);
      const out = { id: u.id, name, role: 'guest', email };
      return json(201, { user: out }, loginCookie(req, out, secret));
    }

    if (path === '/api/login' && method === 'POST') {
      if (limited(req, 'auth', 10, 600000)) return fail(429, 'Too many tries. Please wait a few minutes.');
      const b = await readJson(req);
      const who = norm(clean(b.login != null ? b.login : b.email, 254));
      const pw = String(b.password || '');
      const bad = () => fail(401, 'That login and password do not match.');
      if (who && (who === ownerUser || (ownerEmail && who === ownerEmail))) {
        if (!env.OWNER_PASSWORD || !safeEqual(pw, env.OWNER_PASSWORD)) return bad();
        const u = { id: 'owner', name: ownerName, role: 'owner', email: '' };
        return json(200, { user: u }, loginCookie(req, u, secret));
      }
      const row = await store('users').get('email/' + sha(who), { type: 'json' });
      const ok = row ? await checkPassword(pw, row.pass) : (await checkPassword('x', await hashPassword('y')), false);
      if (!ok) return bad();
      const u = { id: row.id, name: row.name, role: 'guest', email: row.email };
      return json(200, { user: u }, loginCookie(req, u, secret));
    }

    if (path === '/api/logout' && method === 'POST') {
      return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
    }

    /* ---------- shop status and settings ---------- */
    if (path === '/api/settings' && method === 'GET') {
      const s = await getSettings(), info = await slotInfo(s);
      return json(200, { settings: isOwner ? { ...publicSettings(s, info), returnAddress: s.returnAddress } : publicSettings(s, info) });
    }
    if (path === '/api/settings' && method === 'PUT') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const num = (v, d) => { const n = Math.round(Number(v)); return n >= 0 && n <= 99 ? n : d; };
      const s = {
        open: !!b.open, total: num(b.total, 0), notice: clean(b.notice, 200),
        paypal: clean(b.paypal, 80), cashapp: clean(b.cashapp, 40), returnAddress: clean(b.returnAddress, 400)
      };
      await store('settings').setJSON('main', s);
      return json(200, { settings: { ...publicSettings(s, await slotInfo(s)), returnAddress: s.returnAddress } });
    }

    /* ---------- gallery ---------- */
    if (path === '/api/artworks' && method === 'GET') {
      const rows = (await listAll(store('art'), 'meta/')).sort((a, b) => b.created - a.created).slice(0, 200);
      return json(200, { artworks: rows.map((r) => ({ id: r.id, title: r.title, kind: r.kind, url: '/uploads/' + r.file })) });
    }
    if (path === '/api/artworks' && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const buf = await readBuffer(req);
      const mp = parseMultipart(buf, req.headers.get('content-type'));
      if (!mp || !mp.file || !mp.file.data.length) return fail(400, 'Choose an image first.');
      const ext = sniffImage(mp.file.data);
      if (!ext) return fail(400, 'Please use a PNG, JPG, GIF or WebP image.');
      const file = rid(12) + '.' + ext;
      const d = mp.file.data;
      await store('images').set(file, d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      const id = rid(6);
      await store('art').setJSON('meta/' + id, {
        id, file, created: Date.now(), title: clean(mp.fields.title, 60) || 'Untitled',
        kind: ART_KINDS.includes(mp.fields.kind) ? mp.fields.kind : 'Other'
      });
      return json(201, { id });
    }
    let m = /^\/api\/artworks\/([0-9a-f]{12})$/.exec(path);
    if (m && method === 'DELETE') {
      if (!isOwner) return ownerOnly();
      const meta = await store('art').get('meta/' + m[1], { type: 'json' });
      if (meta) { await store('art').delete('meta/' + m[1]); await store('images').delete(meta.file); }
      return json(200, { ok: true });
    }

    /* ---------- reviews ---------- */
    if (path === '/api/reviews' && method === 'GET') {
      const rows = (await listAll(store('reviews'))).sort((a, b) => b.created - a.created).slice(0, 200);
      return json(200, {
        reviews: rows.map((r) => ({ userId: r.userId, name: r.name, rating: r.rating, text: r.text, created: r.created, mine: !!user && user.id === r.userId }))
      });
    }
    if (path === '/api/reviews' && method === 'PUT') {
      if (!user) return fail(401, 'Please log in to leave a review.');
      if (isOwner) return fail(403, 'The artist cannot review her own site.');
      if (limited(req, 'review', 20, 600000)) return fail(429, 'Slow down a little and try again soon.');
      const b = await readJson(req);
      const rating = Math.round(Number(b.rating));
      if (!(rating >= 1 && rating <= 5)) return fail(400, 'Pick 1 to 5 stars.');
      const old = await store('reviews').get(user.id, { type: 'json' });
      const now = Date.now();
      await store('reviews').setJSON(user.id, {
        userId: user.id, name: user.name, rating, text: clean(b.text, 600), created: old ? old.created : now, updated: now
      });
      return json(200, { ok: true });
    }
    m = /^\/api\/reviews\/([a-z0-9]{3,40})$/.exec(path);
    if (m && method === 'DELETE') {
      if (!user || (!isOwner && user.id !== m[1])) return fail(403, 'You can only remove your own review.');
      await store('reviews').delete(m[1]);
      return json(200, { ok: true });
    }

    /* ---------- orders and tracking ---------- */
    if (path === '/api/orders' && method === 'POST') {
      if (limited(req, 'order', 6, 600000)) return fail(429, 'That is a lot of requests at once. Please wait a few minutes.');
      const b = await readJson(req);
      const typeId = String(b.type || '');
      if (!ORDER_TYPES[typeId]) return fail(400, 'Please choose what you would like me to make.');
      const name = clean(b.name, 60), email = clean(b.email, 254).toLowerCase();
      if (name.length < 2) return fail(400, 'Please enter your name.');
      if (!EMAIL.test(email)) return fail(400, 'Please enter a valid email so I can reach you.');
      const details = clean(b.details, 2000);
      if (details.length < 10) return fail(400, 'Please tell me a bit more about what you want (at least a sentence).');
      const del = readDelivery(b.delivery, typeId);
      if (del.error) return fail(400, del.error);
      if (b.agree !== true) return fail(400, 'Please tick the box to agree to the terms.');
      const s = await getSettings();
      if (!s.open) return fail(409, 'Commissions are closed right now. Please check back soon.');
      const info = await slotInfo(s);
      if (info.total > 0 && info.slots <= 0) return fail(409, 'All commission slots are full right now (0 of ' + info.total + ' open). Please check back when a slot opens.');
      let id = newOrderId();
      for (let i = 0; i < 5 && (await store('orders').get('o/' + id, { type: 'json' })); i++) id = newOrderId();
      const now = Date.now();
      const order = {
        id, created: now, status: 'received', type: typeId, typeLabel: ORDER_TYPES[typeId],
        name, email, handle: clean(b.handle, 60), characters: Math.min(10, Math.max(1, Math.round(Number(b.characters)) || 1)),
        details, refs: clean(b.refs, 1000), delivery: del.value, carrier: '', tracking: '',
        userId: user && !isOwner ? user.id : '', history: [{ status: 'received', note: 'Request received.', at: now }]
      };
      await store('orders').setJSON('o/' + id, order);
      if (order.userId) await store('orders').setJSON('mine/' + order.userId + '/' + id, { id });
      return json(201, { id, returnAddress: s.returnAddress });
    }

    if (path === '/api/orders/track' && method === 'GET') {
      if (limited(req, 'track', 20, 600000)) return fail(429, 'Too many lookups. Please wait a few minutes.');
      const id = clean(url.searchParams.get('id'), 12).toUpperCase();
      const email = clean(url.searchParams.get('email'), 254).toLowerCase();
      const o = /^WN-[A-Z2-9]{6}$/.test(id) ? await store('orders').get('o/' + id, { type: 'json' }) : null;
      if (!o || !email || !safeEqual(o.email, email)) return fail(404, 'We could not find that order. Check the order ID and the email you used.');
      return json(200, { order: orderView(o, (await getSettings()).returnAddress) });
    }

    if (path === '/api/orders/mine' && method === 'GET') {
      if (!user || isOwner) return json(200, { orders: [] });
      const out = await store('orders').list({ prefix: 'mine/' + user.id + '/' });
      const rows = await Promise.all((out.blobs || []).slice(0, 50).map((x) => store('orders').get('o/' + x.key.split('/').pop(), { type: 'json' })));
      return json(200, { orders: rows.filter(Boolean).sort((a, c) => c.created - a.created).map((o) => ({ id: o.id, type: o.typeLabel, status: o.status, created: o.created })) });
    }

    if (path === '/api/orders' && method === 'GET') {
      if (!isOwner) return ownerOnly();
      const rows = (await listAll(store('orders'), 'o/')).sort((a, c) => c.created - a.created).slice(0, 300);
      return json(200, { orders: rows });
    }

    m = /^\/api\/orders\/(WN-[A-Z2-9]{6})$/.exec(path);
    if (m && method === 'PATCH') {
      if (!isOwner) return ownerOnly();
      const o = await store('orders').get('o/' + m[1], { type: 'json' });
      if (!o) return fail(404, 'Order not found.');
      const b = await readJson(req);
      const note = clean(b.note, 300);
      const status = STATUSES.includes(b.status) ? b.status : o.status;
      const carrier = CARRIERS.includes(b.carrier) ? b.carrier : o.carrier;
      const tracking = b.tracking != null ? clean(b.tracking, 40) : o.tracking;
      if (tracking && !/^[A-Za-z0-9-]{5,40}$/.test(tracking)) return fail(400, 'Tracking numbers use letters, numbers and dashes only (5 to 40 characters).');
      if (status !== o.status || note) o.history.push({ status, note, at: Date.now() });
      if (o.history.length > 60) o.history = o.history.slice(-60);
      Object.assign(o, { status, carrier, tracking });
      await store('orders').setJSON('o/' + o.id, o);
      return json(200, { order: o });
    }
    if (m && method === 'DELETE') {
      if (!isOwner) return ownerOnly();
      const o = await store('orders').get('o/' + m[1], { type: 'json' });
      if (o) {
        await store('orders').delete('o/' + m[1]);
        if (o.userId) await store('orders').delete('mine/' + o.userId + '/' + m[1]);
      }
      return json(200, { ok: true });
    }

    /* ---------- suggestion box ---------- */
    if (path === '/api/suggestions' && method === 'POST') {
      if (limited(req, 'suggest', 6, 600000)) return fail(429, 'Thanks! Please wait a few minutes before sending another.');
      const b = await readJson(req);
      const text = clean(b.text, 1000);
      if (text.length < 10) return fail(400, 'Please write at least a sentence so I can understand your idea.');
      const id = rid(6);
      await store('suggestions').setJSON('s/' + id, {
        id, created: Date.now(), done: false, text,
        kind: SUGGESTION_KINDS.includes(b.kind) ? b.kind : 'Something else',
        name: clean(b.name, 40) || (user && !isOwner ? user.name : '')
      });
      return json(201, { ok: true });
    }
    if (path === '/api/suggestions' && method === 'GET') {
      if (!isOwner) return ownerOnly();
      const rows = (await listAll(store('suggestions'), 's/')).sort((a, c) => c.created - a.created).slice(0, 300);
      return json(200, { suggestions: rows });
    }
    m = /^\/api\/suggestions\/([0-9a-f]{12})$/.exec(path);
    if (m && method === 'PATCH') {
      if (!isOwner) return ownerOnly();
      const s = await store('suggestions').get('s/' + m[1], { type: 'json' });
      if (!s) return fail(404, 'Not found.');
      const b = await readJson(req);
      s.done = !!b.done;
      await store('suggestions').setJSON('s/' + m[1], s);
      return json(200, { suggestion: s });
    }
    if (m && method === 'DELETE') {
      if (!isOwner) return ownerOnly();
      await store('suggestions').delete('s/' + m[1]);
      return json(200, { ok: true });
    }

    return fail(404, 'Not found.');
  }

  return async function handle(req) {
    try { return await route(req); }
    catch (e) {
      const status = e && e.status ? e.status : 500;
      if (status === 500) console.error(e);
      return fail(status, status === 413 ? 'That is too large. Try a smaller image (under 5 MB).' : status === 400 ? 'Bad request.' : 'Something went wrong. Please try again.');
    }
  };
}
