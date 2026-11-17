// Run: node backend/test.js
const assert = require('assert'), G = require('./lib/graph'), { evaluate, insertBest } = require('./lib/market');
const { AREAS, EDGES } = require('./lib/data');

const R = (id, p, d, o = {}) => {
  const km = G.dist(p, d);
  return { id, riderName: 'R' + id, pickup: p, drop: d, soloKm: km, soloFare: Math.round(40 + 12 * km), maxDetour: 40, ...o };
};
const st = r => [{ node: r.pickup, type: 'pickup', reqId: r.id }, { node: r.drop, type: 'drop', reqId: r.id }];

let a, b, p;

// ---------- Data integrity ----------
EDGES.forEach(([x, y]) => assert.ok(AREAS[x] && AREAS[y], `edge endpoint exists: ${x} - ${y}`));
const seen = new Set();
EDGES.forEach(([x, y]) => { const k = [x, y].sort().join('|'); assert.ok(!seen.has(k), `duplicate edge ${k}`); seen.add(k); });
Object.keys(AREAS).forEach(n => assert.ok(Number.isFinite(G.dist('Kothrud', n)), `${n} is connected to the rest of the graph`));

// ---------- Original tests ----------
assert.ok(Math.abs(G.dist('Kothrud', 'Hinjewadi') - G.dist('Hinjewadi', 'Kothrud')) < 1e-9, 'distance is symmetric');

a = R(1, 'Kothrud', 'Hinjewadi', { maxDetour: 100 });
b = R(2, 'Baner', 'Hinjewadi', { maxDetour: 100 });
p = evaluate('Aundh', [...st(a), ...st(b)], { 1: a, 2: b });
assert.ok(p, 'overlapping rides pool');
[a, b].forEach(r => assert.ok(p.fares[r.id] <= r.soloFare, 'pooled fare <= solo fare'));
assert.ok(p.order.findIndex(s => s.type === 'drop') >= 2, 'both riders are in the car together before the first drop');

a = R(1, 'Kothrud', 'Hinjewadi'); b = R(2, 'Kharadi', 'Katraj');
assert.strictEqual(evaluate('Aundh', [...st(a), ...st(b)], { 1: a, 2: b }), null, 'far apart rides cannot pool');

a = R(1, 'Kothrud', 'Hinjewadi'); p = evaluate('Kothrud', st(a), { 1: a });
assert.ok(p && p.fares[1] === a.soloFare, 'single ride pays solo fare');

// rider 1 already on board (only drop left), rider 2 can still be added on the way
a = R(1, 'Kothrud', 'Hinjewadi', { maxDetour: 100 }); b = R(2, 'Baner', 'Hinjewadi', { maxDetour: 100 });
p = evaluate('Kothrud', [{ node: 'Hinjewadi', type: 'drop', reqId: 1 }, ...st(b)], { 1: a, 2: b });
assert.ok(p && p.order[0].type === 'pickup', 'add a second ride after the first pickup');

// third rider joins a running trip: on the route, seats checked
{
  const x = R(1, 'Kothrud', 'Hinjewadi', { maxDetour: 100, seats: 1 });
  const y = R(2, 'Pashan', 'Baner', { maxDetour: 100, seats: 1 });
  const z = R(3, 'Katraj', 'Swargate', { maxDetour: 100, seats: 1 });
  const un = [{ node: 'Hinjewadi', type: 'drop', reqId: 1 }];
  const ok = insertBest('Kothrud', un, y, { 1: x, 2: y }, 4, 1);
  assert.ok(ok && ok.order.length === 3, 'rider in between is inserted');
  const far = insertBest('Kothrud', un, z, { 1: x, 3: z }, 4, 1);
  assert.ok(!far || far.total - G.dist('Kothrud', 'Hinjewadi') > 20, 'far-off rider needs a big detour (the route check in tripFit rejects it)');
}

// ---------- New area tests (Lohegaon / Ajeenkya DY Patil corridor) ----------
const DYP = 'Ajeenkya DY Patil University';

assert.ok(Math.abs(G.dist(DYP, 'Hinjewadi') - G.dist('Hinjewadi', DYP)) < 1e-9, 'distance is symmetric for DY Patil');
assert.ok(G.dist(DYP, 'Lohegaon') < G.dist(DYP, 'Kothrud'), 'DY Patil is closer to Lohegaon than to Kothrud');

// two riders on the Lohegaon -> Viman Nagar -> Kharadi corridor pool
a = R(1, 'Lohegaon', 'Kharadi', { maxDetour: 100 });
b = R(2, 'Viman Nagar', 'Kharadi', { maxDetour: 100 });
p = evaluate('Pune Airport', [...st(a), ...st(b)], { 1: a, 2: b });
assert.ok(p, 'Lohegaon and Viman Nagar riders heading to Kharadi pool');
[a, b].forEach(r => assert.ok(p.fares[r.id] <= r.soloFare, 'pooled fare <= solo fare (Lohegaon corridor)'));

// DY Patil student and a Tingre Nagar rider heading to the city
a = R(1, DYP, 'Pune Station', { maxDetour: 100 });
b = R(2, 'Tingre Nagar', 'Pune Station', { maxDetour: 100 });
p = evaluate(DYP, [...st(a), ...st(b)], { 1: a, 2: b });
assert.ok(p, 'DY Patil and Tingre Nagar riders to Pune Station pool');

// opposite ends of the city cannot pool
a = R(1, DYP, 'Kharadi'); b = R(2, 'Hinjewadi', 'Katraj');
assert.strictEqual(evaluate('Lohegaon', [...st(a), ...st(b)], { 1: a, 2: b }), null, 'DY Patil and Hinjewadi rides cannot pool');

// single DY Patil ride pays solo fare
a = R(1, DYP, 'Pune Station'); p = evaluate(DYP, st(a), { 1: a });
assert.ok(p && p.fares[1] === a.soloFare, 'single DY Patil ride pays solo fare');

// third rider joins a running DY Patil -> Kharadi trip
{
  const x = R(1, DYP, 'Kharadi', { maxDetour: 100, seats: 1 });
  const y = R(2, 'Viman Nagar', 'Kharadi', { maxDetour: 100, seats: 1 });
  const z = R(3, 'Katraj', 'Swargate', { maxDetour: 100, seats: 1 });
  const un = [{ node: 'Kharadi', type: 'drop', reqId: 1 }];
  const ok = insertBest(DYP, un, y, { 1: x, 2: y }, 4, 1);
  assert.ok(ok && ok.order.length === 3, 'Viman Nagar rider is inserted on the DY Patil -> Kharadi route');
  const far = insertBest(DYP, un, z, { 1: x, 3: z }, 4, 1);
  assert.ok(!far || far.total - G.dist(DYP, 'Kharadi') > 20, 'Katraj rider needs a big detour on the DY Patil route');
}

console.log('All tests passed');
