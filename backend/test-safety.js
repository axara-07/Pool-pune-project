// Run: node backend/test-safety.js   (uses a temporary data folder, your real data is untouched)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.POOLPUNE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'poolpune-'));
process.env.SAFETY_CHECKIN_MS = '50'; process.env.SAFETY_GRACE_MS = '50';
const G = require('./lib/graph'), auth = require('./lib/auth'), market = require('./lib/market'), store = require('./lib/store'), safety = require('./lib/safety');
const BASE = 'http://test', sleep = ms => new Promise(r => setTimeout(r, ms));
const throws = (fn, re) => { try { fn(); } catch (e) { if (re) assert.match(e.message, re, 'error message'); return; } assert.fail('expected an error' + (re ? ' matching ' + re : '')); };
const rejects = async (fn, re) => { try { await fn(); } catch (e) { assert.match(e.message, re); return; } assert.fail('expected an error'); };
let n = 0;
const phone = () => '98' + String(10000000 + ++n);
const mk = (role, name, gender, extra = {}) => { const u = auth.register({ name, email: `${name.toLowerCase().replace(/\W/g, '')}${++n}@x.com`, phone: phone(), password: 'passw0rd1', gender,
  ...(role === 'driver' ? { vehicleType: 'Sedan', plate: 'MH12 AB ' + (1000 + n), licence: 'MH1220110012345', homeArea: 'Kothrud' } : {}), ...extra }, role, G.names);
  if (role === 'driver') store.addDriver(u); return u; };
const drv = u => { const d = store.drivers.find(x => x.userId === u.id); d.online = true; return d; };
const ask = (u, o = {}) => market.createRequest(auth.userById(u.id), { pickup: 'Kothrud', drop: 'Hinjewadi', seats: 1, share: true, maxDetour: 100, ...o });
const reset = () => { market.db.requests.forEach(r => { if (market.ACTIVE.includes(r.status)) r.status = 'cancelled'; }); store.drivers.forEach(d => { d.busy = false; d.tripId = null; d.online = true; d.at = 'Kothrud'; }); market.db.trips.forEach(t => { if (t.status === 'running') t.status = 'cancelled'; }); };

