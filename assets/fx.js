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
      toTop.style.cssText = 'position:fixed;right:26px;bottom:26px;width:50px;height:50px;border-radius:50%;' +
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
