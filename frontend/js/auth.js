// Login / sign-up page for riders and drivers.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
let AREAS = [], role = location.hash.includes('driver') ? 'driver' : 'rider', mode = location.hash.includes('signup') ? 'signup' : 'login', busy = false;

const F = {   // every form field: label, type, rule
  name:   { label: 'Full name', auto: 'name', check: v => v.trim().length >= 2 || 'Enter your full name' },
  email:  { label: 'Email', type: 'email', auto: 'email', ph: 'you@example.com', check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Enter a valid email address' },
  phone:  { label: 'Mobile number', type: 'tel', auto: 'tel-national', prefix: '+91', ph: '98765 43210', hint: '10-digit Indian mobile number',
            check: v => /^[6-9]\d{9}$/.test(v.replace(/[\s-]/g, '')) || 'Enter a valid 10-digit mobile number' },
  password: { label: 'Password', type: 'password', pw: true,
            check: (v, m) => m === 'login' ? (!!v || 'Enter your password') : ((v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v)) || 'Use 8+ characters with a letter and a number') },
  gender: { label: 'Gender (optional)', select: () => ['Prefer not to say', 'Female', 'Male', 'Non-binary'], hint: 'Only used if you choose a same-gender ride preference. Never shown to other users.' },
  vehicleType: { label: 'Vehicle type', select: () => ['Hatchback', 'Sedan', 'SUV', 'Auto rickshaw'] },
  plate:  { label: 'Number plate', ph: 'MH12 AB 1234', max: 13, check: v => /^[A-Za-z]{2} ?\d{1,2} ?[A-Za-z]{1,3} ?\d{4}$/.test(v.trim()) || 'Enter a plate like MH12 AB 1234' },
  licence:{ label: 'Driving licence number', ph: 'MH12 20110012345', max: 20, hint: 'Stored only for this demo; nothing is verified',
            check: v => /^[A-Za-z0-9]{10,16}$/.test(v.replace(/[\s-]/g, '')) || 'Enter 10–16 letters and numbers' },
  homeArea: { label: 'Where do you usually start?', select: () => AREAS }
};
const FORMS = {
  rider:  { signup: ['name', 'email', 'phone', 'gender', 'password'], login: ['email', 'password'] },
  driver: { signup: ['#About you', 'name', 'email', 'phone', 'gender', 'password', '#Vehicle and licence', 'vehicleType', 'plate', 'licence', 'homeArea'], login: ['email', 'password'] }
};
const TEXT = {
  rider:  { pitch: 'Share the ride. Split the fare.', list: ['Pooled rides cost less than riding alone', 'Ride PIN, SOS button and live trip sharing', 'Watch your driver move live on the map'],
            signup: ['Create your rider account', 'Takes a minute. No payment details needed.'], login: ['Welcome back', 'Log in to book your next ride.'] },
  driver: { pitch: 'Drive with PoolPune.', list: ['Get matched with riders heading your way', 'Rider PIN check and an SOS button for you too', 'See your trips and earnings in one place'],
            signup: ['Register as a driver', 'Tell us about you and your vehicle.'], login: ['Welcome back, driver', 'Log in to go online and get ride requests.'] }
};

