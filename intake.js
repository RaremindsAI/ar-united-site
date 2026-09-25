/* A&R United Construction — lead intake (Vercel Serverless Function)
 *
 * PLACE THIS FILE AT:  /api/intake.js   in your Vercel project (same repo as the site).
 * Its public URL is then  https://<your-domain>/api/intake  — same origin as the site,
 * so assets/intake.js is already set to POST to "/api/intake".
 *
 * WHAT IT DOES for every form (Contact, homepage, estimator):
 *   1) forwards the form data to the lead webhook (which creates the ClickUp task)
 *   2) emails the lead to your team (office@arunitedconstruction.com)
 *   3) for the estimator, computes a ballpark and emails it to the customer.
 *
 * SETUP — Vercel -> Project -> Settings -> Environment Variables, add:
 *     RESEND_API_KEY   Resend API key from resend.com  (free tier)                    [required for email]
 *   Optional overrides (defaults baked in below):
 *     LEAD_WEBHOOK_URL, NOTIFY_EMAIL, FROM_EMAIL
 *   Then redeploy. No npm packages needed — this uses plain fetch.
 *
 * EMAIL: uses Resend. In Resend, verify your sending domain and use a FROM_EMAIL on it
 * (e.g. office@arunitedconstruction.com). Prefer SendGrid/Postmark/SMTP? Swap sendEmail().
 */

const DEFAULTS = {
  LEAD_WEBHOOK_URL: 'https://rareminds-webhooks.vercel.app/api/ar-lead',
  NOTIFY_EMAIL: 'office@arunitedconstruction.com',
  FROM_EMAIL: 'office@arunitedconstruction.com',
  SITE_URL: 'https://www.arunitedconstruction.com'
};

// ClickUp "Bid Requests" list custom field IDs (list 901114146582)
const CF = {
  email: 'c374365e-a1b8-4033-a72a-891f953a1afc',
  phone: '424ef137-5201-4969-a961-12ec23c25efb',
  address: 'a536a73d-a75b-4498-8a46-38cffef83b90',
  sheet: '0191f2fe-9cc4-4724-84a6-9e2f162e66fb',
  type: 'f3c9023b-d51c-4f6b-8a2d-635f40331e4d'
};
const TYPE_LABELS = {
  roofing: 'bc516851-9a6b-40cf-950c-a5b3779b9d69', siding: '6edcb544-6a66-4169-97ff-a288b614497a',
  gutter: 'd502d29e-7452-46f5-83df-d72ff5923a53', repair: 'b8c6905c-343c-415a-95fd-a66d2d6f3286',
  replacement: '7bef234f-0f66-439b-9ed9-1341b1322de2', planning: 'caf11f9d-bb01-4d04-9113-4bad15d94d9b',
  repairReplace: 'f90309b4-f5ae-4369-ae6d-3652b6bafe39'
};
function clickupFields(d, sheetUrl) {
  const out = [];
  if (d.email) out.push({ id: CF.email, value: d.email });
  const digits = String(d.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length === 10) out.push({ id: CF.phone, value: '+1 ' + digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6) });
  if (d.address && typeof d.lat === 'number' && typeof d.lng === 'number') out.push({ id: CF.address, value: { location: { lat: d.lat, lng: d.lng }, formatted_address: d.address } });
  if (sheetUrl) out.push({ id: CF.sheet, value: sheetUrl });
  const sv = String(d.service || '').toLowerCase(), sc = String(d.scope || '').toLowerCase(), nd = String(d.projectNeeds || '').toLowerCase();
  const labels = [];
  if (/roof/.test(sv)) labels.push(TYPE_LABELS.roofing);
  if (/siding/.test(sv)) labels.push(TYPE_LABELS.siding);
  if (/gutter/.test(sv)) labels.push(TYPE_LABELS.gutter);
  const rep = /repair/.test(sc), repl = /replace|tear-off|layover|install/.test(sc);
  if (/repair \+ replace/.test(sc) || (rep && repl)) labels.push(TYPE_LABELS.repairReplace);
  else if (rep) labels.push(TYPE_LABELS.repair);
  else if (repl) labels.push(TYPE_LABELS.replacement);
  if (/planning/.test(nd)) labels.push(TYPE_LABELS.planning);
  if (labels.length) out.push({ id: CF.type, value: labels });
  return out;
}


