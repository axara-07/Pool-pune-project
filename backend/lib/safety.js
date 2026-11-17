// Safety features for ANY passenger or driver (not only women):
//   SOS alert, live trip-share link, emergency contacts, "Are you OK?" check-ins, reports + blocking, safety-team alert log.
// Alerts live in market.json (db.alerts). Messages to contacts are simulated (console + saved on the alert);
// set SMS_WEBHOOK_URL to POST them to a real SMS service (see README).
const crypto = require('crypto'), auth = require('./auth'), market = require('./market'), G = require('./graph'), sms = require('./sms');
const { db, save, reqById, tripById, first, activeRequest } = market;
const CHECKIN_MS = +process.env.SAFETY_CHECKIN_MS || 20 * 60e3;     // onboard this long with no stop reached -> ask "Are you OK?"
const GRACE_MS = +process.env.SAFETY_GRACE_MS || 3 * 60e3;          // no answer for this long -> alert is raised for the rider
const DEDUP_MS = 60e3, REASONS = ['unsafe-driving', 'harassment', 'route-deviation', 'wrong-vehicle', 'overcharge', 'other'];
const err = (status, message) => Object.assign(new Error(message), { status });
const iso = () => new Date().toISOString();
const inflight = new WeakMap();                      // alert -> pending SMS promises (never saved to disk)
function notify(a, contact, text) {                 // really sends the SMS (see lib/sms.js); the result is stored on the alert
  const entry = { name: contact.name, phone: contact.phone, at: iso(), status: 'sending' };
  a.sent.push(entry);
  const p = sms.send(contact.phone, text).then(r => { entry.status = r.status; if (r.error) entry.error = r.error; save(); });
  inflight.set(a, [...(inflight.get(a) || []), p]);
  return p;
}
const settle = a => Promise.all(inflight.get(a) || []);
const count = (a, st) => a.sent.filter(x => x.status === st).length;
const mapsLink = (geo, area) => { const p = geo || G.AREAS[area]; return p ? `https://maps.google.com/?q=${p[0]},${p[1]}` : null; };
const cleanGeo = g => g && Number.isFinite(+g.lat) && Number.isFinite(+g.lng) && Math.abs(+g.lat) <= 90 && Math.abs(+g.lng) <= 180 ? [+(+g.lat).toFixed(5), +(+g.lng).toFixed(5)] : null;
const tokenFor = r => r.shareToken || (r.shareToken = crypto.randomBytes(16).toString('hex'));
const trackUrl = (base, r) => `${base}/track.html?t=${tokenFor(r)}`;

// What is happening around this user right now? (their active ride / trip, and where the car is)
function context(user, drivers) {
  let r = null, trip = null;
  if (user.role === 'rider') { r = activeRequest(user.id); trip = r && r.tripId ? tripById(r.tripId) : null; }
  else { const d = drivers.find(x => x.userId === user.id); trip = d && d.tripId ? tripById(d.tripId) : null; }
  if (trip && trip.status !== 'running') trip = null;
  const car = trip && drivers.find(x => x.userId === trip.driverUserId);
  return { r, trip, area: car ? car.at : r ? r.pickup : null };
}
function raise(type, user, ctx, base, note, geo) {
  const { r, trip } = ctx, now = Date.now();
  const a = { id: db.nextAlert++, type, status: 'open', createdAt: iso(), userId: user.id, role: user.role, name: user.name, phone: user.phone, note: String(note || '').slice(0, 300),
    location: ctx.area, requestId: r ? r.id : null, tripId: trip ? trip.id : null, ride: r ? `${r.pickup} → ${r.drop}` : null,
    vehicle: trip ? `${trip.vehicleType} ${trip.plate}` : null, driverName: trip ? trip.driverName : null,
    ridersInCar: trip ? trip.requestIds.map(reqById).filter(x => x.status === 'onboard' || x.status === 'accepted').map(x => first(x.riderName)) : [],
    trackUrl: r ? trackUrl(base, r) : null, geo: geo || null, sent: [] };
  const label = type === 'checkin-missed' ? `${user.name} did not answer a safety check-in` : `${user.name} sent an SOS`;
  const text = `${label} on PoolPune.${a.ride ? ` Ride: ${a.ride}.` : ''} Last known area: ${a.location || 'unknown'}.${mapsLink(a.geo, a.location) ? ` Map: ${mapsLink(a.geo, a.location)}.` : ''}${note && type === 'sos' ? ` Message: ${a.note}.` : ''}${a.vehicle ? ` Vehicle: ${a.vehicle}.` : ''}${a.trackUrl ? ` Live trip: ${a.trackUrl}` : ''} Please call them now; in danger call 112.`;
  a.message = text;
  (auth.userById(user.id).contacts || []).forEach(c => notify(a, c, text));
  console.log(`[SAFETY ALERT #${a.id}] ${type} from ${user.name} (${user.role}) near ${a.location || '?'}`);
  db.alerts.push(a); if (db.alerts.length > 500) db.alerts.splice(0, db.alerts.length - 500);
  save(); return a;
}
const openAlertOf = userId => [...db.alerts].reverse().find(a => a.userId === userId && a.status === 'open' && a.type !== 'report') || null;
const brief = a => a && { id: a.id, type: a.type, createdAt: a.createdAt, contactsNotified: a.sent.length, delivered: count(a, 'sent'), failed: count(a, 'failed'), demo: count(a, 'demo') };
const phoneLinks = (a, user) => { const q = encodeURIComponent(a.message || ''); return (auth.userById(user.id).contacts || []).map(c => ({ name: c.name, phone: c.phone, sms: `sms:+91${c.phone}?body=${q}`, wa: `https://wa.me/91${c.phone}?text=${q}` })); };

