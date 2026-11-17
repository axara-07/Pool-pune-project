// Safety-team console: shows alerts and lets staff mark them resolved. Protected by the ADMIN_KEY printed at server start.
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
let key = sessionStorage.getItem('pp_admin') || '', timer;
const TYPE = { sos: 'SOS', 'checkin-missed': 'Missed check-in', report: 'Report' };
async function call(url, body) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'x-admin-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status }); return j;
}
function show(alerts) {
  const open = alerts.filter(a => a.status === 'open').sort((x, y) => (x.type === 'report') - (y.type === 'report'));
  const card = a => `<div class="offer ${a.status === 'open' && a.type !== 'report' ? 'urgent' : ''}"><div><b>#${a.id} · ${esc(TYPE[a.type] || a.type)}</b> <span class="fitbadge ${a.status === 'open' ? 'no' : 'yes'}">${esc(a.status)}</span> <span class="note">${new Date(a.createdAt).toLocaleString()}</span><br>
    <b>${esc(a.name)}</b> (${esc(a.role)}) · <a href="tel:${esc(a.phone)}">${esc(a.phone)}</a>
    ${a.reason ? `<br>Reason: ${esc(a.reason)}${a.about && a.about.length ? ` · about ${esc(a.about.join(', '))}` : ''}${a.blocked ? ' · reporter blocked them' : ''}` : ''}
    ${a.note ? `<br>“${esc(a.note)}”` : ''}
    ${a.ride ? `<br><span class="note">Ride ${esc(a.ride)}${a.vehicle ? ` · ${esc(a.vehicle)}` : ''}${a.driverName ? ` · driver ${esc(a.driverName)}` : ''}</span>` : ''}
    ${a.location ? `<br><span class="note">Last known area: <b>${esc(a.location)}</b>${a.ridersInCar && a.ridersInCar.length ? ` · in car: ${esc(a.ridersInCar.join(', '))}` : ''}</span>` : ''}
    ${a.trackUrl ? `<br><a href="${esc(a.trackUrl)}" target="_blank" rel="noopener">Open live trip</a>` : ''}
    ${a.sent && a.sent.length ? `<br><span class="note">Contacts notified: ${a.sent.map(c => esc(c.name) + (c.status ? ' (' + esc(c.status) + ')' : '')).join(', ')}</span>` : ''}
    ${a.resolvedAt ? `<br><span class="note">Resolved by ${esc(a.resolvedBy)} ${new Date(a.resolvedAt).toLocaleTimeString()}${a.resolution ? ': ' + esc(a.resolution) : ''}</span>` : ''}</div>
    <div class="side">${a.status === 'open' ? `<button data-res="${a.id}">Mark resolved</button>` : ''}</div></div>`;
  $('list').innerHTML = `<p class="status">${open.length} open alert${open.length === 1 ? '' : 's'}</p>` + (alerts.map(card).join('') || '<p class="note">No alerts yet.</p>');
}
async function load() {
  try { const j = await call('/api/admin/alerts'); $('gate').hidden = true; $('list').hidden = false; show(j.alerts); }
  catch (e) { clearInterval(timer); $('gate').hidden = false; $('list').hidden = true; if (e.status === 401 && key) $('gmsg').textContent = 'That key is not right.'; key = ''; sessionStorage.removeItem('pp_admin'); }
}
$('enter').onclick = () => { key = $('key').value.trim(); sessionStorage.setItem('pp_admin', key); $('gmsg').textContent = ''; start(); };
$('key').onkeydown = e => { if (e.key === 'Enter') $('enter').click(); };
document.addEventListener('click', async e => { const b = e.target.closest('[data-res]'); if (!b) return; const note = prompt('Optional note about what was done:') ; if (note === null) return;
  try { show((await call('/api/admin/resolve', { id: +b.dataset.res, note })).alerts); } catch (er) { alert(er.message); } });
function start() { load(); clearInterval(timer); timer = setInterval(load, 4000); }
if (key) start();