// ballpark pricing model (server-side only; never exposed on the site)
function ballpark(roof) {
  const area = Number(roof.areaSqft) || 0;
  if (!area) return null;
  const coat = roof.coating === 'acrylic' ? { lo: 1.2, hi: 2.15 } : { lo: 1.55, hi: 2.65 };
  let lo = coat.lo, hi = coat.hi;
  if (roof.system === 'Metal') { lo += 0.3; hi += 0.5; }
  if (roof.system === 'BUR') { lo += 0.15; hi += 0.3; }
  const cond = { good: 1.0, weathered: 1.12, leaking: 1.3 }[roof.condition] || 1;
  if (/major/i.test(roof.leaks || '')) { lo += 0.1; hi += 0.15; }
  if (/heavy/i.test(roof.rust || '')) { lo += 0.15; hi += 0.25; }
  else if (/surface/i.test(roof.rust || '')) { lo += 0.05; hi += 0.1; }
  const acc = { single: 1.0, mid: 1.05, high: 1.12 }[roof.access] || 1;
  const units = Number(roof.units) || 0;
  const r = (n) => Math.round(n / 100) * 100;
  let low = r(area * lo * cond * acc + units * 35);
  let high = r(area * hi * cond * acc + units * 70);
  if (high <= low) high = low + 100;
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  return { low, high, text: money(low) + ' \u2013 ' + money(high) };
}

