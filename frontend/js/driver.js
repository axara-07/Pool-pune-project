// Driver dashboard: ride requests pop up; the driver chooses one, or two that fit together, and can add a second ride while driving.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const fmt = n => '₹' + Math.round(n);
async function api(url, opt = {}) {
  if (opt.method === 'POST') { opt.headers = { 'Content-Type': 'application/json' }; opt.body = opt.body || '{}'; }
  const r = await fetch(url, opt), j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = 'login.html#driver'; return new Promise(() => {}); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
let state = null, seen = null, toastTimer = null;
const route = stops => stops.map(s => s.node).join(' → ');
const ridersLine = rs => rs.map(r => `${esc(r.name)}: ${fmt(r.fare)} <span class="note">(solo ${fmt(r.soloFare)}${r.detourPct ? `, +${r.detourPct}% distance` : ''})</span>`).join(' · ');

function offerCard(o, fresh, mode) {
  const meta = `${o.kmToPickup} km to pickup · ${o.soloKm} km ride · ${o.seats} passenger${o.seats > 1 ? 's' : ''} · ${o.share ? 'open to sharing' : 'solo only'} · ${o.ageSec}s ago`;
  const f = o.fit, plan = f && f.ok ? `<div class="note">Stop order: ${esc(route(f.plan.stops))} · your route becomes ${f.plan.totalKm} km<br>${ridersLine(f.plan.riders)}</div>` : '';
  const badge = !f ? '' : f.ok ? `<span class="fitbadge yes">✓ ${esc(f.label)}</span>` : `<span class="fitbadge no">✗ ${esc(f.reason)}</span>`;
  const btn = mode === 'trip' ? `<button data-act="add" data-id="${o.requestId}" ${f.ok ? '' : 'disabled'}>Add to my trip</button>` : `<button data-act="accept" data-ids="[${o.requestId}]">Accept</button>`;
  return `<div class="offer ${fresh ? 'pop' : ''} ${f && !f.ok ? 'nofit' : ''}"><div><b>${esc(o.rider)}</b> · ${esc(o.pickup)} → ${esc(o.drop)} ${badge}<br><span class="note">${meta}</span>${plan}</div>
    <div class="side"><b>${fmt(o.fare)}</b>${btn}</div></div>`;
}
function renderOffers(of, fresh) {
  const t = $('offerTitle'), box = $('offers');
  if (of.mode === 'offline') { t.textContent = 'Ride requests'; box.innerHTML = '<p class="note">Go online to see ride requests.</p>'; return; }
  let h = '';
  if (of.mode === 'trip') {
    const fits = of.offers.filter(o => o.fit.ok).length;
    t.textContent = `All ride requests (${fits} fit${fits === 1 ? 's' : ''} your route)`;
    h = `<p class="note"><b>Your route now:</b> ${esc(of.route.join(' → '))} · seats booked ${of.seatsBooked}/${of.capacity}. Riders whose pickup is on this route and who get off along it (or a little past your destination) can be added.</p>`;
    h += of.offers.map(o => offerCard(o, fresh.has(o.requestId), 'trip')).join('') || '<p class="note">Nobody else is requesting a ride right now. New requests will appear here.</p>';
  } else {
    t.textContent = 'Ride requests near you';
    if (of.pairs.length) h += '<p class="note"><b>Good combinations</b> (two riders you could take together)</p>' + of.pairs.map(p => `<div class="offer ${p.requestIds.some(i => fresh.has(i)) ? 'pop' : ''}">
      <div><b>Rides #${p.requestIds.join(' + #')}</b> · riders save ${fmt(p.saving)} together<br><span class="note">Stop order: ${esc(route(p.stops))} · loaded route ${p.loadedKm} km · ${p.toFirstKm} km to first pickup</span>
      <div class="note">${ridersLine(p.riders)}</div></div><div class="side"><b>${fmt(p.riders.reduce((s, r) => s + r.fare, 0))}</b><button data-act="accept" data-ids="[${p.requestIds}]">Accept both</button></div></div>`).join('') + '<p class="note"><b>All requests</b></p>';
    h += of.offers.map(o => offerCard(o, fresh.has(o.requestId), 'idle')).join('') || '<p class="note">No ride requests right now. New ones will pop up here automatically.</p>';
  }
  box.innerHTML = h;
}
function renderTrip(t) {
  const p = $('tripPanel'); p.hidden = !t; if (!t) return;
  const next = t.stops.findIndex(s => !s.done), n = t.stops[next], started = t.stops.some(s => s.done);
  const html = `<p class="status ok">Current trip ${t.pooled ? `(pooled – ${t.ridersCount} rides)` : ''}</p>
    <ol class="steps stops">${t.stops.map((s, i) => `<li class="${s.done ? 'done' : i === next ? 'next' : ''}">${s.type === 'pickup' ? 'Pick up' : 'Drop'} ${esc(s.rider)} at ${esc(s.node)}</li>`).join('')}</ol>
    <p>${ridersLine(t.riders)}</p>
    ${n.needsPin ? `<div class="pinbox"><label for="pin">Ask ${esc(n.rider)} for their 4-digit ride PIN (shown in their app)</label><input id="pin" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]*" placeholder="••••" aria-describedby="pinhelp"><p class="note" id="pinhelp">Also check that this is the right person before they get in.</p></div>` : ''}
    ${n.needsEndPin ? `<div class="pinbox"><label for="pin">Ask ${esc(n.rider)} for the 4-digit end-of-ride OTP (shown in their app) to finish the ride</label><input id="pin" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]*" placeholder="••••"><p class="note">The ride can only be completed with this OTP.</p></div>` : ''}
    <button class="primary" data-act="advance">${n.type === 'pickup' ? 'I picked up' : 'I dropped off'} ${esc(n.rider)} at ${esc(n.node)}</button>
    ${started ? '' : '<button class="ghost" data-act="cancel-trip">Cancel this trip</button>'}`;
  if (p.dataset.h !== html) { p.innerHTML = html; p.dataset.h = html; }      // redraw only on change so the PIN box keeps what you type
}
function render(s) {
  state = s;
  $('stat').textContent = !s.online ? 'You are offline' : s.trip ? 'On a trip' : 'Online – ride requests will pop up below';
  $('stat').className = 'status ' + (s.online ? 'ok' : '');
  $('sw').setAttribute('aria-checked', s.online); $('swl').textContent = s.online ? 'You are online' : 'Go online';
  if (document.activeElement !== $('area')) $('area').value = s.at;
  $('upd').disabled = s.busy;
  $('stats').innerHTML = `<div class="card"><h3>Trips completed</h3><p class="big">${s.completed}</p></div><div class="card"><h3>Fare collected</h3><p class="big">${fmt(s.earnings)}</p></div>`;
  const d = s.profile.driver; $('vehicle').textContent = `${s.profile.name} · ${d.vehicleType} · ${d.plate} · ${s.profile.phone}`;
  // new requests pop up: toast + highlight (not on the very first load)
  const ids = new Set([...s.offers.offers.map(o => o.requestId), ...s.offers.pairs.flatMap(p => p.requestIds)]), fresh = new Set();
  if (seen) ids.forEach(i => { if (!seen.has(i)) fresh.add(i); });
  seen = ids;
  if (fresh.size) {
    const o = s.offers.offers.find(x => fresh.has(x.requestId));
    $('toast').textContent = o ? `New ride request: ${o.rider}, ${o.pickup} → ${o.drop}` : 'New ride request'; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
  }
  renderTrip(s.trip); renderOffers(s.offers, fresh); SAFE.fab(!!s.trip);
  $('trips').innerHTML = s.history.length ? '<tr><th>#</th><th>Type</th><th>Riders</th><th>Fare</th></tr>' +
    s.history.map(x => `<tr><td>${x.id}</td><td>${x.pooled ? 'Pooled' : 'Solo'}</td><td>${x.riders.map(r => `${esc(r.name)}: ${esc(r.pickup)} → ${esc(r.drop)} <button class="linkbtn" data-report="${r.reqId}" data-role="driver">Report</button>`).join('<br>')}</td><td>${fmt(x.total)}</td></tr>`).join('')
    : '<tr><td>No trips yet.</td></tr>';
}
async function act(url, body) {
  $('msg').textContent = '';
  try { render(await api(url, { method: 'POST', body: JSON.stringify(body || {}) })); }
  catch (e) { $('msg').textContent = e.message; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'accept') act('/api/driver/accept', { requestIds: JSON.parse(b.dataset.ids) });
  if (a === 'add') act('/api/driver/add', { requestId: +b.dataset.id });
  if (a === 'advance') { const pin = $('pin'); act('/api/driver/advance', pin ? { pin: pin.value } : {}); }
  if (a === 'cancel-trip') act('/api/driver/cancel-trip');
});
$('sw').onclick = () => act('/api/driver/status', { online: !state.online });
$('upd').onclick = () => act('/api/driver/status', { area: $('area').value });
(async () => {
  try {
    const me = (await api('/api/auth/me')).user;
    if (me.role !== 'driver') { location.href = 'index.html'; return; }
    $('userbar').innerHTML = `Hi, <b>${esc(me.name)}</b> <button id="logout" class="linkbtn">Log out</button>`;
    $('logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = 'login.html'; };
    $('area').innerHTML = (await api('/api/areas')).map(n => `<option>${esc(n)}</option>`).join('');
    SAFE.panel($('safetyPanel')).catch(() => {});
    render(await api('/api/driver/me'));
    setInterval(async () => { try { render(await api('/api/driver/me')); } catch (e) {} }, 2000);
  } catch (e) { $('stat').textContent = 'Cannot reach the server. Is it running?'; }
})();
