(function () {
  // === A&R United — website lead intake ===
  // Points at the Vercel serverless function at /api/intake.js (same origin, no CORS).
  // If your API lives on another domain, put its full URL here instead.
  var ENDPOINT = '/api/intake';

  window.ARIntake = {
    endpoint: ENDPOINT,
    submit: function (payload) {
      try { payload = Object.assign({ site: 'arunitedconstruction.com' }, payload || {}); } catch (e) {}
      try { Object.keys(payload).forEach(function (k) { var v = payload[k]; if (typeof v === 'string' && k !== 'details') payload[k] = v.replace(/\s+/g, ' ').trim(); /* collapse extra spaces */ }); } catch (e) {}
      if (!this.endpoint) {
        console.warn('[ARIntake] No endpoint configured yet — lead captured but not sent:', payload);
        return Promise.resolve({ ok: false, skipped: true });
      }
      return fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      })
        .then(function (r) { try { if (r.ok && window.gtag) gtag('event', 'generate_lead', { event_category: 'form', event_label: payload.source || 'unknown' }); } catch (e) {}
        return r.json().then(function (j) { console.log('[ARIntake] result', j); return Object.assign({ ok: r.ok, status: r.status }, j); }).catch(function () { console.log('[ARIntake] HTTP', r.status); return { ok: r.ok, status: r.status }; }); })
        .catch(function (e) { console.warn('[ARIntake] send failed', e); return { ok: false, error: String(e) }; });
    }
  };
})();
