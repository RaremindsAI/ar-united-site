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
 *     LEAD_KEY_AR      shared secret; must match LEAD_KEY_AR in rareminds-webhooks    [security]
 *   Optional overrides (defaults baked in below):
 *     LEAD_WEBHOOK_URL, NOTIFY_EMAIL, FROM_EMAIL
 *     EXTRA_ORIGINS    comma list of extra allowed origins (e.g. a Vercel preview URL)
 *   Then redeploy. No npm packages needed — this uses plain fetch.
 *
 * EMAIL: uses Resend. In Resend, verify your sending domain and use a FROM_EMAIL on it
 * (e.g. office@arunitedconstruction.com). Prefer SendGrid/Postmark/SMTP? Swap sendEmail().
 */

import { signToken, ballparkEmailHtml, ballparkEmailText } from './_ballpark.js';

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


// Spam screen: scores contractor-scam patterns (email-only contact, "send plans via Google Drive",
// out-of-area phone/state). Score >= SPAM_THRESHOLD: no ClickUp task, no Airtable, no customer email;
// office still gets the email with a "[Possible spam]" subject so nothing is lost.
const SPAM_THRESHOLD = 5;
const LOCAL_AREA_CODES = new Set(['270','364','502','606','859','812','930','317','463','765','574','219','260','618','217','309','447','730','731','615','629','931','423']);
const LOCAL_STATES = /\b(KY|IN|IL|TN|kentucky|indiana|illinois|tennessee)\b/i;
function spamCheck(d) {
  const reasons = [];
  let score = 0;
  const add = (n, why) => { score += n; reasons.push(why + ' (+' + n + ')'); };
  const text = [d.details, d.message, d.notes].filter(Boolean).join(' ').toLowerCase();
  const strong = [
    [/google ?drive|dropbox|wetransfer/, 'offers files via Google Drive/Dropbox'],
    [/(building|house|project|the) plans|blueprints?|drawings/, 'offers to send plans/drawings'],
    [/financing (is )?(secured|approved|in place)|funds? (is |are )?(available|ready)/, 'says financing is secured'],
    [/(contact|reach|respond|reply)[^.]{0,25}(through|via|by) (e-?mail|mail) only|e-?mail only|text only/, 'asks for email-only contact'],
  ];
  const weak = [
    [/reach me (via|by|through) e-?mail|contact me (via|by|through) e-?mail|prefer e-?mail/, 'prefers email over phone'],
    [/i was referred to your company|awaiting (a|your) (quick|prompt|urgent)|quick respond/, 'scam boilerplate wording'],
    [/custom project|new residential .* project|qualified contractor/, 'vague project wording'],
  ];
  for (const [re, why] of strong) if (re.test(text)) add(3, why);
  for (const [re, why] of weak) if (re.test(text)) add(2, why);
  const digits = String(d.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length === 10 && !LOCAL_AREA_CODES.has(digits.slice(0, 3))) add(2, 'out-of-area phone (' + digits.slice(0, 3) + ')');
  const addr = String(d.address || '');
  const st = addr.match(/,\s*([A-Z]{2})\s*\d{5}/);
  if (st && !LOCAL_STATES.test(st[1])) add(3, 'property outside service area (' + st[1] + ')');
  else if (addr && !/\d{5}/.test(addr) && !LOCAL_STATES.test(addr)) add(1, 'address has no city/state/ZIP');
  if (/^[a-z]+\d{3,}@gmail\.com$/.test(String(d.email || ''))) add(1, 'gmail name+digits');
  const svcCount = String(d.service || '').split(',').filter(x => x.trim()).length;
  if (svcCount >= 3 && /new|first-time/i.test(d.scope || '')) add(1, '3+ unrelated services as new install');
  return { score, reasons, spam: score >= SPAM_THRESHOLD };
}

