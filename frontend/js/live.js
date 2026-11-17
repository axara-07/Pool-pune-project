// Live drivers on the map: markers appear when a driver goes online, slide along real roads when they move, vanish when offline.
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROAM_MS = 700;                                  // metres per second (sped up so you can watch)
const CD = {}; let lastTs = 0, lastBadge = 0, serverOnline = true, onlineInfo = { n: 0, free: 0 };

const hav = (a, b) => { const r = x => x * Math.PI / 180, p = r(b[0]-a[0]), q = r(b[1]-a[1]);
  const h = Math.sin(p/2)**2 + Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(q/2)**2; return 12742 * Math.asin(Math.sqrt(h)); };
const cumLen = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i-1] + hav(pts[i-1], pts[i])); return c; };
function posAt(pts, cum, dk) {
  let i = 1; while (i < cum.length - 1 && cum[i] < dk) i++;
  const s = (cum[i]-cum[i-1]) || 1e-9, f = Math.min(Math.max((dk-cum[i-1])/s, 0), 1);
  return [pts[i-1][0] + (pts[i][0]-pts[i-1][0])*f, pts[i-1][1] + (pts[i][1]-pts[i-1][1])*f];
}
function geoFor(a, b) { const r = ROADS.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a)); return r ? (r.a === a ? r.geo : [...r.geo].reverse()) : null; }
// a driver may jump several areas at once (e.g. changed location), so follow the shortest chain of roads if we can
function routeBetween(a, b) {
  const q = [[a]], seen = { [a]: 1 };
  while (q.length) { const p = q.shift(), n = p[p.length-1]; if (n === b) return p;
    ROADS.forEach(r => { const o = r.a === n ? r.b : r.b === n ? r.a : null; if (o && !seen[o]) { seen[o] = 1; q.push([...p, o]); } }); }
  return null;
}
function addDriver(s) {
  if (CD[s.id]) return;
  const d = CD[s.id] = { id: s.id, at: s.at, pos: [...AREAS[s.at]], move: null };
  d.marker = L.marker(d.pos, { zIndexOffset: 1000, icon: L.divIcon({ className: '', html: `<div class="drv">${esc(s.label || s.id)}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map);
}
function initLive(ds) { ds.forEach(addDriver); syncDrivers(ds); requestAnimationFrame(t => { lastTs = t; frame(t); }); }
// called every 2s with the server's ONLINE drivers
function syncDrivers(ds) {
  serverOnline = true; onlineInfo = { n: ds.length, free: ds.filter(s => !s.busy).length };
  ds.forEach(addDriver);
  Object.keys(CD).forEach(id => { if (!ds.some(s => s.id === id)) { map.removeLayer(CD[id].marker); delete CD[id]; } });
  ds.forEach(s => {
    const d = CD[s.id], el = d.marker.getElement(); if (el && el.firstChild) el.firstChild.classList.toggle('busy', s.busy);
    if (s.at === d.at) return;
    const nodes = RM ? null : routeBetween(d.at, s.at);
    if (nodes) { const pts = [d.pos]; for (let i = 0; i < nodes.length - 1; i++) pts.push(...geoFor(nodes[i], nodes[i+1])); const cum = cumLen(pts); d.move = { pts, cum, dk: 0, total: cum[cum.length-1] }; }
    else { d.pos = [...AREAS[s.at]]; d.move = null; }
    d.at = s.at;
  });
}
function frame(ts) {
  const dt = Math.min(ts - lastTs, 100); lastTs = ts;
  Object.values(CD).forEach(d => {
    if (d.move) { d.move.dk = Math.min(d.move.dk + ROAM_MS*dt/1e6, d.move.total); d.pos = posAt(d.move.pts, d.move.cum, d.move.dk); if (d.move.dk >= d.move.total) d.move = null; }
    d.marker.setLatLng(d.pos);
  });
  if (ts - lastBadge > 500) {
    lastBadge = ts;
    $('badge').innerHTML = serverOnline ? `<b>Live</b> · ${onlineInfo.n} driver${onlineInfo.n === 1 ? '' : 's'} online (${onlineInfo.free} free) · ${new Date().toLocaleTimeString()}` : 'Server offline';
  }
  requestAnimationFrame(frame);
}