// ---------- settings ----------
const me = user => { const u = auth.userById(user.id); return { gender: u.gender || 'unspecified', contacts: u.contacts || [], openAlert: brief(openAlertOf(user.id)) }; };
async function saveProfile(user, b, base) {
  const u = auth.userById(user.id), before = new Set((u.contacts || []).map(c => c.phone));
  auth.updateSafety(u, b);
  const out = me(user), r = user.role === 'rider' ? activeRequest(user.id) : null, a = { sent: [] };
  // new contacts always get a message; if the rider has a ride, every saved contact gets its live link
  (u.contacts || []).filter(c => r || !before.has(c.phone)).forEach(c => notify(a, c, r
    ? `${user.name} added you as an emergency contact on PoolPune. Their ride: ${r.pickup} → ${r.drop}. Follow it live: ${trackUrl(base, r)}`
    : `${user.name} added you as an emergency contact on PoolPune. If they press SOS during a ride, you will get an SMS with their live trip link.`));
  await settle(a);
  return { ...out, messaged: { sent: count(a, 'sent'), demo: count(a, 'demo'), failed: count(a, 'failed'), withLink: !!r, live: sms.live() } };
}

// ---------- sharing + SOS ----------
async function share(user, base, sendToContacts) {
  const r = activeRequest(user.id); if (!r || r.status === 'pending') throw err(409, 'You can share your trip once a driver has accepted it');
  const url = trackUrl(base, r), u = auth.userById(user.id);
  let sent = 0;
  if (sendToContacts) {
    if (!(u.contacts || []).length) throw err(409, 'Add an emergency contact first (Safety settings)');
    const a = { sent: [] }; u.contacts.forEach(c => notify(a, c, `${user.name} is sharing their PoolPune trip (${r.pickup} → ${r.drop}) with you. Follow it live: ${url}`)); await settle(a); sent = count(a, 'sent') + count(a, 'demo');
  }
  save(); return { url, sent, live: sms.live() };
}
async function sos(user, drivers, base, note, geo) {
  const prev = [...db.alerts].reverse().find(a => a.userId === user.id && a.type === 'sos' && a.status === 'open');
  if (prev && Date.now() - Date.parse(prev.createdAt) < DEDUP_MS) return { ...brief(prev), live: sms.live(), links: phoneLinks(prev, user) };   // double taps do not spam contacts
  const a = raise('sos', user, context(user, drivers), base, note, cleanGeo(geo)); await settle(a);
  return { ...brief(a), live: sms.live(), links: phoneLinks(a, user) };
}
function cancelAlert(user) {                         // "I'm safe": the person who raised it can stand it down
  const open = db.alerts.filter(a => a.userId === user.id && a.status === 'open' && a.type !== 'report'); if (!open.length) throw err(404, 'No open alert');
  open.forEach(a => { a.status = 'resolved'; a.resolvedAt = iso(); a.resolvedBy = 'user'; });
  (auth.userById(user.id).contacts || []).forEach(c => notify(open[0], c, `${user.name} says they are safe. The PoolPune alert was cancelled.`)); save();
}