// ballpark pricing model (server-side only; never exposed on the site)
function ballpark(roof) {
  const area = Number(roof.areaSqft) || 0;
  if (!area) return null;
  // Calibrated to A & R jobs (Oct 2026). Same price for all roof types.
  const acrylic = roof.coating === 'acrylic';
  const material = area * (acrylic ? 0.66 : 1.83);
  // labor gets cheaper per sq ft as roofs get bigger: $3.57/sf up to 5k, $25,000 at 10k, $33,120 at 24k
  let labor;
  if (area <= 5000) labor = area * 3.57;
  else if (area <= 10000) labor = 17850 + (area - 5000) * 1.43;
  else if (area <= 24000) labor = 25000 + (area - 10000) * 0.58;
  else labor = 33120 + (area - 24000) * 0.58;
  let price = material + labor;
  // active leaks on elastomeric jobs: silicone under the elastomeric on leak areas
  const lk = String(roof.leaks || '');
  if (acrylic) {
    if (/major|multiple/i.test(lk)) price += area * 0.25 * 1.17;
    else if (/minor|few/i.test(lk)) price += area * 0.10 * 1.17;
  }
  const rust = String(roof.rust || '');
  if (/heavy/i.test(rust)) price += area * 0.25;
  else if (/surface|some/i.test(rust)) price += area * 0.10;
  // rooftop units / penetrations: a few are included; more need extra flashing with butter
  const units = Number(roof.units) || 0;
  if (units > 10) price *= 1.10;
  else if (units > 3) price *= 1.05;
  price *= { single: 1.0, mid: 1.05, high: 1.12 }[roof.access] || 1;
  const r = (n) => Math.round(n / 100) * 100;
  let low = r(price * 0.92);
  let high = r(price * 1.10);
  if (high <= low) high = low + 100;
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  return { low, high, text: money(low) + ' \u2013 ' + money(high) };
}

async function sendEmail(apiKey, from, to, subject, text, replyTo, attachments, html) {
  if (!apiKey) return 'no-key';
  const body = { from: 'A & R United Construction LLC <' + from + '>', to: to.split(',').map((e) => e.trim()), subject, text };
  if (html) body.html = html;
  if (replyTo) body.reply_to = replyTo;
  if (attachments && attachments.length) body.attachments = attachments;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.status;
}

