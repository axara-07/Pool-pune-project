// PoolPune server – no npm packages needed. Run: node backend/server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = require('./lib/graph'), market = require('./lib/market'), store = require('./lib/store'), auth = require('./lib/auth'), safety = require('./lib/safety');
const PORT = process.env.PORT || 3000, FRONT = path.join(__dirname, '..', 'frontend');
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(8).toString('hex');      // opens the safety-team console (admin.html)
const baseUrl = req => process.env.PUBLIC_URL || `http://${(req && req.headers.host) || 'localhost:' + PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const httpErr = (status, msg) => Object.assign(new Error(msg), { status });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, bad) => {
  if (!/application\/json/.test(req.headers['content-type'] || '')) return bad(httpErr(415, 'Send JSON'));   // also blocks cross-site form posts
  let s = ''; req.on('data', c => { s += c; if (s.length > 1e5) { req.destroy(); bad(httpErr(413, 'Body too large')); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(httpErr(400, 'Invalid JSON')); } }); });

auth.driverUsers().forEach(store.addDriver);
market.restore(store.drivers);
const requireRole = (u, role) => { if (u.role !== role) throw httpErr(403, `This is only for ${role}s`); };
const driverEntity = u => store.drivers.find(d => d.userId === u.id);
const withSafety = u => Object.assign(market.riderView(u, store.drivers), { safety: safety.status(u) });
function adminAuth(req) {
  const k = Buffer.from(String(req.headers['x-admin-key'] || '')), a = Buffer.from(ADMIN_KEY);
  if (k.length !== a.length || !crypto.timingSafeEqual(k, a)) throw httpErr(401, 'Wrong safety-team key');
}
function startSession(res, u) { res.setHeader('Set-Cookie', auth.cookie(auth.createSession(u.id))); }

async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  if (route === 'GET /api/health') return send(res, 200, { ok: true });
  if (route === 'GET /api/areas') return send(res, 200, [...G.names].sort((x, y) => x.localeCompare(y)));
  // ---- accounts (public) ----
  if (route === 'POST /api/auth/register-rider' || route === 'POST /api/auth/register-driver') {
    const role = route.endsWith('driver') ? 'driver' : 'rider';
    const u = auth.register(await readBody(req), role, G.names);
    if (role === 'driver') store.addDriver(u);
    startSession(res, u); return send(res, 201, { user: auth.publicUser(u) });
  }
  if (route === 'POST /api/auth/login') {
    const b = await readBody(req), u = auth.login(b.email, b.password, b.role, req.socket.remoteAddress);
    startSession(res, u); return send(res, 200, { user: auth.publicUser(u) });
  }
  if (route === 'POST /api/auth/logout') { auth.destroySession(req); res.setHeader('Set-Cookie', auth.clearCookie); return send(res, 200, { ok: true }); }
  // ---- public live-trip page (a long random token is the key) and the safety-team console (admin key) ----
  if (route.startsWith('GET /api/track/')) {
    const t = url.pathname.slice('/api/track/'.length); if (!/^[a-f0-9]{32}$/.test(t)) throw httpErr(404, 'This link is not valid');
    return send(res, 200, safety.track(t, store.drivers));
  }
  if (route === 'GET /api/admin/alerts') { adminAuth(req); return send(res, 200, { alerts: safety.adminList() }); }
  if (route === 'POST /api/admin/resolve') { adminAuth(req); const b = await readBody(req); safety.adminResolve(b.id, b.note); return send(res, 200, { alerts: safety.adminList() }); }
  // ---- everything below needs a login ----
  const user = auth.userFromReq(req);
  if (!user) throw httpErr(401, 'Please log in');
  if (route === 'GET /api/auth/me') return send(res, 200, { user: auth.publicUser(user) });
  if (route === 'GET /api/graph') return send(res, 200, { areas: G.AREAS, roads: G.roads, status: G.status() });
  if (route === 'GET /api/distances') return send(res, 200, { names: G.names, matrix: G.matrix() });
  if (route === 'GET /api/drivers') return send(res, 200, store.drivers.filter(d => d.online).map(({ id, at, busy, label }) => ({ id, at, busy, label })));
  // ---- rider portal: post a request, watch it, cancel it ----
  if (route === 'POST /api/requests') { requireRole(user, 'rider'); market.createRequest(user, await readBody(req)); return send(res, 201, withSafety(user)); }
  if (route === 'GET /api/requests/mine') { requireRole(user, 'rider'); return send(res, 200, withSafety(user)); }
  if (route === 'POST /api/requests/cancel') { requireRole(user, 'rider'); market.riderCancel(user); return send(res, 200, withSafety(user)); }
  // ---- safety (riders AND drivers) ----
  if (route === 'GET /api/safety/me') return send(res, 200, safety.me(user));
  if (route === 'POST /api/safety/profile') return send(res, 200, await safety.saveProfile(user, await readBody(req), baseUrl(req)));
  if (route === 'POST /api/safety/share') { requireRole(user, 'rider'); const b = await readBody(req); return send(res, 200, await safety.share(user, baseUrl(req), b.sendToContacts === true)); }
  if (route === 'POST /api/safety/sos') { const b = await readBody(req); return send(res, 200, await safety.sos(user, store.drivers, baseUrl(req), b.note, b.geo)); }
  if (route === 'POST /api/safety/cancel-alert') { safety.cancelAlert(user); return send(res, 200, safety.me(user)); }
  if (route === 'POST /api/safety/checkin-ok') { requireRole(user, 'rider'); safety.checkinOk(user); return send(res, 200, withSafety(user)); }
  if (route === 'POST /api/safety/report') return send(res, 200, safety.report(user, store.drivers, await readBody(req)));
  // ---- driver portal: go online, see requests, choose rides, drive ----
  if (route.startsWith('GET /api/driver/') || route.startsWith('POST /api/driver/')) {
    requireRole(user, 'driver'); const e = driverEntity(user), view = () => send(res, 200, market.driverView(e, user));
    if (route === 'GET /api/driver/me') return view();
    const b = await readBody(req).catch(() => ({}));
    if (route === 'POST /api/driver/status') {
      if (typeof b.online === 'boolean') { if (!b.online && e.tripId) throw httpErr(409, 'Finish your current trip before going offline'); e.online = b.online; }
      if (b.area !== undefined) {
        if (!Object.hasOwn(G.AREAS, b.area)) throw httpErr(400, 'Unknown area');
        if (e.busy) throw httpErr(409, 'Finish your current trip before changing location');
        e.at = b.area;
      }
      return view();
    }
    if (route === 'POST /api/driver/accept') { market.accept(e, b.requestIds); return view(); }
    if (route === 'POST /api/driver/add') { market.addRide(e, b.requestId); return view(); }
    if (route === 'POST /api/driver/advance') { market.advance(e, b.pin); return view(); }
    if (route === 'POST /api/driver/cancel-trip') { market.cancelTrip(e); return view(); }
  }
  throw httpErr(404, 'Unknown API route');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const f = path.normalize(path.join(FRONT, url.pathname === '/' ? 'login.html' : decodeURIComponent(url.pathname)));
    if (!f.startsWith(FRONT)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
  } catch (e) { send(res, e.status || 500, { error: e.message, field: e.field }); }
}).listen(PORT, () => {
  console.log(`PoolPune running at http://localhost:${PORT}`);
  console.log(`Safety-team console: http://localhost:${PORT}/admin.html   key: ${ADMIN_KEY}${process.env.ADMIN_KEY ? '' : '   (random each start; set ADMIN_KEY to keep it)'}`);
  setInterval(() => { try { safety.sweep(store.drivers, baseUrl()); } catch (e) { console.error('safety sweep failed', e.message); } }, 5000).unref();
  console.log(require('./lib/sms').live() ? `SMS: real messages via ${require('./lib/sms').provider()}` : 'SMS: DEMO mode (messages only printed here). See README to send real SMS.');
  G.loadRoads().then(s => console.log(`Road distances: ${s.real}/${s.total} real` + (s.real < s.total ? ' (rest are estimates; restart with internet to fetch them)' : '')));
});
