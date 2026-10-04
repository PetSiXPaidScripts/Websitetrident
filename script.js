/* ==========================================================================
   TRIDENT — interaction & motion layer
   --------------------------------------------------------------------------
   Three tiers:
     • no JS          → plain, fully visible page (CSS only)
     • reduced motion → menu, anchors, one static dust frame; no smooth
                        scroll, parallax, scrubbing, cursor, magnetism or tilt
     • full motion    → Lenis + GSAP choreography + tactile layer
   If anything throws while the motion layer boots, fail() rolls the page
   back to the static tier so nothing is ever left hidden; an exception
   anywhere else in boot does the same through the outer guard.

   Sections: 1 setup · 2 rolling labels · 3 menu · 4 header · 5 anchors
             6 hero dust canvas · 6b pause-motion toggle
             7 motion (lenis, intro, hero, reveals, velocity, games set
             piece, studio, quote, finale, idle, keep-place on resize)
             8 tactile (cursor, magnetic, depth, hero frame)
   ========================================================================== */
(() => {
  'use strict';

  const doc = document;
  const html = doc.documentElement;
  html.classList.add('ready'); // tells the <head> safety timer that we booted
  let menuWired = false;

  try {
    boot();
  } catch (err) {
    // any early exception falls back to the static tier: nothing stays hidden
    window.__trdError = String((err && err.stack) || err);
    html.classList.add('no-anim');
    html.classList.remove('show-intro', 'marquee-js', 'cursor-on');
    if (!menuWired) html.classList.remove('ready'); // header shows plain inline links instead of a dead toggle
    try { if (window.ScrollTrigger) window.ScrollTrigger.disable(false); } catch (e) { /* ignore */ }
    // minimal native header: solid once scrolled, never hidden
    const hd = doc.querySelector('[data-header]');
    if (hd) {
      const solid = () => { hd.classList.remove('is-hidden'); hd.classList.toggle('is-scrolled', window.scrollY > 30); };
      window.addEventListener('scroll', solid, { passive: true });
      solid();
    }
  }

  function boot() {
    /* 1. Setup ---------------------------------------------------------------- */

    const $ = (s, c = doc) => c.querySelector(s);
    const $$ = (s, c = doc) => Array.from(c.querySelectorAll(s));
    const media = (q) => window.matchMedia(q).matches;
    const onMedia = (q, fn) => { // Safari ≤ 13 only knows addListener
      const mq = window.matchMedia(q);
      if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn);
    };
    // resolve "#id" by id, never as a CSS selector ("#1", "#games?ref=x" would throw)
    const byHash = (h) => {
      if (!h || h.length < 2 || h.charAt(0) !== '#') return null;
      try { return doc.getElementById(decodeURIComponent(h.slice(1))); } catch (e) { return null; }
    };
    const REDUCE = media('(prefers-reduced-motion: reduce)');
    const FINE = media('(hover: hover) and (pointer: fine)');
    const HAS_GSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
    const MOTION = !REDUCE && HAS_GSAP && !html.classList.contains('no-anim');
    if (!MOTION) html.classList.add('no-anim'); // never leave anything hidden that we won't animate

    const header = $('[data-header]');
    const toggle = header && $('.menu-toggle', header);
    const nav = doc.getElementById('site-nav');
    let lenis = null;
    let mm = null; // gsap.matchMedia() of the motion layer (reverted by fail())
    let velocityTick = null; // gsap.ticker callback of the marquee/floors (removed by fail())
    let dust = null; // hero dust controller
    let paused = false; // visitor pressed "Pause motion"
    let gamesPin = null; // ScrollTrigger of the pinned games sequence (desktop only)
    let scrollStamp = 0; // bumps on every scroll so cached rects know they are stale
    let ensureRest = () => {}; // builds the deferred below-the-fold layer now (assigned by initMotion)
    let liftIntro = () => {}; // ends the intro curtain at once (assigned by initMotion while it plays)
    let scrollGoal = null; // element a running programmatic scroll is heading for
    let anchorTween = null; // GSAP-driven anchor scroll when Lenis is missing

    /* 2. Rolling labels --------------------------------------------------------
       <span data-roll>Games</span> → a screen-reader copy + two stacked rows of
       per-letter spans; on hover each letter slides up (staggered) to reveal the clone. */
    const buildRoll = (el) => {
      const text = el.textContent.trim();
      if (!text) return;
      const row = (cls) => {
        const line = doc.createElement('span');
        line.className = cls;
        [...text].forEach((c, i) => {
          const ch = doc.createElement('span');
          ch.className = 'ch';
          ch.style.setProperty('--ci', i);
          ch.textContent = c;
          line.appendChild(ch);
        });
        return line;
      };
      const inner = doc.createElement('span');
      inner.className = 'roll-inner';
      inner.setAttribute('aria-hidden', 'true');
      inner.append(row('roll-line'), row('roll-line roll-clone'));
      const sr = doc.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = text;
      el.textContent = '';
      el.append(sr, inner);
    };
    $$('[data-roll]').forEach(buildRoll);

    /* direction-aware fill on buttons: remember where the pointer crossed the edge */
    const setFillOrigin = (el, e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--x', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--y', `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    $$('.button').forEach((btn) => {
      btn.addEventListener('pointerenter', (e) => setFillOrigin(btn, e));
      btn.addEventListener('pointerleave', (e) => setFillOrigin(btn, e));
    });

    /* 3. Mobile menu ---------------------------------------------------------- */
    const isMenuOpen = () => !!header && header.classList.contains('menu-open');
    const setMenu = (open) => {
      if (!header || !toggle || open === isMenuOpen()) return;
      header.classList.toggle('menu-open', open);
      html.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      $$('main, footer, .skip-link').forEach((el) => { el.inert = open; });
      if (open) {
        header.classList.remove('is-hidden');
        if (lenis) lenis.stop();
        setTimeout(() => { const first = nav && $('a', nav); if (first && isMenuOpen()) first.focus({ preventScroll: true }); }, 360);
      } else if (lenis) {
        lenis.start();
      }
    };
    if (toggle) toggle.addEventListener('click', () => setMenu(!isMenuOpen()));
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMenuOpen()) { setMenu(false); toggle.focus(); }
    });
    // the external CTA closes the sheet too (in-page links are handled in §5)
    if (nav) $$('a:not([href^="#"])', nav).forEach((a) => a.addEventListener('click', () => setMenu(false)));
    onMedia('(min-width: 851px)', (e) => { if (e.matches) setMenu(false); });
    menuWired = true;

    /* 4. Header: solid once scrolled; hides on the way down, returns on the way up */
    const headerState = (y, dir) => {
      if (!header) return;
      header.classList.toggle('is-scrolled', y > 30);
      if (!MOTION || isMenuOpen()) return;
      if (dir > 0 && y > 260) header.classList.add('is-hidden');
      else if (dir < 0 || y < 120) header.classList.remove('is-hidden');
    };
    if (header) header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
    const bindNativeHeader = () => {
      let lastY = window.scrollY;
      let queued = false;
      window.addEventListener('scroll', () => {
        scrollStamp++;
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { const y = window.scrollY; headerState(y, Math.sign(y - lastY)); lastY = y; queued = false; });
      }, { passive: true });
      headerState(window.scrollY, 0);
    };

    /* 5. In-page anchors -------------------------------------------------------
       Lenis-aware with a header offset; "#games" lands on the finished set piece;
       focus moves to the target and the hash is kept in the URL. */
    const quintInOut = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);
    const targetY = (hash) => {
      if (hash === '#top') return 0;
      const el = byHash(hash);
      if (!el) return null;
      if (hash === '#games' && gamesPin) return gamesPin.end;
      return el.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0) + 1;
    };
    const scrollToHash = (hash, immediate = false) => {
      ensureRest(); // its one refresh lands before we measure, never mid-scroll
      const y = targetY(hash);
      if (y === null) return;
      const focusEl = byHash(hash);
      scrollGoal = focusEl;
      if (anchorTween) { anchorTween.kill(); anchorTween = null; }
      if (lenis) {
        lenis.resize(); // re-sync Lenis with late pin spacers and the browser's own hash jump
        lenis.scrollTo(y, { immediate, force: true, duration: 1.6, easing: quintInOut });
      } else if (MOTION && !immediate && !html.classList.contains('no-anim')) {
        /* no Lenis but ScrollTrigger is live: native smooth scrolling would be cancelled by
           its refreshes, so tween the scroll ourselves toward a live target (a refresh or
           late layout shift mid-flight just bends the path) */
        const y0 = window.scrollY, p = { t: 0 };
        anchorTween = window.gsap.to(p, {
          t: 1, duration: 1.4, ease: 'none',
          onUpdate: () => { const to = targetY(hash); if (to !== null) window.scrollTo(0, y0 + (to - y0) * quintInOut(p.t)); },
          onComplete: () => { anchorTween = null; },
        });
      } else window.scrollTo({ top: y, behavior: immediate || REDUCE ? 'auto' : 'smooth' });
      if (focusEl) {
        if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
        focusEl.focus({ preventScroll: true });
      }
    };
    // the visitor taking the wheel (or keys) cancels a GSAP-driven anchor scroll
    ['wheel', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, () => {
      if (anchorTween) { anchorTween.kill(); anchorTween = null; }
    }, { passive: true }));
    doc.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const hash = a.getAttribute('href');
      if (!byHash(hash)) return;
      e.preventDefault();
      setMenu(false);
      liftIntro(); // activated (by keyboard) under the first-visit curtain: lift it now, then scroll
      scrollToHash(hash);
      if (history.replaceState) history.replaceState(null, '', hash === '#top' ? location.pathname + location.search : hash);
    });

    /* Keyboard focus outranks an in-flight smooth scroll: if Tab moves focus outside the
       element a running Lenis scroll is heading for, re-aim at the focused control (or
       simply stop, when it is already in view), so focus is never left off-screen. */
    doc.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!lenis || lenis.isScrolling !== 'smooth' || !el || el === doc.body || !el.matches || !el.matches(':focus-visible')) return;
      if (scrollGoal && scrollGoal.contains(el)) return;
      scrollGoal = null;
      const headH = header ? header.offsetHeight : 0;
      const r = el.getBoundingClientRect();
      if (r.top >= headH + 8 && r.bottom <= window.innerHeight - 8) { lenis.stop(); lenis.start(); return; } // in view: just stop here
      lenis.scrollTo(window.scrollY + r.top - headH - 24, { duration: 0.5, force: true, easing: quintInOut });
    });

    /* 6. Hero gold-dust canvas -------------------------------------------------
       Slow rising embers drawn from a pre-rendered glow sprite (additive blend).
       The pointer pushes particles away and makes nearby ones flare.
       Cost control: the backing store is rendered at ~¾ resolution (the glows
       are soft, CSS scales it up), low-end/touch devices draw at 30fps, and the
       loop only runs once played, while ≥15% of the hero is on screen, the tab
       is visible and motion isn't paused. A ResizeObserver keeps the bitmap
       matched to its box without respawning the field. */
    const heroDust = (canvas, animate) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const sprite = doc.createElement('canvas');
      sprite.width = sprite.height = 64;
      const sctx = sprite.getContext('2d');
      const g = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,244,205,1)');
      g.addColorStop(0.18, 'rgba(255,214,90,.85)');
      g.addColorStop(0.45, 'rgba(244,194,27,.22)');
      g.addColorStop(1, 'rgba(244,194,27,0)');
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 64, 64);

      const LOW = !FINE || (navigator.hardwareConcurrency || 8) <= 4;
      let w = 0, h = 0, parts = [], raf = 0, inView = true, playing = false, frame = 0;
      const R = 150, R2 = R * R;
      const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
      const spawn = (anywhere) => {
        const depth = Math.random();
        return {
          x: Math.random() * w,
          y: anywhere ? Math.random() * h : h + 12,
          vx: (Math.random() - 0.5) * 0.14,
          vy: -(0.1 + depth * 0.4),
          r: 0.5 + depth * depth * 2.5,
          a: 0.22 + depth * 0.62,
          tw: Math.random() * Math.PI * 2,
          ts: 0.008 + Math.random() * 0.03,
          ox: 0, oy: 0,
        };
      };
      const resize = (cw, ch) => {
        if (!cw || !ch || (Math.abs(cw - w) < 1 && Math.abs(ch - h) < 1)) return false;
        const sx = w ? cw / w : 1, sy = h ? ch / h : 1;
        w = cw; h = ch;
        const res = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
        canvas.width = Math.round(w * res);
        canvas.height = Math.round(h * res);
        ctx.setTransform(res, 0, 0, res, 0, 0);
        // keep the existing field: rescale positions, then top up / trim to the new density
        parts.forEach((p) => { p.x *= sx; p.y *= sy; });
        const n = Math.round(Math.min(110, Math.max(30, (w * h) / 12500)));
        while (parts.length < n) parts.push(spawn(true));
        parts.length = n;
        return true;
      };
      const draw = (k = 1) => {
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const ease = 1 - 0.82 ** k, damp = 0.92 ** k;
        pointer.x += (pointer.tx - pointer.x) * ease;
        pointer.y += (pointer.ty - pointer.y) * ease;
        for (const p of parts) {
          p.tw += p.ts * k;
          p.x += (p.vx + Math.sin(p.tw * 0.6) * 0.07) * k;
          p.y += p.vy * k;
          let flare = 0;
          const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1;
            const f = 1 - d / R;
            p.ox += (dx / d) * f * 2.4 * k;
            p.oy += (dy / d) * f * 2.4 * k;
            flare = f;
          }
          p.ox *= damp; p.oy *= damp;
          if (p.y < -16) Object.assign(p, spawn(false));
          if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
          const s = p.r * (6 + flare * 5);
          ctx.globalAlpha = Math.min(1, p.a * (0.55 + 0.45 * Math.sin(p.tw)) + flare * 0.6);
          ctx.drawImage(sprite, p.x + p.ox - s / 2, p.y + p.oy - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      };
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (LOW && (frame++ & 1)) return; // 30fps on coarse pointers / few cores
        draw(LOW ? 2 : 1);
      };
      const start = () => { if (!raf && animate && playing && inView && !paused && !doc.hidden) raf = requestAnimationFrame(loop); };
      const stop = () => { cancelAnimationFrame(raf); raf = 0; };

      const box = () => { const r = canvas.getBoundingClientRect(); return [r.width, r.height]; };
      resize(...box());
      draw();
      if ('ResizeObserver' in window) {
        new ResizeObserver(([en]) => {
          const cr = en.contentRect;
          if (resize(cr.width, cr.height)) draw(0);
        }).observe(canvas);
      } else {
        window.addEventListener('resize', () => { if (resize(...box())) draw(0); });
      }
      const ctl = { play() { playing = true; start(); }, pause(p) { if (p) stop(); else start(); } };
      if (!animate) return ctl;
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([en]) => {
          inView = en.isIntersecting && en.intersectionRatio >= 0.15;
          if (inView) start(); else stop();
        }, { threshold: [0, 0.15, 0.3] }).observe(canvas);
      }
      doc.addEventListener('visibilitychange', () => (doc.hidden ? stop() : start()));
      if (FINE) {
        window.addEventListener('pointermove', (e) => {
          if (e.pointerType !== 'mouse') return;
          pointer.tx = e.clientX;
          pointer.ty = e.clientY + window.scrollY; // the canvas sits at the very top of the document
          if (pointer.x < -9e3) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
        }, { passive: true });
        html.addEventListener('mouseleave', () => { pointer.tx = pointer.ty = -1e4; });
      }
      return ctl;
    };
    const dustCanvas = $('.hero-dust');
    if (dustCanvas) dust = heroDust(dustCanvas, !REDUCE);

    /* 6b. Pause-motion toggle (WCAG 2.2.2) --------------------------------------
       Freezes every self-running loop (CSS loops via html.paused, the dust and
       the marquee drift); scroll-linked motion stays, since the visitor drives
       it. The choice is remembered on this device. */
    const pauseBtn = $('[data-motion-toggle]');
    const setPaused = (p, save) => {
      paused = p;
      html.classList.toggle('paused', p);
      if (pauseBtn) pauseBtn.setAttribute('aria-pressed', String(p));
      if (dust) dust.pause(p);
      if (save) { try { localStorage.setItem('trd-paused', p ? '1' : '0'); } catch (e) { /* storage blocked */ } }
    };
    if (pauseBtn && !REDUCE) {
      pauseBtn.hidden = false;
      pauseBtn.addEventListener('click', () => setPaused(!paused, true));
      let saved = null;
      try { saved = localStorage.getItem('trd-paused'); } catch (e) { /* storage blocked */ }
      if (saved === '1') setPaused(true, false);
    }

    /* Static tiers stop here -------------------------------------------------- */
    if (!MOTION) {
      if (dust) dust.play();
      bindNativeHeader();
      // ScrollTrigger registers itself on load and keeps a rAF loop alive; the static page never needs it
      // (only touched with its core present: without gsap, disable() throws)
      if (HAS_GSAP) { try { window.ScrollTrigger.disable(false); } catch (e) { /* ignore */ } }
      return;
    }

    /* 7. Motion ---------------------------------------------------------------- */
    const { gsap, ScrollTrigger } = window;
    const SplitText = window.SplitText;
    const HAS_SPLIT = typeof SplitText !== 'undefined';
    const splits = [];
    let lenisRaf = null;
    let heroStarted = false;
    let heroEntrance = () => {}; // assigned by buildHero()
    let onEntranceDone = () => {}; // assigned by initMotion(): builds the below-the-fold layer

    const fail = (err) => {
      window.__trdError = String((err && err.stack) || err);
      try { if (mm) mm.revert(); } catch (e) { /* keep rolling back */ }
      try {
        splits.forEach((s) => s.revert());
        ScrollTrigger.getAll().forEach((t) => t.kill());
        gsap.globalTimeline.clear();
        gsap.set($$('[data-hero],[data-reveal],[data-split],[data-lines],[data-line],.hero-inner,.hero-dust,.frame-media img,.frame-ticks i,.frame-cap,[data-frame-media],.game-card,.game-art,.game-art-inner,.game-scene,.game-info>*,.game-badge,.game-art-label .lm>*,[data-depth],.studio-image,[data-studio-media],.image-caption,.footer-word span,.horizon-sun,.ticker-track,.site-header>*,.header-progress'), { clearProps: 'all' });
      } catch (e) { /* keep rolling back */ }
      if (anchorTween) { anchorTween.kill(); anchorTween = null; }
      if (velocityTick) gsap.ticker.remove(velocityTick);
      if (lenisRaf) gsap.ticker.remove(lenisRaf);
      if (lenis) { lenis.destroy(); lenis = null; }
      try { ScrollTrigger.disable(false); } catch (e) { /* ignore */ }
      const card = $('.game-card');
      if (card) card.classList.remove('is-cinematic');
      html.classList.remove('show-intro', 'marquee-js');
      html.classList.add('no-anim');
      if (dust) dust.play();
      bindNativeHeader();
    };

    // a visitor who switches on "reduce motion" mid-visit gets the calm page right away
    onMedia('(prefers-reduced-motion: reduce)', (e) => { if (e.matches) location.reload(); });

    try {
      initMotion();
    } catch (err) {
      fail(err);
    }

    function initMotion() {
      gsap.registerPlugin(ScrollTrigger);
      if (HAS_SPLIT) gsap.registerPlugin(SplitText);
      let EASE = 'expo.out';
      let WIPE = 'power4.inOut';
      if (typeof window.CustomEase !== 'undefined') {
        gsap.registerPlugin(window.CustomEase);
        window.CustomEase.create('lux', 'M0,0 C0.16,1 0.3,1 1,1');   // long expo-style settle
        window.CustomEase.create('wipe', 'M0,0 C0.77,0 0.18,1 1,1');  // film wipe for every clip-path curtain
        EASE = 'lux';
        WIPE = 'wipe';
      }
      gsap.defaults({ ease: EASE });
      // we refresh ourselves once fonts settle (and the body observer catches the rest),
      // so the window "load" refresh never lands inside the hero entrance
      ScrollTrigger.config({ autoRefreshEvents: 'visibilitychange,DOMContentLoaded,resize' });

      /* Lenis smooth scroll on GSAP's ticker */
      if (typeof window.Lenis !== 'undefined') {
        lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, autoRaf: false });
        lenis.on('scroll', ScrollTrigger.update);
        lenisRaf = (t) => { if (lenis) lenis.raf(t * 1000); };
        gsap.ticker.add(lenisRaf);
        ScrollTrigger.addEventListener('refresh', () => { if (lenis && lenis.dimensions) lenis.dimensions.resize(); });
      }
      // during the entrance a main-thread stall slows the motion instead of skipping it;
      // afterwards (Lenis' recommendation) GSAP time follows real time exactly
      gsap.ticker.lagSmoothing(100, 33);
      // header state follows every kind of scroll (wheel via Lenis, keyboard, focus, scrollbar)
      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => { scrollStamp++; headerState(self.scroll(), self.direction); } });
      ScrollTrigger.addEventListener('scrollEnd', () => { scrollGoal = null; }); // a finished scroll has no goal left
      headerState(window.scrollY, 0);

      mm = gsap.matchMedia();
      const rememberPlace = keepPlace();

      /* Above the fold first, in page order: the pinned games sequence must exist
         before any trigger below it is measured, so they all account for its spacer. */
      buildGames(mm, WIPE);
      buildHeaderProgress();
      buildHero(mm, WIPE);
      buildVelocity();
      buildIdle();
      if (FINE && !media('(forced-colors: active)')) buildTactile();

      /* Below the fold (split-line reveals, studio, quote, finale) is built after
         the hero entrance — or as soon as the visitor heads down — so the boot
         task stays short and nothing re-splits mid-entrance. Created after the
         pin, so their positions include its spacer. */
      let restBuilt = false;
      const onEarlyScroll = () => { if (window.scrollY > window.innerHeight * 0.2) buildRest(); };
      function buildRest() {
        if (restBuilt) return;
        restBuilt = true;
        window.removeEventListener('scroll', onEarlyScroll);
        try {
          buildRevealsIn($('#games'), WIPE);
          buildRevealsIn($('#studio'), WIPE);
          buildStudio(mm, WIPE);
          buildRevealsIn($('.quote-section'), WIPE);
          buildQuote();
          buildRevealsIn($('#contact'), WIPE);
          buildFinale();
          syncRefresh();
        } catch (err) { fail(err); }
      }
      const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 700 }) : (fn) => setTimeout(fn, 1);
      onEntranceDone = () => {
        gsap.ticker.lagSmoothing(lenis ? 0 : 500, 33);
        idle(buildRest);
      };
      window.addEventListener('scroll', onEarlyScroll, { passive: true });
      ensureRest = buildRest;

      /* keep trigger positions honest after late layout changes */
      let refreshTimer, lastH = doc.body.offsetHeight;
      const syncRefresh = () => { clearTimeout(refreshTimer); lastH = doc.body.offsetHeight; ScrollTrigger.refresh(); };
      const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(syncRefresh, 120); };
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => { const hgt = doc.body.offsetHeight; if (Math.abs(hgt - lastH) > 2) { lastH = hgt; refreshSoon(); } }).observe(doc.body);
      }
      /* Fonts settle → one synchronous refresh (before the entrance on the no-intro path).
         document.fonts.ready alone resolves too early: the Google Fonts sheet is
         applied late (media="print" swap), so wait for that sheet, then ask for the
         three families explicitly. Capped so the hero is never held past ~1.2s. */
      const fontsSettled = new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, Math.min(600, 1200 - performance.now())));
        if (!doc.fonts || !doc.fonts.load) { resolve(); return; }
        const want = () => Promise.all(['800 1em Manrope', 'italic 400 1em "Instrument Serif"', '400 1em "DM Sans"'].map((f) => doc.fonts.load(f)))
          .then(() => doc.fonts.ready).then(resolve, resolve);
        const sheet = $('link[rel="stylesheet"][href*="fonts.googleapis"]');
        if (sheet && sheet.media === 'print') {
          sheet.addEventListener('load', () => setTimeout(want, 0), { once: true }); // after its inline onload flips media
          sheet.addEventListener('error', resolve, { once: true });
        } else want();
      });
      fontsSettled.then(() => { if (Math.abs(doc.body.offsetHeight - lastH) > 2) syncRefresh(); });
      if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', () => { if (Math.abs(doc.body.offsetHeight - lastH) > 2) refreshSoon(); });

      /* deep links: the browser jumps before pin spacers and split text settle,
         so build everything now and re-land after every refresh in the first
         seconds, until the visitor scrolls */
      const hash = byHash(location.hash) ? location.hash : '';
      if (hash) {
        buildRest();
        let userMoved = false;
        const until = performance.now() + 4500;
        ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => window.addEventListener(ev, () => { userMoved = true; }, { once: true, passive: true }));
        const reland = () => { if (!userMoved && performance.now() < until) { scrollToHash(hash, true); rememberPlace(); } };
        ScrollTrigger.addEventListener('refresh', reland);
        window.addEventListener('load', () => requestAnimationFrame(reland), { once: true });
      }

      /* Intro handoff --------------------------------------------------------
         The curtain is pure CSS (its clock starts at first paint). The hero
         starts on the curtain's lift, read from the running animation itself,
         so a late first paint can never make the two drift apart. */
      const intro = $('.intro');
      const introOn = html.classList.contains('show-intro') && intro && getComputedStyle(intro).display !== 'none';
      if (!introOn) {
        // no curtain: start once fonts have settled (no re-split mid-entrance), two frames after the heavy init
        fontsSettled.then(() => requestAnimationFrame(() => requestAnimationFrame(heroIn)));
        return;
      }
      if (lenis && !location.hash) lenis.stop();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        liftIntro = () => {};
        heroIn();
        html.classList.remove('show-intro');
        if (lenis && !isMenuOpen()) lenis.start();
      };
      liftIntro = finish;
      const lift = intro.getAnimations ? intro.getAnimations().find((a) => a.animationName === 'introOut') : null;
      if (lift) {
        const delayMs = 900; // matches the CSS animation-delay of introOut
        setTimeout(heroIn, Math.max(0, delayMs - (lift.currentTime || 0) - 40));
        lift.finished.then(finish, finish);
      } else {
        intro.addEventListener('animationstart', (e) => { if (e.animationName === 'introOut') heroIn(); });
        intro.addEventListener('animationend', (e) => { if (e.animationName === 'introOut') finish(); });
      }
      setTimeout(finish, 2600); // safety net: the curtain never blocks longer than this
    }

    /* Keep the reader's place across resizes: a breakpoint rebuild (matchMedia)
       can reset the scroll to the top, and a pin appearing / changing length
       moves everything below it. Remember which section is on top and how far
       into it (on every scroll end), and after the refreshes that follow a
       resize / rotation put the reader back there — unless they are scrolling
       at that moment. Returns remember() for code that moves the page itself. */
    function keepPlace() {
      const anchors = $$('main > section, footer');
      const SETTLE = 1200; // ms after a resize during which refreshes restore the place
      let place = null, resizedAt = -1e4, lastInput = -1e4;
      const remember = () => {
        const el = anchors.find((s) => s.getBoundingClientRect().bottom > 0);
        place = el ? { el, ratio: -el.getBoundingClientRect().top / Math.max(1, el.offsetHeight) } : null;
      };
      const settling = () => performance.now() - resizedAt < SETTLE;
      ['wheel', 'touchmove', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true }));
      window.addEventListener('resize', () => { resizedAt = performance.now(); });
      ScrollTrigger.addEventListener('scrollEnd', () => { if (!settling()) remember(); });
      ScrollTrigger.addEventListener('refresh', () => {
        if (!settling()) { remember(); return; }
        if (!place || performance.now() - lastInput < 300 || isMenuOpen()) return;
        const r = place.el.getBoundingClientRect();
        const y = Math.round(r.top + window.scrollY + place.ratio * r.height);
        if (Math.abs(y - window.scrollY) <= 1) return;
        if (lenis) { lenis.resize(); lenis.scrollTo(y, { immediate: true, force: true }); } else window.scrollTo(0, y);
      });
      return remember;
    }

    /* Hero entrance ------------------------------------------------------------ */
    function heroIn() {
      if (heroStarted) return;
      heroStarted = true;
      if (dust) dust.play();
      try { heroEntrance(); } catch (err) { fail(err); }
    }

    /* SplitText helpers: autoSplit re-splits on resizes (and late font swaps) and
       keeps the animation's progress, so line breaks are always correct.
       Line-only splits never break a word, so they stay plain text for screen
       readers (aria: 'none'); no aria-label lands on a <p>. */
    function lineReveal(el, { delay = 0, scroll = true, y = 105, duration = 1.15, stagger = 0.07 } = {}) {
      if (!el) return;
      const st = scroll ? { trigger: el, start: 'top 90%', once: true } : undefined;
      if (!HAS_SPLIT) {
        gsap.fromTo(el, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.2, delay, scrollTrigger: st });
        return;
      }
      splits.push(SplitText.create(el, {
        type: 'lines', mask: 'lines', linesClass: 'line', autoSplit: true, aria: 'none',
        onSplit(self) {
          gsap.set(el, { opacity: 1 });
          return gsap.from(self.lines, { yPercent: y, duration, stagger, delay, scrollTrigger: st });
        },
      }));
    }

    function buildHero(mm, WIPE) {
      const frame = $('.hero-frame');
      heroEntrance = () => {
        // booted late (slow network)? play the same entrance, faster, so the copy is readable sooner
        const speed = performance.now() > 1400 ? 1.8 : 1;
        const tl = gsap.timeline({ defaults: { duration: 1.3 }, onComplete: () => onEntranceDone() });
        const title = $('.hero-title');
        if (title && HAS_SPLIT) {
          splits.push(SplitText.create(title, {
            type: 'lines,words,chars', mask: 'lines', linesClass: 'line', autoSplit: true,
            onSplit(self) {
              gsap.set(title, { opacity: 1 });
              return gsap.from(self.chars, { yPercent: 118, rotate: 6, duration: 1.35, stagger: 0.022, delay: 0.05 }).timeScale(speed);
            },
          }));
        } else if (title) {
          tl.fromTo(title, { opacity: 0, y: 40 }, { opacity: 1, y: 0 }, 0.05);
        }
        lineReveal($('.hero-copy'), { scroll: false, delay: 0.45 / speed, duration: 1.2 / speed });
        tl.fromTo('.hero-eyebrow', { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 1 }, 0.1)
          .from('.hero-eyebrow .eyebrow-line', { scaleX: 0, duration: 1.1 }, 0.1)
          .set('.hero-actions', { opacity: 1 }, 0)
          .from('.hero-actions > *', { opacity: 0, y: 26, duration: 1.1, stagger: 0.08 }, 0.6)
          // the frame wipes up while the still inside counter-zooms
          .fromTo(frame, { opacity: 1, clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: WIPE, clearProps: 'clipPath' }, 0)
          .from('.hero-frame .frame-media img', { scale: 1.45, duration: 2.2 }, 0)
          .from('.hero-frame .frame-ticks i', { opacity: 0, scale: 0.4, duration: 0.8, stagger: 0.06 }, 0.9)
          .from('.frame-cap', { opacity: 0, y: 10, duration: 0.8 }, 1.1)
          .fromTo('.hero-foot', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1.1 }, 0.8)
          .fromTo('.hero-dust', { opacity: 0 }, { opacity: 1, duration: 2.2, ease: 'none' }, 0)
          .fromTo(['.site-header > .brand', '.site-header > .nav', '.site-header > .menu-toggle'],
            { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08, clearProps: 'transform' }, 0.25);
        tl.timeScale(speed);
      };

      /* Leaving the hero feels like moving into the scene: the copy recedes in
         layers, the framed still drifts and grows (desktop only). Wrappers and
         properties differ from the entrance, so the two never fight. */
      mm.add('(min-width: 851px)', () => {
        gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
          .to('.hero-eyebrow', { y: -170 }, 0)
          .to('.hero-title', { y: -140 }, 0)
          .to('.hero-copy', { y: -105 }, 0)
          .to('.hero-actions', { y: -80 }, 0)
          .to('.hero-inner', { opacity: 0.1 }, 0)
          .to(frame, { y: -50, scale: 1.1 }, 0)
          .to('[data-frame-media]', { yPercent: 9 }, 0);
      });
    }

    /* Header progress + active section -------------------------------------- */
    function buildHeaderProgress() {
      gsap.to('.header-progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.4 } });
      $$('.nav-link').forEach((link) => {
        const sec = $(link.getAttribute('href'));
        if (!sec) return;
        ScrollTrigger.create({ trigger: sec, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => link.classList.toggle('is-active', self.isActive) });
      });
    }

    /* Section reveals (scoped: built per section, after the hero entrance) ----- */
    function buildRevealsIn(scope, WIPE) {
      if (!scope) return;
      // eyebrow rows: the gold rule draws, then the label and its serif index slide in
      $$('[data-reveal="meta"]', scope).forEach((meta) => {
        gsap.timeline({ scrollTrigger: { trigger: meta, start: 'top 90%', once: true } })
          .set(meta, { opacity: 1 })
          .from($('.eyebrow-line', meta), { scaleX: 0, duration: 1.1 }, 0)
          .from($('.eyebrow', meta), { opacity: 0, x: -10, duration: 1 }, 0.05)
          .from($('.section-num', meta), { opacity: 0, y: 8, duration: 0.9 }, 0.25);
      });

      // headings: masked line rise
      $$('h2[data-split]', scope).forEach((h) => {
        const st = { trigger: h, start: 'top 88%', once: true };
        if (!HAS_SPLIT) { gsap.fromTo(h, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.2, scrollTrigger: st }); return; }
        splits.push(SplitText.create(h, {
          type: 'lines', mask: 'lines', linesClass: 'line', autoSplit: true, aria: 'none',
          onSplit(self) {
            gsap.set(h, { opacity: 1 });
            return gsap.from(self.lines, { yPercent: 112, duration: 1.4, stagger: 0.11, scrollTrigger: st });
          },
        }));
      });

      // body copy: line-by-line masked rise
      $$('[data-lines]', scope).forEach((p) => lineReveal(p, { delay: 0.12 }));

      // anything else (e.g. the email): opacity + rise, never visibility, so links stay focusable
      $$('[data-reveal]:not([data-reveal="meta"])', scope).forEach((el) => {
        gsap.fromTo(el, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.2, delay: 0.2, clearProps: 'transform', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
      });

      // hairlines draw out from the centre; principle rows cascade in (CSS transitions)
      $$('[data-line]', scope).forEach((line) => {
        gsap.to(line, { scaleX: 1, duration: 1.8, ease: WIPE, scrollTrigger: { trigger: line, start: 'top 92%', once: true } });
      });
      $$('[data-principles]', scope).forEach((list) => {
        ScrollTrigger.create({ trigger: list, start: 'top 88%', once: true, onEnter: () => list.classList.add('is-in') });
      });
    }

    /* Scroll velocity drives the world ------------------------------------------
       One loop: the marquee drifts, speeds up, flips with scroll direction and
       leans into fast scrolls; the CSS grid floors (game card + finale) run
       faster or backwards through their WAAPI playbackRate. */
    function buildVelocity() {
      const track = $('[data-marquee]');
      const floors = $$('[data-floor]').map((el) => (el.getAnimations ? el.getAnimations()[0] : null)).filter(Boolean);
      floors.forEach((a) => { try { a.currentTime = (a.currentTime || 0) + 36e5; } catch (e) { /* ignore */ } }); // room to run backwards

      let x = 0, w = 0, dir = 1, skew = 0, boost = 0, rate = 1, lastRate = 1, tickerOn = false;
      if (track) {
        html.classList.add('marquee-js');
        const measure = () => { w = track.firstElementChild.getBoundingClientRect().width; };
        measure();
        if (doc.fonts) doc.fonts.ready.then(measure);
        window.addEventListener('resize', measure);
        // seeded on every refresh too, so a deep link / restored scroll never leaves it running off-screen
        const seen = (s) => { tickerOn = s.isActive; };
        ScrollTrigger.create({ trigger: '.ticker', start: 'top bottom', end: 'bottom top', onToggle: seen, onRefresh: seen });
        gsap.from('.ticker-group', { yPercent: 40, opacity: 0, duration: 1.4, scrollTrigger: { trigger: '.ticker', start: 'top 92%', once: true } });
      }
      velocityTick = (time, dt) => {
        const v = lenis ? lenis.velocity : 0;
        if (v > 0.3) dir = 1; else if (v < -0.3) dir = -1;
        if (track && tickerOn && w && !paused) {
          boost += (Math.min(Math.abs(v) * 32, 1500) - boost) * 0.08;
          x -= ((55 + boost) * dir * dt) / 1000;
          if (x <= -w) x += w; else if (x > 0) x -= w;
          skew += (Math.max(-7, Math.min(7, -v * 0.22)) - skew) * 0.1;
          track.style.transform = `translate3d(${x.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
        }
        if (floors.length) {
          rate += (gsap.utils.clamp(-5, 5, dir * (1 + Math.abs(v) * 0.12)) - rate) * 0.08;
          if (Math.abs(rate - lastRate) > 0.02) {
            lastRate = rate;
            floors.forEach((a) => { a.playbackRate = Math.abs(rate) < 0.05 ? 0.05 : rate; });
          }
        }
      };
      gsap.ticker.add(velocityTick);
    }

    /* Games: the set piece -------------------------------------------------------
       Desktop: the card pins, a rounded aperture opens to full bleed, the art
       slides aside and the details arrive. Info items hide with opacity only
       (keyboard focus scrubs to the end), and "#games" links land on the end. */
    function buildGames(mm, WIPE) {
      const card = $('.game-card');
      if (!card) return;
      const art = $('.game-art', card);
      const inner = $('.game-art-inner', card);
      const scene = $('.game-scene', card);
      const info = $('.game-info', card);
      const infoItems = Array.from(info.children);
      const label = $$('.game-art-label .lm > *', card);
      const badge = $('.game-badge', card);

      mm.add('(min-width: 1024px) and (min-height: 640px)', () => {
        card.classList.add('is-cinematic');
        const share = () => info.offsetWidth / card.offsetWidth; // 0..1 of the card's width
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          // centred in the viewport, but never tucked under the fixed header on short screens
          scrollTrigger: { trigger: '.game-stage', start: () => `center ${Math.round(Math.max(window.innerHeight / 2, (header ? header.offsetHeight : 0) + card.offsetHeight / 2 + 10))}px`, end: '+=100%', pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1 },
        });
        // the card's own chrome (surface, border, top light) arrives only as the aperture reaches
        // full bleed, so the window first opens on true black instead of on a grey slab
        tl.fromTo(card, { '--chrome': 0 }, { '--chrome': 1, duration: 0.4 }, 0.7)
          .fromTo(art, { clipPath: 'inset(9% 16% 9% 16% round 22px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 1, ease: 'power2.inOut' }, 0)
          .fromTo(scene, { scale: 1.35 }, { scale: 1.06, duration: 1, ease: 'power2.inOut' }, 0)
          .fromTo(badge, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.35 }, 0.55)
          .fromTo(label, { yPercent: 110 }, { yPercent: 0, duration: 0.45, stagger: 0.08, ease: 'power3.out' }, 0.5)
          .to(art, { clipPath: () => `inset(0% ${(share() * 100).toFixed(2)}% 0% 0% round 0px)`, duration: 1, ease: 'power3.inOut' }, 1.1)
          .to(inner, { xPercent: () => -share() * 50, duration: 1, ease: 'power3.inOut' }, 1.1)
          .to(scene, { scale: 1, duration: 1, ease: 'power3.inOut' }, 1.1)
          .fromTo(infoItems, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out' }, 1.5)
          .to({}, { duration: 0.3 }); // hold the final frame
        gamesPin = tl.scrollTrigger;

        const toEnd = (duration) => {
          if (!gamesPin || window.scrollY >= gamesPin.end - 2) return;
          scrollGoal = card;
          if (lenis) { lenis.resize(); lenis.scrollTo(gamesPin.end, { duration, easing: quintInOut }); }
          else window.scrollTo(0, gamesPin.end);
        };
        // keyboard users tabbing into the card are carried to the finished state
        const onFocus = (e) => { if (e.target.matches(':focus-visible')) toEnd(1); };
        card.addEventListener('focusin', onFocus);
        // a visitor who stops just short of the end (scrolling down) is eased onto the final frame;
        // anywhere earlier the half-open aperture stays exactly where they left it
        const onScrollEnd = () => {
          if (!gamesPin || !gamesPin.isActive || gamesPin.direction !== 1) return;
          if (gamesPin.progress > 0.8 && gamesPin.progress < 0.97) toEnd(0.8);
        };
        ScrollTrigger.addEventListener('scrollEnd', onScrollEnd);
        return () => {
          card.classList.remove('is-cinematic');
          card.style.removeProperty('--chrome');
          card.removeEventListener('focusin', onFocus);
          ScrollTrigger.removeEventListener('scrollEnd', onScrollEnd);
          gamesPin = null;
        };
      });

      mm.add('(max-width: 1023px), (max-height: 639px)', () => {
        gsap.timeline({ scrollTrigger: { trigger: card, start: 'top 85%', once: true } })
          .fromTo(card, { clipPath: 'inset(8% 6% 8% 6% round 40px)' }, { clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 1.6, ease: WIPE, clearProps: 'clipPath' }, 0)
          .fromTo(scene, { scale: 1.3 }, { scale: 1, duration: 2 }, 0)
          .fromTo(badge, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.8 }, 0.7)
          .fromTo(label, { yPercent: 110 }, { yPercent: 0, duration: 1, stagger: 0.08 }, 0.7);
        gsap.fromTo(infoItems, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.07, scrollTrigger: { trigger: info, start: 'top 88%', once: true } });
      });
    }

    /* Studio: the frame wipes up while the still counter-zooms; inner parallax */
    function buildStudio(mm, WIPE) {
      const fig = $('.studio-image');
      if (!fig) return;
      gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 82%', once: true } })
        .fromTo(fig, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: WIPE, clearProps: 'clipPath' }, 0)
        .from($('img', fig), { scale: 1.4, duration: 2.2 }, 0)
        .from($$('.frame-ticks i', fig), { opacity: 0, scale: 0.4, duration: 0.8, stagger: 0.06 }, 0.9)
        .from($('.image-caption', fig), { opacity: 0, y: 10, duration: 1 }, 1);
      mm.add('(min-width: 851px)', () => {
        gsap.fromTo('[data-studio-media]', { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    }

    /* Quote: words light up as you read (scrubbed) */
    function buildQuote() {
      const quote = $('[data-words]');
      if (!quote || !HAS_SPLIT) return;
      const s = SplitText.create(quote, { type: 'words', wordsClass: 'word' });
      splits.push(s);
      gsap.fromTo(s.words, { opacity: 0.12 }, {
        opacity: 1, ease: 'none', stagger: 0.12,
        scrollTrigger: { trigger: quote, start: 'top 85%', end: 'center 55%', scrub: 0.6 },
      });
    }

    /* Finale: the sun rises on the horizon and the wordmark lifts out of it,
       tied to the last scroll gesture of the page */
    function buildFinale() {
      const horizon = $('.horizon');
      if (!horizon) return;
      const st = { trigger: horizon, start: 'top bottom', end: 'max', scrub: 0.6 };
      gsap.fromTo('.horizon-sun', { yPercent: 24, scale: 0.78, opacity: 0.35 }, { yPercent: 0, scale: 1, opacity: 1, ease: 'none', scrollTrigger: st });
      gsap.fromTo('.footer-word span', { yPercent: 105 }, { yPercent: 0, ease: 'none', stagger: 0.06, scrollTrigger: st });
    }

    /* Off-screen sections pause every CSS loop inside them */
    function buildIdle() {
      $$('.hero, .ticker, .section, .quote-section, .site-footer').forEach((el) => {
        const set = (s) => el.classList.toggle('is-idle', !s.isActive);
        ScrollTrigger.create({ trigger: el, start: 'top bottom', end: 'bottom top', onToggle: set, onRefresh: set });
      });
    }

    /* 8. Tactile layer — fine pointers only ------------------------------------ */
    function buildTactile() {
      /* Custom cursor: precise dot + lagging ring; GSAP moves the wrappers, CSS scales the inner <i> */
      const cursor = doc.createElement('div');
      cursor.className = 'cursor is-away';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.innerHTML = '<div class="cursor-ring"><i></i><span class="cursor-label"></span></div><div class="cursor-dot"><i></i></div>';
      doc.body.appendChild(cursor);
      const ring = $('.cursor-ring', cursor);
      const dot = $('.cursor-dot', cursor);
      const label = $('.cursor-label', cursor);
      const ringX = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3' });
      const ringY = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3' });
      const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power2' });
      const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power2' });
      let shown = false;
      window.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        if (!shown) { gsap.set([ring, dot], { x: e.clientX, y: e.clientY }); html.classList.add('cursor-on'); shown = true; }
        cursor.classList.remove('is-away');
        // the label chip flips to the other side near the right / bottom edges
        cursor.classList.toggle('flip-x', e.clientX > window.innerWidth - 200);
        cursor.classList.toggle('flip-y', e.clientY > window.innerHeight - 90);
        ringX(e.clientX); ringY(e.clientY); dotX(e.clientX); dotY(e.clientY);
      }, { passive: true });
      html.addEventListener('mouseleave', () => cursor.classList.add('is-away'));
      html.addEventListener('mouseenter', () => cursor.classList.remove('is-away'));
      window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
      window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
      doc.addEventListener('pointerover', (e) => {
        const t = e.target.closest('a, button, [data-cursor]');
        const text = t && t.dataset.cursor;
        cursor.classList.toggle('is-label', !!text);
        cursor.classList.toggle('is-link', !!t && !text);
        if (text) label.textContent = text;
      });

      /* Magnetic elements: pulled toward the pointer with a weighted (not springy) settle */
      $$('[data-magnetic]').forEach((el) => {
        const k = el.dataset.magnetic === 'soft' ? 0.1 : 0.3;
        const opts = { duration: 0.8, ease: 'power3.out' };
        const xTo = gsap.quickTo(el, 'x', opts);
        const yTo = gsap.quickTo(el, 'y', opts);
        const inner = $('.roll', el);
        const ixTo = inner && gsap.quickTo(inner, 'x', opts);
        const iyTo = inner && gsap.quickTo(inner, 'y', opts);
        let rect = null, stamp = -1;
        const measure = () => {
          const r = el.getBoundingClientRect();
          rect = { cx: r.left - gsap.getProperty(el, 'x') + r.width / 2, cy: r.top - gsap.getProperty(el, 'y') + r.height / 2 };
          stamp = scrollStamp;
        };
        el.addEventListener('pointerenter', measure);
        el.addEventListener('pointermove', (e) => {
          if (!rect || stamp !== scrollStamp) measure();
          const dx = e.clientX - rect.cx, dy = e.clientY - rect.cy;
          xTo(dx * k); yTo(dy * k);
          if (inner) { ixTo(dx * k * 0.45); iyTo(dy * k * 0.45); }
        });
        el.addEventListener('pointerleave', () => { xTo(0); yTo(0); if (inner) { ixTo(0); iyTo(0); } rect = null; });
      });

      /* Pointer depth: layers drift at different depths under a soft spotlight.
         The game card itself never tilts, so it can't fight the pinned sequence. */
      const depthField = (el, { depth = 30, tilt = 0, light = false }) => {
        let spot = null, lx, ly, rx, ry;
        if (light) {
          spot = doc.createElement('span');
          spot.className = 'card-light';
          spot.setAttribute('aria-hidden', 'true');
          el.appendChild(spot);
          lx = gsap.quickTo(spot, 'x', { duration: 0.45, ease: 'power3' });
          ly = gsap.quickTo(spot, 'y', { duration: 0.45, ease: 'power3' });
        }
        if (tilt) {
          gsap.set(el, { transformPerspective: 1400 });
          rx = gsap.quickTo(el, 'rotationX', { duration: 0.9, ease: 'power3' });
          ry = gsap.quickTo(el, 'rotationY', { duration: 0.9, ease: 'power3' });
        }
        const layers = $$('[data-depth]', el).map((n) => ({
          d: parseFloat(n.dataset.depth) || 0,
          x: gsap.quickTo(n, 'x', { duration: 1.1, ease: 'power3' }),
          y: gsap.quickTo(n, 'y', { duration: 1.1, ease: 'power3' }),
        }));
        let r = null, stamp = -1;
        const measure = () => { r = el.getBoundingClientRect(); stamp = scrollStamp; };
        el.addEventListener('pointerenter', (e) => {
          measure();
          el.classList.add('is-hover');
          if (spot) gsap.set(spot, { x: e.clientX - r.left, y: e.clientY - r.top });
        });
        el.addEventListener('pointermove', (e) => {
          if (!r || stamp !== scrollStamp) measure();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          if (spot) { lx(e.clientX - r.left); ly(e.clientY - r.top); }
          if (tilt) { ry(px * tilt * 1.3); rx(-py * tilt); }
          layers.forEach((l) => { l.x(-px * depth * l.d); l.y(-py * depth * l.d); });
        });
        el.addEventListener('pointerleave', () => {
          el.classList.remove('is-hover');
          if (tilt) { rx(0); ry(0); }
          layers.forEach((l) => { l.x(0); l.y(0); });
        });
      };
      const gameCard = $('.game-card');
      if (gameCard) depthField(gameCard, { depth: 34, light: true });
      const studioImg = $('.studio-image[data-tilt]');
      if (studioImg) depthField(studioImg, { depth: 0, tilt: 5 });

      /* Hero frame turns gently toward the pointer; the still inside counter-moves */
      const frame = $('.hero-frame');
      const hero = $('.hero');
      if (frame && hero) {
        gsap.set(frame, { transformPerspective: 1200 });
        const fy = gsap.quickTo(frame, 'rotationY', { duration: 1.4, ease: 'power3' });
        const fx = gsap.quickTo(frame, 'rotationX', { duration: 1.4, ease: 'power3' });
        const img = $('.frame-media img', frame);
        const mx = gsap.quickTo(img, 'x', { duration: 1.6, ease: 'power3' });
        const my = gsap.quickTo(img, 'y', { duration: 1.6, ease: 'power3' });
        hero.addEventListener('pointermove', (e) => {
          const px = e.clientX / window.innerWidth - 0.5;
          const py = e.clientY / window.innerHeight - 0.5;
          fy(px * 9); fx(-py * 7); mx(-px * 18); my(-py * 14);
        });
        hero.addEventListener('pointerleave', () => { fy(0); fx(0); mx(0); my(0); });
      }
    }
  } // end boot()
})();
