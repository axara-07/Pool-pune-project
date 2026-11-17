// Ride marketplace. Riders POST requests. DRIVERS choose which request(s) to take (one, or two that pool well),
// and can add a second compatible ride while already driving.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), G = require('./graph'), auth = require('./auth'), sms = require('./sms');
const FILE = path.join(process.env.POOLPUNE_DATA || path.join(__dirname, '..', 'data'), 'market.json');
const BASE = 40, RATE = 12, TTL = 15 * 60 * 1000, ACTIVE = ['pending', 'accepted', 'onboard'];
const CAP = { 'Hatchback': 4, 'Sedan': 4, 'SUV': 6, 'Auto rickshaw': 3 };      // passenger seats
const err = (status, message) => Object.assign(new Error(message), { status });
let db = { requests: [], trips: [], alerts: [], nextReq: 1, nextTrip: 1, nextAlert: 1 };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) {}
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); } catch (e) { console.error('save failed', e.message); } };
const soloFare = km => BASE + RATE * km, r1 = n => Math.round(n * 10) / 10;
const reqById = id => db.requests.find(r => r.id === id), tripById = id => db.trips.find(t => t.id === id);
const first = n => String(n).split(' ')[0];
// ---------- safety rules: who may be matched with whom ----------
// Preferences are optional. 'same' = only the same gender (needs the rider's gender to be set). Blocks work both ways.
const known = g => g && g !== 'unspecified';
const genderOk = (pref, mine, other) => pref !== 'same' || (known(mine) && mine === other);
function canServe(driver, r) {                      // may this driver see / take this request at all?
  if (auth.isBlocked(driver.userId, r.riderUserId)) return false;
  return genderOk(r.driverPref, r.gender, auth.genderOf(driver.userId));
}
const compatible = (a, b) => genderOk(a.coRider, a.gender, b.gender) && genderOk(b.coRider, b.gender, a.gender) && !auth.isBlocked(a.riderUserId, b.riderUserId);
const newPin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');
const pinFails = new Map();                         // wrong-PIN throttle: 5 wrong tries = 1 minute wait
function checkPin(r, pin, kind = 'start') {      // kind 'start' = pickup PIN, 'end' = ride-over OTP given to the driver at drop-off
  const want = kind === 'end' ? r.endPin : r.pin, key = r.id + ':' + kind;
  if (!want) return;                                // requests created before these codes existed
  const f = pinFails.get(key) || { n: 0, until: 0 };
  if (f.until > Date.now()) throw err(429, `Too many wrong codes. Try again in ${Math.ceil((f.until - Date.now()) / 1000)} seconds.`);
  if (String(pin == null ? '' : pin).trim() !== want) {
    f.n++; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60000; } pinFails.set(key, f);
    throw err(403, kind === 'end' ? 'Wrong end-of-ride OTP. Ask the rider for the 4-digit OTP shown in their app.' : 'Wrong ride PIN. Ask the rider for the 4-digit PIN shown in their app.');
  }
  pinFails.delete(key);
}
// SMS the rider their code too (real SMS if a provider is set up, console in demo mode). Never blocks or breaks the ride.
const textRider = (r, msg) => { const u = auth.userById(r.riderUserId); if (u && u.phone) sms.send(u.phone, msg).catch(() => {}); };
const stopsOf = r => [{ node: r.pickup, type: 'pickup', reqId: r.id }, { node: r.drop, type: 'drop', reqId: r.id }];

// after a server restart: drivers who were mid-trip are busy again
function restore(drivers) {
  db.trips.filter(t => t.status === 'running').forEach(t => {
    const d = drivers.find(x => x.userId === t.driverUserId); if (!d) return;
    d.busy = true; d.tripId = t.id; d.online = true;
    const done = t.stops.filter(s => s.done); if (done.length) d.at = done[done.length - 1].node;
  });
}
function expire() {
  let ch = false;
  db.requests.forEach(r => { if (r.status === 'pending' && Date.now() - Date.parse(r.createdAt) > TTL) { r.status = 'expired'; ch = true; } });
  if (ch) save();
}