function fieldHTML(key) {
  const f = F[key], id = 'f-' + key, hint = key === 'password' ? (mode === 'signup' ? 'At least 8 characters with a letter and a number' : '') : (mode === 'signup' ? (f.hint || '') : '');
  let ctl;
  if (f.select) ctl = `<select id="${id}" name="${key}" aria-describedby="${id}-e">${f.select().map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
  else ctl = `<input id="${id}" name="${key}" type="${f.type || 'text'}" autocomplete="${key === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : (f.auto || 'off')}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.max ? `maxlength="${f.max}"` : ''} aria-describedby="${id}-h ${id}-e">`;
  if (f.prefix) ctl = `<div class="pfx"><span>${f.prefix}</span>${ctl}</div>`;
  if (f.pw) ctl = `<div class="pw">${ctl}<button type="button" class="eye" data-for="${id}" aria-label="Show password">Show</button></div>`;
  const meter = key === 'password' && mode === 'signup' ? '<div class="meter" aria-hidden="true"><i id="meter"></i></div>' : '';
  return `<div class="field" id="${id}-w"><label for="${id}">${f.label}</label>${ctl}${meter}<p class="hint" id="${id}-h">${hint}</p><p class="err" id="${id}-e"></p></div>`;
}
function render() {
  const t = TEXT[role];
  $('auth').dataset.role = role;
  document.querySelectorAll('#roleSeg button').forEach(b => b.setAttribute('aria-selected', b.dataset.role === role));
  document.querySelectorAll('#modeSeg button').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === mode));
  $('pitchTitle').textContent = t.pitch; $('pitchList').innerHTML = t.list.map(x => `<li>${esc(x)}</li>`).join('');
  $('title').textContent = t[mode][0]; $('sub').textContent = t[mode][1];
  $('form').innerHTML = FORMS[role][mode].map(k => k[0] === '#' ? `<h3>${esc(k.slice(1))}</h3>` : fieldHTML(k)).join('') +
    `<button class="btn" type="submit" id="submit">${mode === 'login' ? 'Log in' : (role === 'driver' ? 'Register as a driver' : 'Create account')}</button>`;
  $('switch').innerHTML = mode === 'login' ? `New to PoolPune? <button type="button" data-mode="signup">Create an account</button>` : `Already have an account? <button type="button" data-mode="login">Log in</button>`;
  $('alert').hidden = true;
  history.replaceState(null, '', '#' + role + (mode === 'signup' ? '-signup' : ''));
}
const keys = () => FORMS[role][mode].filter(k => k[0] !== '#');
const val = k => { const v = $('f-' + k).value; return k === 'password' ? v : v.trim(); };
function setErr(k, msg) { $('f-' + k + '-w').classList.toggle('bad', !!msg); $('f-' + k + '-e').textContent = msg || ''; $('f-' + k).setAttribute('aria-invalid', !!msg); }
function validate(k) { const f = F[k]; if (!f.check) return true; const r = f.check(val(k), mode); setErr(k, r === true ? '' : r); return r === true; }
function showAlert(msg) { const a = $('alert'); a.textContent = msg; a.hidden = false; }
function strength(v) { let s = 0; if (v.length >= 8) s++; if (v.length >= 12) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++; return s; }

document.addEventListener('click', e => {
  const r = e.target.closest('[data-role]'), m = e.target.closest('[data-mode]'), eye = e.target.closest('.eye');
  if (r && r.closest('#roleSeg')) { role = r.dataset.role; render(); }
  if (m) { mode = m.dataset.mode; render(); }
  if (eye) { const i = $(eye.dataset.for), show = i.type === 'password'; i.type = show ? 'text' : 'password'; eye.textContent = show ? 'Hide' : 'Show'; eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); }
});
$('form').addEventListener('focusout', e => { const k = e.target.name; if (k && F[k] && e.target.value) validate(k); });
$('form').addEventListener('input', e => {
  const k = e.target.name; if (!k) return;
  if ($('f-' + k + '-w').classList.contains('bad')) validate(k);
  if (k === 'password' && $('meter')) { const s = strength(e.target.value); $('meter').style.width = (s * 25) + '%'; $('meter').style.background = s < 2 ? 'var(--bad)' : s < 3 ? '#e08a00' : 'var(--ok)'; }
  $('alert').hidden = true;
});
$('form').addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return;
  const bad = keys().filter(k => !validate(k));
  if (bad.length) { $('f-' + bad[0]).focus(); return; }
  const body = {}; keys().forEach(k => body[k] = val(k));
  if (mode === 'login') body.role = role;
  const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register-' + role;
  busy = true; const btn = $('submit'), label = btn.textContent; btn.disabled = true; btn.textContent = mode === 'login' ? 'Logging in…' : 'Creating account…';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { if (j.field && F[j.field] && $('f-' + j.field)) { setErr(j.field, j.error); $('f-' + j.field).focus(); } else showAlert(j.error || 'Something went wrong'); }
    else location.href = j.user.role === 'driver' ? 'driver.html' : 'index.html';
  } catch (err) { showAlert('Cannot reach the server. Is it running? (node backend/server.js)'); }
  busy = false; btn.disabled = false; btn.textContent = label;
});

(async () => {
  try { AREAS = await (await fetch('/api/areas')).json(); } catch (e) { AREAS = []; }
  render();
  try { const r = await fetch('/api/auth/me'); if (r.ok) { const j = await r.json(); location.href = j.user.role === 'driver' ? 'driver.html' : 'index.html'; } } catch (e) {}
})();
