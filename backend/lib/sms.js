// Sends real SMS with no npm packages (Node 18+ fetch). Pick ONE provider with environment variables (see README):
//   Twilio    : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM (your Twilio number) or TWILIO_MESSAGING_SERVICE_SID
//   Fast2SMS  : FAST2SMS_API_KEY          (Indian provider, "quick SMS" route)
//   Webhook   : SMS_WEBHOOK_URL           (we POST {"to":"+91...","text":"..."} to your own service)
// With none of these set the app runs in DEMO mode: the message is only printed in the server console.
// send() never throws. It always resolves to { status: 'sent' | 'failed' | 'demo', provider, error? }.
const E = process.env;
const provider = () =>
  E.TWILIO_ACCOUNT_SID && E.TWILIO_AUTH_TOKEN && (E.TWILIO_FROM || E.TWILIO_MESSAGING_SERVICE_SID) ? 'twilio'
  : E.FAST2SMS_API_KEY ? 'fast2sms'
  : E.SMS_WEBHOOK_URL ? 'webhook' : null;
const live = () => provider() !== null;
const TIMEOUT = 10000;

async function viaTwilio(to, text) {
  const body = new URLSearchParams({ To: '+91' + to, Body: text });
  if (E.TWILIO_MESSAGING_SERVICE_SID) body.set('MessagingServiceSid', E.TWILIO_MESSAGING_SERVICE_SID); else body.set('From', E.TWILIO_FROM);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${E.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT),
    headers: { Authorization: 'Basic ' + Buffer.from(`${E.TWILIO_ACCOUNT_SID}:${E.TWILIO_AUTH_TOKEN}`).toString('base64') } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Twilio HTTP ${r.status}`);
}
async function viaFast2sms(to, text) {
  const r = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
    headers: { authorization: E.FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'q', message: text, numbers: to, flash: 0 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.return === false) throw new Error((Array.isArray(j.message) ? j.message.join(' ') : j.message) || `Fast2SMS HTTP ${r.status}`);
}
async function viaWebhook(to, text) {
  const r = await fetch(E.SMS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: '+91' + to, text }), signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`Webhook HTTP ${r.status}`);
}

async function send(phone10, text) {
  const p = provider();
  if (!p) { console.log(`[SMS demo → +91${phone10}] ${text}`); return { status: 'demo', provider: null }; }
  try {
    await (p === 'twilio' ? viaTwilio : p === 'fast2sms' ? viaFast2sms : viaWebhook)(phone10, text);
    return { status: 'sent', provider: p };
  } catch (e) {
    console.error(`[SMS ${p} failed → +91${phone10}] ${e.message}`);
    return { status: 'failed', provider: p, error: String(e.message).slice(0, 160) };
  }
}
module.exports = { send, live, provider };