// Security: only accept posts from our own site, and reject empty/invalid/oversized submissions.
const ALLOWED_ORIGINS = ['https://www.arunitedconstruction.com', 'https://arunitedconstruction.com'];
function allowedOrigins() {
  return ALLOWED_ORIGINS.concat(String(process.env.EXTRA_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean));
}
function originOk(req) {
  const list = allowedOrigins();
  const o = String(req.headers.origin || '').replace(/\/$/, '');
  if (o) return list.includes(o);
  const ref = String(req.headers.referer || '');
  return list.some(a => ref === a || ref.startsWith(a + '/'));
}
const MAX_LEN = { details: 5000, notes: 5000, message: 5000, address: 300 };
function validate(d) {
  if (d.website || d.hp) return 'bot';
  for (const k of Object.keys(d)) {
    if (typeof d[k] === 'string' && d[k].length > (MAX_LEN[k] || 500)) return 'One of the fields is too long.';
  }
  const name = String(d.name || d.company || '').trim();
  if (name.length < 2 || !/[a-z]/i.test(name)) return 'Please enter your name.';
  if (/https?:\/\/|www\./i.test(name)) return 'Please enter your name.';
  const digits = String(d.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const email = String(d.email || '');
  const emailOk = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);
  if (email && !emailOk) return 'Please check your email address.';
  if (d.phone && digits.length !== 10) return 'Please check your phone number.';
  if (digits.length !== 10 && !emailOk) return 'Please enter a phone number or email so we can reach you.';
  if (!/estimator/i.test(d.source || '')) {
    const a = String(d.address || '');
    if (!a) return 'Please enter the property or service address.';
  }
  const photos = Array.isArray(d.photos) ? d.photos : (d.photo ? [d.photo] : []);
  if (photos.length > 4) return 'Please attach up to 4 photos.';
  return '';
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (origin && allowedOrigins().includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!originOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });

  let d = {};
  try { d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { return res.status(400).json({ ok: false, error: 'bad request' }); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return res.status(400).json({ ok: false, error: 'bad request' });
  // normalize text: collapse repeated spaces, trim (keeps line breaks in free-text details)
  for (const k of Object.keys(d)) {
    if (typeof d[k] !== 'string') continue;
    d[k] = k === 'details' ? d[k].replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim() : d[k].replace(/\s+/g, ' ').trim();
  }
  if (typeof d.email === 'string') d.email = d.email.replace(/ /g, '').toLowerCase();
  const invalid = validate(d);
  if (invalid === 'bot') return res.status(200).json({ ok: true });
  if (invalid) return res.status(400).json({ ok: false, error: invalid });
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
  const sc = spamCheck(d);
  // Service area is KY/IN only. Out-of-area addresses get the same quiet treatment as spam (office email only),
  // and the visitor sees the normal thank-you, so the form never reveals which states pass.
  const addrTxt = String(d.address || '');
  const inArea = /\bky\b|kentucky|indiana/i.test(addrTxt) || /\bIN\b/.test(addrTxt) || /\bin\s+4[67]\d{3}\b/i.test(addrTxt);
  if (!inArea && !/estimator/i.test(d.source || '')) { sc.spam = true; sc.reasons.unshift('address outside service area (KY/IN only)'); }
  result.spamScore = sc.score;
  if (sc.spam && !/estimator/i.test(d.source || '')) {
    const note = 'POSSIBLE SPAM (score ' + sc.score + '). Not sent to ClickUp or Airtable.\n' + sc.reasons.map(r => '- ' + r).join('\n') +
      '\nIf this is a real customer, add them manually.\n\n';
    try { result.teamEmail = await sendEmail(cfg.RESEND_API_KEY, cfg.FROM_EMAIL, cfg.NOTIFY_EMAIL, '[Possible spam] ' + title, note + details, null); } catch (e) { result.teamEmail = 'error:' + e; }
    return res.status(200).json({ ok: true, ...result });
  }

  // 1) Forward form data to the lead webhook (handles ClickUp)
  if (cfg.LEAD_WEBHOOK_URL) {
    try {
      const r = await fetch(cfg.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lead-key': process.env.LEAD_KEY_AR || '' },
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
    const tok = signToken({ task: result.taskId || '', name: (d.name || d.company || '').trim(), first: name, email: d.email, phone: d.phone || '', address: d.address || '', range: bp.text, area });
    const v = {
      first: name, range: bp.text, area, coating: roof.coating, system: roof.system || '', leaks: roof.leaks || '',
      units: roof.units === 0 || roof.units ? String(roof.units) : '', address: d.address || '',
      scheduleUrl: tok ? cfg.SITE_URL + '/api/schedule?t=' + tok : cfg.SITE_URL + '/contact#quote-form'
    };
    try {
      result.customerEmail = await sendEmail(cfg.RESEND_API_KEY, cfg.FROM_EMAIL, d.email, 'Your commercial roof coating ballpark', ballparkEmailText(v), cfg.NOTIFY_EMAIL, null, ballparkEmailHtml(v));
    } catch (e) { result.customerEmail = 'error:' + e; }
    // Record the ballpark on the ClickUp task as a comment
    if (result.taskId && cfg.LEAD_WEBHOOK_URL) {
      const sent = result.customerEmail === 200;
      const extras = [roof.leaks && 'Active leaks: ' + roof.leaks, roof.rust && 'Rust: ' + roof.rust, (roof.units || roof.units === 0) && 'Units / penetrations: ' + roof.units, roof.access && 'Access: ' + roof.access].filter(Boolean);
      const text = 'BALLPARK ESTIMATE ' + (sent ? 'EMAILED TO CLIENT' : '(email to client did not send, follow up manually)') + '\n' +
        'Price range: ' + bp.text + '\n' +
        'Roof: ' + area + ' sq ft, ' + (roof.system || 'roof type not given') + '\n' +
        'Coating: ' + (roof.coating === 'acrylic' ? 'Elastomeric' : '100% silicone') + '\n' +
        (extras.length ? extras.join('\n') + '\n' : '') +
        'Sent to: ' + d.email + '\n' +
        'Sent: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT';
      try {
        await fetch(cfg.LEAD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lead-key': process.env.LEAD_KEY_AR || '' }, body: JSON.stringify({ action: 'ballpark_comment', taskId: result.taskId, text }) });
        result.ballparkComment = 'sent';
      } catch (e) { result.ballparkComment = 'error:' + e; }
    }
  } else if (d.email && /estimator/i.test(d.source || '')) {
    // Estimator submitted without a measured area: still confirm receipt to the customer
    const name = (d.name || '').trim().split(' ')[0] || 'there';
    const msg =
      `Hi ${name},\n\n` +
      `Thanks for using our commercial roof coating estimator. We received your request` +
      `${d.address ? ' for ' + d.address : ''} and our team will follow up with your ballpark shortly.\n\n` +
      `Need it sooner? Call or text (270) 844-3355 or just reply to this email.\n\n` +
      `A & R United Construction LLC\nCommercial Roof Coatings & Restoration`;
    try {
      result.customerEmail = await sendEmail(cfg.RESEND_API_KEY, cfg.FROM_EMAIL, d.email, 'We received your roof coating estimate request', msg, cfg.NOTIFY_EMAIL);
    } catch (e) { result.customerEmail = 'error:' + e; }
  }

  return res.status(200).json({ ok: true, ...result });
}
