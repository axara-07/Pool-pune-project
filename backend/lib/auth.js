// Accounts + sessions (no packages). Passwords are hashed with scrypt; a login is a random token in an HttpOnly cookie.
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const DIR = process.env.POOLPUNE_DATA || path.join(__dirname, '..', 'data'), UF = path.join(DIR, 'users.json'), SF = path.join(DIR, 'sessions.json');
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const save = (f, o) => { try { fs.writeFileSync(f, JSON.stringify(o, null, 1)); } catch (e) { console.error('save failed', e.message); } };
let users = load(UF, []), sessions = load(SF, {});
const SESSION_MS = 7 * 864e5, VEHICLES = ['Hatchback', 'Sedan', 'SUV', 'Auto rickshaw'];
const err = (status, message, field) => Object.assign(new Error(message), { status, field });
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64);
const GENDERS = { female: 'female', male: 'male', 'non-binary': 'nonbinary', nonbinary: 'nonbinary', 'prefer not to say': 'unspecified', unspecified: 'unspecified', '': 'unspecified' };
const cleanGender = v => { const g = GENDERS[String(v == null ? '' : v).trim().toLowerCase()]; if (!g) throw err(400, 'Choose a gender option (or "Prefer not to say")', 'gender'); return g; };
const cleanPhone = raw => { let p = String(raw || '').replace(/[\s\-+]/g, ''); if (p.length === 12 && p.startsWith('91')) p = p.slice(2); return /^[6-9]\d{9}$/.test(p) ? p : null; };
const publicUser = u => ({ id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, gender: u.gender || 'unspecified',
  ...(u.driver ? { driver: { vehicleType: u.driver.vehicleType, plate: u.driver.plate, homeArea: u.driver.homeArea } } : {}) });

function clean(b, role, areas) {            // validate sign-up data (the browser checks too, but the server never trusts it)
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) throw err(400, 'Enter your full name', 'name');
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw err(400, 'Enter a valid email address', 'email');
  const phone = cleanPhone(b.phone); if (!phone) throw err(400, 'Enter a valid 10-digit mobile number', 'phone');
  const password = String(b.password || '');
  if (password.length < 8 || password.length > 100 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw err(400, 'Password needs 8+ characters with a letter and a number', 'password');
  const out = { name, email, phone, password, gender: cleanGender(b.gender) };
  if (role === 'driver') {
    const vehicleType = String(b.vehicleType || ''); if (!VEHICLES.includes(vehicleType)) throw err(400, 'Choose your vehicle type', 'vehicleType');
    const plate = String(b.plate || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!/^[A-Z]{2} ?\d{1,2} ?[A-Z]{1,3} ?\d{4}$/.test(plate)) throw err(400, 'Enter a plate like MH12 AB 1234', 'plate');
    const licence = String(b.licence || '').toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{10,16}$/.test(licence)) throw err(400, 'Enter your licence number (10–16 letters/numbers)', 'licence');
    const homeArea = String(b.homeArea || ''); if (!areas.includes(homeArea)) throw err(400, 'Choose your starting area', 'homeArea');
    Object.assign(out, { vehicleType, plate, licence, homeArea });
  }
  return out;
}
function register(b, role, areas) {
  const c = clean(b, role, areas);
  if (users.some(u => u.email === c.email)) throw err(409, 'An account with this email already exists. Try logging in.', 'email');
  const salt = crypto.randomBytes(16).toString('hex');
  const u = { id: users.reduce((m, x) => Math.max(m, x.id), 0) + 1, role, name: c.name, email: c.email, phone: c.phone, gender: c.gender, contacts: [], blocked: [], salt,
    hash: hashPw(c.password, salt).toString('hex'), createdAt: new Date().toISOString() };
  if (role === 'driver') u.driver = { vehicleType: c.vehicleType, plate: c.plate, licence: c.licence, homeArea: c.homeArea };
  users.push(u); save(UF, users); return u;
}
const fails = new Map();                    // simple brute-force protection: 5 wrong passwords = 1 minute lock
function login(email, password, role, ip) {
  email = String(email || '').trim().toLowerCase();
  const key = email + '|' + ip, f = fails.get(key);
  if (f && f.until > Date.now()) throw err(429, `Too many attempts. Try again in ${Math.ceil((f.until - Date.now()) / 1000)} seconds.`);
  const u = users.find(x => x.email === email);
  const h = hashPw(String(password || ''), u ? u.salt : 'x'.repeat(32));          // same work even for unknown emails
  if (!(u && crypto.timingSafeEqual(h, Buffer.from(u.hash, 'hex')))) {
    const prev = f && (f.until === 0 || f.until > Date.now()) ? f.n : 0, n = prev + 1;
    fails.set(key, { n, until: n >= 5 ? Date.now() + 60000 : 0 });
    throw err(401, 'Wrong email or password', 'password');
  }
  fails.delete(key);
  if (role && u.role !== role) throw err(403, u.role === 'driver' ? 'This is a driver account. Switch to the "I\'m a driver" tab.' : 'This is a rider account. Switch to the "I\'m a rider" tab.');
  return u;
}
function createSession(userId) {
  const t = crypto.randomBytes(32).toString('hex'), now = Date.now();
  for (const k in sessions) if (sessions[k].exp < now) delete sessions[k];
  sessions[t] = { userId, exp: now + SESSION_MS }; save(SF, sessions); return t;
}
const tokenFrom = req => { const m = /(?:^|;\s*)pp_session=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return m && m[1]; };
function userFromReq(req) { const t = tokenFrom(req), s = t && sessions[t]; if (!s || s.exp < Date.now()) return null; return users.find(u => u.id === s.userId) || null; }
function destroySession(req) { const t = tokenFrom(req); if (t) { delete sessions[t]; save(SF, sessions); } }
const cookie = t => `pp_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`;
const clearCookie = 'pp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
// ---- safety settings: gender (optional, used for same-gender preferences), trusted contacts, blocked people ----
const userById = id => users.find(u => u.id === id) || null;
function updateSafety(u, b) {
  if (b.gender !== undefined) u.gender = cleanGender(b.gender);
  if (b.contacts !== undefined) {
    if (!Array.isArray(b.contacts) || b.contacts.length > 3) throw err(400, 'You can add up to 3 emergency contacts', 'contacts');
    const seen = new Set(), out = [];
    for (const c of b.contacts) {
      const name = String((c && c.name) || '').trim().replace(/\s+/g, ' '), phone = cleanPhone(c && c.phone);
      if (!name && !(c && c.phone)) continue;                                     // empty row: ignore
      if (name.length < 2 || name.length > 40) throw err(400, 'Enter each contact\'s name', 'contacts');
      if (!phone) throw err(400, `Enter a valid 10-digit mobile number for ${name}`, 'contacts');
      if (!seen.has(phone)) { seen.add(phone); out.push({ name, phone }); }
    }
    u.contacts = out;
  }
  save(UF, users); return u;
}
function block(userId, otherId) { const u = userById(userId); if (!u || userId === otherId) return; u.blocked = u.blocked || []; if (!u.blocked.includes(otherId)) { u.blocked.push(otherId); save(UF, users); } }
const isBlocked = (a, b) => { const x = userById(a), y = userById(b); return !!((x && (x.blocked || []).includes(b)) || (y && (y.blocked || []).includes(a))); };
const genderOf = id => { const u = userById(id); return (u && u.gender) || 'unspecified'; };
module.exports = { userById, updateSafety, block, isBlocked, genderOf, register, login, createSession, userFromReq, destroySession, cookie, clearCookie, publicUser, driverUsers: () => users.filter(u => u.role === 'driver') };
