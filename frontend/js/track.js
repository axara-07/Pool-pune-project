// Public live-trip page for trusted contacts. No login: the long random token in the link is the key.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const token = new URLSearchParams(location.search).get('t') || '';
let map, layer, timer;
function draw(v) {
  if (!map) { map = L.map('map').setView([18.535, 73.85], 12); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map); layer = L.layerGroup().addTo(map); }
  layer.clearLayers(); if (!v.atLatLng) return;
  if (v.routeGeo.length > 1) L.polyline(v.routeGeo, { color: '#2563eb', weight: 6, opacity: .8 }).addTo(layer);
  L.circleMarker(v.pickupLatLng, { radius: 8, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('Pickup').addTo(layer);
  L.circleMarker(v.dropLatLng, { radius: 8, color: '#fff', weight: 2, fillColor: '#c2185b', fillOpacity: 1 }).bindTooltip('Drop').addTo(layer);
  const car = L.marker(v.atLatLng, { zIndexOffset: 1000, icon: L.divIcon({ className: '', html: '<div class="drv">Car</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(layer);
  if (!map._fitted) { map.fitBounds(L.latLngBounds([v.atLatLng, v.pickupLatLng, v.dropLatLng]), { padding: [40, 40], maxZoom: 14 }); map._fitted = true; }
}
async function tick() {
  try {
    const r = await fetch('/api/track/' + encodeURIComponent(token)), v = await r.json();
    if (!r.ok) { $('who').textContent = 'This link is not valid.'; $('info').innerHTML = '<p class="bad">We could not find this trip. Ask the rider to share it again.</p>'; clearInterval(timer); return; }
    $('who').textContent = `${v.rider}'s trip: ${v.pickup} → ${v.drop}`;
    if (v.ended) { $('info').innerHTML = `<p class="status ${v.status === 'completed' ? 'ok' : ''}">Trip ${v.status === 'completed' ? 'completed' : 'ended'}</p><p>Sharing has stopped. Thank you for keeping an eye out.</p>`; $('map').hidden = true; clearInterval(timer); return; }
    const alert = v.alert ? '<div class="alertbar" role="alert"><b>Safety alert raised for this trip.</b> Please call them now. If you think they are in danger call <a href="tel:112">112</a>.</div>' : '';
    if (v.waiting) { $('info').innerHTML = alert + '<p class="status">Waiting for a driver</p><p class="note">The trip has not started yet. This page will update by itself.</p>'; return; }
    const next = v.stops.find(s => !s.done);
    $('info').innerHTML = alert + `<p class="status ok">${v.status === 'onboard' ? 'On the way' : 'Driver heading to pickup'}</p>
      <p><b>${esc(v.driver)}</b> · ${esc(v.vehicle)} · <b>${esc(v.plate)}</b></p><p>Car is at <b>${esc(v.at)}</b>${next ? `. Next stop: ${esc(next.type === 'pickup' ? 'pickup' : 'drop')} at ${esc(next.node)}.` : '.'}</p>
      <ol class="steps stops">${v.stops.map(s => `<li class="${s.done ? 'done' : ''}">${s.mine ? '' : 'Another rider: '}${s.type === 'pickup' ? 'pickup' : 'drop'} at ${esc(s.node)}</li>`).join('')}</ol>
      <p class="note">Updated ${new Date(v.updatedAt).toLocaleTimeString()} · Emergency: <a href="tel:112">112</a></p>`;
    draw(v);
  } catch (e) { $('who').textContent = 'Cannot reach PoolPune right now. Retrying…'; }
}
tick(); timer = setInterval(tick, 4000);