async function sendEmail(apiKey, from, to, subject, text, replyTo, attachments) {
  if (!apiKey) return 'no-key';
  const body = { from: 'A&R United Construction <' + from + '>', to: to.split(',').map((e) => e.trim()), subject, text };
  if (replyTo) body.reply_to = replyTo;
  if (attachments && attachments.length) body.attachments = attachments;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.status;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let d = {};
  try { d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
  // normalize text: collapse repeated spaces, trim (keeps line breaks in free-text details)
  for (const k of Object.keys(d)) {
    if (typeof d[k] !== 'string') continue;
    d[k] = k === 'details' ? d[k].replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim() : d[k].replace(/\s+/g, ' ').trim();
  }
  if (typeof d.email === 'string') d.email = d.email.replace(/ /g, '').toLowerCase();
  d.smsConsent = !!d.smsConsent;
  const photoList = (Array.isArray(d.photos) ? d.photos : (d.photo ? [d.photo] : [])).filter(p => p && p.content).slice(0, 4);
  d.smsConsentText = d.smsConsent ? 'Yes \u2014 opted in to SMS texts' : 'No \u2014 did not opt in to SMS texts';

  const cfg = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    LEAD_WEBHOOK_URL: process.env.LEAD_WEBHOOK_URL || DEFAULTS.LEAD_WEBHOOK_URL,
    NOTIFY_EMAIL: process.env.NOTIFY_EMAIL || DEFAULTS.NOTIFY_EMAIL,
    FROM_EMAIL: process.env.FROM_EMAIL || DEFAULTS.FROM_EMAIL,
    SITE_URL: process.env.SITE_URL || DEFAULTS.SITE_URL
  };

  const roof = d.roof || {};
  const bp = roof.areaSqft ? ballpark(roof) : null;
  let sheetUrl = '';
  const row = (k, v) => (v || v === 0) ? `${k}: ${v}\n` : '';
  const title = `[Bid] ${d.name || d.company || 'New lead'}${d.service ? ' \u2014 ' + d.service : ''}`;
  const details =
    row('Source', d.source) + row('Name', d.name) + row('Company', d.company) +
    row('Email', d.email) + row('Phone', d.phone) + row('Address', d.address) +
    row('Client type', d.clientType) + row('Business/LLC', d.business) + row('Property type', d.propertyType) + row('Occupancy', d.occupancy) + row('Property owner', d.ownerName) + row('Service', d.service) +
    row('Scope of work', d.scope) + row('Project needs', d.projectNeeds) +
    row('Preferences', d.preferences) + row('Timeline', d.timeline) +
    row('Preferred estimate day', d.preferredDay) + row('Alternate day', d.altDay) +
    row('Arrival window', d.arrival) + row('Heard about us via', d.heardFrom) +
    row('Photos attached', photoList.length ? photoList.length + ' (' + photoList.map(p => p.name).join(', ') + ')' : '') +
    row('Roof area (sq ft)', roof.areaSqft) + row('Roof system', roof.system) +
    row('Condition', roof.condition) + row('Coating', roof.coating) +
    row('Access', roof.access) +
    row('Coated before', roof.coatedBefore) + row('Active leaks', roof.leaks) +
    row('Rust', roof.rust) + row('Main goals', roof.goals) +
    row('Rooftop units / penetrations', roof.units) + row('Measured by', roof.method) +
    (bp ? row('Ballpark', bp.text) : '') +
    row('SMS consent', d.smsConsentText) + row('Details', d.details) + row('Submitted', d.submittedAt);

  const result = { webhook: 'skipped', teamEmail: 'skipped', customerEmail: 'skipped' };

  // 1) Forward form data to the lead webhook (handles ClickUp)
  if (cfg.LEAD_WEBHOOK_URL) {
    try {
      const r = await fetch(cfg.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, photos: undefined, photo: undefined, title, summary: details, ballpark: bp ? bp.text : undefined, custom_fields: clickupFields(d) })
      });
      result.webhook = r.status;
      try { const j = await r.json(); if (j && j.sheetUrl) sheetUrl = j.sheetUrl; if (j && j.taskId) result.taskId = j.taskId; } catch (e) {}
    } catch (e) { result.webhook = 'error:' + e; }
  }

  // 2) Team notification email (with customer photo attached, if provided)
  try {
    const atts = photoList.length ? photoList.map((p, i) => ({ filename: p.name || ('photo-' + (i + 1) + '.jpg'), content: p.content })) : null;
    result.teamEmail = await sendEmail(cfg.RESEND_API_KEY, cfg.FROM_EMAIL, cfg.NOTIFY_EMAIL, title, (sheetUrl ? 'Open measurement sheet: ' + sheetUrl + '\n\n' : '') + details, d.email || null, atts);
  } catch (e) { result.teamEmail = 'error:' + e; }

  // 3) Customer ballpark email (estimator only, when we have a price + their email)
  if (bp && d.email) {
    const name = (d.name || '').trim().split(' ')[0] || 'there';
    const area = Number(roof.areaSqft).toLocaleString('en-US');
    const msg =
      `Hi ${name},\n\n` +
      `Thanks for using our commercial roof coating estimator. Based on your roughly ${area} sq ft ` +
      `${roof.coating === 'acrylic' ? 'acrylic' : 'silicone'} coating project, your preliminary ballpark is:\n\n` +
      `    ${bp.text}\n\n` +
      `This is an estimate only, meant to give you a range to plan around. For an exact, itemized quote, ` +
      `schedule a free onsite assessment and we'll verify the roof, prep needs, and details.\n\n` +
      `Call or text (270) 844-3355 or just reply to this email and we'll get you on the schedule.\n\n` +
      `A&R United Construction\nCommercial Roof Coatings & Restoration`;
    try {
      result.customerEmail = await sendEmail(cfg.RESEND_API_KEY, cfg.FROM_EMAIL, d.email, 'Your commercial roof coating ballpark', msg, cfg.NOTIFY_EMAIL);
    } catch (e) { result.customerEmail = 'error:' + e; }
  }

  return res.status(200).json({ ok: true, ...result });
}
