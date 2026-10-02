/* "Schedule my assessment" link from the ballpark email.
 * GET  /api/schedule?t=TOKEN  -> landing page; it sends the request with a POST on load
 *      (email link scanners only GET, so they never trigger a fake request)
 * POST /api/schedule {t}       -> pings ClickUp (comment + tag on the lead task), emails the office,
 *                                 emails the customer a confirmation. Repeat clicks are ignored.
 * Uses the same env vars as /api/intake (LEAD_KEY_AR, RESEND_API_KEY, FROM_EMAIL, NOTIFY_EMAIL).
 */
import { readToken, schedulePage, scheduleConfirmText } from './_ballpark.js';

const WEBHOOK = process.env.LEAD_WEBHOOK_URL || 'https://rareminds-webhooks.vercel.app/api/ar-lead';
const NOTIFY = process.env.NOTIFY_EMAIL || 'office@arunitedconstruction.com';
const FROM = process.env.FROM_EMAIL || 'office@arunitedconstruction.com';

async function sendEmail(to, subject, text, replyTo) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return 'skipped';
  const body = { from: 'A & R United Construction LLC <' + FROM + '>', to: to.split(',').map((e) => e.trim()), subject, text };
  if (replyTo) body.reply_to = replyTo;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.status;
}

function page(res, html, status) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status || 200).send(html);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const t = String(req.query.t || '');
    const v = readToken(t);
    return page(res, schedulePage(v, v ? 'confirm' : 'invalid', t), v ? 200 : 410);
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  let d = req.body || {};
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = Object.fromEntries(new URLSearchParams(d)); } }
  const isForm = !/json/i.test(req.headers['content-type'] || '');
  const v = readToken(d.t);
  if (!v) return isForm ? page(res, schedulePage(null, 'invalid'), 410) : res.status(410).json({ ok: false, error: 'expired' });

  let already = false;
  if (v.task) {
    try {
      const r = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lead-key': process.env.LEAD_KEY_AR || '' },
        body: JSON.stringify({ action: 'schedule_request', taskId: v.task, name: v.name, phone: v.phone, email: v.email, address: v.address, ballpark: v.range, area: v.area })
      });
      const j = await r.json().catch(() => ({}));
      already = !!j.already;
    } catch (e) { console.error('webhook', e); }
  }

  if (!already) {
    const line = (k, x) => (x ? k + ': ' + x + '\n' : '');
    const text = 'The client clicked "Schedule my assessment" in their ballpark email. Call or text them to set the onsite visit.\n\n' +
      line('Name', v.name) + line('Phone', v.phone) + line('Email', v.email) + line('Address', v.address) +
      line('Roof area', v.area ? v.area + ' sq ft' : '') + line('Ballpark sent', v.range) +
      (v.task ? 'ClickUp task: https://app.clickup.com/t/' + v.task + '\n' : 'No ClickUp task was linked to this estimate.\n') +
      'Clicked: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT';
    try { await sendEmail(NOTIFY, '[Assessment requested] ' + (v.name || 'Estimator client') + (v.address ? ' \u2014 ' + v.address : ''), text, v.email); } catch (e) { console.error(e); }
    try { await sendEmail(v.email, 'We received your roof assessment request', scheduleConfirmText(v), NOTIFY); } catch (e) { console.error(e); }
  }

  if (isForm) return page(res, schedulePage(v, already ? 'already' : 'done'));
  return res.status(200).json({ ok: true, already });
}