// ---------- planning ----------
const perms = a => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
// Best stop order starting from `start`. Rules: each pickup before its own drop; with 2 riders BOTH must be in the car together
// (both pickups before the first drop) and neither rider's detour may pass their own limit. A rider already on board has only a drop stop.
function measure(start, o, reqs) {          // distances, detours and validity of ONE stop order (null if a limit is broken)
  const ids = [...new Set(o.map(s => s.reqId))], posP = {}, posD = {};
  o.forEach((s, i) => { (s.type === 'pickup' ? posP : posD)[s.reqId] = i; });
  for (const id of ids) { if (posP[id] !== undefined && posP[id] > posD[id]) return null; if (posP[id] === undefined) posP[id] = -1; }
  const cum = [0]; let cur = start; o.forEach(s => { cum.push(cum[cum.length - 1] + G.dist(cur, s.node)); cur = s.node; });
  const at = k => k < 0 ? 0 : cum[k + 1], inKm = {}, det = {};
  for (const id of ids) {
    const sk = reqs[id].soloKm; inKm[id] = at(posD[id]) - at(posP[id]);
    det[id] = sk ? Math.max(0, Math.round((inKm[id] - sk) / sk * 100)) : 0;
    if (ids.length > 1 && det[id] > reqs[id].maxDetour + 1e-9) return null;
  }
  return { order: o, total: cum[cum.length - 1], cum, inKm, det, posP, posD };
}
function bestOrder(start, stops, reqs) {
  const ids = [...new Set(stops.map(s => s.reqId))];
  let best = null;
  for (const o of perms(stops)) {
    const plan = measure(start, o, reqs); if (!plan) continue;
    if (ids.length > 1 && Math.max(...ids.map(i => plan.posP[i])) > Math.min(...ids.map(i => plan.posD[i]))) continue;
    if (!best || plan.total < best.total) best = plan;
  }
  return best;
}
// Add ONE new ride into a trip that is already running. The existing stops keep their order; the new pickup and drop are slotted in
// at the cheapest places. Seats in the car may never go over `cap` at any moment, and nobody's detour limit may be broken.
function insertBest(start, undone, r, reqs, cap, occ0) {
  const ps = stopsOf(r); let best = null;
  for (let i = 0; i <= undone.length; i++) for (let j = i; j <= undone.length; j++) {
    const o = [...undone.slice(0, i), ps[0], ...undone.slice(i, j), ps[1], ...undone.slice(j)];
    let occ = occ0, ok = true;
    for (const s of o) { occ += (s.type === 'pickup' ? 1 : -1) * reqs[s.reqId].seats; if (occ > cap) { ok = false; break; } }
    if (!ok) continue;
    const plan = measure(start, o, reqs); if (plan && (!best || plan.total < best.total)) best = plan;
  }
  return best;
}
// plan + fares. Pooled: the shared route is priced once and split by solo distance, never above anyone's solo fare.
function priceFares(plan, reqs) {
  const ids = Object.keys(plan.inKm), fares = {};
  if (ids.length === 1) fares[ids[0]] = reqs[ids[0]].soloFare;
  else {
    const fp = Math.min(...ids.map(i => plan.posP[i])), base = fp >= 0 ? plan.cum[fp + 1] : 0;
    const loaded = plan.total - base, total = soloFare(loaded), sum = ids.reduce((s, i) => s + reqs[i].soloKm, 0);
    ids.forEach(i => { fares[i] = Math.min(Math.round(total * reqs[i].soloKm / sum), reqs[i].soloFare); });
    plan.loadedKm = r1(loaded);
  }
  plan.fares = fares; return plan;
}
function evaluate(start, stops, reqs) { const plan = bestOrder(start, stops, reqs); return plan ? priceFares(plan, reqs) : null; }
function describe(plan, reqs) {
  const ids = Object.keys(plan.inKm);
  const riders = ids.map(i => ({ reqId: +i, name: first(reqs[i].riderName), inKm: r1(plan.inKm[i]), detourPct: plan.det[i], soloFare: reqs[i].soloFare, fare: plan.fares[i] }));
  return { stops: plan.order.map(s => ({ node: s.node, type: s.type, reqId: s.reqId, rider: first(reqs[s.reqId].riderName) })),
    totalKm: r1(plan.total), toFirstKm: r1(plan.cum[1]), loadedKm: plan.loadedKm || null, riders,
    saving: riders.reduce((s, r) => s + r.soloFare - r.fare, 0) };
}
const applyFare = (r, plan) => { if (plan.fares[r.id] === undefined) return;      // rider already dropped off: keep their fare
  r.fare = r.fare == null ? plan.fares[r.id] : Math.min(r.fare, plan.fares[r.id]);   // a fare shown to a rider never goes up
  r.inKm = r1(plan.inKm[r.id]); r.detourPct = plan.det[r.id]; };

