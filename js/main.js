/* YouTube Music Skip Solution: comic one-pager. No libraries. */
(function () {
  'use strict';

  /* ================= CONFIG: the ONE place to change pricing / links ================= */
  var CONFIG = {
    trialDays: 7,
    price: '$1.99',          // shown on the page
    priceValue: '1.99',      // JSON-LD offer
    currency: 'USD',
    stores: {
      chrome: 'https://chromewebstore.google.com/detail/youtube-music-skip-soluti/gbchceofniiamjghihdjgecmmlecogld',
      firefox: 'https://addons.mozilla.org/en-US/firefox/addon/youtube-music-skip-solution/'
    },
    // TODO(Michael): the live domain (with trailing slash). Single source for canonical,
    // og:url, og:image, twitter:image, JSON-LD, robots.txt, sitemap.xml and the Umami
    // data-domains. Run tools/set_domain.py after changing it to bake it into the files.
    siteUrl: 'https://skipnomore.site/'
  };

  /* ================= PACING: how every page builds itself (ms) =================
     A page builds when it becomes the active page: after one click on NEXT / PREVIOUS /
     a dot / a link, or when 60% of it is scrolled into view. It resets once it has fully
     left the viewport, so every arrival replays it. Coming back (PREVIOUS or scrolling up)
     plays at backSpeed. Beats are the data-beat="0..n" groups in index.html. */
  var CHAPTER_PACING = {
    title: 900,          // beat 0: chapter number + title, alone in the middle
    image: 700,          // beat 1: the main image reveals
    beatBase: 560,       // later beats: base gap before the next one ...
    perChar: 9,          // ... plus this much per character of text in the beat ...
    beatMin: 600,        // ... clamped to this range
    beatMax: 1000,
    tabDelay: 450,       // after the last beat, the NEXT tab pops in
    scrollSettle: 1600,  // max wait for the smooth scroll before a page starts
    autoStart: 0.6,      // scrolling: build once 60% of the page is visible
    resetBelow: 0.1,     // ... reset once less than 10% is visible
    backSpeed: 2         // PREVIOUS / scrolling up: build at 2x
  };
  var PAGE_PACING = {    // the pages after the story: calmer, quicker
    title: 650,          // section title first
    beat: 420,           // then one content beat every 420 ms
    tabDelay: 350
  };
  var CHAOS = {          // chapter 3 timeline (ms from the click, 1x speed)
    main: 900,           // calm establishing image
    queue: 1600,         // the queue panel
    skipStart: 2200,     // then the highlight jumps, accelerating:
    skipGaps: [120, 110, 100, 90, 80, 70, 60],
    tiles: 3150, tileStep: 110,  // skip icons slam in
    screen: 3550, bzzt: 3750, head: 3950,
    dialog: 4500,        // "Video paused. Continue watching?": the final blow
    caption: 5200,       // "Your playlist skips itself. Focus gone."
    done: 5800           // NEXT CHAPTER tab
  };
  /* =================================================================================== */

  var doc = document;
  var root = doc.documentElement;
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var reduceMQ = mq('(prefers-reduced-motion: reduce)');
  var reduced = function () { return reduceMQ.matches; };
  var hasIO = 'IntersectionObserver' in window;
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  /* ---------- Analytics (Umami, only when UMAMI_WEBSITE_ID is set in index.html) ---------- */
  function track(name, data) {
    if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data);
  }

  /* ---------- Config -> page ---------- */
  $$('[data-cfg="price"]').forEach(function (el) { el.textContent = CONFIG.price; });
  $$('[data-cfg="trial-days"]').forEach(function (el) { el.textContent = String(CONFIG.trialDays); });
  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  var OG_IMAGE = CONFIG.siteUrl + 'assets/img/og-image.jpg';
  [['link[rel="canonical"]', 'href', CONFIG.siteUrl],
   ['link[rel="alternate"][hreflang="en"]', 'href', CONFIG.siteUrl],
   ['link[rel="alternate"][hreflang="x-default"]', 'href', CONFIG.siteUrl],
   ['meta[property="og:url"]', 'content', CONFIG.siteUrl],
   ['meta[property="og:image"]', 'content', OG_IMAGE],
   ['meta[name="twitter:image"]', 'content', OG_IMAGE]].forEach(function (m) {
    var el = doc.querySelector(m[0]);
    if (el) el.setAttribute(m[1], m[2]);
  });
  var ld = doc.getElementById('ld-app');
  if (ld) {
    try {
      var data = JSON.parse(ld.textContent);
      data.image = OG_IMAGE;
      data.url = CONFIG.siteUrl;
      if (data.offers && data.offers[1]) {
        data.offers[1].price = CONFIG.priceValue;
        data.offers.forEach(function (o) { o.priceCurrency = CONFIG.currency; });
      }
      ld.textContent = JSON.stringify(data);
    } catch (e) { /* keep the static JSON-LD */ }
  }

  /* ---------- Browser detection -> every generic CTA ---------- */
  // Never guess: iOS, mobile Chromium (no extension support), Safari and unknown browsers
  // keep the no-JS default (#download: both store buttons + the availability line).
  function detectBrowser() {
    var ua = navigator.userAgent;
    var iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (iOS || /FxiOS|CriOS|EdgiOS|OPiOS/.test(ua)) return 'unknown';
    if (/\bFirefox\//.test(ua)) return 'firefox';             // desktop and Android
    if (/Android|Mobile/.test(ua)) return 'unknown';
    if (/\bEdg\//.test(ua)) return 'edge';
    if (/\bOPR\//.test(ua)) return 'opera';
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') return 'brave';
    if (/\bVivaldi\//.test(ua)) return 'vivaldi';
    if (/\b(Chrome|Chromium)\//.test(ua)) return 'chrome';
    return 'unknown';
  }
  var BROWSERS = {
    chrome:  { label: 'Add to Chrome',  mark: 'chrome',  store: 'chrome',  sub: 'Chrome Web Store' },
    edge:    { label: 'Add to Edge',    mark: 'edge',    store: 'chrome',  sub: 'From the Chrome Web Store' },
    brave:   { label: 'Add to Brave',   mark: 'brave',   store: 'chrome',  sub: 'From the Chrome Web Store' },
    opera:   { label: 'Add to Opera',   mark: 'opera',   store: 'chrome',  sub: 'From the Chrome Web Store' },
    vivaldi: { label: 'Get the extension', mark: 'chrome', store: 'chrome', sub: 'From the Chrome Web Store', event: 'chrome' },
    firefox: { label: 'Add to Firefox', mark: 'firefox', store: 'firefox', sub: 'Firefox Add-ons' }
  };
  var OPERA_NOTE = 'Opera: first add Opera\u2019s official \u201cInstall Chrome Extensions\u201d add-on, then click \u201cAdd to Opera\u201d in the Chrome Web Store.';
  var browser = detectBrowser();
  root.setAttribute('data-browser', browser);

  function storeUrl(store, medium, content) {
    return CONFIG.stores[store] + '?utm_source=website&utm_medium=' + encodeURIComponent(medium) +
      (content ? '&utm_content=' + encodeURIComponent(content) : '');
  }
  var tipN = 0;
  $$('[data-store]').forEach(function (a) {
    var store = a.getAttribute('data-store');
    var section = a.getAttribute('data-section') || 'site';
    var also = a.getAttribute('data-also');
    if (also) {
      a.href = storeUrl('chrome', 'also-works', also + '-' + section);
      if (also === browser) a.classList.add('is-you');
      return;
    }
    if (store !== 'auto') {
      a.href = storeUrl(store, section);
      var pref = BROWSERS[browser] ? BROWSERS[browser].store : null;
      if (store === pref && a.classList.contains('btn--store')) a.classList.add('is-primary');
      return;
    }
    var b = BROWSERS[browser];
    if (!b) return; // unknown: stays "Get the extension" -> #download (the last page's tab: "Read it again" -> #cover)
    a.href = storeUrl(b.store, section);
    a.classList.add('is-store');
    a.setAttribute('data-store', b.store);
    a.setAttribute('data-umami-event', 'store-click');
    a.setAttribute('data-umami-event-store', b.event || browser);
    a.setAttribute('data-umami-event-section', section);
    var use = a.querySelector('.btn__mark use');
    if (use) use.setAttribute('href', '#mark-' + b.mark);
    var label = a.querySelector('.btn__label');
    if (label) label.textContent = b.label;
    var shortL = a.querySelector('.btn__short');
    if (shortL) shortL.textContent = b.label;
    var sub = a.querySelector('.btn__sub');
    if (sub) sub.textContent = b.sub;
    if (browser === 'opera') {
      var tip = doc.createElement('span');
      tip.className = 'cta-tip';
      tip.id = 'cta-tip-' + (++tipN);
      tip.setAttribute('role', 'tooltip');
      tip.textContent = OPERA_NOTE;
      a.setAttribute('aria-describedby', tip.id);
      a.parentNode.classList.add('has-tip');
      a.parentNode.insertBefore(tip, a.nextSibling);
    }
  });
  if (browser === 'firefox') {
    $$('.download .store-row').forEach(function (row) {
      var ff = row.querySelector('[data-store="firefox"]');
      if (ff) row.insertBefore(ff, row.firstChild);
    });
  }

  /* ---------- Mobile menu ---------- */
  var menuBtn = doc.querySelector('.nav__menu');
  var links = doc.getElementById('nav-links');
  if (menuBtn && links) {
    var setMenu = function (open) {
      menuBtn.setAttribute('aria-expanded', String(open));
      links.classList.toggle('is-open', open);
    };
    menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); }
    });
  }

  /* ---------- Reveals (class driven, so every page can reset and replay) ---------- */
  function reveal(el) {
    if (!el || el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    if (el.getAttribute('data-reveal') === 'ink') {
      // Settle the whole wrapper, not a bubbled child-image event. Cancel on reset so an
      // earlier replay cannot light a panel in the middle of the next build.
      var done = function (e) {
        if (e && (e.target !== el || e.propertyName !== 'opacity')) return;
        cancelReveal(el);
        if (el.classList.contains('is-in')) el.classList.add('is-done');
      };
      var style = getComputedStyle(el);
      var seconds = function (value) { return value.split(',').map(function (n) { return parseFloat(n) || 0; }); };
      var durations = seconds(style.transitionDuration), delays = seconds(style.transitionDelay);
      var wait = Math.max.apply(null, durations.map(function (n, i) { return n + delays[i % delays.length]; })) * 1000;
      if (reduced() || !wait) { el.classList.add('is-done'); return; }
      el.addEventListener('transitionend', done);
      revealPlans.set(el, { done: done, timer: setTimeout(done, wait + 80) });
    }
  }
  var revealPlans = new WeakMap();
  function cancelReveal(el) {
    var plan = revealPlans.get(el);
    if (!plan) return;
    clearTimeout(plan.timer);
    el.removeEventListener('transitionend', plan.done);
    revealPlans.delete(el);
  }
  function unreveal(el) { cancelReveal(el); el.classList.remove('is-in', 'is-done'); }

  /* ---------- Chapter 3 queue: the highlight jumps, each passed track gets struck ---------- */
  var queue = doc.querySelector('[data-queue]');
  var queueItems = queue ? $$('.queue__list li', queue) : [];
  var queueNow = queue ? queue.querySelector('[data-queue-now]') : null;
  function setQueue(k) {
    if (!queue) return;
    var n = queueItems.length;
    queueItems.forEach(function (li, i) {
      li.classList.toggle('is-skipped', i < k);
      li.classList.toggle('is-current', i === k);
    });
    queue.classList.toggle('is-burned', k >= n);
    if (queueNow) {
      queueNow.textContent = k >= n ? 'Playlist ended. Every track skipped.'
        : 'Now playing: ' + queueItems[k].querySelector('.queue__title').textContent;
    }
  }

  /* ---------- Pages: the whole site is a comic you click (or scroll) through ---------- */
  var navH = function () {
    var nav = doc.querySelector('.nav');
    return nav ? nav.getBoundingClientRect().height : 0;
  };
  var barEl = doc.querySelector('.pbar');
  var barH = function () { return barEl && barEl.offsetParent !== null ? barEl.getBoundingClientRect().height : 0; };
  var pages = $$('[data-page]').map(function (el, index) {
    var groups = [];
    $$('[data-beat]', el).forEach(function (b) {
      var k = parseInt(b.getAttribute('data-beat'), 10) || 0;
      (groups[k] = groups[k] || []).push(b);
    });
    return {
      el: el, index: index, id: el.id, chapter: el.hasAttribute('data-chapter'),
      groups: groups.filter(Boolean), state: 'idle', timers: [], anims: []
    };
  });
  var pageOf = function (el) {
    for (var i = 0; i < pages.length; i++) if (pages[i].el === el) return pages[i];
    return null;
  };
  var LEGACY = { story: 'chapter-1', ch1: 'chapter-1', ch2: 'chapter-2', ch3: 'chapter-3', ch4: 'chapter-4', main: 'cover', top: 'cover', demo: 'difference' };
  function pageForHash(id) {
    if (!id) return null;
    id = LEGACY[id] || id;
    var el = doc.getElementById(id);
    if (!el) return null;
    var host = el.closest('[data-page]');
    return host && host === el ? pageOf(host) : null;
  }
  var active = null;
  var reached = {};
  var pageNo = doc.querySelector('[data-page-no]');
  var dots = $$('.pbar__dot');

  function setActive(p) {
    if (!p || active === p) return;
    active = p;
    if (pageNo) pageNo.textContent = String(p.index + 1);
    dots.forEach(function (d, i) {
      d.classList.toggle('is-active', i === p.index);
      if (i === p.index) d.setAttribute('aria-current', 'page'); else d.removeAttribute('aria-current');
    });
    if (history.replaceState) {
      var url = p.index === 0 ? location.pathname + location.search : '#' + p.id;
      if ((p.index === 0 ? '' : '#' + p.id) !== location.hash) history.replaceState(null, '', url);
    }
  }
  function setState(p, s) {
    p.state = s; p.el.setAttribute('data-state', s);
    // The final NEXT control can be taller than Show all (notably on phones).
    // Refit after it becomes visible so terms cannot sit underneath navigation.
    if (s === 'done' && queueFit) queueFit();
  }
  function clearPlan(p) {
    p.timers.forEach(clearTimeout);
    p.timers = [];
    p.anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* already gone */ } });
    p.anims = [];
  }
  function anim(p, el, frames, opts) {
    if (el && el.animate && !reduced()) p.anims.push(el.animate(frames, opts));
  }
  function reset(p) {
    if (!p.groups.length) { setState(p, 'done'); return; }
    clearPlan(p);
    p.el.classList.add('is-resetting');       // no transitions: back to beat 0 instantly, invisibly
    p.el.classList.remove('is-title');
    p.groups.forEach(function (g) { g.forEach(unreveal); });
    if (queue && p.el.contains(queue)) setQueue(0);
    $$('.swipe', p.el).forEach(function (s) { s.scrollLeft = 0; });
    void p.el.offsetWidth;                    // force reflow before transitions come back
    p.el.classList.remove('is-resetting');
    setState(p, 'idle');
  }
  function finish(p) {
    clearPlan(p);
    p.el.classList.remove('is-title');
    p.groups.forEach(function (g) { g.forEach(reveal); });
    if (queue && p.el.contains(queue)) setQueue(queueItems.length);
    setState(p, 'done');
  }

  // beat 0 of a chapter: the title alone, centred on the page
  function titleAlone(p) {
    var head = p.el.querySelector('.page__head');
    var box = p.el.querySelector('.page');
    if (!head || !box) return;
    var hr = head.getBoundingClientRect();
    var pr = box.getBoundingClientRect();
    p.el.style.setProperty('--hd', Math.round((pr.top + pr.height / 2) - (hr.top + hr.height / 2)) + 'px');
    p.el.style.setProperty('--title-scale', String(Math.min(1.4, (pr.width - 8) / Math.max(1, hr.width))));
    p.el.classList.add('is-title');
  }
  function textLen(group) {
    return group.reduce(function (n, el) { return n + el.textContent.replace(/\s+/g, ' ').trim().length; }, 0);
  }
  function chapterPlan(p) {
    titleAlone(p);
    var steps = [[0, function () { p.groups[0].forEach(reveal); }]];
    var t = 0;
    p.groups.forEach(function (g, k) {
      if (k === 0) return;
      var prev = k - 1;
      t += prev === 0 ? CHAPTER_PACING.title : prev === 1 ? CHAPTER_PACING.image
        : Math.max(CHAPTER_PACING.beatMin, Math.min(CHAPTER_PACING.beatMax,
            CHAPTER_PACING.beatBase + textLen(p.groups[prev]) * CHAPTER_PACING.perChar));
      steps.push([t, function () {
        if (k === 1) p.el.classList.remove('is-title');
        g.forEach(reveal);
      }]);
    });
    return { steps: steps, end: t + CHAPTER_PACING.tabDelay };
  }
  function pagePlan(p) {
    var steps = [], t = 0;
    p.groups.forEach(function (g, k) {
      steps.push([t, function () { g.forEach(reveal); }]);
      t += k === 0 ? PAGE_PACING.title : PAGE_PACING.beat;
    });
    return { steps: steps, end: t - PAGE_PACING.beat + PAGE_PACING.tabDelay };
  }
  // Chapter 3: one-shot chaos. Calm image, the queue burns through, NEXT! slams, shakes,
  // panels slam in tilted, the pause dialog lands last, then everything holds still.
  function chaosPlan(p) {
    titleAlone(p);
    var C = CHAOS, steps = [];
    var q = function (s) { return p.el.querySelector(s); };
    var add = function (t, fn) { steps.push([t, fn]); };
    var grid = q('.page__grid');
    var shake = function (amt) {
      anim(p, grid, [
        { translate: '0 0' }, { translate: (-9 * amt) + 'px ' + (3 * amt) + 'px' },
        { translate: (8 * amt) + 'px ' + (-4 * amt) + 'px' }, { translate: (-5 * amt) + 'px ' + (2 * amt) + 'px' },
        { translate: '0 0' }], { duration: 300, easing: 'linear' });
    };
    var flash = function (el) {
      anim(p, el, [{ outlineColor: 'rgba(237, 36, 70, 1)' }, { outlineColor: 'rgba(237, 36, 70, 0)' }], { duration: 280, easing: 'ease-out' });
    };
    var slam = function (el) {
      if (!el) return;
      el.style.setProperty('--rj', (Math.random() * 18 - 9).toFixed(1) + 'deg');
      reveal(el);
    };
    var nexts = $$('.sfx--next1, .sfx--next2, .sfx--next3, .sfx--next4', p.el);
    var slamOn = { 1: 0, 2: 1, 4: 2, 6: 3 };
    var n = queueItems.length;
    add(0, function () { p.groups[0].forEach(reveal); });
    add(C.main, function () { p.el.classList.remove('is-title'); reveal(q('.c-main')); });
    add(C.queue, function () { reveal(q('.c-queue')); });
    var t = C.skipStart;
    for (var k = 1; k <= n; k++) {
      t += C.skipGaps[Math.min(k - 1, C.skipGaps.length - 1)];
      (function (k) {
        add(t, function () {
          setQueue(k);
          flash(q('.c-queue .panel__art'));
          if (slamOn[k] !== undefined) slam(nexts[slamOn[k]]);
          if (k === 1 || k === n) { shake(1); flash(q('.c-main .panel__art')); }
          if (k === n) slam(q('.sfx--skip'));
        });
      })(k);
    }
    $$('.skip-tile', p.el).forEach(function (tile, i) { add(C.tiles + i * C.tileStep, function () { reveal(tile); }); });
    add(C.screen, function () { reveal(q('.c-screen')); });
    add(C.bzzt, function () { slam(q('.sfx--bzzt')); });
    add(C.head, function () { reveal(q('.c-head')); });
    add(C.dialog, function () { reveal(q('.yt-dialog')); shake(0.5); });
    add(C.caption, function () { reveal(q('.caption--alarm')); });
    return { steps: steps, end: C.done };
  }
  function start(p, speed) {
    if (p.state !== 'idle') return;
    if (!p.groups.length) { setState(p, 'done'); return; }
    if (p.chapter && !reached[p.id]) { reached[p.id] = true; track('chapter-reached', { chapter: p.id }); }
    if (reduced()) { finish(p); return; }
    speed = speed || 1;
    setState(p, 'building');
    var plan = p.id === 'chapter-3' && queue ? chaosPlan(p) : p.chapter ? chapterPlan(p) : pagePlan(p);
    plan.steps.forEach(function (s) { p.timers.push(setTimeout(s[1], s[0] / speed)); });
    p.timers.push(setTimeout(function () {
      p.timers = [];
      setState(p, 'done');
    }, plan.end / speed));
  }
  function replay(p, speed) { reset(p); start(p, speed); }

  // Arriving: snap the page to the exact centred position, then build it.
  var autoScrolling = false;
  function goTo(p) {
    if (!p) return;
    var from = active;
    var speed = from && p.index < from.index ? CHAPTER_PACING.backSpeed : 1;
    if (p !== from) reset(p);
    var top = Math.max(0, p.el.getBoundingClientRect().top + window.pageYOffset - navH());
    var smooth = !reduced() && Math.abs(window.pageYOffset - top) > 2;
    autoScrolling = true;
    var settled = false, timer = 0;
    var settle = function () {
      if (settled) return;
      settled = true;
      autoScrolling = false;
      clearTimeout(timer);
      window.removeEventListener('scrollend', settle);
      setActive(p);
      start(p, speed);
    };
    if (smooth) {
      window.addEventListener('scrollend', settle);
      timer = setTimeout(settle, CHAPTER_PACING.scrollSettle);
    } else {
      setTimeout(settle, 0);
    }
    window.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'instant' });
    // Keep focus on the aria-labelledby page region: screen readers announce the
    // destination and keyboard users retain a visible :focus-visible outline.
    // Scoped caret-color CSS prevents caret-browsing paint in noneditable page text.
    p.el.focus({ preventScroll: true });
  }

  // Every in-page link to a page (tabs, dots, nav menu, "Skip to download") arrives the same way.
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var p = pageForHash(a.getAttribute('href').slice(1));
    if (!p) return;
    e.preventDefault();
    goTo(p);
  });
  // Keyboard: ArrowDown / PageDown = next page, ArrowUp / PageUp = previous (not inside form controls).
  doc.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target && e.target.closest ? e.target : doc.body;
    if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .faq__a')) return;
    if ((e.key === ' ' || e.key === 'Spacebar') && t.closest('.next-tab, .prev-tab')) {
      e.preventDefault();
      t.closest('a').click();
      return;
    }
    var dir = e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 0;
    if (!dir || !active) return;
    var target = pages[active.index + dir];
    if (!target) return; // past the last page: normal scrolling to the footer
    e.preventDefault();
    goTo(target);
  });

  pages.forEach(function (p) {
    // "Show all", or a click anywhere on the page while it builds, finishes it at once
    p.el.addEventListener('click', function (e) {
      if (p.state !== 'building') return;
      if (!e.target.closest('[data-skip]') && e.target.closest('a, button, summary, details, input, label')) return;
      finish(p);
    });
    var rp = p.el.querySelector('[data-replay]');
    if (rp) rp.addEventListener('click', function () { replay(p, 1); });
  });

  if (reduced() || !hasIO) {
    if (!hasIO) root.classList.add('no-io');
    pages.forEach(finish);
  } else {
    pages.forEach(reset);
  }
  // Legacy hashes (#ch1, #story ...) land on their page, under the new name.
  (function () {
    var h = location.hash.slice(1);
    if (!LEGACY[h] || !pageForHash(h)) return;
    var p = pageForHash(h);
    if (history.replaceState) history.replaceState(null, '', '#' + p.id);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    var land = function () {
      window.scrollTo({ top: p.el.getBoundingClientRect().top + window.pageYOffset - navH(), behavior: 'instant' });
    };
    land();
    requestAnimationFrame(land);
    window.addEventListener('load', land);
  })();

  // Becoming active (>= 60% of the page area visible) builds a page; scrolling UP builds at 2x.
  // Fully leaving (< 10% visible) resets it, so every arrival replays. Never driven by load events.
  if (hasIO) {
    var thresholds = [];
    for (var i = 0; i <= 20; i++) thresholds.push(i / 20);
    var pageIO = new IntersectionObserver(function (entries) {
      var avail = window.innerHeight - navH() - barH();
      entries.forEach(function (en) {
        var p = pageOf(en.target);
        if (!p) return;
        var ratio = en.intersectionRect.height / Math.max(1, Math.min(en.boundingClientRect.height, avail));
        if (ratio < CHAPTER_PACING.resetBelow) {
          if (p.state !== 'idle' && !reduced()) reset(p);
          return;
        }
        if (ratio >= CHAPTER_PACING.autoStart && !autoScrolling) {
          var from = active;
          setActive(p);
          if (p.state === 'idle') start(p, from && p.index < from.index ? CHAPTER_PACING.backSpeed : 1);
        }
      });
    }, { threshold: thresholds, rootMargin: '-' + Math.round(navH()) + 'px 0px -' + Math.round(barH()) + 'px 0px' });
    pages.forEach(function (p) { pageIO.observe(p.el); });
  }
  if (reduceMQ.addEventListener) {
    reduceMQ.addEventListener('change', function () { if (reduced()) pages.forEach(finish); });
  }

  /* ---------- Fit: every page fits its box (content scaled down, never cut) ---------- */
  var faqRoom = function () { return window.innerWidth < 700 ? 80 : 150; }; // px kept free in the FAQ for an opened answer
  function fitOne(el, availH, availW, reserve) {
    el.style.zoom = '';
    var r = el.getBoundingClientRect();
    var s = Math.min(1, availH / (r.height + reserve), availW / Math.max(1, el.scrollWidth));
    for (var k = 0; k < 2 && s < 1; k++) {
      el.style.zoom = String(s);
      var h2 = el.getBoundingClientRect().height + reserve * s;
      if (h2 > availH) s = s * availH / h2; else break;
    }
    s = Math.max(0.45, s);
    el.style.zoom = s < 0.99 ? String(s) : '';
    return s;
  }
  function fitAll() {
    if (!root.classList.contains('js')) return;
    $$('.page__fit').forEach(function (f) {
      var body = f.parentNode;
      var list = f.querySelector('.faq__list');
      var open = list ? $$('details[open]', list) : [];
      open.forEach(function (d) { d.open = false; });
      body.style.flex = '1 1 0';               // measure the full space the page box leaves
      var availH = body.clientHeight;
      body.style.flex = '';
      var s = fitOne(f, availH, body.clientWidth, list ? faqRoom() : 0);
      if (list) {
        var free = availH - list.getBoundingClientRect().height - 8;
        f.style.setProperty('--faq-a-max', Math.max(90, Math.floor(free / s)) + 'px');
        open.forEach(function (d) { d.open = true; });
      }
    });
    var frame = doc.querySelector('.cover__frame');
    var cb = doc.querySelector('.cover__body');
    if (frame && cb) {
      var top = doc.querySelector('.cover__top');
      fitOne(cb, frame.clientHeight - (top ? top.offsetHeight : 0) - 6, frame.clientWidth, 0);
    }
  }
  var fitQueued = 0;
  var queueFit = function () { cancelAnimationFrame(fitQueued); fitQueued = requestAnimationFrame(fitAll); };
  fitAll();
  window.addEventListener('resize', queueFit);
  window.addEventListener('load', queueFit);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(queueFit);

  /* ---------- Swipe rows (phones): dots follow the snapped card ---------- */
  $$('.swipe').forEach(function (list) {
    var items = Array.prototype.slice.call(list.children);
    var bar = doc.createElement('div');
    bar.className = 'swipe-dots';
    bar.setAttribute('aria-hidden', 'true');
    items.forEach(function () { bar.appendChild(doc.createElement('i')); });
    list.parentNode.insertBefore(bar, list.nextSibling);
    var queued = false;
    var update = function () {
      queued = false;
      var lr = list.getBoundingClientRect();
      var mid = lr.left + lr.width / 2, best = 0, bestD = Infinity;
      items.forEach(function (it, i) {
        var r = it.getBoundingClientRect();
        var d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      Array.prototype.forEach.call(bar.children, function (dot, i) { dot.classList.toggle('is-on', i === best); });
    };
    list.addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  });

  /* ---------- FAQ: one answer open at a time ---------- */
  var faqItems = $$('.faq details');
  faqItems.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      faqItems.forEach(function (o) { if (o !== d && o.open) o.open = false; });
    });
  });

  /* ---------- Analytics: FAQ opens, scroll depth ---------- */
  $$('.faq details').forEach(function (d) {
    d.addEventListener('toggle', function () { if (d.open) track('faq-open', { question: d.id }); });
  });
  var depthSent = {};
  var depthQueued = false;
  function depth() {
    depthQueued = false;
    var max = root.scrollHeight - window.innerHeight;
    var p = max > 0 ? window.pageYOffset / max : 1;
    [50, 90].forEach(function (d) {
      if (!depthSent[d] && p * 100 >= d) { depthSent[d] = true; track('scroll-depth', { depth: d }); }
    });
  }
  window.addEventListener('scroll', function () {
    if (!depthQueued && !(depthSent[50] && depthSent[90])) { depthQueued = true; requestAnimationFrame(depth); }
  }, { passive: true });

  /* ---------- Sections in view (demo start/stop) ---------- */
  var loopSections = $$('[data-loop]');
  var onView = [];
  if (hasIO) {
    var viewIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('in-view', en.isIntersecting);
        onView.forEach(function (fn) { fn(en.target, en.isIntersecting); });
      });
    }, { rootMargin: '100px 0px' });
    loopSections.forEach(function (s) { viewIO.observe(s); });
  } else {
    loopSections.forEach(function (s) { s.classList.add('in-view'); });
  }

  /* ---------- Ambient cover wave: run only while its artwork is visible ---------- */
  var cover = doc.getElementById('cover');
  var coverWave = cover && cover.querySelector('.cover__wave');
  if (coverWave && hasIO) {
    var waveVisible = false;
    var updateWave = function () {
      cover.classList.toggle('is-wave-visible', waveVisible && !doc.hidden && !reduced());
    };
    var waveIO = new IntersectionObserver(function (entries) {
      waveVisible = entries[0].isIntersecting;
      updateWave();
    }, { rootMargin: '-' + Math.round(navH()) + 'px 0px -' + Math.round(barH()) + 'px 0px' });
    waveIO.observe(coverWave);
    doc.addEventListener('visibilitychange', updateWave);
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', updateWave);
  }

  /* ---------- Hover parallax: tilt + inner image shift (fine pointers only) ---------- */
  if (mq('(hover: hover) and (pointer: fine)').matches) {
    $$('[data-hover]').forEach(function (el) {
      var tx = 0, ty = 0, queued = false;
      var apply = function () {
        queued = false;
        el.style.setProperty('--tx', tx.toFixed(3));
        el.style.setProperty('--ty', ty.toFixed(3));
      };
      el.addEventListener('pointermove', function (e) {
        if (reduced()) return;
        var r = el.getBoundingClientRect();
        tx = clamp01((e.clientX - r.left) / r.width) * 2 - 1;
        ty = clamp01((e.clientY - r.top) / r.height) * 2 - 1;
        el.classList.add('is-hover');
        if (!queued) { queued = true; requestAnimationFrame(apply); }
      });
      el.addEventListener('pointerleave', function () {
        tx = 0; ty = 0;
        el.classList.remove('is-hover');
        if (!queued) { queued = true; requestAnimationFrame(apply); }
      });
    });

    /* hero: layered tilt (max ~3deg) */
    var frameEl = doc.querySelector('[data-tilt]');
    if (frameEl) {
      var tLayers = $$('[data-tilt-layer]', frameEl);
      var px = 0, py = 0, tiltQueued = false;
      var applyTilt = function () {
        tiltQueued = false;
        tLayers.forEach(function (l) {
          var depth = parseFloat(l.getAttribute('data-tilt-layer')) || 1;
          l.style.transform = 'translate3d(' + (px * 12 * depth).toFixed(1) + 'px,' + (py * 10 * depth).toFixed(1) + 'px,0) rotateY(' +
            (px * 3 * depth).toFixed(2) + 'deg) rotateX(' + (-py * 2.4 * depth).toFixed(2) + 'deg)';
        });
      };
      frameEl.addEventListener('pointermove', function (e) {
        if (reduced()) return;
        var r = frameEl.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width - 0.5;
        py = (e.clientY - r.top) / r.height - 0.5;
        if (!tiltQueued) { tiltQueued = true; requestAnimationFrame(applyTilt); }
      });
      frameEl.addEventListener('pointerleave', function () {
        px = 0; py = 0;
        if (!tiltQueued) { tiltQueued = true; requestAnimationFrame(applyTilt); }
      });
    }
  }

  /* ---------- Before / after demo (the one illustration that runs on its own) ---------- */
  var screen = doc.querySelector('[data-demo]');
  if (screen) {
    var demoSection = screen.closest('[data-loop]');
    var msg = screen.querySelector('.demo__msg');
    var marks = $$('.demo__mark', screen);
    var dqItems = $$('.dq__list li', screen);
    var dqCount = screen.querySelector('[data-dq-count]');
    var live = doc.getElementById('demo-live');
    var btns = $$('.demo__btn');
    var mode = 'without';
    var timers = [];
    var running = false;

    var LIVE_TEXT = {
      without: 'Showing playback without Skip Solution: a pause prompt, a frozen background tab, then the playlist skips through every track.',
      'with': 'Showing playback with Skip Solution: track 1 keeps playing smoothly in the background tab.'
    };
    var setDemo = function (state, text, shown) {
      screen.setAttribute('data-state', state);
      msg.textContent = text;
      marks.forEach(function (m, i) { m.classList.toggle('is-shown', i < (shown || 0)); });
    };
    var setTrack = function (k) { // k = current index; tracks before it are skipped
      dqItems.forEach(function (li, i) {
        li.classList.toggle('is-skipped', i < k);
        li.classList.toggle('is-current', i === k);
      });
      if (dqCount) dqCount.textContent = k >= dqItems.length ? 'Queue empty' : 'Track ' + (k + 1) + ' of ' + dqItems.length;
    };
    var clear = function () { timers.forEach(clearTimeout); timers = []; };
    var at = function (ms, fn) { timers.push(setTimeout(fn, ms)); };

    var runWithout = function () {
      clear();
      if (reduced()) {
        setTrack(dqItems.length);
        setDemo('burned', 'Paused, frozen, and every track skipped.', 3);
        return;
      }
      setTrack(0);
      setDemo('playing', 'Playing in a background tab', 0);
      at(1600, function () { setDemo('paused', 'Video paused. Continue watching?', 0); });
      at(4000, function () { setDemo('frozen', 'Tab throttled. Playback frozen.', 0); });
      var t0 = 6000, step = 480;
      dqItems.forEach(function (li, i) {
        at(t0 + i * step, function () {
          setTrack(i + 1);
          setDemo('skipping', i + 1 >= dqItems.length ? 'Whole playlist skipped!' : 'Track skipped! Next\u2026', Math.min(3, i + 1));
        });
      });
      at(t0 + dqItems.length * step + 300, function () { setDemo('burned', 'Playlist burned through. Silence.', 3); });
      at(t0 + dqItems.length * step + 3400, function () { if (running && mode === 'without') runWithout(); });
    };
    var runWith = function () {
      clear();
      setTrack(0);
      setDemo('playing', 'Track 1 playing in a background tab. Skip Solution: ON', 0);
    };
    var startDemo = function () {
      running = true;
      if (mode === 'with') runWith(); else runWithout();
    };
    var stopDemo = function () { running = false; clear(); };

    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        mode = b.getAttribute('data-mode');
        btns.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        screen.setAttribute('data-mode', mode);
        if (live) live.textContent = LIVE_TEXT[mode];
        startDemo();
      });
    });

    if (hasIO && demoSection) {
      onView.push(function (target, visible) {
        if (target !== demoSection) return;
        if (visible && !running) startDemo();
        else if (!visible && running) stopDemo();
      });
    } else {
      startDemo();
    }
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', function () { if (running) startDemo(); });
  }
})();
