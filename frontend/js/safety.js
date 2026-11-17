// Safety tools shared by the rider page and the driver page: emergency contacts, SOS, trip sharing, reports.
// Uses the page's own $, esc and api() helpers.
const SAFE = (() => {
  let dlg;
  const GENDERS = [['unspecified', 'Prefer not to say'], ['female', 'Female'], ['male', 'Male'], ['nonbinary', 'Non-binary']];
  const REASONS = [['unsafe-driving', 'Unsafe driving'], ['harassment', 'Harassment or made me uncomfortable'], ['route-deviation', 'Took a different route'], ['wrong-vehicle', 'Wrong vehicle or person'], ['overcharge', 'Asked for extra money'], ['other', 'Something else']];
  function modal(html) {
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'sdlg'; document.body.appendChild(dlg); dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); }
    dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); return dlg;
  }
  const close = () => dlg && dlg.open && dlg.close();
  const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body || {}) });
  const clock = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ---- settings panel: gender + up to 3 emergency contacts ----
  async function panel(el) {
    const m = await api('/api/safety/me');
    const rows = [0, 1, 2].map(i => { const c = m.contacts[i] || {}; return `<div class="crow"><input aria-label="Contact ${i + 1} name" name="cn" maxlength="40" placeholder="Name" value="${esc(c.name || '')}"><input aria-label="Contact ${i + 1} mobile" name="cp" type="tel" inputmode="tel" maxlength="14" placeholder="10-digit mobile" value="${esc(c.phone || '')}"></div>`; }).join('');
    el.innerHTML = `<details class="safedet" ${m.contacts.length ? '' : 'open'}><summary><b>Safety settings</b> <span class="note">${m.contacts.length ? m.contacts.length + ' emergency contact' + (m.contacts.length > 1 ? 's' : '') : 'Add a trusted contact so SOS can reach someone'}</span></summary>
      <p class="note">Trusted contacts get an SMS with your location and live trip link if you press SOS or miss a safety check-in. They never need an account.</p>${rows}
      <label for="sg">Gender (optional, never shown to others; only used for same-gender ride preferences)</label>
      <select id="sg">${GENDERS.map(([v, t]) => `<option value="${v}" ${v === m.gender ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button id="ssave" class="primary">Save safety settings</button> <span id="smsg" class="note" role="status"></span>
      <p class="note">In an emergency call <b>112</b> (police, ambulance, fire). Women's helpline: <b>1091</b>.</p></details>
      <button id="sospanel" class="sosbtn sospanel">SOS – send emergency alert</button>`;
    el.querySelector('#sospanel').onclick = () => sos();
    el.querySelector('#ssave').onclick = async () => {
      const names = [...el.querySelectorAll('[name=cn]')], phones = [...el.querySelectorAll('[name=cp]')];
      const contacts = names.map((n, i) => ({ name: n.value, phone: phones[i].value }));
      try { el.querySelector('#smsg').textContent = 'Saving…'; const r = await post('/api/safety/profile', { contacts, gender: el.querySelector('#sg').value }), m = r.messaged || {};
        const n = m.sent + m.demo + m.failed;
        el.querySelector('#smsg').textContent = 'Saved ✓' + (!n ? '' : !m.live ? ` Demo mode: ${n} message${n > 1 ? 's' : ''} printed in the server console, none sent by SMS.` : ` SMS sent to ${m.sent} contact${m.sent === 1 ? '' : 's'}${m.withLink ? ' with your ride link' : ''}${m.failed ? `; ${m.failed} failed` : ''}.`);
        el.querySelector('#smsg').className = 'note ok'; setTimeout(() => panel(el), 3500); }
      catch (e) { el.querySelector('#smsg').textContent = e.message; el.querySelector('#smsg').className = 'note bad'; }
    };
  }

  // ---- SOS ----
  const here = () => new Promise(ok => { if (!navigator.geolocation) return ok(null); navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null), { timeout: 4000, maximumAge: 60000 }); });
  function sos() {
    const d = modal(`<h2>Send an emergency alert?</h2><p>We send an SMS to your emergency contacts with your location and live trip link, and notify the PoolPune safety team.</p>
      <p><b>If you are in danger right now, call 112.</b></p><textarea id=\"sosnote\" maxlength=\"300\" rows=\"2\" placeholder=\"Optional: what is happening?\"></textarea>
      <div class=\"drow\"><a class=\"btnlink bad\" href=\"tel:112\">Call 112</a><button id=\"sosgo\" class=\"sosbtn\">Send SOS</button><button id=\"sosno\" class=\"ghost\">Cancel</button></div><p id=\"sosmsg\" class=\"note\"></p>`);
    d.querySelector('#sosno').onclick = close;
    d.querySelector('#sosgo').onclick = async () => {
      d.querySelector('#sosgo').disabled = true; d.querySelector('#sosmsg').textContent = 'Sending…'; d.querySelector('#sosmsg').className = 'note';
      try { const geo = await here(), r = await post('/api/safety/sos', { note: d.querySelector('#sosnote').value, geo });
        const status = !r.contactsNotified ? 'You have no emergency contacts saved, so only the safety team was notified. Add contacts in Safety settings.'
          : r.live ? `SMS delivered to ${r.delivered} of ${r.contactsNotified} contact${r.contactsNotified > 1 ? 's' : ''}${r.failed ? `; ${r.failed} failed, use the buttons below` : ''}.`
          : 'The server is in demo mode, so no SMS left it. Use the buttons below to send the alert from your own phone.';
        const links = (r.links || []).map(l => `<div class=\"drow\"><span>${esc(l.name)}</span><a class=\"btnlink\" href=\"${esc(l.sms)}\">SMS</a><a class=\"btnlink\" href=\"${esc(l.wa)}\" target=\"_blank\" rel=\"noopener\">WhatsApp</a><a class=\"btnlink\" href=\"tel:+91${esc(l.phone)}\">Call</a></div>`).join('');
        d.innerHTML = `<h2 class=\"bad\">Alert sent</h2><p>${status}</p>${links ? `<p class=\"note\">Also message them from your phone:</p>${links}` : ''}<p><b>If you are in danger, call 112.</b></p>
          <div class=\"drow\"><a class=\"btnlink bad\" href=\"tel:112\">Call 112</a><button id=\"sosx\" class=\"ghost\">Close</button></div>`;
        d.querySelector('#sosx').onclick = close; if (SAFE.onChange) SAFE.onChange();
      } catch (e) { d.querySelector('#sosmsg').textContent = e.message; d.querySelector('#sosmsg').className = 'note bad'; d.querySelector('#sosgo').disabled = false; }
    };
  }
  async function imSafe() { try { await post('/api/safety/cancel-alert'); if (SAFE.onChange) SAFE.onChange(); } catch (e) { alert(e.message); } }
  const fab = on => { let b = document.getElementById('sosfab'); if (!b && on) { b = document.createElement('button'); b.id = 'sosfab'; b.className = 'sosfab'; b.textContent = 'SOS'; b.setAttribute('aria-label', 'Emergency SOS'); b.onclick = sos; document.body.appendChild(b); } if (b) b.hidden = !on; };

  // ---- share live trip (riders) ----
  async function share() {
    try {
      const r = await post('/api/safety/share', {});
      const d = modal(`<h2>Share your live trip</h2><p>Anyone with this link can see your driver, vehicle and where the car is, until the ride ends. They don't need an account.</p>
        <input id="slink" readonly value="${esc(r.url)}" aria-label="Trip link"><div class="drow"><button id="scopy">Copy link</button><button id="ssend">Send to my emergency contacts</button><button id="sclose" class="ghost">Close</button></div><p id="shmsg" class="note" role="status"></p>`);
      const msg = (t, c) => { d.querySelector('#shmsg').textContent = t; d.querySelector('#shmsg').className = 'note ' + (c || ''); };
      d.querySelector('#sclose').onclick = close; d.querySelector('#slink').onclick = e => e.target.select();
      d.querySelector('#scopy').onclick = async () => { try { await navigator.clipboard.writeText(r.url); msg('Link copied ✓', 'ok'); } catch (e) { d.querySelector('#slink').select(); msg('Press Ctrl+C to copy'); } };
      d.querySelector('#ssend').onclick = async () => { try { const x = await post('/api/safety/share', { sendToContacts: true }); msg(x.live ? `SMS sent to ${x.sent} contact${x.sent === 1 ? '' : 's'} ✓` : 'Demo mode: no SMS was sent. Use Copy link and send it yourself.', x.live ? 'ok' : 'bad'); } catch (e) { msg(e.message, 'bad'); } };
      if (SAFE.onChange) SAFE.onChange();
    } catch (e) { alert(e.message); }
  }

  // ---- report a ride (about: 'driver' | 'co-rider' for riders; drivers report the rider) ----
  function report(requestId, role) {
    const d = modal(`<h2>Report a problem</h2><label for="rr">What went wrong?</label><select id="rr">${REASONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
      ${role === 'rider' ? `<label for="ra">About</label><select id="ra"><option value="driver">The driver</option><option value="co-rider">Another rider in the car</option></select>` : ''}
      <label for="rd">Details (optional)</label><textarea id="rd" rows="3" maxlength="500"></textarea>
      <label class="chk"><input type="checkbox" id="rb" checked> Don't match me with this person again</label>
      <div class="drow"><button id="rgo">Send report</button><button id="rno" class="ghost">Cancel</button></div><p id="rmsg" class="note"></p>`);
    d.querySelector('#rno').onclick = close;
    d.querySelector('#rgo').onclick = async () => {
      try { await post('/api/safety/report', { requestId, reason: d.querySelector('#rr').value, about: role === 'rider' ? d.querySelector('#ra').value : undefined, details: d.querySelector('#rd').value, block: d.querySelector('#rb').checked });
        d.innerHTML = `<h2 class="ok">Thank you</h2><p>Your report was sent to the PoolPune safety team.</p><button id="rx">Close</button>`; d.querySelector('#rx').onclick = close; }
      catch (e) { d.querySelector('#rmsg').textContent = e.message; d.querySelector('#rmsg').className = 'note bad'; }
    };
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-report]'); if (b) report(+b.dataset.report, b.dataset.role); });
  return { panel, sos, imSafe, fab, share, report, clock, onChange: null };
})();
