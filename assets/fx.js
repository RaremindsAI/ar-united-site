/* A&R United Construction — site-wide premium interaction layer.
   Plain, dependency-free, idempotent. Safe with the DC runtime: it rescans
   on DOM mutations so it catches content that streams in, and it never
   permanently hides anything (safety timer always reveals). */
(function () {
  if (window.__aruFx) return; window.__aruFx = true;

  var BRAND = '#2f80bd', SPARK = '#5cb3ea';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var parItems = [];

  /* ---------- fixed chrome: progress bar + back-to-top ---------- */
  var bar, toTop;
  function ensureChrome() {
    if (!document.body) return;
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0;z-index:9999;' +
        'background:linear-gradient(90deg,' + BRAND + ',' + SPARK + ');' +
        'box-shadow:0 0 12px rgba(92,179,234,.55);pointer-events:none;transition:width .12s linear;';
      document.body.appendChild(bar);
    }
    if (!toTop) {
      toTop = document.createElement('button');
      toTop.setAttribute('aria-label', 'Back to top');
      toTop.innerHTML = '&uarr;';
      toTop.style.cssText = 'position:fixed;right:26px;bottom:94px;width:50px;height:50px;border-radius:50%;' +
        'border:none;cursor:pointer;z-index:9998;background:' + BRAND + ';color:#fff;font-size:20px;line-height:1;' +
        'box-shadow:0 12px 32px rgba(47,128,189,.42);opacity:0;transform:translateY(16px) scale(.9);' +
        'transition:opacity .3s ease,transform .3s cubic-bezier(.16,.84,.44,1),filter .2s;';
      toTop.addEventListener('mouseenter', function () { toTop.style.filter = 'brightness(1.12)'; });
      toTop.addEventListener('mouseleave', function () { toTop.style.filter = ''; });
      toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
      document.body.appendChild(toTop);
    }
  }

  /* ---------- reveal on scroll ---------- */
  var revealIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); revealIO.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }) : null;

  function reveal(el) {
    el.dataset.arDone = '1'; el.style.opacity = '1'; el.style.transform = 'none'; el.style.willChange = '';
  }
  function initReveal(el) {
    if (el.__fxrv || el.dataset.arDone) return; el.__fxrv = 1;
    if (reduce) { el.dataset.arDone = '1'; return; }
    var r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.92 && r.bottom > 0) { el.dataset.arDone = '1'; return; } // above/at fold: show now
    el.dataset.fxHidden = '1';
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity .9s cubic-bezier(.16,.84,.44,1),transform .9s cubic-bezier(.16,.84,.44,1)';
    el.style.willChange = 'opacity,transform';
    if (revealIO) revealIO.observe(el); else reveal(el);
  }

  /* ---------- count up ---------- */
  var countIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { runCount(e.target); countIO.unobserve(e.target); } });
  }, { threshold: 0.6 }) : null;

  function runCount(el) {
    var raw = el.getAttribute('data-count');
    var target = parseFloat(raw);
    if (isNaN(target)) return;
    var dec = (raw.indexOf('.') >= 0) ? raw.split('.')[1].length : 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var prefix = el.getAttribute('data-prefix') || '';
    var dur = 1500, t0 = null;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + (target * eased).toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function initCount(el) {
    if (el.__fxc) return; el.__fxc = 1;
    if (reduce) return;
    el.textContent = (el.getAttribute('data-prefix') || '') + '0' + (el.getAttribute('data-suffix') || '');
    if (countIO) countIO.observe(el); else runCount(el);
  }

  /* ---------- 3D tilt ---------- */
  function initTilt(el) {
    if (el.__fxt) return; el.__fxt = 1;
    if (reduce) return;
    var max = parseFloat(el.getAttribute('data-tilt')) || 7;
    el.style.transformStyle = 'preserve-3d';
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = 'perspective(900px) rotateX(' + (-y * max).toFixed(2) + 'deg) rotateY(' +
        (x * max * 1.3).toFixed(2) + 'deg) translateY(-6px)';
      el.style.boxShadow = '0 28px 60px rgba(20,22,26,.16)';
    });
    el.addEventListener('mouseleave', function () { el.style.transform = ''; el.style.boxShadow = ''; });
  }

  /* ---------- magnetic buttons ---------- */
  function initMagnetic(el) {
    if (el.__fxm) return; el.__fxm = 1;
    if (reduce) return;
    var str = parseFloat(el.getAttribute('data-magnetic')) || 0.3;
    el.style.transition = 'transform .25s cubic-bezier(.16,.84,.44,1)';
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left - r.width / 2) * str;
      var y = (e.clientY - r.top - r.height / 2) * str;
      el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    });
    el.addEventListener('mouseleave', function () { el.style.transform = ''; });
  }

  /* ---------- scroll handler (progress, header, back-to-top, parallax) ---------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var h = document.documentElement;
      var st = h.scrollTop || document.body.scrollTop || 0;
      var max = (h.scrollHeight - h.clientHeight) || 1;
      if (bar) bar.style.width = (st / max * 100) + '%';
      var hdr = document.querySelector('header');
      if (hdr) {
        if (st > 12) { hdr.style.boxShadow = '0 8px 30px rgba(0,0,0,.11)'; hdr.style.background = 'rgba(255,255,255,.99)'; }
        else { hdr.style.boxShadow = ''; hdr.style.background = ''; }
      }
      if (toTop) {
        var show = st > 520;
        toTop.style.opacity = show ? '1' : '0';
        toTop.style.transform = show ? 'none' : 'translateY(16px) scale(.9)';
        toTop.style.pointerEvents = show ? 'auto' : 'none';
      }
      if (!reduce) parItems.forEach(function (o) {
        var r = o.el.getBoundingClientRect();
        if (r.bottom < -80 || r.top > innerHeight + 80) return;
        var center = r.top + r.height / 2 - innerHeight / 2;
        o.el.style.transform = 'translate3d(0,' + (-center * o.f).toFixed(1) + 'px,0)';
      });
    });
  }

  /* ---------- scan ---------- */
  function scan() {
    ensureChrome();
    document.querySelectorAll('[data-reveal], section').forEach(initReveal);
    document.querySelectorAll('[data-count]').forEach(initCount);
    document.querySelectorAll('[data-tilt]').forEach(initTilt);
    document.querySelectorAll('[data-magnetic]').forEach(initMagnetic);
    parItems = [];
    document.querySelectorAll('[data-parallax]').forEach(function (el) {
      if (reduce) return;
      parItems.push({ el: el, f: parseFloat(el.getAttribute('data-parallax')) || 0.12 });
    });
    onScroll();
  }

  /* ---------- safety net: never leave anything hidden ---------- */
  function safety() {
    document.querySelectorAll('[data-fx-hidden]').forEach(function (el) {
      if (!el.dataset.arDone) reveal(el);
    });
  }

  function boot() {
    scan();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    var mo = new MutationObserver(function () { clearTimeout(mo.__t); mo.__t = setTimeout(scan, 120); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(safety, 2600);
    setTimeout(safety, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


/* Contact bubble — floating shortcut to the estimate form, phone and email. */
(function(){
  if (window.__arBubble) return; window.__arBubble = 1;
  var PHONE = '(270) 844-3355', TEL = 'tel:2708443355', MAIL = 'mailto:office@arunitedconstruction.com';
  function init(){
    if (document.getElementById('ar-bubble')) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = document.createElement('div');
    root.id = 'ar-bubble';
    root.style.cssText = 'position:fixed; right:22px; bottom:22px; z-index:9000; font-family:"IBM Plex Sans",system-ui,sans-serif; display:flex; flex-direction:column; align-items:flex-end; gap:12px; transition:opacity .25s, transform .25s;';
    var ico = {
      chat:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; flex:none;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      x:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="display:block; flex:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      form:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>',
      phone:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
      mail:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><polyline points="22 6 12 13 2 6"></polyline></svg>'
    };
    var row = function(href, icon, label, sub, primary){
      return '<a href="'+href+'" data-ar-act="1" style="display:flex; align-items:center; gap:14px; padding:13px 14px; border-radius:10px; text-decoration:none; '+(primary?'background:#2f80bd; color:#fff;':'background:#f6f4f1; color:#15161a;')+'">'
        + '<span style="width:36px; height:36px; flex:none; border-radius:50%; display:flex; align-items:center; justify-content:center; '+(primary?'background:rgba(255,255,255,.18);':'background:#fff; color:#2f80bd;')+'">'+icon+'</span>'
        + '<span style="display:flex; flex-direction:column; line-height:1.25;"><span style="font-weight:700; font-size:14.5px;">'+label+'</span><span style="font-size:12.5px; opacity:.75; margin-top:2px;">'+sub+'</span></span></a>';
    };
    var panel = document.createElement('div');
    panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Contact A&R United Construction');
    panel.style.cssText = 'display:none; width:300px; max-width:calc(100vw - 44px); background:#fff; border:1px solid #e7e3dd; border-radius:14px; box-shadow:0 24px 60px rgba(12,13,16,.22); padding:18px; transform-origin:bottom right;';
    panel.innerHTML = '<div style="font-family:Archivo,system-ui,sans-serif; font-weight:800; font-size:19px; color:#15161a; margin:2px 4px 4px;">How can we help?</div>'
      + '<div style="font-size:13.5px; color:#5c616b; margin:0 4px 14px; line-height:1.5;">Free estimates and inspections. We respond all week, including weekends.</div>'
      + '<div style="display:flex; flex-direction:column; gap:8px;">'
      + row('/contact#quote-form', ico.form, 'Request a free estimate', 'Tell us about your project', true)
      + row(TEL, ico.phone, 'Call '+PHONE, 'Mon\u2013Fri 9\u20135 \u00b7 Sat 9\u20132', false)
      + row(MAIL, ico.mail, 'Email us', 'office@arunitedconstruction.com', false)
      + '</div>';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('aria-label','Contact us'); btn.setAttribute('aria-expanded','false');
    btn.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:10px; height:58px; padding:0 22px 0 18px; border:none; border-radius:999px; cursor:pointer; background:#ee7f1f; color:#fff; font-family:inherit; font-weight:700; font-size:14.5px; letter-spacing:.01em; box-shadow:0 12px 30px rgba(238,127,31,.4), 0 2px 6px rgba(0,0,0,.12); transition:transform .18s, filter .18s;';
    var label = '<span data-ar-lbl="1">Free estimate</span>';
    btn.innerHTML = ico.chat + label;
    btn.onmouseenter = function(){ btn.style.transform = 'translateY(-2px)'; btn.style.filter = 'brightness(1.06)'; };
    btn.onmouseleave = function(){ btn.style.transform = ''; btn.style.filter = ''; };
    root.appendChild(panel); root.appendChild(btn); document.body.appendChild(root);
    var open = false;
    function set(v){
      open = v; btn.setAttribute('aria-expanded', v ? 'true' : 'false');
      btn.innerHTML = v ? ico.x : ico.chat + label;
      btn.style.padding = v ? '0' : '0 22px 0 18px'; btn.style.width = v ? '58px' : ''; btn.style.justifyContent = 'center';
      panel.style.display = v ? 'block' : 'none';
      if (v && !reduce && panel.animate) panel.animate([{opacity:0, transform:'translateY(8px) scale(.97)'},{opacity:1, transform:'none'}], {duration:180, easing:'cubic-bezier(.16,.84,.44,1)'});
      compact();
    }
    function compact(){
      var small = window.innerWidth < 640;
      root.style.right = small ? '16px' : '22px'; root.style.bottom = small ? '16px' : '22px';
      var tt = document.querySelector('button[aria-label="Back to top"]');
      if (tt){ tt.style.right = small ? '20px' : '26px'; tt.style.bottom = small ? '86px' : '94px'; tt.style.visibility = open ? 'hidden' : ''; }
      if (!open){ var l = btn.querySelector('[data-ar-lbl]'); if (l) l.style.display = small ? 'none' : ''; btn.style.width = small ? '58px' : ''; btn.style.padding = small ? '0' : '0 22px 0 18px'; btn.style.gap = small ? '0' : '10px'; }
    }
    btn.addEventListener('click', function(e){ e.stopPropagation(); set(!open); });
    panel.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[data-ar-act]'); if (!a) return;
      if (a.getAttribute('href') === '/contact#quote-form'){
        var f = document.getElementById('quote-form');
        if (f){ e.preventDefault(); var h = document.querySelector('header'); var off = (h ? h.offsetHeight : 0) + 14; window.scrollTo({ top: f.getBoundingClientRect().top + window.pageYOffset - off, behavior: reduce ? 'auto' : 'smooth' }); }
      }
      set(false);
    });
    document.addEventListener('click', function(e){ if (open && !root.contains(e.target)) set(false); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && open) set(false); });
    window.addEventListener('resize', compact);
    compact();
    // Step aside while the estimate form itself is on screen.
    var watch = function(){
      var f = document.getElementById('quote-form');
      if (!f || !('IntersectionObserver' in window)) return false;
      new IntersectionObserver(function(en){ var vis = en[0].isIntersecting; if (vis && open) set(false); root.style.opacity = vis ? '0' : '1'; root.style.pointerEvents = vis ? 'none' : ''; root.style.transform = vis ? 'translateY(12px)' : ''; }, { threshold: 0.25 }).observe(f);
      return true;
    };
    if (!watch()){ var tries = 0, iv = setInterval(function(){ if (watch() || ++tries > 20) clearInterval(iv); }, 500); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