// ---------- riders ----------
function createRequest(user, b) {
  const pickup = String(b.pickup), drop = String(b.drop);
  if (!Object.hasOwn(G.AREAS, pickup) || !Object.hasOwn(G.AREAS, drop)) throw err(400, 'Choose a valid pickup and drop area');
  if (pickup === drop) throw err(400, 'Pickup and drop must be different areas');
  const seats = Math.round(Number(b.seats) || 1); if (seats < 1 || seats > 3) throw err(400, 'Passengers must be 1 to 3');
  let md = Number(b.maxDetour); if (!Number.isFinite(md)) md = 40; md = Math.min(100, Math.max(0, md));
  const coRider = b.coRider === 'same' ? 'same' : 'any', driverPref = b.driverPref === 'same' ? 'same' : 'any', gender = user.gender || 'unspecified';
  if ((coRider === 'same' || driverPref === 'same') && !known(gender)) throw err(400, 'To use same-gender preferences, set your gender first (Safety settings).');
  expire();
  if (db.requests.some(r => r.riderUserId === user.id && ACTIVE.includes(r.status))) throw err(409, 'You already have an active ride. Cancel it or finish it first.');
  const km = G.dist(pickup, drop);
  const r = { id: db.nextReq++, riderUserId: user.id, riderName: user.name, pickup, drop, seats, share: b.share === true, maxDetour: md, status: 'pending',
    createdAt: new Date().toISOString(), coRider, driverPref, gender, pin: newPin(), shareToken: null, checkin: null, soloKm: r1(km), soloFare: Math.round(soloFare(km)), fare: null, inKm: null, detourPct: 0, tripId: null };
  db.requests.push(r); save(); return r;
}
function riderCancel(user) {
  const r = db.requests.find(x => x.riderUserId === user.id && ACTIVE.includes(x.status));
  if (!r) throw err(404, 'No active ride to cancel');
  if (r.status !== 'pending') throw err(409, 'A driver has already accepted this ride. Ask the driver to cancel.');
  r.status = 'cancelled'; save();
}
function riderView(user, drivers) {
  expire();
  const mine = db.requests.filter(r => r.riderUserId === user.id), a = mine.find(r => ACTIVE.includes(r.status));
  let active = null;
  if (a) {
    active = { id: a.id, status: a.status, pickup: a.pickup, drop: a.drop, seats: a.seats, share: a.share, soloKm: a.soloKm, soloFare: a.soloFare, fare: a.fare, inKm: a.inKm, detourPct: a.detourPct, createdAt: a.createdAt,
      coRider: a.coRider || 'any', driverPref: a.driverPref || 'any', shared: !!a.shareToken, pin: a.status === 'accepted' ? a.pin || null : null, endPin: a.status === 'onboard' ? a.endPin || null : null };
    if (a.status === 'pending') active.waiting = { driversOnline: drivers.filter(d => d.online).length, ahead: db.requests.filter(r => r.status === 'pending' && r.id < a.id).length };
    else {
      const t = tripById(a.tripId), d = drivers.find(x => x.userId === t.driverUserId), undone = t.stops.filter(s => !s.done);
      const co = t.requestIds.filter(i => i !== a.id).map(reqById).filter(x => ACTIVE.includes(x.status));
      active.trip = { driverName: first(t.driverName), vehicleType: t.vehicleType, plate: t.plate, driverAt: d.at, sharedWith: co.length ? co.map(x => first(x.riderName)).join(', ') : null,
        stops: t.stops.map(s => ({ node: s.node, type: s.type, done: s.done, mine: s.reqId === a.id })),
        routeGeo: G.geoPath(G.chain([d.at, ...undone.map(s => s.node)])) };
    }
  }
  const history = mine.filter(r => r !== a).slice(-10).reverse().map(r => ({ id: r.id, pickup: r.pickup, drop: r.drop, share: r.share, fare: r.fare, soloFare: r.soloFare, status: r.status, createdAt: r.createdAt }));
  return { active, history };
}