// ---------- check-ins ----------
function checkinOk(user) { const r = activeRequest(user.id); if (r) { r.checkin = null; r.okAt = Date.now(); save(); } }
function sweep(drivers, base) {                      // runs every few seconds on the server, so it works even if the rider's phone is silent
  const now = Date.now(); let ch = false;
  for (const r of db.requests) {
    if (r.status !== 'onboard') continue;
    const t = tripById(r.tripId); if (!t || t.status !== 'running') continue;
    const ref = Math.max(Date.parse(r.pickedAt) || 0, t.lastProgressAt || 0, r.okAt || 0);
    if (!r.checkin) { if (now - ref > CHECKIN_MS) { r.checkin = { askedAt: now }; ch = true; } }
    else if (!r.checkin.escalated && now - r.checkin.askedAt > GRACE_MS) {
      r.checkin.escalated = true; const u = auth.userById(r.riderUserId); ch = true;
      if (u) raise('checkin-missed', u, context(u, drivers), base, 'No answer to the automatic safety check-in');
    }
  }
  if (ch) save();
}
function status(user) {                              // small block the rider page polls
  const r = activeRequest(user.id), c = r && r.checkin && !r.checkin.escalated ? r.checkin : null;
  return { contacts: (auth.userById(user.id).contacts || []).length, openAlert: brief(openAlertOf(user.id)), checkin: c ? { deadline: c.askedAt + GRACE_MS } : null };
}

// ---------- reports + blocking ----------
function report(user, drivers, b) {
  const r = reqById(Number(b.requestId)), t = r && r.tripId && tripById(r.tripId);
  const reason = REASONS.includes(b.reason) ? b.reason : null; if (!reason) throw err(400, 'Choose what went wrong');
  if (!r || !t) throw err(404, 'Ride not found');
  let targets = [];
  if (user.role === 'rider') {
    if (r.riderUserId !== user.id) throw err(403, 'That is not your ride');
    targets = b.about === 'co-rider' ? t.requestIds.map(reqById).filter(x => x.riderUserId !== user.id).map(x => x.riderUserId) : [t.driverUserId];
  } else {
    if (t.driverUserId !== user.id) throw err(403, 'That is not your trip');
    targets = [r.riderUserId];
  }
  if (!targets.length) throw err(409, 'There was nobody else in the car to report');
  const a = { id: db.nextAlert++, type: 'report', status: 'open', createdAt: iso(), userId: user.id, role: user.role, name: user.name, phone: user.phone, reason, about: targets.map(id => (auth.userById(id) || {}).name).filter(Boolean),
    note: String(b.details || '').slice(0, 500), requestId: r.id, tripId: t.id, ride: `${r.pickup} → ${r.drop}`, vehicle: `${t.vehicleType} ${t.plate}`, driverName: t.driverName, location: null, ridersInCar: [], trackUrl: null, sent: [], blocked: b.block !== false };
  if (a.blocked) targets.forEach(id => auth.block(user.id, id));
  db.alerts.push(a); save(); return { ok: true, blocked: a.blocked };
}

// ---------- public tracking page (no login; the long random token is the key) ----------
function track(token, drivers) {
  const r = db.requests.find(x => x.shareToken === token); if (!r) throw err(404, 'This link is not valid');
  const base = { rider: first(r.riderName), pickup: r.pickup, drop: r.drop, status: r.status };
  if (!market.ACTIVE.includes(r.status)) return { ...base, ended: true };
  const al = db.alerts.find(a => a.requestId === r.id && a.status === 'open' && a.type !== 'report');
  if (r.status === 'pending' || !r.tripId) return { ...base, ended: false, waiting: true, alert: !!al };
  const t = tripById(r.tripId), d = drivers.find(x => x.userId === t.driverUserId), undone = t.stops.filter(s => !s.done);
  return { ...base, ended: false, alert: !!al, updatedAt: iso(), driver: first(t.driverName), vehicle: t.vehicleType, plate: t.plate,
    at: d.at, atLatLng: G.AREAS[d.at], pickupLatLng: G.AREAS[r.pickup], dropLatLng: G.AREAS[r.drop],
    stops: t.stops.map(s => ({ node: s.node, type: s.type, done: s.done, mine: s.reqId === r.id })),
    routeGeo: G.geoPath(G.chain([d.at, ...undone.map(s => s.node)])) };
}

// ---------- safety-team console ----------
function adminList() { return [...db.alerts].reverse().slice(0, 100); }
function adminResolve(id, note) {
  const a = db.alerts.find(x => x.id === Number(id)); if (!a) throw err(404, 'Alert not found');
  a.status = 'resolved'; a.resolvedAt = iso(); a.resolvedBy = 'safety team'; a.resolution = String(note || '').slice(0, 300); save();
}
module.exports = { settle, me, saveProfile, share, sos, cancelAlert, checkinOk, sweep, status, report, track, adminList, adminResolve, raise, context, CHECKIN_MS, GRACE_MS };
