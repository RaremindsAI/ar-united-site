/* A&R United Construction — lead intake (Vercel Serverless Function)
 *
 * PLACE THIS FILE AT:  /api/intake.js   in your Vercel project (same repo as the site).
 * Its public URL is then  https://<your-domain>/api/intake  — same origin as the site,
 * so assets/intake.js is already set to POST to "/api/intake".
 *
 * WHAT IT DOES for every form (Contact, homepage, estimator):
 *   1) creates a task in ClickUp  (CRM space -> Bids list)
 *   2) emails the lead to your team (office@arunitedconstruction.com)
 *   3) for the estimator, computes a ballpark and emails it to the customer.
 *
 * SETUP — Vercel -> Project -> Settings -> Environment Variables, add:
 *     CLICKUP_TOKEN    ClickUp API token  (ClickUp -> Settings -> Apps -> Generate)   [required]
 *     RESEND_API_KEY   Resend API key from resend.com  (free tier)                    [required for email]
 *   Optional overrides (defaults baked in below):
 *     CLICKUP_LIST_ID, NOTIFY_EMAIL, FROM_EMAIL
 *   Then redeploy. No npm packages needed — this uses plain fetch.
 *
 * EMAIL: uses Resend. In Resend, verify your sending domain and use a FROM_EMAIL on it
 * (e.g. office@arunitedconstruction.com). Prefer SendGrid/Postmark/SMTP? Swap sendEmail().
 */

const DEFAULTS = {
  CLICKUP_LIST_ID: '901114146582',                 // CRM > Bids
  NOTIFY_EMAIL: 'office@arunitedconstruction.com',
  FROM_EMAIL: 'office@arunitedconstruction.com'
};

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
  const warr = { '10': 1.0, '15': 1.15, '20': 1.32 }[String(roof.warranty)] || 1;
  const acc = { single: 1.0, mid: 1.05, high: 1.12 }[roof.access] || 1;
  const units = Number(roof.units) || 0;
  const r = (n) => Math.round(n / 100) * 100;
  let low = r(area * lo * cond * warr * acc + units * 35);
  let high = r(area * hi * cond * warr * acc + units * 70);
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

  const cfg = {
    CLICKUP_TOKEN: process.env.CLICKUP_TOKEN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CLICKUP_LIST_ID: process.env.CLICKUP_LIST_ID || DEFAULTS.CLICKUP_LIST_ID,
    NOTIFY_EMAIL: process.env.NOTIFY_EMAIL || DEFAULTS.NOTIFY_EMAIL,
    FROM_EMAIL: process.env.FROM_EMAIL || DEFAULTS.FROM_EMAIL
  };

  const roof = d.roof || {};
  const bp = roof.areaSqft ? ballpark(roof) : null;
  const row = (k, v) => (v || v === 0) ? `${k}: ${v}\n` : '';
  const title = `[Bid] ${d.name || d.company || 'New lead'}${d.service ? ' \u2014 ' + d.service : ''}`;
  const details =
    row('Source', d.source) + row('Name', d.name) + row('Company', d.company) +
    row('Email', d.email) + row('Phone', d.phone) + row('Address', d.address) +
    row('Client type', d.clientType) + row('Business/LLC', d.business) + row('Service', d.service) +
    row('Scope of work', d.scope) + row('Project needs', d.projectNeeds) +
    row('Preferences', d.preferences) + row('Timeline', d.timeline) +
    row('Preferred estimate day', d.preferredDay) + row('Alternate day', d.altDay) +
    row('Arrival window', d.arrival) + row('Heard about us via', d.heardFrom) +
    row('Photo attached', d.photo && d.photo.content ? d.photo.name || 'yes' : '') +
    row('Roof area (sq ft)', roof.areaSqft) + row('Roof system', roof.system) +
    row('Condition', roof.condition) + row('Coating', roof.coating) +
    row('Warranty (yr)', roof.warranty) + row('Access', roof.access) +
    row('Coated before', roof.coatedBefore) + row('Active leaks', roof.leaks) +
    row('Rust', roof.rust) + row('Main goals', roof.goals) +
    row('Rooftop units / penetrations', roof.units) + row('Measured by', roof.method) +
    (bp ? row('Ballpark', bp.text) : '') +
    row('SMS consent', d.smsConsent) + row('Details', d.details) + row('Submitted', d.submittedAt);

  const result = { clickup: 'skipped', teamEmail: 'skipped', customerEmail: 'skipped' };

  // 1) ClickUp task in CRM > Bids
  if (cfg.CLICKUP_TOKEN && cfg.CLICKUP_LIST_ID) {
    try {
      const r = await fetch(`https://api.clickup.com/api/v2/list/${cfg.CLICKUP_LIST_ID}/task`, {
        method: 'POST',
        headers: { 'Authorization': cfg.CLICKUP_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: title, markdown_description: details.replace(/\n/g, '  \n') })
      });
      result.clickup = r.status;
    } catch (e) { result.clickup = 'error:' + e; }
  }

  // 2) Team notification email (with customer photo attached, if provided)
  try {
    const atts = (d.photo && d.photo.content) ? [{ filename: d.photo.name || 'photo.jpg', content: d.photo.content }] : null;
    result.teamEmail = await sendEmail(cfg.RESEND_API_KEY, cfg.FROM_EMAIL, cfg.NOTIFY_EMAIL, title, details, d.email || null, atts);
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