// ---------- drivers ----------
const BEYOND_KM = 8;      // a drop-off may be this far past the driver's last stop ("a little further")
const capOf = d => CAP[d.vehicleType] || 4;
// Does request `r` fit the route the driver is on right now? Returns { ok, kind, label, reason, plan }.
//  kind 'route'  : pickup AND drop both lie on the road the driver will take anyway (drop-off in between)
//  kind 'beyond' : pickup lies on the route, drop is a short distance past the last stop
function tripFit(driver, trip, r) {
  const riders = trip.requestIds.map(reqById), undone = trip.stops.filter(s => !s.done);
  if (!canServe(driver, r)) return { ok: false, reason: 'Not available to you' };
  if (riders.filter(x => x.status === 'accepted' || x.status === 'onboard').some(x => !compatible(x, r))) return { ok: false, reason: "Doesn't match a current rider's preferences" };
  if (!riders.every(x => x.share)) return { ok: false, reason: 'Your current rider asked for a solo ride' };
  if (!r.share) return { ok: false, reason: 'This rider wants a solo ride' };
  const path = G.chain([driver.at, ...undone.map(s => s.node)]), last = undone[undone.length - 1].node;
  const pi = path.indexOf(r.pickup), di = path.lastIndexOf(r.drop);
  let kind = null;
  if (pi >= 0 && di > pi) kind = 'route';
  else if (pi >= 0 && di < 0 && G.dist(last, r.drop) <= BEYOND_KM) kind = 'beyond';
  if (!kind) return { ok: false, reason: pi < 0 ? 'Pickup is not on your route' : di >= 0 ? 'Drop-off is behind you on this route' : 'Drop-off is too far past your destination' };
  const ids = [...new Set(undone.map(s => s.reqId))], reqs = { [r.id]: r }; ids.forEach(i => { reqs[i] = reqById(i); });
  const occ0 = riders.filter(x => x.status === 'onboard').reduce((s, x) => s + x.seats, 0);
  const plan = insertBest(driver.at, undone, r, reqs, capOf(driver), occ0);
  if (!plan) return { ok: false, reason: "Doesn't fit: not enough seats, or it would stretch a rider's trip too much" };
  // the driver must not go backwards or take a detour: extra distance is only allowed for the short "beyond" drop-off
  let cur = driver.at, now = 0; undone.forEach(x => { now += G.dist(cur, x.node); cur = x.node; });
  if (plan.total - now > (kind === 'beyond' ? BEYOND_KM : 0) + 0.5) return { ok: false, reason: 'Would need a detour or backtracking (seats are full on the way)' };
  priceFares(plan, reqs);
  return { ok: true, kind, label: kind === 'route' ? 'On your route' : `Drop-off a little beyond your destination (${r1(G.dist(last, r.drop))} km)`, plan, reqs };
}
function offersFor(driver) {
  expire();
  if (!driver.online) return { mode: 'offline', offers: [], pairs: [] };
  const cap = capOf(driver), pending = db.requests.filter(r => r.status === 'pending' && canServe(driver, r)).slice(0, 100);
  const base = r => ({ requestId: r.id, rider: first(r.riderName), pickup: r.pickup, drop: r.drop, seats: r.seats, share: r.share, soloKm: r.soloKm, fare: r.soloFare,
    kmToPickup: r1(G.dist(driver.at, r.pickup)), ageSec: Math.round((Date.now() - Date.parse(r.createdAt)) / 1000) });
  const trip = driver.tripId ? tripById(driver.tripId) : null;
  if (!trip) {
    const offers = pending.filter(r => r.seats <= cap).map(base).sort((a, b) => a.kmToPickup - b.kmToPickup);
    const sh = pending.filter(r => r.share && r.seats <= cap).slice(0, 20), pairs = [];
    for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
      const a = sh[i], b = sh[j]; if (a.seats + b.seats > cap || !compatible(a, b)) continue;
      const reqs = { [a.id]: a, [b.id]: b }, plan = evaluate(driver.at, [...stopsOf(a), ...stopsOf(b)], reqs);
      if (plan) pairs.push({ requestIds: [a.id, b.id], ...describe(plan, reqs) });
    }
    pairs.sort((x, y) => y.saving - x.saving);
    return { mode: 'idle', offers, pairs: pairs.slice(0, 3) };
  }
  // driving: the driver sees EVERY waiting request; each one says whether it fits the route and why not if it doesn't
  const undone = trip.stops.filter(s => !s.done), seatsNow = trip.requestIds.map(reqById).filter(x => x.status === 'onboard' || x.status === 'accepted').reduce((s, x) => s + x.seats, 0);
  const offers = pending.map(r => {
    const f = tripFit(driver, trip, r), o = base(r);
    o.fit = f.ok ? { ok: true, kind: f.kind, label: f.label, plan: describe(f.plan, f.reqs) } : { ok: false, reason: f.reason };
    return o;
  }).sort((a, b) => (b.fit.ok - a.fit.ok) || (b.fit.ok ? b.fit.plan.saving - a.fit.plan.saving : a.kmToPickup - b.kmToPickup));
  return { mode: 'trip', offers, pairs: [], route: G.chain([driver.at, ...undone.map(s => s.node)]), seatsBooked: seatsNow, capacity: cap };
}
function accept(driver, ids) {
  if (!driver.online) throw err(409, 'Go online first');
  if (driver.tripId) throw err(409, 'Finish your current trip first');
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 2 || new Set(ids).size !== ids.length) throw err(400, 'Pick one ride, or two different rides');
  expire();
  const rs = ids.map(id => reqById(Number(id)));
  if (rs.some(r => !r || r.status !== 'pending')) throw err(409, 'That ride is no longer available');
  if (rs.reduce((s, r) => s + r.seats, 0) > (CAP[driver.vehicleType] || 4)) throw err(409, 'Not enough seats in your vehicle for these rides');
  if (rs.some(r => !canServe(driver, r))) throw err(409, 'That ride is not available to you');
  if (rs.length === 2 && !rs.every(r => r.share)) throw err(409, 'Both riders must allow sharing');
  if (rs.length === 2 && !compatible(rs[0], rs[1])) throw err(409, "These two riders' preferences don't match");
  const reqs = {}; rs.forEach(r => { reqs[r.id] = r; });
  const plan = evaluate(driver.at, rs.flatMap(stopsOf), reqs);
  if (!plan) throw err(409, "These rides can't be pooled within the riders' detour limits");
  const trip = { id: db.nextTrip++, driverUserId: driver.userId, driverName: driver.name, vehicleType: driver.vehicleType, plate: driver.plate,
    requestIds: rs.map(r => r.id), stops: plan.order.map(s => ({ ...s, done: false })), status: 'running', pooled: rs.length === 2, createdAt: new Date().toISOString(), lastProgressAt: Date.now() };
  db.trips.push(trip); rs.forEach(r => { r.status = 'accepted'; r.tripId = trip.id; applyFare(r, plan); });
  driver.busy = true; driver.tripId = trip.id; save();
  rs.forEach(r => r.pin && textRider(r, `PoolPune: your ride PIN is ${r.pin}. Tell it to the driver (${driver.name}, ${driver.plate}) only after checking the name and number plate.`));
}
function addRide(driver, reqId) {                   // driver is on a trip and adds one more ride that fits the route (as many as the seats allow)
  const trip = driver.tripId && tripById(driver.tripId); if (!trip) throw err(409, 'You have no trip to add to');
  expire(); const r = reqById(Number(reqId));
  if (!r || r.status !== 'pending') throw err(409, 'That ride is no longer available');
  const fit = tripFit(driver, trip, r); if (!fit.ok) throw err(409, fit.reason);
  const plan = fit.plan, riders = trip.requestIds.map(reqById);
  trip.stops = [...trip.stops.filter(s => s.done), ...plan.order.map(s => ({ ...s, done: false }))];
  trip.requestIds.push(r.id); trip.pooled = true; trip.lastProgressAt = Date.now();
  r.status = 'accepted'; r.tripId = trip.id; applyFare(r, plan); riders.forEach(x => applyFare(x, plan)); save();
  if (r.pin) textRider(r, `PoolPune: your ride PIN is ${r.pin}. Tell it to the driver (${driver.name}, ${driver.plate}) only after checking the name and number plate.`);
}
function advance(driver, pin) {                     // driver confirms they reached the next stop (a pickup also needs the rider's PIN)
  const trip = driver.tripId && tripById(driver.tripId); if (!trip) throw err(409, 'You have no active trip');
  const s = trip.stops.find(x => !x.done), r = reqById(s.reqId);
  if (s.type === 'pickup') checkPin(r, pin, 'start'); else checkPin(r, pin, 'end');
  s.done = true; driver.at = s.node; trip.lastProgressAt = Date.now();
  if (s.type === 'pickup') { r.status = 'onboard'; r.pickedAt = new Date().toISOString(); r.endPin = newPin(); textRider(r, `PoolPune: your end-of-ride OTP is ${r.endPin}. Give it to the driver only when you have reached your drop-off.`); }
  else { r.status = 'completed'; r.finishedAt = new Date().toISOString(); r.checkin = null; r.endPin = null; }
  if (trip.stops.every(x => x.done)) { trip.status = 'completed'; trip.completedAt = new Date().toISOString(); driver.busy = false; driver.tripId = null; }
  save();
}
function cancelTrip(driver) {                       // only before anything has happened
  const trip = driver.tripId && tripById(driver.tripId); if (!trip) throw err(409, 'You have no active trip');
  if (trip.stops.some(s => s.done)) throw err(409, 'You already started this trip. Finish it instead.');
  trip.requestIds.forEach(id => { const r = reqById(id); r.status = 'pending'; r.tripId = null; r.fare = null; r.inKm = null; r.detourPct = 0; r.pin = newPin(); r.endPin = null; r.checkin = null; });
  trip.status = 'cancelled'; driver.busy = false; driver.tripId = null; save();
}
function driverView(driver, user) {
  const mine = db.trips.filter(t => t.driverUserId === driver.userId), done = mine.filter(t => t.status === 'completed');
  const fareOf = t => t.requestIds.reduce((s, id) => s + (reqById(id).fare || 0), 0);
  let trip = null;
  if (driver.tripId) {
    const t = tripById(driver.tripId);
    trip = { id: t.id, pooled: t.pooled, capacity: capOf(driver), ridersCount: t.requestIds.length,
      stops: t.stops.map(s => ({ node: s.node, type: s.type, done: s.done, rider: first(reqById(s.reqId).riderName), seats: reqById(s.reqId).seats, needsPin: s.type === 'pickup' && !!reqById(s.reqId).pin, needsEndPin: s.type === 'drop' && !!reqById(s.reqId).endPin })),
      riders: t.requestIds.map(id => { const r = reqById(id); return { reqId: r.id, name: first(r.riderName), pickup: r.pickup, drop: r.drop, fare: r.fare, soloFare: r.soloFare, status: r.status }; }) };
  }
  return { profile: require('./auth').publicUser(user), online: driver.online, busy: driver.busy, at: driver.at, completed: done.length,
    earnings: done.reduce((s, t) => s + fareOf(t), 0), trip, offers: offersFor(driver),
    history: done.slice(-10).reverse().map(t => ({ id: t.id, pooled: t.pooled, total: fareOf(t), at: t.completedAt,
      riders: t.requestIds.map(id => { const r = reqById(id); return { reqId: r.id, name: first(r.riderName), pickup: r.pickup, drop: r.drop, fare: r.fare }; }) })) };
}
const activeRequest = userId => db.requests.find(r => r.riderUserId === userId && ACTIVE.includes(r.status)) || null;
module.exports = { db, save, reqById, tripById, activeRequest, first, ACTIVE, canServe, compatible, createRequest, riderCancel, riderView, accept, addRide, advance, cancelTrip, driverView, restore, evaluate, bestOrder, insertBest, measure, priceFares };
