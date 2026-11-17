// Graph of Pune: areas = nodes, roads = edges with REAL driving km (OpenStreetMap routing, cached on disk).
const fs = require('fs'), path = require('path');
const { AREAS, EDGES } = require('./data');
const CACHE = path.join(__dirname, '..', 'data', 'roads.json');
const names = Object.keys(AREAS);

const hav = (a, b) => { const r = x => x * Math.PI / 180, p = r(b[0]-a[0]), q = r(b[1]-a[1]);
  const h = Math.sin(p/2)**2 + Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(q/2)**2; return 12742 * Math.asin(Math.sqrt(h)); };

// Start with estimates (straight line x 1.35); loadRoads() replaces them with real data.
const roads = EDGES.map(([a, b]) => ({ a, b, km: +(hav(AREAS[a], AREAS[b]) * 1.35).toFixed(1), geo: [AREAS[a], AREAS[b]], real: false }));
let adj = {}, memo = {};
function buildAdj() { adj = {}; memo = {}; names.forEach(n => adj[n] = []); roads.forEach(r => { adj[r.a].push([r.b, r.km]); adj[r.b].push([r.a, r.km]); }); }
buildAdj();

// Dijkstra: shortest road distance from src to every area
function dijkstra(src) {
  const d = {}, prev = {}, done = {}; names.forEach(k => d[k] = Infinity); d[src] = 0;
  for (;;) {
    let u = null; for (const k in d) if (!done[k] && (u === null || d[k] < d[u])) u = k;
    if (u === null || d[u] === Infinity) break; done[u] = 1;
    for (const [v, w] of adj[u]) if (d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = u; }
  }
  return { d, prev };
}
const sp = s => memo[s] || (memo[s] = dijkstra(s));
const dist = (a, b) => a === b ? 0 : sp(a).d[b];
function pathNodes(a, b) { const { prev } = sp(a), p = [b]; while (p[0] !== a) p.unshift(prev[p[0]]); return p; }
function geoFor(a, b) { const r = roads.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a)); return r.a === a ? r.geo : [...r.geo].reverse(); }
function geoPath(nodes) { let g = []; for (let i = 0; i < nodes.length - 1; i++) { const s = geoFor(nodes[i], nodes[i+1]); g = g.concat(i ? s.slice(1) : s); } return g; }
function chain(stops) { let r = []; for (let i = 0; i < stops.length - 1; i++) { const p = pathNodes(stops[i], stops[i+1]); r = r.concat(i ? p.slice(1) : p); } return r; }
const matrix = () => names.map(a => names.map(b => +dist(a, b).toFixed(1)));

async function fetchRoad(r) {
  const A = AREAS[r.a], B = AREAS[r.b];
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${A[1]},${A[0]};${B[1]},${B[0]}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(12000) });
    const j = await res.json();
    if (j.code === 'Ok') { const t = j.routes[0]; return { km: t.distance / 1000, geo: t.geometry.coordinates.map(p => [+p[1].toFixed(5), +p[0].toFixed(5)]) }; }
  } catch (e) { /* offline or busy: keep the estimate */ }
  return null;
}
async function loadRoads() {
  let saved = {}; try { saved = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
  const apply = (r, d) => { r.km = +d.km.toFixed(1); r.geo = d.geo; r.real = true; };
  const todo = [];
  roads.forEach(r => { const d = saved[r.a + '|' + r.b]; d ? apply(r, d) : todo.push(r); });
  for (let i = 0; i < todo.length; i += 4)
    await Promise.all(todo.slice(i, i + 4).map(async r => { const d = await fetchRoad(r); if (d) { apply(r, d); saved[r.a + '|' + r.b] = d; } }));
  try { fs.writeFileSync(CACHE, JSON.stringify(saved)); } catch (e) {}
  buildAdj();
  return status();
}
const status = () => ({ real: roads.filter(r => r.real).length, total: roads.length });
module.exports = { AREAS, names, roads, dist, pathNodes, geoPath, chain, matrix, loadRoads, status };