(async () => {
  // ---- sign-up: gender optional, validated ----
  const asha = mk('rider', 'Asha Rao', 'Female'), ravi = mk('rider', 'Ravi Kumar', 'Male'), neel = mk('rider', 'Neel Shah', 'Prefer not to say');
  assert.strictEqual(auth.userById(neel.id).gender, 'unspecified');
  throws(() => mk('rider', 'Bad Gender', 'robot'), /gender/i);
  const dF = mk('driver', 'Meera Joshi', 'Female'), dM = mk('driver', 'Sunil Patil', 'Male');

  // ---- emergency contacts ----
  await safety.saveProfile(asha, { contacts: [{ name: 'Mom', phone: '98765 43210' }, { name: 'Sister', phone: '9876543211' }, { name: '', phone: '' }] });
  assert.strictEqual(safety.me(asha).contacts.length, 2, 'two contacts saved, empty row ignored');
  await rejects(() => safety.saveProfile(asha, { contacts: [{ name: 'X Y', phone: '123' }] }), /valid 10-digit/);
  await rejects(() => safety.saveProfile(asha, { contacts: [1, 2, 3, 4].map(i => ({ name: 'Cont ' + i, phone: '987654321' + i })) }), /up to 3/);

  // ---- preferences need a gender ----
  throws(() => ask(neel, { driverPref: 'same' }), /set your gender/i);
  throws(() => ask(neel, { coRider: 'same' }), /set your gender/i);

  // ---- same-gender DRIVER preference hides the request from other drivers ----
  let r = ask(asha, { driverPref: 'same' });
  assert.ok(market.driverView(drv(dF), dF).offers.offers.some(o => o.requestId === r.id), 'female driver sees it');
  assert.ok(!market.driverView(drv(dM), dM).offers.offers.some(o => o.requestId === r.id), 'male driver does not see it');
  throws(() => market.accept(drv(dM), [r.id]), /not available/);
  reset();

  // ---- PIN: pickup needs the rider's PIN ----
  r = ask(asha); assert.match(r.pin, /^\d{4}$/);
  const dr = drv(dF); market.accept(dr, [r.id]);
  assert.strictEqual(market.riderView(auth.userById(asha.id), store.drivers).active.pin, r.pin, 'rider sees PIN while waiting for pickup');
  throws(() => market.advance(dr), /Wrong ride PIN/);
  throws(() => market.advance(dr, r.pin === '0000' ? '1111' : '0000'), /Wrong ride PIN/);
  market.advance(dr, r.pin);
  assert.strictEqual(r.status, 'onboard');
  assert.strictEqual(market.riderView(auth.userById(asha.id), store.drivers).active.pin, null, 'PIN hidden once on board');
  // ---- end-of-ride OTP: the ride cannot be finished without it ----
  assert.match(r.endPin, /^\d{4}$/, 'end OTP created at pickup');
  assert.strictEqual(market.riderView(auth.userById(asha.id), store.drivers).active.endPin, r.endPin, 'rider sees the end OTP while on board');
  assert.strictEqual(market.driverView(dr, dF).trip.stops.find(s => !s.done).needsEndPin, true, 'driver is asked for the OTP at drop-off');
  throws(() => market.advance(dr), /end-of-ride OTP/);
  throws(() => market.advance(dr, r.endPin === '0000' ? '1111' : '0000'), /end-of-ride OTP/);
  assert.strictEqual(r.status, 'onboard', 'wrong OTP does not finish the ride');
  const endOtp = r.endPin; market.advance(dr, endOtp);
  assert.strictEqual(r.status, 'completed'); assert.strictEqual(r.endPin, null, 'OTP cleared after the ride');
  reset();

  // ---- PIN throttle: 5 wrong tries lock for a while, even the right PIN ----
  r = ask(asha); market.accept(drv(dF), [r.id]);
  for (let i = 0; i < 5; i++) throws(() => market.advance(drv(dF), 'xxxx'), /Wrong ride PIN/);
  throws(() => market.advance(drv(dF), r.pin), /Too many wrong codes/);
  reset();

  // ---- co-rider preference blocks mixed pooling ----
  const a = ask(asha, { coRider: 'same', pickup: 'Kothrud', drop: 'Hinjewadi' }), b = ask(ravi, { pickup: 'Baner', drop: 'Hinjewadi' });
  assert.ok(!market.driverView(drv(dM), dM).offers.pairs.length, 'a "same gender" rider is never paired with another gender');
  throws(() => market.accept(drv(dM), [a.id, b.id]), /preferences/);
  reset();
  // ...but a trip that is already running also refuses to add an incompatible rider
  const a2 = ask(asha, { coRider: 'same' }); market.accept(drv(dM), [a2.id]);
  const b2 = ask(ravi, { pickup: 'Baner', drop: 'Hinjewadi' });
  const off = market.driverView(drv(dM), dM).offers.offers.find(o => o.requestId === b2.id);
  assert.ok(off && !off.fit.ok && /preferences/.test(off.fit.reason), 'cannot add a different-gender rider to a same-gender rider trip');
  assert.ok(!/female|male|gender/i.test(off.fit.reason), "the reason does not reveal anyone's gender");
  reset();

  // ---- SOS: alerts contacts, includes live link, de-duplicates, can be cancelled ----
  const sRide = ask(asha); market.accept(drv(dF), [sRide.id]);
  const al = await safety.sos(auth.userById(asha.id), store.drivers, BASE, 'help');
  assert.strictEqual(al.contactsNotified, 2);
  const stored = market.db.alerts.find(x => x.id === al.id);
  assert.ok(stored.trackUrl.startsWith(BASE + '/track.html?t='), 'alert carries the live tracking link');
  assert.strictEqual(stored.location, 'Kothrud'); assert.match(stored.vehicle, /Sedan/);
  assert.strictEqual(( await safety.sos(auth.userById(asha.id), store.drivers, BASE)).id, al.id, 'double tap does not create a second alert');
  assert.ok(safety.status(auth.userById(asha.id)).openAlert, 'rider status shows open alert');
  // an automatic check-in alert must never swallow a real SOS press, and "I'm safe" clears both
  const ci = market.db.requests.find(x => x.id === sRide.id); ci.status = 'onboard';
  market.db.alerts.push({ id: market.db.nextAlert++, type: 'checkin-missed', status: 'open', createdAt: new Date().toISOString(), userId: asha.id, sent: [], requestId: sRide.id });
  safety.cancelAlert(auth.userById(asha.id));                    // clears the earlier SOS and the check-in alert together
  assert.strictEqual(safety.status(auth.userById(asha.id)).openAlert, null, 'I am safe clears every open alert');
  ci.status = 'accepted';
  const again2 = await safety.sos(auth.userById(asha.id), store.drivers, BASE); assert.strictEqual(again2.type, 'sos');
  safety.cancelAlert(auth.userById(asha.id));

  // ---- a DRIVER can raise an SOS too ----
  const dAl = await safety.sos(auth.userById(dF.id), store.drivers, BASE);
  assert.strictEqual(market.db.alerts.find(x => x.id === dAl.id).role, 'driver');
  safety.adminResolve(dAl.id, 'checked'); assert.strictEqual(market.db.alerts.find(x => x.id === dAl.id).status, 'resolved');

  // ---- live trip share link works without login, ends with the ride ----
  const sh = await safety.share(auth.userById(asha.id), BASE, true);
  assert.strictEqual(sh.sent, 2, 'link sent to both contacts');
  const tok = sh.url.split('t=')[1], pub = safety.track(tok, store.drivers);
  assert.strictEqual(pub.plate, market.tripById(sRide.tripId).plate); assert.ok(pub.routeGeo.length > 1);
  assert.ok(!JSON.stringify(pub).match(/@|asha@|9876/i), 'public page leaks no email or phone');
  throws(() => safety.track('0'.repeat(32), store.drivers), /not valid/);
  const dd = drv(dF); market.advance(dd, sRide.pin); market.advance(dd, sRide.endPin);
  assert.strictEqual(safety.track(tok, store.drivers).ended, true, 'link stops showing the car after the ride');
  reset();

  // ---- check-in: no answer -> alert is raised for the rider (and "I am OK" stops it) ----
  const cRide = ask(asha); market.accept(drv(dF), [cRide.id]); market.advance(drv(dF), cRide.pin);
  await sleep(80); safety.sweep(store.drivers, BASE);
  assert.ok(safety.status(auth.userById(asha.id)).checkin, 'rider is asked "Are you OK?"');
  safety.checkinOk(auth.userById(asha.id)); assert.strictEqual(safety.status(auth.userById(asha.id)).checkin, null);
  await sleep(80); safety.sweep(store.drivers, BASE); assert.ok(safety.status(auth.userById(asha.id)).checkin, 'asked again later');
  await sleep(80); safety.sweep(store.drivers, BASE);
  const auto = market.db.alerts.filter(x => x.type === 'checkin-missed' && x.requestId === cRide.id);
  assert.strictEqual(auto.length, 1, 'one automatic alert after no answer'); assert.strictEqual(auto[0].sent.length, 2);
  await sleep(80); safety.sweep(store.drivers, BASE); assert.strictEqual(market.db.alerts.filter(x => x.type === 'checkin-missed' && x.requestId === cRide.id).length, 1, 'no repeat spam');
  reset();

  // ---- reports + blocking ----
  const rRide = ask(asha); market.accept(drv(dM), [rRide.id]); market.advance(drv(dM), rRide.pin); market.advance(drv(dM), rRide.endPin);
  throws(() => safety.report(auth.userById(ravi.id), store.drivers, { requestId: rRide.id, reason: 'other' }), /not your ride/);
  throws(() => safety.report(auth.userById(asha.id), store.drivers, { requestId: rRide.id, reason: 'nonsense' }), /what went wrong/i);
  safety.report(auth.userById(asha.id), store.drivers, { requestId: rRide.id, reason: 'unsafe-driving', details: 'Drove too fast' });
  assert.ok(auth.isBlocked(asha.id, dM.id), 'reporting blocks the driver');
  const again = ask(asha); assert.ok(!market.driverView(drv(dM), dM).offers.offers.some(o => o.requestId === again.id), 'blocked driver no longer sees this rider');
  throws(() => market.accept(drv(dM), [again.id]), /not available/);
  assert.ok(market.driverView(drv(dF), dF).offers.offers.some(o => o.requestId === again.id), 'other drivers still can');
  // driver reports a rider
  reset(); const rr = ask(ravi); market.accept(drv(dF), [rr.id]); market.advance(drv(dF), rr.pin); market.advance(drv(dF), rr.endPin);
  safety.report(auth.userById(dF.id), store.drivers, { requestId: rr.id, reason: 'harassment' });
  assert.ok(auth.isBlocked(dF.id, ravi.id), 'driver can block a rider');
  assert.strictEqual(safety.adminList().filter(x => x.type === 'report').length, 2);

  // ---- real SMS plumbing: delivery status is stored, phone fallback links are built, GPS is used ----
  reset(); const sms = require('./lib/sms'); assert.strictEqual(sms.live(), false, 'tests run in demo mode');
  const mRide = ask(asha); market.accept(drv(dF), [mRide.id]);
  const out = await safety.sos(auth.userById(asha.id), store.drivers, BASE, 'follow me', { lat: 18.5204, lng: 73.8567 });
  assert.strictEqual(out.contactsNotified, 2); assert.strictEqual(out.demo, 2, 'demo mode is reported honestly (nothing really sent)'); assert.strictEqual(out.live, false);
  const al2 = market.db.alerts.find(x => x.id === out.id);
  assert.ok(al2.sent.every(x => x.status === 'demo'), 'each contact has a delivery status');
  assert.match(al2.message, /maps\.google\.com\/\?q=18\.5204,73\.8567/, 'message carries the GPS map link'); assert.match(al2.message, /follow me/);
  assert.strictEqual(out.links.length, 2); assert.match(out.links[0].sms, /^sms:\+919876543210\?body=/); assert.match(out.links[0].wa, /^https:\/\/wa\.me\/919876543210\?text=/);
  const bad = await safety.sos(auth.userById(dF.id), store.drivers, BASE, '', { lat: 999, lng: 'x' }); assert.strictEqual(bad.links.length, 0, 'driver has no contacts');
  assert.strictEqual(market.db.alerts.find(x => x.id === bad.id).geo, null, 'invalid GPS is ignored');
  // a failing provider is recorded as failed, never crashes the SOS
  process.env.SMS_WEBHOOK_URL = 'http://127.0.0.1:9/nope'; safety.cancelAlert(auth.userById(asha.id));
  const failed = await safety.sos(auth.userById(asha.id), store.drivers, BASE);
  assert.strictEqual(failed.failed, 2); assert.strictEqual(failed.live, true); delete process.env.SMS_WEBHOOK_URL;

  // ---- saving contacts messages them (with the ride link if the rider has a ride) ----
  reset(); const lena = mk('rider', 'Lena Roy', 'Female');
  let sv = await safety.saveProfile(lena, { contacts: [{ name: 'Dad', phone: '9000000001' }] }, BASE);
  assert.deepStrictEqual([sv.messaged.demo, sv.messaged.withLink], [1, false], 'new contact is told they were added');
  sv = await safety.saveProfile(lena, { contacts: [{ name: 'Dad', phone: '9000000001' }] }, BASE); assert.strictEqual(sv.messaged.demo, 0, 'unchanged contact and no ride: no repeat SMS');
  const lr = ask(lena); sv = await safety.saveProfile(lena, { contacts: [{ name: 'Dad', phone: '9000000001' }] }, BASE);
  assert.deepStrictEqual([sv.messaged.demo, sv.messaged.withLink], [1, true], 'with a ride, saved contact gets the ride link');
  assert.ok(lr.shareToken, 'ride link token created');

  console.log('All safety tests passed');
  fs.rmSync(process.env.POOLPUNE_DATA, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
