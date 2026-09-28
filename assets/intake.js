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


/* ARPlacesAC — drop-in for google.maps.places.Autocomplete using the current Places API
   (AutocompleteSuggestion). Same surface: new ARPlacesAC(input, opts); .addListener('place_changed', fn); .getPlace().
   Falls back to the legacy widget if the new API is not enabled on the key. */
(function(){
  if (window.ARPlacesAC) return;
  function ARPlacesAC(input, opts){
    opts = opts || {};
    var self = this, place = null, handlers = [], items = [], active = -1, timer = 0, token = null, dead = false, lib = null, legacy = null;
    var box = document.createElement('div');
    box.setAttribute('role','listbox');
    box.style.cssText = 'position:absolute; z-index:100000; display:none; background:#fff; border:1px solid #e0dcd4; border-radius:8px; box-shadow:0 14px 34px rgba(12,13,16,.16); overflow:hidden; font-family:"IBM Plex Sans",system-ui,sans-serif;';
    document.body.appendChild(box);
    input.setAttribute('autocomplete','off');
    function pos(){ var r = input.getBoundingClientRect(); box.style.left = (r.left + window.pageXOffset) + 'px'; box.style.top = (r.bottom + window.pageYOffset + 4) + 'px'; box.style.width = r.width + 'px'; }
    function hide(){ box.style.display = 'none'; items = []; active = -1; }
    function fire(){ handlers.forEach(function(fn){ try { fn(); } catch(e){} }); }
    function toLegacy(){
      dead = true; hide();
      try { box.remove(); } catch(e){}
      if (!(window.google && google.maps && google.maps.places && google.maps.places.Autocomplete)) return;
      var o = { fields:['formatted_address','geometry'] };
      if (opts.componentRestrictions) o.componentRestrictions = opts.componentRestrictions;
      if (opts.types) o.types = opts.types;
      legacy = new google.maps.places.Autocomplete(input, o);
      legacy.addListener('place_changed', function(){ place = legacy.getPlace(); fire(); });
    }
    function paint(){
      box.innerHTML = '';
      if (!items.length){ box.style.display = 'none'; return; }
      items.forEach(function(it, i){
        var p = it.placePrediction, row = document.createElement('div');
        row.setAttribute('role','option');
        row.style.cssText = 'padding:11px 14px; cursor:pointer; font-size:14px; line-height:1.35; color:#15161a; border-top:' + (i ? '1px solid #f0ede8' : 'none') + '; background:' + (i === active ? '#f0f6fb' : '#fff') + ';';
        var main = (p.mainText && p.mainText.text) || (p.text && p.text.text) || '';
        var sec = (p.secondaryText && p.secondaryText.text) || '';
        row.innerHTML = '<div style="font-weight:600;"></div><div style="font-size:12.5px; color:#6b6f78; margin-top:2px;"></div>';
        row.firstChild.textContent = main; row.lastChild.textContent = sec;
        row.addEventListener('mousedown', function(e){ e.preventDefault(); choose(i); });
        row.addEventListener('mouseenter', function(){ active = i; paint(); });
        box.appendChild(row);
      });
      var foot = document.createElement('div');
      foot.style.cssText = 'padding:6px 14px; font-size:10.5px; color:#9a9da4; text-align:right; border-top:1px solid #f0ede8;';
      foot.textContent = 'Powered by Google';
      box.appendChild(foot);
      pos(); box.style.display = 'block';
    }
    function choose(i){
      var it = items[i]; if (!it) return; hide();
      var pl = it.placePrediction.toPlace();
      pl.fetchFields({ fields:['formattedAddress','location'] }).then(function(){
        token = null;
        var loc = pl.location;
        place = { formatted_address: pl.formattedAddress || (it.placePrediction.text && it.placePrediction.text.text) || input.value,
                  geometry: loc ? { location: loc } : undefined };
        input.value = place.formatted_address;
        fire();
      }).catch(function(){ place = { formatted_address: (it.placePrediction.text && it.placePrediction.text.text) || input.value }; input.value = place.formatted_address; fire(); });
    }
    function query(){
      var q = input.value.trim();
      if (dead) return;
      if (q.length < 3){ hide(); return; }
      if (!lib){ return; }
      if (!token) token = new lib.AutocompleteSessionToken();
      var req = { input:q, sessionToken:token };
      var cr = opts.componentRestrictions && opts.componentRestrictions.country;
      req.includedRegionCodes = [cr || 'us'];
      lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req).then(function(res){
        if (input.value.trim() !== q) return;
        items = (res.suggestions || []).filter(function(s){ return s.placePrediction; }).slice(0,5); active = -1; paint();
      }).catch(function(err){ if (window.console) console.warn('[ARPlacesAC] new Places API unavailable, using legacy widget', err); toLegacy(); });
    }
    input.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(query, 180); });
    input.addEventListener('keydown', function(e){
      if (dead || box.style.display === 'none') return;
      if (e.key === 'ArrowDown'){ e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); active = Math.max(0, active - 1); paint(); }
      else if (e.key === 'Enter' && active >= 0){ e.preventDefault(); e.stopPropagation(); choose(active); }
      else if (e.key === 'Escape'){ hide(); }
    }, true);
    input.addEventListener('blur', function(){ setTimeout(hide, 150); });
    window.addEventListener('resize', function(){ if (box.style.display !== 'none') pos(); });
    window.addEventListener('scroll', function(){ if (box.style.display !== 'none') pos(); }, true);
    var g = window.google && google.maps;
    if (g && g.importLibrary){
      g.importLibrary('places').then(function(l){ if (l && l.AutocompleteSuggestion) lib = l; else toLegacy(); }).catch(toLegacy);
    } else if (g && g.places && g.places.AutocompleteSuggestion){ lib = g.places; }
    else toLegacy();
    self.addListener = function(ev, fn){ if (ev === 'place_changed') handlers.push(fn); return { remove:function(){ handlers = handlers.filter(function(h){ return h !== fn; }); } }; };
    self.getPlace = function(){ return place; };
  }
  window.ARPlacesAC = ARPlacesAC;
})();
