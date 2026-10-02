// Shared helpers for the ballpark email + "Schedule my assessment" link.
// Files starting with "_" in /api are not public endpoints on Vercel.
import crypto from 'node:crypto';

const SITE = 'https://www.arunitedconstruction.com';
const PHONE = '(270) 844-3355';
const TEL = 'tel:+12708443355';
const LEGAL = 'A &amp; R United Construction LLC';

const secret = () => process.env.LEAD_KEY_AR || '';
const sig = (p) => crypto.createHmac('sha256', secret()).update(p).digest('base64url').slice(0, 32);

// Signed link token so only links we emailed can trigger a schedule request (valid 120 days)
export function signToken(obj) {
  if (!secret()) return '';
  const p = Buffer.from(JSON.stringify({ ...obj, ts: Date.now() })).toString('base64url');
  return p + '.' + sig(p);
}
export function readToken(t) {
  const [p, s] = String(t || '').split('.');
  if (!p || !s || !secret()) return null;
  const want = sig(p);
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  try {
    const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (o.ts && Date.now() - o.ts > 120 * 864e5) return null;
    return o;
  } catch (e) { return null; }
}

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// v: { first, range, area, coating ('silicone'|'acrylic'), system, leaks, units, address, scheduleUrl }
export function ballparkEmailHtml(v) {
  const acr = v.coating === 'acrylic';
  const leaky = acr && /minor|few|major|multiple/i.test(v.leaks || '');
  const coatName = acr ? 'Elastomeric coating' : '100% silicone coating';
  const steps = [
    ['Power wash and clean', 'the entire roof surface of dirt, debris and oils, then make sure it is dry before coating.'],
    ['Seal the weak spots', 'with ' + (acr ? 'sealant and butter' : 'silicone butter') + ' around pipes, vents, seams, cracks and other openings.'],
    leaky ? ['Treat the active leaks', 'with silicone coating, then apply elastomeric over the full roof for a seamless, reflective finish.']
          : ['Apply the coating', 'across the full roof for a seamless, reflective, waterproof finish.']
  ];
  const rows = [['Property', v.address], ['Roof area', v.area + ' sq ft'], ['Current roof', v.system], ['Coating system', acr ? 'Elastomeric' : '100% silicone'], ['Active leaks', v.leaks], ['Units &amp; penetrations', v.units]].filter((r) => r[1] && r[1] !== ' sq ft');
  const F = 'font-family:Arial, Helvetica, sans-serif;';
  const rowHtml = rows.map((r, i) => { const b = i < rows.length - 1 ? ' border-bottom:1px solid #eef1f4;' : ''; return '<tr><td width="44%" style="padding:11px 0; color:#6b717a;' + b + '">' + r[0] + '</td><td style="padding:11px 0; color:#15161a; font-weight:bold;' + b + '">' + esc(r[1]) + '</td></tr>'; }).join('');
  const stepHtml = steps.map((s, i) => '<tr><td width="34" valign="top" style="padding:12px 0 0;"><div style="width:24px; height:24px; border-radius:12px; background:#e3f0fa; color:#2f80bd; font-size:12px; font-weight:bold; line-height:24px; text-align:center;">' + (i + 1) + '</div></td><td style="padding:13px 0 0;"><strong style="color:#15161a;">' + s[0] + '</strong> ' + s[1] + '</td></tr>').join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>Your commercial roof coating ballpark</title>
<style>body{margin:0;padding:0;} a{color:#2f80bd;} @media (max-width:620px){.px{padding-left:22px !important;padding-right:22px !important;}.price{font-size:34px !important;line-height:40px !important;}}</style></head>
<body style="margin:0; padding:0; background:#eef1f4;">
<span style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">Your ballpark for ${esc(v.area)} sq ft of ${acr ? 'elastomeric' : 'silicone'} roof coating is ${esc(v.range)}. One click to schedule your free assessment.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f4;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #dde3e8;">
<tr><td class="px" style="padding:26px 40px 22px; border-bottom:3px solid #2f80bd;"><img src="${SITE}/assets/logo-2026.png" width="150" alt="${LEGAL}" style="display:block; width:150px; height:auto; border:0;"></td></tr>
<tr><td class="px" style="padding:34px 40px 8px; ${F}">
<div style="font-size:12px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#2f80bd; mso-line-height-rule:exactly; line-height:18px;">Commercial roof coating ballpark</div>
<h1 style="margin:10px 0 14px; font-size:26px; line-height:32px; mso-line-height-rule:exactly; color:#15161a; font-weight:bold;">Hi ${esc(v.first)}, here is your estimate.</h1>
<p style="margin:0; font-size:16px; line-height:25px; mso-line-height-rule:exactly; color:#4a4f57;">Thanks for using our roof coating estimator. Based on the roof you measured and the details you gave us, this is the price range to plan around.</p>
</td></tr>
<tr><td class="px" style="padding:22px 40px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#15202b; border-radius:10px;"><tr><td style="padding:28px 28px 26px; ${F}">
<div style="font-size:12px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#8fc3ea; line-height:18px;">Estimated project range</div>
<div class="price" style="margin-top:8px; font-size:42px; line-height:48px; mso-line-height-rule:exactly; font-weight:bold; color:#ffffff;">${esc(v.range).replace(' \u2013 ', ' &ndash; ')}</div>
<div style="margin-top:10px; font-size:14px; line-height:21px; color:#c6d4de;">${esc(v.area)} sq ft &nbsp;&middot;&nbsp; ${coatName} &nbsp;&middot;&nbsp; Labor and materials included</div>
</td></tr></table></td></tr>
<tr><td class="px" style="padding:28px 40px 4px; ${F}">
<div style="font-size:13px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; color:#15161a; padding-bottom:10px; border-bottom:1px solid #e3e7eb;">Your project</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px; line-height:22px;">${rowHtml}</table>
</td></tr>
<tr><td class="px" style="padding:26px 40px 4px; ${F}">
<div style="font-size:13px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; color:#15161a; padding-bottom:10px; border-bottom:1px solid #e3e7eb;">What the price covers</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px; line-height:22px; color:#3c4048;">${stepHtml}</table>
</td></tr>
<tr><td class="px" style="padding:32px 40px 6px; ${F}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f8fb; border:1px solid #dbe8f2; border-radius:10px;"><tr><td style="padding:24px 26px; ${F}">
<div style="font-size:18px; line-height:24px; font-weight:bold; color:#15161a;">Next step: a free onsite assessment</div>
<p style="margin:8px 0 18px; font-size:15px; line-height:23px; color:#4a4f57;">Click below and our team is notified right away. We will reach out to set a day, walk the roof, and turn this range into an exact, itemized quote. No forms to fill out again.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#2f80bd" style="border-radius:7px; background:#2f80bd;"><a href="${esc(v.scheduleUrl)}" style="display:block; padding:14px 26px; ${F} font-size:14px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#ffffff; text-decoration:none;">Schedule my assessment</a></td></tr></table>
<p style="margin:16px 0 0; font-size:15px; line-height:22px; color:#4a4f57;">Or call or text <a href="${TEL}" style="color:#2f80bd; font-weight:bold; text-decoration:none;">${PHONE}</a>. You can also reply to this email.</p>
</td></tr></table></td></tr>
<tr><td class="px" style="padding:22px 40px 30px; ${F}"><p style="margin:0; font-size:12.5px; line-height:19px; color:#7a8089;">This ballpark is a preliminary range based on the information you entered online. It is not a contract or a final quote. Final pricing depends on an onsite inspection of the roof, its condition, access and penetrations.</p></td></tr>
<tr><td class="px" style="padding:22px 40px 26px; background:#15202b; ${F}">
<div style="font-size:14px; line-height:20px; font-weight:bold; color:#ffffff;">${LEGAL}</div>
<div style="font-size:13px; line-height:20px; color:#c6d4de;">Commercial Roof Coatings &amp; Restoration &middot; Henderson, KY &amp; the Tri-State</div>
<div style="margin-top:8px; font-size:13px; line-height:20px;"><a href="${SITE}" style="color:#8fc3ea; text-decoration:none;">arunitedconstruction.com</a> &nbsp;&middot;&nbsp; <a href="${TEL}" style="color:#8fc3ea; text-decoration:none;">${PHONE}</a></div>
<div style="margin-top:12px; font-size:11.5px; line-height:17px; color:#8a96a1;">You are receiving this email because you requested a ballpark on our website.</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

export function ballparkEmailText(v) {
  return `Hi ${v.first},\n\nThanks for using our commercial roof coating estimator. Based on your roughly ${v.area} sq ft ` +
    `${v.coating === 'acrylic' ? 'elastomeric' : 'silicone'} coating project, your preliminary ballpark is:\n\n    ${v.range}\n\n` +
    `This is an estimate only, meant to give you a range to plan around. For an exact, itemized quote, schedule a free onsite assessment:\n${v.scheduleUrl}\n\n` +
    `Or call or text ${PHONE}, or reply to this email.\n\nA & R United Construction LLC\nCommercial Roof Coatings & Restoration`;
}

// Page the customer lands on after clicking "Schedule my assessment".
// state: 'confirm' (auto-sends on load), 'done', 'already', 'invalid'
export function schedulePage(v, state, token) {
  const F = "font-family:Arial, Helvetica, sans-serif;";
  const first = esc((v && v.first) || 'there');
  const phone = v && v.phone ? esc(v.phone) : '';
  const done = '<h1 style="margin:0 0 12px; font-size:30px; line-height:36px; color:#15161a;">Request received, ' + first + '.</h1>' +
    '<p style="margin:0 0 14px; font-size:17px; line-height:27px; color:#4a4f57;">Our team has been notified that you would like a free onsite assessment' + (v && v.address ? ' at <strong style="color:#15161a;">' + esc(v.address) + '</strong>' : '') + '.</p>' +
    '<p style="margin:0 0 26px; font-size:17px; line-height:27px; color:#4a4f57;">We will call or text you' + (phone ? ' at <strong style="color:#15161a;">' + phone + '</strong>' : '') + ' within one business day to pick a day and time. A confirmation is also on its way to your email.</p>';
  const body = {
    confirm: '<div id="s1"><h1 style="margin:0 0 12px; font-size:30px; line-height:36px; color:#15161a;">Sending your request&hellip;</h1><p style="margin:0 0 26px; font-size:17px; line-height:27px; color:#4a4f57;">One moment while we let our team know.</p>' +
      '<noscript><form method="post" action="/api/schedule"><input type="hidden" name="t" value="' + esc(token) + '"><button type="submit" style="background:#2f80bd; color:#fff; border:0; border-radius:7px; padding:14px 26px; font-size:14px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; cursor:pointer;">Confirm my request</button></form></noscript></div>' +
      '<div id="s2" style="display:none;">' + done + '</div>' +
      '<div id="s3" style="display:none;"><h1 style="margin:0 0 12px; font-size:30px; line-height:36px; color:#15161a;">We could not send that.</h1><p style="margin:0 0 26px; font-size:17px; line-height:27px; color:#4a4f57;">Please call or text us at ' + PHONE + ' and we will get you scheduled.</p></div>',
    done: done,
    already: '<h1 style="margin:0 0 12px; font-size:30px; line-height:36px; color:#15161a;">You are all set, ' + first + '.</h1><p style="margin:0 0 26px; font-size:17px; line-height:27px; color:#4a4f57;">We already have your assessment request and our team will be in touch to pick a day and time.</p>',
    invalid: '<h1 style="margin:0 0 12px; font-size:30px; line-height:36px; color:#15161a;">This link has expired.</h1><p style="margin:0 0 26px; font-size:17px; line-height:27px; color:#4a4f57;">Please call or text us at ' + PHONE + ' or request an assessment on our website and we will get you scheduled.</p>'
  }[state];
  const script = state === 'confirm' ? '<script>fetch("/api/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:' + JSON.stringify(String(token)) + '})}).then(function(r){return r.json()}).then(function(j){document.getElementById("s1").style.display="none";document.getElementById(j&&j.ok?"s2":"s3").style.display="block";}).catch(function(){document.getElementById("s1").style.display="none";document.getElementById("s3").style.display="block";});</script>' : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Assessment request | A &amp; R United Construction LLC</title></head>
<body style="margin:0; background:#eef1f4; ${F}">
<div style="background:#ffffff; border-bottom:3px solid #2f80bd;"><div style="max-width:640px; margin:0 auto; padding:20px 24px;"><a href="${SITE}"><img src="${SITE}/assets/logo-2026.png" alt="${LEGAL}" style="display:block; height:44px; width:auto; border:0;"></a></div></div>
<div style="max-width:640px; margin:0 auto; padding:44px 24px 60px;">
<div style="background:#ffffff; border:1px solid #dde3e8; border-radius:12px; padding:38px 34px;">
<div style="font-size:12px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#2f80bd; margin-bottom:12px;">Free onsite assessment</div>
${body}
<div style="display:flex; flex-wrap:wrap; gap:12px;">
<a href="${TEL}" style="display:inline-block; background:#2f80bd; color:#ffffff; text-decoration:none; font-size:14px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; padding:14px 24px; border-radius:7px;">Call ${PHONE}</a>
<a href="${SITE}" style="display:inline-block; background:#ffffff; color:#15161a; text-decoration:none; font-size:14px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; padding:13px 24px; border-radius:7px; border:1px solid #cfd8e0;">Back to website</a>
</div></div>
<p style="margin:22px 0 0; font-size:13px; line-height:20px; color:#6b717a; text-align:center;">${LEGAL} &middot; Henderson, KY &amp; the Tri-State</p>
</div>${script}</body></html>`;
}

export function scheduleConfirmText(v) {
  return `Hi ${v.first || 'there'},\n\nWe received your request for a free onsite roof assessment${v.address ? ' at ' + v.address : ''}. ` +
    `Our team will call or text you${v.phone ? ' at ' + v.phone : ''} within one business day to pick a day and time.\n\n` +
    `Your ballpark for reference: ${v.range}\n\nNeed us sooner? Call or text ${PHONE} or reply to this email.\n\nA & R United Construction LLC\nCommercial Roof Coatings & Restoration`;
}
