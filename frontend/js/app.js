// Rider page: request a ride, watch the driver accept and drive. Drivers choose; nothing is auto-assigned.
const $ = id => document.getElementById(id);
const fmt = n => '₹' + Math.round(n);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
async function api(url, opt = {}) {
  if (opt.method === 'POST') { opt.headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) }; opt.body = opt.body || '{}'; }
  const r = await fetch(url, opt), j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = 'login.html'; return new Promise(() => {}); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
let AREAS = {}, ROADS = [], map, routeLayer, sig = '', lastActive = null, doneMsg = '';
const prefText = a => [a.coRider === 'same' ? 'same-gender co-riders only' : '', a.driverPref === 'same' ? 'same-gender driver only' : ''].filter(Boolean).join(', ');

function initMap() {
  map = L.map('map', { zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, wheelDebounceTime: 30, minZoom: 9, maxZoom: 19, zoomAnimation: true, preferCanvas: true }).setView([18.535, 73.85], 12);
  map.createPane('roads').style.zIndex = 350;
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
  L.control.layers({ 'Street map (OpenStreetMap)': osm, 'Street map (Esri)': esri, 'Satellite': sat }).addTo(map);
  map.fitBounds(Object.values(AREAS), { padding: [30, 30] });
  routeLayer = L.layerGroup().addTo(map);
  ROADS.forEach(r => L.polyline(r.geo, { pane: 'roads', color: '#6b7c93', weight: 3, opacity: .85, dashArray: r.real ? null : '4 6' })
    .addTo(map).bindTooltip(`${r.a} – ${r.b}: ${r.km} km${r.real ? '' : ' (estimate)'}`, { sticky: true }));
  // Labels thin out when zoomed out and fill in as you zoom in, so the map stays readable with 100+ areas.
  const MAJOR = new Set(['Hinjewadi','Wakad','Baner','Pashan','Aundh','Kothrud','Shivajinagar','Deccan','Pune Station','Koregaon Park','Swargate','Katraj','Kondhwa','Hadapsar','Viman Nagar','Kharadi','Lohegaon','Pimpri','Chinchwad','Ajeenkya DY Patil University','Pune Airport','Wagholi','Nigdi','Bhosari']);
  const setZoomClass = () => { const z = map.getZoom(), c = map.getContainer();
    c.classList.toggle('z-lo', z < 11); c.classList.toggle('z-mid', z >= 11 && z < 13); c.classList.toggle('z-hi', z >= 13); };
  const pick = (id, name) => { const el = $(id); el.value = name; el.dispatchEvent(new Event('change', { bubbles: true })); map.closePopup(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  window.setArea = pick;
  Object.keys(AREAS).forEach(n => {
    const m = L.circleMarker(AREAS[n], { radius: 6, color: '#14233a', weight: 2, fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip(n, { permanent: true, direction: 'right', offset: [6, 0], className: 'lbl ' + (MAJOR.has(n) ? 'major' : 'minor') }).addTo(map);
    // bigger invisible touch target so small dots are easy to hit
    const hit = L.circleMarker(AREAS[n], { radius: 14, stroke: false, fillOpacity: 0, fillColor: '#000' }).addTo(map);
    const pop = `<b>${esc(n)}</b><br><button class="pk" onclick="setArea('ap','${esc(n).replace(/'/g, "\\'")}')">Set as pickup</button> <button class="pk" onclick="setArea('ad','${esc(n).replace(/'/g, "\\'")}')">Set as drop</button>`;
    [m, hit].forEach(x => x.bindPopup(pop));
  });
  map.on('zoomend', setZoomClass); setZoomClass();
  // controls: reset view, zoom to my route
  const Reset = L.Control.extend({ options: { position: 'topleft' }, onAdd() {
    const b = L.DomUtil.create('div', 'leaflet-bar'), a = L.DomUtil.create('a', '', b);
    a.href = '#'; a.title = 'Show all of Pune'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Show all of Pune'); a.textContent = '⌂'; a.style.cssText = 'font-size:18px;line-height:30px;text-align:center';
    L.DomEvent.disableClickPropagation(b); L.DomEvent.on(a, 'click', e => { L.DomEvent.preventDefault(e); map.fitBounds(Object.values(AREAS), { padding: [30, 30] }); });
    return b; } });
  new Reset().addTo(map); L.control.scale({ imperial: false }).addTo(map);
}
async function buildTable() {
  const { names, matrix } = await api('/api/distances');
  $('tbl').innerHTML = '<tr><th></th>' + names.map(n => `<th title="${esc(n)}">${esc(n.slice(0, 4))}</th>`).join('') + '</tr>' +
    names.map((a, i) => `<tr><th>${esc(a)}</th>` + names.map((b, j) => `<td>${i === j ? '–' : matrix[i][j].toFixed(1)}</td>`).join('') + '</tr>').join('');
}
const stopText = s => s.mine ? (s.type === 'pickup' ? 'Pick you up' : 'Drop you off') : (s.type === 'pickup' ? 'Pick up another rider' : 'Drop another rider');

function safetyBox(a, sf) {
  const al = sf.openAlert;
  return `<div class="safebox">
    ${a.endPin ? `<p class="pin">End-of-ride OTP <b>${esc(a.endPin)}</b></p><p class="note">When you reach your drop-off, give this OTP to the driver. The ride is only marked finished once the driver enters it. Don't share it earlier.</p>` : ''}
    ${a.pin ? `<p class="pin">Ride PIN <b>${esc(a.pin)}</b></p><p class="note">Check that the driver's name and number plate match, then tell the driver this PIN when you get in. Never share it earlier or by phone.</p>` : ''}
    ${sf.checkin ? `<div class="checkin" role="alert"><b>Are you OK?</b> Your ride hasn't reached a stop for a while. If we don't hear from you, we alert your emergency contacts.<br><button id="ckok" class="primary">I'm OK</button> <button id="cksos" class="sosbtn">I need help</button></div>` : ''}
    ${al ? `<div class="alertbar" role="alert"><b>Alert sent at ${esc(SAFE.clock(al.createdAt))}</b> · ${al.contactsNotified} contact${al.contactsNotified === 1 ? '' : 's'} notified. <a href="tel:112">Call 112</a><br><button id="imsafe" class="ghost">I'm safe, cancel the alert</button></div>` : ''}
    <button id="shareBtn" class="ghost">${a.shared ? 'Trip shared · share again' : 'Share live trip'}</button>
    ${sf.contacts ? '' : '<p class="note">Tip: add an emergency contact in Safety settings so SOS can reach someone you trust.</p>'}</div>`;
}
function renderRide(v) {
  const a = v.active; $('go').disabled = !!a; $('go').textContent = a ? 'Ride in progress' : 'Request ride';
  let html;
  if (!a) {
    if (lastActive) {                                   // a ride just ended: say how it went
      const h = v.history.find(x => x.id === lastActive);
      if (h) doneMsg = h.status === 'completed' ? `<p class="status ok">Ride complete</p><p>${esc(h.pickup)} → ${esc(h.drop)}. You paid <b>${fmt(h.fare)}</b>${h.soloFare > h.fare ? ` (you saved ${fmt(h.soloFare - h.fare)} by sharing)` : ''}.</p><p><button class="linkbtn" data-report="${h.id}" data-role="rider">Report a problem with this ride</button></p>`
        : `<p class="status bad">Request ${esc(h.status)}</p><p>${esc(h.pickup)} → ${esc(h.drop)}</p>`;
    }
    html = doneMsg || '<p class="status">No active ride.</p><p class="note">Choose where you are going and press Request ride.</p>';
  } else {
    doneMsg = '';
    const mode = a.share ? `open to sharing (up to +${$('det').value}% distance)` : 'solo ride';
    if (a.status === 'pending') {
      html = `<p class="status">Looking for a driver…</p><p>${esc(a.pickup)} → ${esc(a.drop)} · ${a.seats} passenger${a.seats > 1 ? 's' : ''} · ${a.share ? 'open to sharing' : 'solo ride'}${prefText(a) ? ` · ${prefText(a)}` : ''}</p>
        <p class="note">${a.waiting.driversOnline} driver${a.waiting.driversOnline === 1 ? ' is' : 's are'} online. Drivers see your request and choose whether to take it. Solo fare would be ${fmt(a.soloFare)}${a.share ? '; sharing makes it cheaper.' : '.'}</p>
        <button id="cancel">Cancel request</button>`;
    } else {
      const t = a.trip, save = a.soloFare - a.fare;
      html = `<p class="status ok">${a.status === 'onboard' ? 'You are on your way' : 'A driver accepted your ride'}</p>
        <p><b>${esc(t.driverName)}</b> · ${esc(t.vehicleType)} · ${esc(t.plate)}${t.sharedWith ? ` · sharing with ${esc(t.sharedWith)}` : ''}</p>
        <ol class="steps stops">${t.stops.map(s => `<li class="${s.done ? 'done' : ''}">${stopText(s)} at ${esc(s.node)}</li>`).join('')}</ol>
        <p>Your fare: <b>${fmt(a.fare)}</b>${save > 0 ? ` <span class="ok">(solo ${fmt(a.soloFare)}, you save ${fmt(save)})</span>` : ''}${a.detourPct ? ` · your extra distance +${a.detourPct}%` : ''}</p>
        ${safetyBox(a, v.safety || {})}`;
    }
  }
  if ($('ride').dataset.h !== html) { $('ride').innerHTML = html; $('ride').dataset.h = html; }       // only redraw when something changed (keeps dialogs and clicks steady)
  SAFE.fab(!!a && a.status !== 'pending');
  if ($('shareBtn')) $('shareBtn').onclick = SAFE.share;
  if ($('ckok')) $('ckok').onclick = async () => { try { renderRide(await api('/api/safety/checkin-ok', { method: 'POST' })); } catch (e) { alert(e.message); } };
  if ($('cksos')) $('cksos').onclick = SAFE.sos;
  if ($('imsafe')) $('imsafe').onclick = SAFE.imSafe;
  if ($('cancel')) $('cancel').onclick = async () => { try { renderRide(await api('/api/requests/cancel', { method: 'POST' })); } catch (e) { $('ride').insertAdjacentHTML('beforeend', `<p class="bad">${esc(e.message)}</p>`); } };
  lastActive = a ? a.id : lastActive;
  // map: route + pickup/drop markers (redraw only when something changed)
  const s = JSON.stringify(a && [a.id, a.status, a.trip && a.trip.driverAt, a.trip && a.trip.stops.map(x => x.done)]);
  if (s !== sig) {
    sig = s; routeLayer.clearLayers();
    if (a) {
      if (a.trip && a.trip.routeGeo.length > 1) L.polyline(a.trip.routeGeo, { color: '#2563eb', weight: 6, opacity: .8 }).addTo(routeLayer);
      L.circleMarker(AREAS[a.pickup], { radius: 9, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('Your pickup').addTo(routeLayer);
      L.circleMarker(AREAS[a.drop], { radius: 9, color: '#fff', weight: 2, fillColor: '#c2185b', fillOpacity: 1 }).bindTooltip('Your drop').addTo(routeLayer);
    }
  }
  $('trips').innerHTML = v.history.length ? '<tr><th>#</th><th>Time</th><th>Ride</th><th>Type</th><th>Fare</th><th>Status</th></tr>' +
    v.history.map(x => `<tr><td>${x.id}</td><td>${new Date(x.createdAt).toLocaleTimeString()}</td><td>${esc(x.pickup)} → ${esc(x.drop)}</td><td>${x.share ? 'Shared OK' : 'Solo'}</td>
      <td>${x.fare == null ? '–' : fmt(x.fare)}</td><td>${esc(x.status)}${x.status === 'completed' ? ` <button class="linkbtn" data-report="${x.id}" data-role="rider">Report</button>` : ''}</td></tr>`).join('') : '<tr><td>No rides yet.</td></tr>';
}
$('share').onchange = e => { $('shareOpts').hidden = !e.target.checked; };
$('det').oninput = e => { $('detv').textContent = e.target.value; };
$('go').onclick = async () => {
  $('go').disabled = true; doneMsg = '';
  try {
    renderRide(await api('/api/requests', { method: 'POST', body: JSON.stringify({ pickup: $('ap').value, drop: $('ad').value, seats: +$('seats').value, share: $('share').checked, maxDetour: +$('det').value, coRider: $('corider').value, driverPref: $('drvpref').value }) }));
  } catch (e) { $('ride').innerHTML = `<p class="status bad">${esc(e.message)}</p>`; $('go').disabled = false; }
};
async function boot() {
  try {
    const me = (await api('/api/auth/me')).user;
    if (me.role === 'driver') { location.href = 'driver.html'; return; }
    $('userbar').innerHTML = `Hi, <b>${esc(me.name)}</b> <button id="logout" class="linkbtn">Log out</button>`;
    $('logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = 'login.html'; };
    const g = await api('/api/graph'); AREAS = g.areas; ROADS = g.roads;
    initMap();
    const opts = Object.keys(AREAS).sort((x, y) => x.localeCompare(y)).map(n => `<option>${esc(n)}</option>`).join('');
    $('ap').innerHTML = $('ad').innerHTML = opts; $('ap').value = 'Kothrud'; $('ad').value = 'Hinjewadi';
    $('src').textContent = g.status.real === g.status.total ? `Real road distances loaded for all ${g.status.total} roads (OpenStreetMap routing).`
      : `${g.status.real} of ${g.status.total} roads have real distances; the rest are estimates. Restart the server with internet to fetch them.`;
    initLive(await api('/api/drivers')); buildTable();
    SAFE.onChange = async () => { try { renderRide(await api('/api/requests/mine')); } catch (e) {} };
    SAFE.panel($('safetyPanel')).catch(() => {});
    renderRide(await api('/api/requests/mine'));
    setInterval(async () => { try { const [d, v] = await Promise.all([api('/api/drivers'), api('/api/requests/mine')]); syncDrivers(d); renderRide(v); } catch (e) { serverOnline = false; } }, 2000);
  } catch (e) { $('badge').textContent = 'Server offline'; $('src').textContent = 'Cannot reach the server. Run "node backend/server.js" and open http://localhost:3000'; }
}
boot();
