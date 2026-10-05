/* ==========================================================================
   STARFALL — interaction & motion layer
   --------------------------------------------------------------------------
   Three tiers:
     • no JS          → plain, fully visible page with a CSS star sky
     • reduced motion → menu, anchors, one static starfield frame; no smooth
                        scroll, parallax, scrubbing, cursor, magnetism or tilt
     • full motion    → Lenis + GSAP choreography + living sky + tactile layer
   If anything throws while the motion layer boots, fail() rolls the page
   back to the static tier so nothing is ever left hidden; an exception
   anywhere else in boot does the same through the outer guard.

   Sections: 1 setup · 2 rolling labels · 3 menu · 4 header · 5 anchors
             6 the sky (starfield + shooting stars) · 6b pause-motion toggle
             7 motion (lenis, intro, hero, reveals, constellations, velocity,
             rift tear, the comet, the portal set piece, creator, quote,
             community, finale, idle, star CTAs, keep-place on resize)
             8 tactile (cursor, magnetic, depth, hero mark, social light)
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
    window.__sfError = String((err && err.stack) || err);
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
    let velocityTick = null; // gsap.ticker callback of the rift marquee (removed by fail())
    let sky = null; // starfield controller
    let comet = null; // the falling-star controller (desktop; destroyed by fail())
    let paused = false; // visitor pressed "Pause motion"
    let gamesPin = null; // ScrollTrigger of the pinned games sequence (desktop only)
    let scrollStamp = 0; // bumps on every scroll so cached rects know they are stale
    let ensureRest = () => {}; // builds the deferred below-the-fold layer up to a target now (assigned by initMotion)
    let liftIntro = () => {}; // ends the intro curtain at once (assigned by initMotion while it plays)
    let scrollGoal = null; // element a running programmatic scroll is heading for
    let anchorTween = null; // GSAP-driven anchor scroll when Lenis is missing
    let entranceDone = false; // the hero entrance has finished (the deferred layer may build freely)
    let riftLean = null; // the rift's lean wrapper: counter-scales the tear and carries the skew (§7 velocity / rift)

    /* The scroll position for per-frame loops, read without touching the DOM:
       Lenis' own value when it drives the page, else the last value a passive
       scroll listener saw (reading window.scrollY mid-frame, after GSAP has
       written styles, would force a synchronous style recalc). */
    let seenScrollY = window.scrollY;
    window.addEventListener('scroll', () => { seenScrollY = window.scrollY; }, { passive: true });
    const scrollPos = () => (lenis ? lenis.scroll : seenScrollY);

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
      if (sky) sky.cover(open); // the sheet is opaque: the sky rests behind it
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
    // external links in the sheet (CTA, socials) close it too (in-page links are handled in §5)
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
        requestAnimationFrame(() => { const y = seenScrollY; headerState(y, Math.sign(y - lastY)); lastY = y; queued = false; });
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
      ensureRest(byHash(hash)); // the target's own reveals exist before we measure (the rest stays queued)
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

    /* 6. The sky ---------------------------------------------------------------
       One fixed canvas behind every section: three depth layers of stars that
       twinkle and drift, parallax against the scroll (far layers barely move,
       near ones more), stretch into faint streaks on fast scrolls and lean
       away from the pointer. Now and then a shooting star crosses — the logo's
       gold star at its head, a cyan → blue comet tail behind it; near the
       finale they come as a shower.
       Cost control: pre-rendered glow sprites (additive blend), drawn at 1×
       (soft sprites gain nothing from more pixels, and every redraw uploads
       the whole bitmap), ~20fps for twinkle, drift and scroll parallax alike
       (~15 on coarse pointers / few cores), ~30 for the pointer lean, every
       frame only while a shooting star crosses; no work while the tab is
       hidden, motion is paused or the menu sheet covers it, no DOM reads per
       frame. Without motion it paints one still frame. */
    const makeSky = (canvas, animate) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const sprite = (size, stops) => {
        const c = doc.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        stops.forEach(([o, col]) => gr.addColorStop(o, col));
        g.fillStyle = gr;
        g.fillRect(0, 0, size, size);
        return c;
      };
      const DOT = sprite(32, [[0, 'rgba(255,255,255,1)'], [0.14, 'rgba(230,246,255,.95)'], [0.36, 'rgba(150,215,255,.24)'], [1, 'rgba(120,200,255,0)']]);
      const GOLD = sprite(32, [[0, 'rgba(255,251,230,1)'], [0.16, 'rgba(255,220,110,.95)'], [0.4, 'rgba(249,198,27,.26)'], [1, 'rgba(249,198,27,0)']]);
      const HALO = sprite(64, [[0, 'rgba(255,240,190,.9)'], [0.2, 'rgba(249,198,27,.42)'], [0.5, 'rgba(95,211,255,.12)'], [1, 'rgba(95,211,255,0)']]);
      // a 4-point sparkle (concave astroid) for the brightest near stars
      const SPARK = (() => {
        const s = 64, h = s / 2, c = doc.createElement('canvas');
        c.width = c.height = s;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(h, h, 0, h, h, h);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.25, 'rgba(210,240,255,.65)');
        gr.addColorStop(1, 'rgba(150,215,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, h); g.quadraticCurveTo(h, h, h, 0); g.quadraticCurveTo(h, h, s, h);
        g.quadraticCurveTo(h, h, h, s); g.quadraticCurveTo(h, h, 0, h);
        g.fill();
        g.drawImage(DOT, h - 9, h - 9, 18, 18);
        return c;
      })();
      const head = new Image();
      head.decoding = 'async';
      head.src = 'assets/brand/starfall-star-head.webp';

      // depth layers: share of the stars, scroll parallax, drift (px/s), radius / alpha ranges
      const LAYERS = [
        { share: 0.62, depth: 0.035, drift: 2.2, r: [0.35, 0.75], a: [0.28, 0.7] },
        { share: 0.3, depth: 0.09, drift: 4.5, r: [0.7, 1.15], a: [0.45, 0.88] },
        { share: 0.08, depth: 0.18, drift: 8, r: [1.1, 1.8], a: [0.65, 1] },
      ];
      const LOW = !FINE || (navigator.hardwareConcurrency || 8) <= 4;
      const rand = (a, b) => a + Math.random() * (b - a);
      let w = 0, h = 0, stars = [], meteors = [], raf = 0, last = 0, time = 0;
      let playing = false, covered = false, boosted = false, nextShot = 9;
      let lastY = scrollPos(), vel = 0;
      const ptr = { x: 0, y: 0, tx: 0, ty: 0 };

      const makeStar = (L) => {
        const l = LAYERS[L];
        const kind = L === 2 ? (Math.random() < 0.3 ? 2 : Math.random() < 0.15 ? 1 : 0) : (L === 1 && Math.random() < 0.06 ? 1 : 0);
        return { x: Math.random(), y: Math.random(), L, kind, r: rand(l.r[0], l.r[1]), a: rand(l.a[0], l.a[1]), tw: Math.random() * 6.3, ts: rand(0.5, 2.2) };
      };
      const populate = () => {
        const n = Math.round(Math.min(420, Math.max(130, (w * h) / 4200)));
        const want = LAYERS.map((l) => Math.round(n * l.share));
        const have = [0, 0, 0];
        stars = stars.filter((s) => (have[s.L] < want[s.L] ? (have[s.L]++, true) : false));
        LAYERS.forEach((l, i) => { while (have[i] < want[i]) { stars.push(makeStar(i)); have[i]++; } });
        stars.sort((p, q) => p.L - q.L);
      };
      const resize = (cw, ch) => {
        if (!cw || !ch || (Math.abs(cw - w) < 1 && Math.abs(ch - h) < 1)) return false;
        w = cw; h = ch;
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        populate(); // star positions are stored 0..1, so the field simply rescales
        return true;
      };

      const shoot = () => {
        const sc = Math.max(0.6, Math.min(1.15, w / 1440));
        const ang = rand(14, 30) * Math.PI / 180; // heading left and a little down
        const speed = rand(950, 1500) * sc;
        meteors.push({
          x: w * rand(0.35, 1.08), y: h * rand(-0.04, 0.42),
          vx: -Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          t: 0, life: rand(0.95, 1.4), len: rand(280, 460) * sc, size: rand(20, 28) * sc,
          rot: Math.random() * 6.3, spin: (Math.random() < 0.5 ? -1 : 1) * rand(1.5, 3.2), sc,
        });
      };

      const draw = (dt) => {
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const sy = animate ? scrollPos() : 0;
        const streak = Math.min(1, Math.abs(vel) / 4000);
        for (const s of stars) {
          const l = LAYERS[s.L];
          s.tw += s.ts * dt;
          // position: stored 0..1, drifted over time, parallaxed against scroll and pointer, wrapped
          let x = s.x * w - time * l.drift * 0.7 - ptr.x * l.depth * 140;
          let y = s.y * h + time * l.drift * 0.22 - sy * l.depth - ptr.y * l.depth * 90;
          x = ((x % w) + w) % w;
          y = ((y % h) + h) % h;
          const alpha = s.a * (0.58 + 0.42 * Math.sin(s.tw));
          ctx.globalAlpha = alpha;
          if (s.kind === 2) {
            const z = s.r * 16 * (0.85 + 0.15 * Math.sin(s.tw * 0.7));
            ctx.drawImage(SPARK, x - z / 2, y - z / 2, z, z);
            continue;
          }
          const z = s.r * 9;
          const st = streak * l.depth * 220; // fast scrolls pull stars into short streaks
          ctx.drawImage(s.kind ? GOLD : DOT, x - z / 2, y - z / 2 - st / 2, z, z + st);
        }
        // shooting stars
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.spin * dt;
          if (m.t >= m.life) { meteors.splice(i, 1); continue; }
          const env = Math.min(1, m.t / 0.12) * Math.min(1, (m.life - m.t) / 0.4);
          const sp = Math.hypot(m.vx, m.vy), ux = m.vx / sp, uy = m.vy / sp;
          const L = m.len * Math.min(1, m.t / 0.3);
          const tx = m.x - ux * L, ty = m.y - uy * L;
          const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
          g.addColorStop(0, `rgba(255,255,255,${0.95 * env})`);
          g.addColorStop(0.07, `rgba(166,233,255,${0.85 * env})`);
          g.addColorStop(0.32, `rgba(56,200,240,${0.45 * env})`);
          g.addColorStop(0.7, `rgba(26,127,230,${0.16 * env})`);
          g.addColorStop(1, 'rgba(15,79,196,0)');
          ctx.strokeStyle = g;
          ctx.lineCap = 'round';
          // a soft wide glow, the bright core, and two fanning fibres like the logo's tail
          const nx = -uy, ny = ux;
          ctx.globalAlpha = 0.28; ctx.lineWidth = 12 * m.sc;
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.globalAlpha = 0.55; ctx.lineWidth = 5 * m.sc;
          ctx.stroke();
          ctx.globalAlpha = 1; ctx.lineWidth = 2.2 * m.sc;
          ctx.stroke();
          ctx.globalAlpha = 0.8; ctx.lineWidth = 1.2 * m.sc;
          ctx.beginPath();
          ctx.moveTo(m.x + nx * 2 * m.sc, m.y + ny * 2 * m.sc); ctx.lineTo(m.x - ux * L * 0.72 + nx * 9 * m.sc, m.y - uy * L * 0.72 + ny * 9 * m.sc);
          ctx.moveTo(m.x - nx * 2 * m.sc, m.y - ny * 2 * m.sc); ctx.lineTo(m.x - ux * L * 0.55 - nx * 7 * m.sc, m.y - uy * L * 0.55 - ny * 7 * m.sc);
          ctx.stroke();
          ctx.globalAlpha = env;
          const hz = m.size * 4.2;
          ctx.drawImage(HALO, m.x - hz / 2, m.y - hz / 2, hz, hz);
          if (head.complete && head.naturalWidth) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.save();
            ctx.translate(m.x, m.y);
            ctx.rotate(m.rot);
            ctx.drawImage(head, -m.size / 2, -m.size / 2, m.size, m.size * 1.04);
            ctx.restore();
            ctx.globalCompositeOperation = 'lighter';
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      };

      const leaning = () => Math.abs(ptr.tx - ptr.x) > 0.002 || Math.abs(ptr.ty - ptr.y) > 0.002;
      /* frame budget (ms): a shooting star gets about 60fps whatever the display's refresh rate
         (every frame at 60/75Hz, every other one at 120/144Hz; ~30fps on phones / few cores); the
         pointer lean ~30fps; scrolling does NOT raise the rate (~20fps): every redraw re-uploads the
         whole viewport-sized bitmap, and fast scrolls stretch the stars into streaks, which reads
         as motion blur between the steps */
      const budget = () => (meteors.length ? (LOW ? 31 : 12) : leaning() ? 31 : LOW ? 64 : 48);
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        const el = now - last;
        if (el < budget()) return;
        last = now;
        const dt = Math.min(0.05, el / 1000 || 0.016);
        time += dt;
        // scroll velocity (Lenis' value or the cached native one: no DOM read)
        const y = scrollPos();
        vel += ((y - lastY) / dt - vel) * 0.25;
        lastY = y;
        // pointer lean, eased
        const k = 1 - 0.9 ** (dt * 60);
        ptr.x += (ptr.tx - ptr.x) * k * 0.4;
        ptr.y += (ptr.ty - ptr.y) * k * 0.4;
        // shooting-star clock
        nextShot -= dt;
        if (nextShot <= 0) {
          if (w > 0) shoot();
          nextShot = boosted ? rand(0.45, 1.3) : rand(9, 15); // rare enough to stay magical while reading
        }
        draw(dt);
      };
      const start = () => { if (!raf && animate && playing && !paused && !covered && !doc.hidden) { last = performance.now(); lastY = scrollPos(); raf = requestAnimationFrame(loop); } };
      const stop = () => { cancelAnimationFrame(raf); raf = 0; };

      const box = () => [canvas.clientWidth, canvas.clientHeight];
      resize(...box());
      draw(0);
      html.classList.add('sky-on');
      if ('ResizeObserver' in window) {
        new ResizeObserver(([en]) => { const cr = en.contentRect; if (resize(cr.width, cr.height)) draw(0); }).observe(canvas);
      } else {
        window.addEventListener('resize', () => { if (resize(...box())) draw(0); });
      }
      const ctl = {
        play() { playing = true; start(); },
        pause(p) { if (p) stop(); else start(); },
        cover(c) { covered = c; if (c) stop(); else start(); },
        boost(b) { if (b && !boosted) nextShot = Math.min(nextShot, 0.3); boosted = b; },
        shoot() { if (animate && !paused) shoot(); },
      };
      if (!animate) return ctl;
      doc.addEventListener('visibilitychange', () => (doc.hidden ? stop() : start()));
      if (FINE) {
        window.addEventListener('pointermove', (e) => {
          if (e.pointerType !== 'mouse') return;
          ptr.tx = e.clientX / window.innerWidth - 0.5;
          ptr.ty = e.clientY / window.innerHeight - 0.5;
        }, { passive: true });
      }
      return ctl;
    };
    const skyCanvas = $('.sky-canvas');
    if (skyCanvas) { try { sky = makeSky(skyCanvas, !REDUCE); } catch (e) { sky = null; } }

    /* 6b. Pause-motion toggle (WCAG 2.2.2) --------------------------------------
       Freezes every self-running loop (CSS loops via html.paused, the sky and
       the marquee drift); scroll-linked motion stays, since the visitor drives
       it. The choice is remembered on this device. */
    const pauseBtn = $('[data-motion-toggle]');
    const setPaused = (p, save) => {
      paused = p;
      html.classList.toggle('paused', p); // CSS swaps the button's visible label, which is also its accessible name
      if (sky) sky.pause(p);
      if (save) { try { localStorage.setItem('sf-paused', p ? '1' : '0'); } catch (e) { /* storage blocked */ } }
    };
    if (pauseBtn && !REDUCE) {
      pauseBtn.hidden = false;
      pauseBtn.addEventListener('click', () => setPaused(!paused, true));
      let saved = null;
      try { saved = localStorage.getItem('sf-paused'); } catch (e) { /* storage blocked */ }
      if (saved === '1') setPaused(true, false);
    }

    /* Static tiers stop here -------------------------------------------------- */
    if (!MOTION) {
      if (sky) sky.play();
      bindNativeHeader();
      // ScrollTrigger registers itself on load and keeps a rAF loop alive; the static page never needs it
      // (only touched with its core present: without gsap, disable() throws)
      if (HAS_GSAP) { try { window.ScrollTrigger.disable(false); } catch (e) { /* ignore */ } }
      return;
    }

    /* 7. Motion ---------------------------------------------------------------- */
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);
    const SplitText = window.SplitText;
    const HAS_SPLIT = typeof SplitText !== 'undefined';
    const splits = [];
    let lenisRaf = null;
    let heroStarted = false;
    let introOn = false; // the first-visit curtain is playing (the hero mark then only settles in)
    let markFlown = false; // the curtain's mark flew onto the hero mark (which stays hidden until the swap)
    let heroEntrance = () => {}; // assigned by buildHero()
    let onEntranceDone = () => {}; // assigned by initMotion(): builds the below-the-fold layer
    let failed = false;

    /* Every tween, timeline, ScrollTrigger and split of the motion layer is
       created inside this one gsap.context (initMotion, the hero entrance and
       each deferred build step), so fail() can revert ALL of them: each
       element gets back exactly the inline styles it had before (a from()
       tween's hidden start state included), without a selector list to keep
       in sync. */
    const motionCtx = gsap.context(() => {});
    const inCtx = (fn) => {
      let error = null;
      motionCtx.add(() => { try { fn(); } catch (e) { error = e; } }); // never leaves the context half-open
      if (error) throw error;
    };

    const fail = (err) => {
      if (failed) return;
      failed = true;
      window.__sfError = String((err && err.stack) || err);
      try { if (mm) mm.revert(); } catch (e) { /* keep rolling back */ }
      try { motionCtx.revert(); } catch (e) { /* keep rolling back */ }
      try {
        splits.forEach((s) => { try { s.revert(); } catch (e) { /* already reverted */ } });
        ScrollTrigger.getAll().forEach((t) => t.kill());
        gsap.globalTimeline.clear();
        gsap.set($$([
          '[data-hero],[data-reveal],[data-split],[data-lines],[data-line],.hero-inner,.hero-actions > *,.section-meta *,.eyebrow-star',
          '[data-constellation],[data-constellation] line,[data-constellation] circle',
          '[data-mark-depth],[data-mark-art],[data-mark-star],[data-mark-tail],.mark-trail,.mark-chart-wrap,.mark-halo,.mark-flash',
          '.game-card,.game-art,.game-info,.game-art-inner,.game-scene,.portal-iris,.portal-rim,.rift-flare,.core-star,.core-glow,.game-info>*,.game-badge,.game-art-label .lm>*,[data-depth]',
          '[data-portrait],.portrait-photo,.portrait-photo img,.portrait-ring,.portrait-orbit,.portrait-tag',
          '.social-card,.social-glyph,.social-avatar,.social-light,.button-primary,.nav-cta',
          '.footer-word span,.finale-planet,.finale-rim,.rift-track,.rift-lean,.rift-band,.site-header>*,.header-progress',
        ].join(',')), { clearProps: 'all' });
      } catch (e) { /* keep rolling back */ }
      if (anchorTween) { anchorTween.kill(); anchorTween = null; }
      if (velocityTick) gsap.ticker.remove(velocityTick);
      if (comet) { try { comet.destroy(); } catch (e) { /* ignore */ } comet = null; }
      if (lenisRaf) gsap.ticker.remove(lenisRaf);
      if (lenis) { lenis.destroy(); lenis = null; }
      try { ScrollTrigger.disable(false); } catch (e) { /* ignore */ }
      const card = $('.game-card');
      if (card) card.classList.remove('is-cinematic', 'is-iris');
      $$('.is-idle').forEach((el) => el.classList.remove('is-idle')); // (their ScrollTriggers are gone: no loop stays frozen)
      html.classList.remove('show-intro', 'marquee-js', 'press-js', 'cursor-on');
      html.classList.add('no-anim');
      if (sky) { sky.boost(false); sky.play(); }
      bindNativeHeader();
    };

    // a visitor who switches on "reduce motion" mid-visit gets the calm page right away
    onMedia('(prefers-reduced-motion: reduce)', (e) => { if (e.matches) location.reload(); });

    try {
      inCtx(initMotion);
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
      buildGames(mm);
      buildHeaderProgress();
      buildHero(mm);
      buildVelocity();
      buildRift();
      buildIdle();
      buildStarCTAs();
      if (FINE && !media('(forced-colors: active)')) buildTactile();

      /* Below the fold (reveals, constellations, creator, quote, community,
         finale) is built in small steps — one section per idle callback — so no
         single task is long: the queue starts once fonts have settled (no
         re-split later), rests while the hero entrance plays, and finishes with
         one refresh once the page is not scrolling. A visitor who heads down
         early gets the sections near the viewport built at once (one step, not
         all of them); an anchor link builds its target. No step changes the
         layout (split headings keep their height), so building in any order
         leaves every measured position valid. Created after the pin, so
         positions include its spacer. */
      const restSteps = [
        { el: $('#games'), fn: () => buildRevealsIn($('#games'), WIPE) },
        { el: $('#creator'), fn: () => { buildRevealsIn($('#creator'), WIPE); buildCreator(WIPE); } },
        { el: $('.quote-section'), fn: () => { buildRevealsIn($('.quote-section'), WIPE); buildQuote(); } },
        { el: $('#community'), fn: () => { buildRevealsIn($('#community'), WIPE); buildCommunity(); } },
        { el: $('#contact'), fn: () => buildRevealsIn($('#contact'), WIPE) },
        { el: $('.site-footer'), fn: buildFinale },
      ];
      let restLeft = restSteps.length, restQueued = false, restRefreshed = false;
      const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 900 }) : (fn) => setTimeout(fn, 16);
      const runStep = (step) => {
        if (step.done || failed) return;
        step.done = true;
        restLeft--;
        inCtx(step.fn);
      };
      // the one refresh after the last step, when nothing is scrolling (it never lands mid-flight)
      const settleRest = () => {
        if (restRefreshed || failed) return;
        if (lenis && lenis.isScrolling) { ScrollTrigger.addEventListener('scrollEnd', function once() { ScrollTrigger.removeEventListener('scrollEnd', once); idle(settleRest); }); return; }
        restRefreshed = true;
        syncRefresh();
      };
      const afterSteps = () => {
        if (restLeft > 0 || failed) return;
        window.removeEventListener('scroll', onEarlyScroll);
        idle(settleRest);
      };
      const pumpRest = () => {
        restQueued = false;
        if (failed || restLeft <= 0) return;
        if (heroStarted && !entranceDone) return; // resumes from onEntranceDone
        try { runStep(restSteps.find((st) => !st.done)); } catch (err) { fail(err); return; }
        if (restLeft > 0) queueRest(); else afterSteps();
      };
      function queueRest() { if (!restQueued && restLeft > 0 && !failed) { restQueued = true; idle(pumpRest); } }
      // build synchronously every step whose section is within reach (an early scroll / an anchor)
      const buildNear = (reach) => {
        try {
          restSteps.forEach((st) => { if (!st.done && st.el && st.el.getBoundingClientRect().top < reach) runStep(st); });
        } catch (err) { fail(err); return; }
        if (restLeft > 0) queueRest(); else afterSteps();
      };
      function buildRest() { // everything, now (deep links)
        try { restSteps.forEach(runStep); } catch (err) { fail(err); return; }
        window.removeEventListener('scroll', onEarlyScroll);
        if (!restRefreshed && !failed) { restRefreshed = true; syncRefresh(); }
      }
      const onEarlyScroll = () => { if (restLeft > 0) buildNear(window.innerHeight * 1.6); };
      onEntranceDone = () => {
        entranceDone = true;
        gsap.ticker.lagSmoothing(lenis ? 0 : 500, 33);
        queueRest();
      };
      window.addEventListener('scroll', onEarlyScroll, { passive: true });
      // an anchor: build its own section now (a step never changes the layout: split headings keep
      // their height), and leave the rest to the queue
      ensureRest = (target) => {
        if (restLeft <= 0) return;
        const st = target ? restSteps.find((x) => x.el && (x.el === target || x.el.contains(target))) : null;
        try { if (st) runStep(st); } catch (err) { fail(err); return; }
        if (restLeft > 0) queueRest(); else afterSteps();
      };

      /* keep trigger positions honest after late layout changes */
      let refreshTimer, lastH = doc.body.offsetHeight;
      const syncRefresh = () => { clearTimeout(refreshTimer); lastH = doc.body.offsetHeight; ScrollTrigger.refresh(); };
      const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(syncRefresh, 120); };
      if ('ResizeObserver' in window) {
        // (while the deferred layer is still being built step by step, its own final refresh covers every change)
        new ResizeObserver(() => { const hgt = doc.body.offsetHeight; if (Math.abs(hgt - lastH) > 2) { lastH = hgt; if (!restLeft || restLeft === restSteps.length) refreshSoon(); } }).observe(doc.body);
      }
      /* Fonts settle → one synchronous refresh (before the entrance on the no-intro path).
         document.fonts.ready alone resolves too early: the Google Fonts sheet is
         applied late (media="print" swap), so wait for that sheet, then ask for the
         three families explicitly. Capped so the hero is never held past ~1.2s. */
      const fontsSettled = new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, Math.min(600, 1200 - performance.now())));
        if (!doc.fonts || !doc.fonts.load) { resolve(); return; }
        const want = () => Promise.all(['800 1em Unbounded', '700 1em Unbounded', '700 1em Fredoka', '600 1em Fredoka', '400 1em "DM Sans"'].map((f) => doc.fonts.load(f)))
          .then(() => doc.fonts.ready).then(resolve, resolve);
        const sheet = $('link[rel="stylesheet"][href*="fonts.googleapis"]');
        if (sheet && sheet.media === 'print') {
          sheet.addEventListener('load', () => setTimeout(want, 0), { once: true }); // after its inline onload flips media
          sheet.addEventListener('error', resolve, { once: true });
        } else want();
      });
      fontsSettled.then(() => {
        if (Math.abs(doc.body.offsetHeight - lastH) > 2) syncRefresh();
        // the deferred layer starts building now, a step at a time (two frames after the refresh)
        requestAnimationFrame(() => requestAnimationFrame(queueRest));
      });
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
      introOn = html.classList.contains('show-intro') && !!intro && getComputedStyle(intro).display !== 'none';
      if (!introOn) {
        // no curtain: start once fonts have settled (no re-split mid-entrance), two frames after the heavy init
        fontsSettled.then(() => requestAnimationFrame(() => requestAnimationFrame(heroIn)));
        return;
      }
      if (lenis && !location.hash) lenis.stop();
      let done = false;
      const art = $('[data-mark-art]');
      const finish = () => {
        if (done) return;
        done = true;
        liftIntro = () => {};
        heroIn();
        if (markFlown && art) gsap.set(art, { opacity: 1 }); // the flown mark becomes the hero's own
        html.classList.remove('show-intro');
        if (lenis && !isMenuOpen()) lenis.start();
      };
      liftIntro = finish;
      /* On the lift the landed mark glides from the curtain's centre onto the
         hero mark (size and place measured live) and becomes it; the CSS fade of
         the curtain's mark stays the fallback. */
      const flyMark = () => {
        const im = $('.intro-mark', intro);
        if (!im || !art || location.hash || isMenuOpen()) return;
        const a = im.getBoundingClientRect();
        const b = art.getBoundingClientRect();
        if (!a.width || !b.width || b.bottom < 0 || b.top > window.innerHeight) return;
        im.style.animation = 'none';
        gsap.set(art, { opacity: 0 });
        gsap.to(im, { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2), scale: b.width / a.width, duration: 0.64, ease: 'power3.inOut' });
        markFlown = true;
      };
      const onLift = () => {
        if (heroStarted) return;
        try { flyMark(); } catch (e) { /* the CSS fade covers it */ }
        heroIn();
      };
      const lift = intro.getAnimations ? intro.getAnimations().find((a) => a.animationName === 'introOut') : null;
      if (lift) {
        const delayMs = 1080; // matches the CSS animation-delay of introOut
        setTimeout(onLift, Math.max(0, delayMs - (lift.currentTime || 0) - 40));
        lift.finished.then(finish, finish);
      } else {
        intro.addEventListener('animationstart', (e) => { if (e.animationName === 'introOut') onLift(); });
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
      if (sky) sky.play();
      try { inCtx(heroEntrance); } catch (err) { fail(err); }
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

    function buildHero(mm) {
      const STAR = '30.3% 30.2%'; // the star's centre inside the logo layers
      heroEntrance = () => {
        // booted late (slow network)? play the same entrance, faster, so the copy is readable sooner
        const speed = !introOn && performance.now() > 1400 ? 1.8 : 1;
        const tl = gsap.timeline({ defaults: { duration: 1.3 }, onComplete: () => onEntranceDone() });
        const title = $('.hero-title');
        if (title && HAS_SPLIT) {
          splits.push(SplitText.create(title, {
            type: 'lines,words,chars', mask: 'lines', linesClass: 'line', autoSplit: true,
            onSplit(self) {
              gsap.set(title, { opacity: 1 });
              // after the curtain the title waits a beat, so it never rises through the intro's fading name
              // (longer on phones, where the title sits right where the name was)
              return gsap.from(self.chars, { yPercent: 118, rotate: 5, duration: 1.35, stagger: 0.024, delay: introOn ? (window.innerWidth <= 850 ? 0.35 : 0.2) : 0.05 }).timeScale(speed);
            },
          }));
        } else if (title) {
          tl.fromTo(title, { opacity: 0, y: 40 }, { opacity: 1, y: 0 }, 0.05);
        }
        lineReveal($('.hero-copy'), { scroll: false, delay: 0.45 / speed, duration: 1.2 / speed });
        tl.fromTo('.hero-eyebrow', { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 1 }, 0.1)
          .from('.hero-eyebrow .eyebrow-star', { scale: 0, rotate: -90, duration: 1.2 }, 0.1)
          .set('.hero-actions', { opacity: 1 }, 0)
          .from('.hero-actions > *', { opacity: 0, y: 26, duration: 1.1, stagger: 0.08 }, 0.6)
          .set('.hero-mark', { opacity: 1 }, 0)
          .fromTo('.mark-chart-wrap', { opacity: 0, scale: 0.86, rotate: -35 }, { opacity: 1, scale: 1, rotate: 0, duration: 2.4 }, 0)
          .fromTo('.mark-halo', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 2 }, 0.15);
        if (introOn) {
          // the curtain just showed the landing: its mark flies here (flyMark), or this one settles in
          if (!markFlown) tl.fromTo('[data-mark-art]', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 1.8 }, 0.05);
        } else {
          // the comet lands: the star streaks in along its own tail, the tail blooms out behind it
          tl.fromTo('[data-mark-star]', { xPercent: 75, yPercent: 66, scale: 0.42, opacity: 0, transformOrigin: STAR },
            { xPercent: 0, yPercent: 0, scale: 1, opacity: 1, duration: 1.25, ease: 'expo.out' }, 0.12)
            .fromTo('.mark-trail', { opacity: 0, scale: 0.14, rotate: -14, transformOrigin: STAR },
              { opacity: 1, scale: 1, rotate: 0, duration: 1.2, ease: 'expo.out' }, 0.5)
            .set('.mark-flash', { opacity: 0, scale: 0.2 }, 0)
            .to('.mark-flash', { keyframes: [{ opacity: 1, scale: 0.7, duration: 0.18, ease: 'power2.out' }, { opacity: 0, scale: 1.5, duration: 0.7, ease: 'power2.out' }] }, 0.48);
        }
        tl.fromTo('.hero-foot', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1.1 }, 0.8)
          .fromTo(['.site-header > .brand', '.site-header > .nav', '.site-header > .menu-toggle'],
            { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08, clearProps: 'transform' }, 0.25)
          .add(() => { if (sky) sky.shoot(); }, 1.1); // a first shooting star crosses as the hero settles
        tl.timeScale(speed);
      };

      /* Leaving the hero feels like rising through the sky: the copy recedes in
         layers, the mark drifts up and grows, the star chart keeps turning
         (desktop only). Wrappers and properties differ from the entrance, so
         the two never fight. */
      mm.add('(min-width: 851px)', () => {
        gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
          .to('.hero-eyebrow', { y: -170 }, 0)
          .to('.hero-title', { y: -140 }, 0)
          .to('.hero-copy', { y: -105 }, 0)
          .to('.hero-actions', { y: -80 }, 0)
          .to('.hero-inner', { opacity: 0.1 }, 0)
          .to('[data-mark-depth]', { y: -90 }, 0) // translate only: the filtered art is rasterised once (its own layer)
          .to('.mark-chart-wrap', { rotation: 60 }, 0);
      });
      // where the comet runs (desktop), the tail it leaves behind dissolves as the star falls away
      mm.add('(min-width: 1024px) and (min-height: 640px)', () => {
        gsap.fromTo('[data-mark-tail]', { opacity: 1 }, { opacity: 0.22, ease: 'power1.in', scrollTrigger: { trigger: '.hero', start: 'top top', end: '60% top', scrub: true } });
      });
    }

    /* Header progress + active section -------------------------------------- */
    function buildHeaderProgress() {
      gsap.to('.header-progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.4 } });
      $$('.nav-link').forEach((link) => {
        const sec = byHash(link.getAttribute('href'));
        if (!sec) return;
        ScrollTrigger.create({ trigger: sec, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => link.classList.toggle('is-active', self.isActive) });
      });
    }

    /* Section reveals (scoped: built per section, after the hero entrance) ----- */
    function buildRevealsIn(scope, WIPE) {
      if (!scope) return;
      // eyebrow rows: the sparkle turns in, then the label and its numbered tag slide in
      $$('[data-reveal="meta"]', scope).forEach((meta) => {
        gsap.timeline({ scrollTrigger: { trigger: meta, start: 'top 90%', once: true } })
          .set(meta, { opacity: 1 })
          .from($('.eyebrow-star', meta), { scale: 0, rotate: -120, duration: 1.2 }, 0)
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

      // hairlines draw out from the centre; fact rows cascade in (CSS transitions)
      $$('[data-line]', scope).forEach((line) => {
        gsap.to(line, { scaleX: 1, duration: 1.8, ease: WIPE, scrollTrigger: { trigger: line, start: 'top 92%', once: true } });
      });
      $$('[data-facts]', scope).forEach((list) => {
        ScrollTrigger.create({ trigger: list, start: 'top 88%', once: true, onEnter: () => list.classList.add('is-in') });
      });

      buildConstellations(scope);
    }

    /* Constellations: the stars light up one by one, then the hairlines draw
       between them. Dash lengths are measured once; after drawing, the dash is
       cleared so a later resize (percentage coordinates) can't leave gaps. */
    function buildConstellations(scope) {
      $$('[data-constellation]', scope).forEach((svg) => {
        const linked = svg.dataset.link ? linkConstellation(svg) : null;
        if (svg.dataset.link && !linked) return;
        const lines = $$('line', svg);
        const dots = $$('circle', svg);
        gsap.set(svg, { opacity: 1 });
        lines.forEach((l) => {
          let len = 0;
          try { len = l.getTotalLength(); } catch (e) { len = 0; }
          if (len > 0) gsap.set(l, { strokeDasharray: len, strokeDashoffset: len });
        });
        gsap.set(dots, { scale: 0, transformOrigin: '50% 50%' });
        gsap.timeline({ scrollTrigger: { trigger: linked ? linked.trigger : svg, start: linked ? 'top 70%' : 'top 85%', once: true } })
          .to(dots, { scale: 1, duration: 0.9, stagger: 0.14, ease: 'back.out(3)' }, 0)
          .to(lines, { strokeDashoffset: 0, duration: 1.1, stagger: 0.18, ease: 'power2.inOut' }, 0.2)
          .add(() => { if (linked) linked.done(); gsap.set(lines, { clearProps: 'strokeDasharray,strokeDashoffset' }); });
      });
    }

    /* Element-linked constellation: data-link lists anchors separated by ";" —
       "selector|ax|ay" (a point inside that element's box, 0..1) or "~f|dy" (a
       free star at fraction f between the first and last anchors, lifted dy px).
       Points are measured relative to the SVG (which covers its section) and
       re-measured on every ScrollTrigger refresh. */
    function linkConstellation(svg) {
      const host = svg.parentElement;
      const parts = svg.dataset.link.split(';').map((p) => p.trim().split('|').map((v) => v.trim()));
      const anchors = parts.map(([sel]) => (sel.charAt(0) === '~' ? null : $(sel, host)));
      const real = anchors.filter(Boolean);
      if (real.length < 2) return null;
      const iFirst = anchors.indexOf(real[0]);
      const iLast = anchors.lastIndexOf(real[real.length - 1]);
      const NS = 'http://www.w3.org/2000/svg';
      const pts = parts.map(() => ({ x: 0, y: 0 }));
      const lines = pts.slice(1).map(() => svg.appendChild(doc.createElementNS(NS, 'line')));
      const dots = pts.map((_, i) => {
        const c = svg.appendChild(doc.createElementNS(NS, 'circle'));
        c.setAttribute('r', i === iLast ? '0' : i === iFirst ? '3' : '2.2'); // the last anchor is a star already
        if (i === iFirst) c.setAttribute('class', 'c-gold');
        return c;
      });
      let drawn = false;
      const measure = () => {
        const hr = svg.getBoundingClientRect();
        parts.forEach(([, ax, ay], i) => {
          const el = anchors[i];
          if (!el) return;
          const r = el.getBoundingClientRect();
          pts[i] = { x: r.left - hr.left + r.width * (parseFloat(ax) || 0.5), y: r.top - hr.top + r.height * (parseFloat(ay) || 0.5) };
        });
        const a = pts[iFirst], b = pts[iLast];
        parts.forEach(([sel, dy], i) => {
          if (anchors[i]) return;
          const f = parseFloat(sel.slice(1)) || 0.5;
          pts[i] = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f + (parseFloat(dy) || 0) };
        });
        dots.forEach((c, i) => { c.setAttribute('cx', pts[i].x.toFixed(1)); c.setAttribute('cy', pts[i].y.toFixed(1)); });
        lines.forEach((l, i) => {
          const p = pts[i], q = pts[i + 1];
          l.setAttribute('x1', p.x.toFixed(1)); l.setAttribute('y1', p.y.toFixed(1));
          l.setAttribute('x2', q.x.toFixed(1)); l.setAttribute('y2', q.y.toFixed(1));
          if (!drawn) { const len = Math.hypot(q.x - p.x, q.y - p.y); gsap.set(l, { strokeDasharray: len, strokeDashoffset: len }); }
        });
      };
      measure();
      ScrollTrigger.addEventListener('refresh', measure);
      return { trigger: real[0], done: () => { drawn = true; } };
    }

    /* Scroll velocity drives the rift marquee --------------------------------
       One loop: the marquee drifts, speeds up, flips with scroll direction and
       leans into fast scrolls. It only runs while the band is on screen. */
    function buildVelocity() {
      const track = $('[data-marquee]');
      const leanEl = $('[data-lean]');
      if (!track) return;
      let x = 0, w = 0, dir = 1, skew = 0, boost = 0, on = false;
      html.classList.add('marquee-js');
      if (leanEl) {
        let written = '';
        riftLean = {
          open: 1, skew: 0,
          apply() {
            const v = `scaleY(${(1 / Math.max(0.02, this.open)).toFixed(4)}) skewX(${this.skew.toFixed(2)}deg)`;
            if (v !== written) { written = v; leanEl.style.transform = v; }
          },
        };
      }
      const measure = () => { w = track.firstElementChild.getBoundingClientRect().width; };
      measure();
      if (doc.fonts) doc.fonts.ready.then(measure);
      window.addEventListener('resize', measure);
      // seeded on every refresh too, so a deep link / restored scroll never leaves it running off-screen
      const seen = (s) => { on = s.isActive; };
      ScrollTrigger.create({ trigger: '.rift', start: 'top bottom', end: 'bottom top', onToggle: seen, onRefresh: seen });
      velocityTick = (time, dt) => {
        if (!on || !w || paused) return;
        const v = lenis ? lenis.velocity : 0;
        if (v > 0.3) dir = 1; else if (v < -0.3) dir = -1;
        boost += (Math.min(Math.abs(v) * 32, 1500) - boost) * 0.08;
        x -= ((60 + boost) * dir * dt) / 1000;
        if (x <= -w) x += w; else if (x > 0) x -= w;
        skew += (Math.max(-7, Math.min(7, -v * 0.22)) - skew) * 0.1;
        track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
        if (riftLean) { riftLean.skew = Math.round(skew * 20) / 20; riftLean.apply(); }
      };
      gsap.ticker.add(velocityTick);
    }

    /* Rift: the band tears open from a hairline as it scrolls in. Collapsing
       every vertex of its torn polygon onto the centre line is the same as
       scaling the shape vertically, so the band itself scales open (a
       transform on its own layer: nothing is re-clipped or re-rasterised per
       frame) and .rift-lean counter-scales the text so it reads unsquashed. */
    function buildRift() {
      const band = $('[data-rift]');
      if (!band || !riftLean) return;
      const SHUT = 0.02;
      gsap.fromTo(band, { rotation: -3, scaleY: SHUT }, {
        scaleY: 1, ease: 'none',
        scrollTrigger: { trigger: '.rift', start: 'top 92%', end: 'center 55%', scrub: 0.6 },
        onUpdate() { riftLean.open = gsap.getProperty(band, 'scaleY'); riftLean.apply(); },
        onStart() { riftLean.open = gsap.getProperty(band, 'scaleY'); riftLean.apply(); },
      });
      riftLean.open = SHUT;
      riftLean.apply();
    }

    /* Pet Dimensions: the portal set piece ---------------------------------------
       Desktop: the card pins; the falling star has just dived into a small rift
       waiting in the night sky. The rift tears open to full bleed (a clip-path
       circle plus one ring of light scaled to sit on its edge — transform only),
       the world inside settles, the card's surface arrives, then the art slides
       aside and the details cascade in. Info items hide with opacity only
       (keyboard focus scrubs to the end), and "#games" links land on the end.
       Smaller screens: the same rift opens, scrubbed, without a pin. */
    // where the pinned card sits: centred, but never tucked under the fixed header on short screens
    function pinY(card) {
      return Math.round(Math.max(window.innerHeight / 2, (header ? header.offsetHeight : 0) + card.offsetHeight / 2 + 10));
    }

    function buildGames(mm) {
      const SEED = 54; // px radius of the waiting rift
      const RIM = 200; // px radius of the .portal-rim element at scale 1
      const card = $('.game-card');
      if (!card) return;
      const art = $('.game-art', card);
      const inner = $('.game-art-inner', card);
      const scene = $('.game-scene', card);
      const iris = $('.portal-iris', card);
      const rim = $('.portal-rim', card);
      const flare = $('.rift-flare', card);
      const core = $('.core-star', card);
      const glow = $('.core-glow', card);
      const info = $('.game-info', card);
      const infoItems = Array.from(info.children);
      const label = $$('.game-art-label .lm > *', card);
      const badge = $('.game-badge', card);
      if (!iris || !rim) return;
      const circle = (r) => `circle(${Math.round(r)}px at 50% 50%)`;

      /* the rift tearing open: shared by both layouts (radius `full` is measured live) */
      const tear = (tl, full, at, zoom) => {
        tl.fromTo(core, { scale: 0, rotate: -120 }, { scale: 1, rotate: 0, duration: 0.24, ease: 'back.out(2)' }, at)
          .fromTo(iris, { clipPath: circle(SEED) }, { clipPath: () => circle(full()), duration: 1, ease: 'power1.in' }, at + 0.04)
          // fully open: drop the clip, so the running portal loops are never masked frame after frame
          .set(iris, { clipPath: 'none' }, at + 1.05)
          .fromTo(rim, { scale: SEED / RIM, opacity: 1 }, { scale: () => full() / RIM, duration: 1, ease: 'power1.in' }, at + 0.04)
          // the rim is gone before the circle meets the card's edges (it would be cut flat there)
          .to(rim, { opacity: 0, duration: 0.24, ease: 'power1.in' }, at + 0.42)
          .fromTo(flare, { opacity: 1, scaleX: 1 }, { opacity: 0, scaleX: 0.3, duration: 0.42, ease: 'power1.in' }, at + 0.04)
          // the world inside rushes up to meet you (the oversized vortex never shows an edge inside the circle)
          .fromTo(scene, { scale: zoom }, { scale: 1.04, duration: 1.04, ease: 'power2.out' }, at)
          .fromTo(glow, { scale: 0.5 }, { scale: 1, duration: 1, ease: 'power1.in' }, at);
        return tl;
      };

      mm.add('(min-width: 1024px) and (min-height: 640px)', () => {
        card.classList.add('is-cinematic');
        const full = () => Math.ceil(Math.hypot(card.offsetWidth, card.offsetHeight) / 2) + 40;
        const share = () => info.offsetWidth / card.offsetWidth; // 0..1 of the card's width
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: '.game-stage', start: () => `center ${pinY(card)}px`, end: '+=130%', pin: true, scrub: 0.8, invalidateOnRefresh: true }, // (no anticipatePin: Lenis drives the scroll)
        });
        tear(tl, full, 0, 0.4)
          // the card's own chrome (surface, border, top light) arrives as the circle meets the card's
          // top and bottom edges (≈0.65), so the opening never floats as a flat-cut disc in the sky
          .fromTo(card, { '--chrome': 0 }, { '--chrome': 1, duration: 0.28 }, 0.56)
          .fromTo(badge, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.3 }, 0.6)
          .fromTo(label, { yPercent: 160 }, { yPercent: 0, duration: 0.4, stagger: 0.08, ease: 'power3.out' }, 0.62)
          .fromTo(art, { clipPath: 'inset(0% 0% 0% 0% round 0px)' }, { clipPath: () => `inset(0% ${(share() * 100).toFixed(2)}% 0% 0% round 0px)`, duration: 1, ease: 'power3.inOut' }, 1.2)
          .to(inner, { xPercent: () => -share() * 50, duration: 1, ease: 'power3.inOut' }, 1.2)
          .to(scene, { scale: 1, duration: 1, ease: 'power3.inOut' }, 1.2)
          // the info column is wiped in by the art's moving edge (the mirror of the art's own clip, same
          // ease and timing), so its text only ever shows where the portal has already left; the clip
          // is dropped once it is fully open (the button's glow and focus ring are never boxed in)
          .fromTo(info, { clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'power3.inOut' }, 1.2)
          .set(info, { clipPath: 'none' }, 2.2)
          .fromTo(infoItems, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' }, 1.58)
          // until they are (nearly) revealed, the info items are inert to the pointer: no 'Open Roblox'
          // cursor or click lands on a hidden button over the portal art (keyboard focus is unaffected)
          .fromTo(infoItems, { pointerEvents: 'none' }, { pointerEvents: 'auto', duration: 0.01 }, 1.95)
          .to({}, { duration: 0.25 }); // hold the final frame
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
        // a visitor who stops once the art is sliding aside (scrolling down) is eased onto the final
        // frame, so the half-built split never rests on screen; anywhere earlier the opening portal
        // stays exactly where they left it
        const onScrollEnd = () => {
          if (!gamesPin || !gamesPin.isActive || gamesPin.direction !== 1) return;
          if (gamesPin.progress > 0.6 && gamesPin.progress < 0.97) toEnd(0.8);
        };
        ScrollTrigger.addEventListener('scrollEnd', onScrollEnd);
        // the falling star (built after the pin exists, so it can aim at it)
        try { comet = buildComet(card); } catch (e) { comet = null; }
        return () => {
          if (comet) { comet.destroy(); comet = null; }
          card.classList.remove('is-cinematic');
          card.style.removeProperty('--chrome');
          card.removeEventListener('focusin', onFocus);
          ScrollTrigger.removeEventListener('scrollEnd', onScrollEnd);
          gamesPin = null;
        };
      });

      mm.add('(max-width: 1023px), (max-height: 639px)', () => {
        card.classList.add('is-iris');
        const full = () => Math.ceil(Math.hypot(art.offsetWidth, art.offsetHeight) / 2) + 30;
        // the rift waits in the dark card and tears open as it scrolls through the middle of the screen
        tear(gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: art, start: 'center 72%', end: 'center 34%', scrub: 0.5, invalidateOnRefresh: true } }), full, 0, 0.5);
        gsap.timeline({ scrollTrigger: { trigger: art, start: 'center 40%', once: true } })
          .fromTo(badge, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.8 }, 0)
          .fromTo(label, { yPercent: 160 }, { yPercent: 0, duration: 1, stagger: 0.08 }, 0.1);
        gsap.fromTo(infoItems, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.07, scrollTrigger: { trigger: info, start: 'top 88%', once: true } });
        return () => card.classList.remove('is-iris');
      });
    }

    /* The comet (desktop) ---------------------------------------------------------
       The signature: on the first scroll the hero's star breaks away from its
       tail and falls down the page — scrubbed by scroll — until it dives into
       the rift waiting in the Pet Dimensions card, which then tears open.
       The path is a Catmull-Rom spline in *viewport* space whose samples each
       carry the scroll offset they belong to, so the trail stays painted where
       the star passed and scrolling back simply rewinds it. Geometry is
       measured on ScrollTrigger refresh only; a frame takes the scroll from
       Lenis (no DOM read) and returns at once when nothing changed. The trail
       canvas (fixed, under the content, 1× resolution) is cleared only where
       it was drawn and leaves the page (display:none) whenever nothing is on
       it; the star is the logo's own star layer (pixel-identical to the
       hero's), moved by transform. */
    function buildComet(card) {
      const markArt = $('[data-mark-art]');
      const markStar = $('[data-mark-star]');
      const markDepth = $('[data-mark-depth]');
      const markStarImg = $('.mark-star');
      const markTail = $('[data-mark-tail]');
      let cut = -1; // how far the tail's head has opened behind the departing star (0..1)
      if (!markArt || !gamesPin) return null;
      const canvas = doc.createElement('canvas');
      canvas.className = 'comet-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.display = 'none'; // shown only while something is drawn on it
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const star = doc.createElement('div');
      star.className = 'comet-star';
      star.setAttribute('aria-hidden', 'true');
      star.innerHTML = '<span class="cs-glow"></span><img src="assets/brand/starfall-star.webp" alt="" width="760" height="735" decoding="async">';
      const skyEl = $('.sky');
      if (skyEl && skyEl.nextSibling) { doc.body.insertBefore(star, skyEl.nextSibling); doc.body.insertBefore(canvas, star); } else doc.body.append(canvas, star);

      const LOW = (navigator.hardwareConcurrency || 8) <= 4; // (sparks only)
      const CX = 0.303, CY = 0.302; // the star's centre inside the logo layers
      const VIS = 400 / 760; // the star's visible width as a share of the layer
      const N = 220; // path samples
      const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
      const dot = (rgb) => {
        const c = doc.createElement('canvas');
        c.width = c.height = 32;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, `rgba(${rgb},.95)`); gr.addColorStop(0.5, `rgba(${rgb},.25)`); gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
        return c;
      };
      const GOLD = dot('255,214,90'), CYAN = dot('142,232,255'), WHITE = dot('225,248,255');
      const docBox = (el) => { let x = 0, y = 0, n = el; while (n) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y, w: el.offsetWidth, h: el.offsetHeight }; };
      const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);

      let pts = [], end = 1, fadeLen = 1, starW = 400, starH = 387, mid = 0.35, vw = 0, vh = 0;
      let lastS = -1, starOn = false, cometOn = false, over = null, shown = false;
      let lean = { x: 0, y: 0 }; // the hero mark's live pointer lean at the hand-off (blended out over the first 10%)
      let box = null; // the area drawn last frame (cleared next frame)
      const sparks = [];

      const sizeCanvas = () => {
        vw = html.clientWidth; vh = window.innerHeight;
        canvas.width = Math.round(vw); // 1×: soft light, uploaded whole every frame it changes
        canvas.height = Math.round(vh);
        box = null; lastS = -1;
      };
      const measure = () => {
        if (!gamesPin) return;
        sizeCanvas();
        const W = vw, H = vh;
        const m = docBox(markArt);
        starW = m.w; starH = m.h;
        star.style.width = `${starW}px`;
        const P0 = { x: m.x + m.w * CX, y: m.y + m.h * CY }; // viewport position at scroll 0 (the hero is at the top)
        const cb = docBox(card);
        end = Math.max(1, gamesPin.start);
        const P4 = { x: cb.x + cb.w / 2, y: pinY(card) }; // the rift, the moment the card pins
        fadeLen = Math.max(1, (gamesPin.end - gamesPin.start) * 0.12);
        // it leaves forward (up-left, as the logo flies), swoops down through the gap
        // between the headings' columns, and dives into the rift
        const C = [P0, { x: W * 0.64, y: H * 0.34 }, { x: W * 0.47, y: H * 0.62 }, { x: W * 0.58, y: H * 0.42 }, P4];
        const seg = C.length - 1;
        pts = [];
        for (let i = 0; i <= N; i++) {
          const u = (i / N) * seg;
          const k = Math.min(seg - 1, Math.floor(u));
          const t = u - k;
          const a = C[Math.max(0, k - 1)], b = C[k], c = C[k + 1], d = C[Math.min(seg, k + 2)];
          pts.push({ x: cr(a.x, b.x, c.x, d.x, t), y: cr(a.y, b.y, c.y, d.y, t), o: (i / N) * end });
        }
        // cruising size: a star about 90px across at 1440 wide
        mid = Math.min(1, Math.max(64, Math.min(110, W * 0.064)) / Math.max(1, starW * VIS));
        lastS = -1;
      };

      // star size along the flight: hero size → cruising size → swallowed by the rift
      const scaleAt = (p) => {
        if (p < 0.16) { const t = p / 0.16; return 1 + (mid - 1) * (1 - (1 - t) ** 2); }
        if (p < 0.88) return mid * (1 - 0.14 * ((p - 0.16) / 0.72));
        const t = (p - 0.88) / 0.12;
        return mid * 0.86 * (1 - t * t * 0.96);
      };

      const grow = (x, y, r) => {
        if (!box) box = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
        else { if (x - r < box.x0) box.x0 = x - r; if (y - r < box.y0) box.y0 = y - r; if (x + r > box.x1) box.x1 = x + r; if (y + r > box.y1) box.y1 = y + r; }
      };
      const clear = () => {
        if (!box) return;
        ctx.clearRect(Math.floor(box.x0) - 2, Math.floor(box.y0) - 2, Math.ceil(box.x1 - box.x0) + 4, Math.ceil(box.y1 - box.y0) + 4);
        box = null;
      };
      /* a tapered ribbon along the path behind the head (newest first) */
      const ribbon = (list, L, w0, pow, rgb, alpha) => {
        const left = [], right = [];
        for (let i = 0; i < list.length && list[i].d <= L; i++) {
          const a = list[Math.max(0, i - 1)], b = list[Math.min(list.length - 1, i + 1)];
          let nx = -(b.y - a.y), ny = b.x - a.x;
          const len = Math.hypot(nx, ny) || 1;
          nx /= len; ny /= len;
          // swells out of the star over the first few px, then tapers to a point
          const t = list[i].d / L;
          const w = w0 * (1 - t) ** pow * Math.min(1, 0.3 + list[i].d / (w0 * 3));
          left.push([list[i].x + nx * w, list[i].y + ny * w]);
          right.push([list[i].x - nx * w, list[i].y - ny * w]);
        }
        if (left.length < 2) return;
        const h0 = list[0], h1 = list[left.length - 1];
        const g = ctx.createLinearGradient(h0.x, h0.y, h1.x, h1.y);
        g.addColorStop(0, `rgba(${rgb},${alpha})`);
        g.addColorStop(0.5, `rgba(${rgb},${alpha * 0.4})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(left[0][0], left[0][1]);
        for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
        for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
        ctx.closePath();
        ctx.fill();
      };
      /* a bright fibre fanning out of the tail, like the logo's white streaks */
      const fibre = (list, L, off, lw, alpha) => {
        let last = list[0], n = 0;
        ctx.beginPath();
        for (let i = 0; i < list.length && list[i].d < L; i++) {
          const a = list[Math.max(0, i - 1)], b = list[Math.min(list.length - 1, i + 1)];
          const nx = -(b.y - a.y), ny = b.x - a.x;
          const len = Math.hypot(nx, ny) || 1;
          const o = off * Math.sin(Math.min(1, list[i].d / L) * Math.PI * 0.9);
          const px = list[i].x + (nx / len) * o, py = list[i].y + (ny / len) * o;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          last = list[i]; n++;
        }
        if (n < 2) return;
        const g = ctx.createLinearGradient(list[0].x, list[0].y, last.x, last.y);
        g.addColorStop(0, `rgba(240,253,255,${alpha})`);
        g.addColorStop(1, 'rgba(142,232,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = lw;
        ctx.stroke();
      };

      const setCometOn = (on) => {
        if (on === cometOn) return;
        cometOn = on;
        if (on) {
          /* the hand-off: the hero star (about to hide) may be leaning toward the pointer;
             start the flight exactly where it is drawn (GSAP's cached values: no layout read) */
          const gp = (el, p) => (el ? Number(gsap.getProperty(el, p)) || 0 : 0);
          lean = { x: gp(markArt, 'x') + gp(markStar, 'x') + gp(markDepth, 'x'), y: gp(markArt, 'y') + gp(markStar, 'y') + gp(markDepth, 'y') };
          // …plus where its idle bob (a CSS loop) has it right now: one style read, once per hand-off
          try {
            const bob = markStarImg && getComputedStyle(markStarImg).transform;
            const mt = bob && bob !== 'none' ? bob.match(/matrix\(([^)]+)\)/) : null;
            if (mt) { const v = mt[1].split(',').map(Number); lean.x += v[4] || 0; lean.y += v[5] || 0; }
          } catch (e) { /* no bob offset */ }
        }
        html.classList.toggle('comet-on', on);
      };
      const show = (on) => { if (on !== shown) { shown = on; canvas.style.display = on ? '' : 'none'; } };
      const hideStar = () => { if (starOn) { star.style.visibility = 'hidden'; starOn = false; } };

      const render = (s, dt) => {
        clear();
        const p = clamp01(s / end);
        const q = s > end ? clamp01((s - end) / fadeLen) : 0;
        setCometOn(p > 0.0005);
        // the tail left behind opens its head as the star moves off (written only over the first 4%)
        const c = p < 0.04 ? Math.round(((t) => t * (2 - t))(p / 0.04) * 50) / 50 : 1;
        if (markTail && c !== cut) { cut = c; markTail.style.setProperty('--cut', c); }
        if (p <= 0.0005 || (q >= 1 && !sparks.length)) { hideStar(); show(false); return; }
        show(true);
        const sR = Math.min(s, end); // the pinned portal freezes the page under the trail
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // the head (interpolated between samples) and the path behind it, newest first
        const kf = p * N, k = Math.min(N - 1, Math.floor(kf)), f = kf - k;
        const A = pts[k], B = pts[k + 1];
        const head = { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f + (A.o + (B.o - A.o) * f) - sR };
        if (p < 0.1 && (lean.x || lean.y)) { const k = 1 - p / 0.1, e = k * k * (3 - 2 * k); head.x += lean.x * e; head.y += lean.y * e; }
        const list = [{ x: head.x, y: head.y, d: 0 }];
        let d = 0, px = head.x, py = head.y;
        for (let i = k; i >= 0; i--) {
          const x = pts[i].x, y = pts[i].y + pts[i].o - sR;
          d += Math.hypot(x - px, y - py);
          px = x; py = y;
          list.push({ x, y, d });
          if (y < -40) break; // above the viewport: stop
        }

        const sc = scaleAt(p);
        const r = starW * VIS * sc * 0.5; // the star's visible radius
        const drain = 1 - q; // after the dive the tail drains into the rift
        if (q < 1) {
          const L = Math.min(vh * 0.8, 680) * Math.max(0.001, drain) * Math.min(1, p / 0.08 + 0.15);
          // the journey stays drawn as a faint dotted constellation line
          const faint = list.filter((pt) => pt.d > L * 0.5);
          if (faint.length > 1) {
            ctx.setLineDash([1.5, 11]);
            ctx.strokeStyle = `rgba(142,232,255,${0.34 * drain})`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(faint[0].x, faint[0].y);
            for (let i = 1; i < faint.length; i++) { ctx.lineTo(faint[i].x, faint[i].y); }
            ctx.stroke();
            ctx.setLineDash([]);
            for (const pt of faint) grow(pt.x, pt.y, 3);
          }
          const w0 = Math.max(7, r * 0.62);
          ribbon(list, L, w0 * 1.7, 1.1, '15,79,196', 0.34 * drain);
          ribbon(list, L * 0.92, w0 * 0.85, 1.2, '56,200,240', 0.6 * drain);
          ribbon(list, L * 0.7, w0 * 0.28, 1.4, '235,252,255', 0.95 * drain);
          fibre(list, L * 0.62, w0 * 0.9, 1.3, 0.75 * drain);
          fibre(list, L * 0.48, -w0 * 0.7, 1.1, 0.6 * drain);
          for (const pt of list) { if (pt.d > L) break; grow(pt.x, pt.y, w0 * 1.8 + 2); }
        }

        // sparks shed by the moving star (time-based fade; skipped on few-core devices)
        if (!LOW && !paused && lastS >= 0 && p < 0.97) {
          const n = Math.min(4, Math.floor(Math.abs(s - lastS) / 16));
          for (let i = 0; i < n && sparks.length < 60; i++) {
            const a = Math.random() * Math.PI * 2, rr = Math.random() * r * 0.9;
            sparks.push({ x: head.x + Math.cos(a) * rr, y: head.y + Math.sin(a) * rr + sR, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.2) * 30, life: 1, sz: 4 + Math.random() * 8, gold: Math.random() < 0.4 });
          }
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const sp = sparks[i];
          sp.life -= dt / 1000;
          if (sp.life <= 0) { sparks.splice(i, 1); continue; }
          sp.x += sp.vx * (dt / 1000); sp.y += sp.vy * (dt / 1000);
          ctx.globalAlpha = sp.life * sp.life;
          const z = sp.sz * (0.5 + sp.life * 0.5);
          const y = sp.y - sR;
          ctx.drawImage(sp.gold ? GOLD : CYAN, sp.x - z / 2, y - z / 2, z, z);
          grow(sp.x, y, z);
        }
        ctx.globalAlpha = 1;

        // the dive: a shockwave ring and a bloom burst out of the rift as the star enters
        if (q > 0 && q < 1) {
          const P4 = pts[N];
          const cy = P4.y + P4.o - sR;
          const e = 1 - (1 - q) ** 3;
          const R = 40 + e * Math.min(vw, vh) * 0.42;
          ctx.strokeStyle = `rgba(190,245,255,${0.8 * (1 - q) ** 1.5})`;
          ctx.lineWidth = 1 + 3 * (1 - q);
          ctx.beginPath();
          ctx.arc(P4.x, cy, R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = (1 - q) * 0.75;
          const z = 140 + e * 240;
          ctx.drawImage(WHITE, P4.x - z / 2, cy - z / 2, z, z);
          ctx.globalAlpha = 1;
          grow(P4.x, cy, Math.max(R + 6, z / 2));
        }
        ctx.globalCompositeOperation = 'source-over';

        // the star itself: a DOM layer moved by a compositor-only transform
        if (p < 0.995 && q === 0) {
          const op = p > 0.95 ? 1 - (p - 0.95) / 0.045 : 1;
          star.style.transform = `translate3d(${(head.x - starW * CX).toFixed(1)}px,${(head.y - starH * CY).toFixed(1)}px,0) rotate(${(-p * 330).toFixed(1)}deg) scale(${sc.toFixed(3)})`;
          star.style.opacity = op.toFixed(3);
          // beside the hero's tail it flies above it (as in the logo); then it falls under the page
          const o = p < 0.16;
          if (o !== over) { over = o; star.classList.toggle('is-over', o); }
          if (!starOn) { star.style.visibility = 'visible'; starOn = true; }
        } else hideStar();
      };

      const tick = (time, dt) => {
        if (!pts.length) return;
        const s = scrollPos();
        if (s === lastS && !sparks.length) return;
        render(s, Math.min(dt, 50));
        lastS = s;
      };
      const onRefresh = () => { measure(); const s = window.scrollY; render(s, 16); lastS = s; }; // (refresh only: one read)
      ScrollTrigger.addEventListener('refresh', onRefresh);
      window.addEventListener('resize', sizeCanvas);
      measure();
      gsap.ticker.add(tick);
      return {
        destroy() {
          gsap.ticker.remove(tick);
          ScrollTrigger.removeEventListener('refresh', onRefresh);
          window.removeEventListener('resize', sizeCanvas);
          canvas.remove();
          star.remove();
          if (markTail) markTail.style.removeProperty('--cut');
          html.classList.remove('comet-on');
        },
      };
    }

    /* Creator: the portrait irises open from its centre, the ring of light and
       the orbit fade up, the name tag rises; gentle parallax on desktop */
    function buildCreator(WIPE) {
      const fig = $('[data-portrait]');
      if (!fig) return;
      gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 82%', once: true } })
        .fromTo($('.portrait-photo', fig), { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(50% at 50% 50%)', duration: 1.6, ease: WIPE, clearProps: 'clipPath' }, 0)
        .from($('.portrait-photo img', fig), { scale: 1.4, duration: 2.2 }, 0)
        .fromTo($('.portrait-ring', fig), { opacity: 0 }, { opacity: 1, duration: 1.4 }, 0.35)
        .fromTo($('.portrait-orbit', fig), { opacity: 0 }, { opacity: 1, duration: 1.6 }, 0.6)
        .fromTo($('.portrait-tag', fig), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1.1, clearProps: 'transform' }, 0.8);
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

    /* Community: the two cards rise in, their glyphs pop like stars igniting */
    function buildCommunity() {
      const grid = $('[data-community]');
      if (!grid) return;
      const st = { trigger: grid, start: 'top 85%', once: true };
      gsap.fromTo($$('.social-card', grid), { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 1.4, stagger: 0.12, clearProps: 'transform', scrollTrigger: st });
      gsap.fromTo($$('.social-glyph, .social-avatar', grid), { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.1, stagger: 0.1, delay: 0.35, ease: 'back.out(2.2)', clearProps: 'transform', scrollTrigger: st });
    }

    /* Finale: the planet's rim brightens and rises, the wordmark lifts out of
       the horizon, and the sky turns into a meteor shower while it is in view */
    function buildFinale() {
      const fin = $('.finale');
      if (!fin) return;
      const st = { trigger: fin, start: 'top bottom', end: 'max', scrub: 0.6 };
      gsap.fromTo('.finale-planet', { y: 90 }, { y: 0, ease: 'none', scrollTrigger: st });
      gsap.fromTo('.finale-rim', { opacity: 0.15, scaleX: 0.55 }, { opacity: 0.95, scaleX: 1, ease: 'none', scrollTrigger: st });
      gsap.fromTo('.footer-word span', { yPercent: 105 }, { yPercent: 0, ease: 'none', stagger: 0.06, scrollTrigger: st });
      const shower = (s) => { if (sky) sky.boost(s.isActive); };
      ScrollTrigger.create({ trigger: '.site-footer', start: 'top 65%', end: 'bottom top', onToggle: shower, onRefresh: shower });
    }

    /* Off-screen sections pause every CSS loop inside them */
    function buildIdle() {
      $$('.hero, .rift, .section, .quote-section, .site-footer').forEach((el) => {
        const set = (s) => el.classList.toggle('is-idle', !s.isActive);
        ScrollTrigger.create({ trigger: el, start: 'top bottom', end: 'bottom top', onToggle: set, onRefresh: set });
      });
    }

    /* Star CTAs — the calls to action that leave the site (Play on Roblox,
       YouTube, Discord) shed light in their own colours (data-burst: gold /
       yt / dc). When a mouse arrives, the pill's outline sheds stars outward;
       a press / tap sprays a burst that falls a little, with a shock ring; a
       springy press (squash, then an elastic release) on every pointer; and
       every click sends a shooting star across the sky behind the page.
       Particles live in one fixed layer, animate transform/opacity only
       (WAAPI, compositor), are capped in number and remove themselves. */
    function buildStarCTAs() {
      const ctas = $$('[data-burst]');
      if (!ctas.length || !doc.body.animate) return;
      html.classList.add('press-js'); // JS owns the press transform now (CSS :active scale stands down)
      const layer = doc.createElement('div');
      layer.className = 'sparks';
      layer.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(layer);
      const PALETTES = {
        gold: ['#ffe27a', '#f9c61b', '#fff6d6', '#ffffff', '#a6e9ff', '#f47a10'],
        yt: ['#ff3355', '#ffffff', '#ffe27a', '#ff8aa0'],
        dc: ['#8b95ff', '#5865f2', '#ffffff', '#a6e9ff'],
      };
      const MAX = 72;
      let live = 0;
      /* one spark: from (x,y) out along angle a for distance d, then a little gravity */
      const spark = (x, y, a, d, size, col) => {
        const s = doc.createElement('i');
        s.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;--c:${col}`;
        layer.appendChild(s);
        live++;
        const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
        const rot = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 140);
        s.animate([
          { transform: 'translate(0,0) scale(.15) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.7}px,${dy * 0.7}px) scale(1) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.38 },
          { transform: `translate(${dx}px,${dy + d * 0.3}px) scale(0) rotate(${rot}deg)`, opacity: 0 },
        ], { duration: 680 + Math.random() * 420, easing: 'cubic-bezier(.2,.8,.3,1)', delay: Math.random() * 50 }).onfinish = () => { s.remove(); live--; };
      };
      /* press: a spray from the press point, plus a shock ring */
      const burst = (x, y, palette, n = 15, reach = 80) => {
        if (paused) return;
        const cols = PALETTES[palette] || PALETTES.gold;
        n = Math.min(n, MAX - live);
        for (let i = 0; i < n; i++) spark(x, y, (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.8, reach * (0.5 + Math.random() * 0.7), 9 + Math.random() * 13, cols[i % cols.length]);
        if (live >= MAX) return;
        const r = doc.createElement('b');
        r.style.cssText = `left:${x}px;top:${y}px;--c:${cols[0]}`;
        layer.appendChild(r);
        r.animate([{ transform: 'scale(.15)', opacity: 0.9 }, { transform: `scale(${reach / 24})`, opacity: 0 }], { duration: 680, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = () => r.remove();
      };
      /* hover: the pill's outline sheds stars outward (squarish edge points, so long pills shed along their flat sides) */
      const shed = (rect, palette, n = 12) => {
        if (paused) return;
        const cols = PALETTES[palette] || PALETTES.gold;
        n = Math.min(n, MAX - live);
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, rx = rect.width / 2, ry = rect.height / 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
          const ca = Math.cos(a), sa = Math.sin(a);
          spark(cx + rx * Math.sign(ca) * Math.abs(ca) ** 0.35, cy + ry * Math.sign(sa) * Math.abs(sa) ** 0.6, Math.atan2(sa * 1.6, ca), 22 + Math.random() * 32, 7 + Math.random() * 9, cols[i % cols.length]);
        }
      };
      // a card's light comes from its call-to-action pill; a button's from itself
      const pillOf = (el) => $('.social-cta', el) || el;
      const centre = (el) => { const r = pillOf(el).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
      ctas.forEach((el) => {
        const card = el.classList.contains('social-card');
        const squash = card ? 0.975 : 0.93;
        const palette = el.dataset.burst || 'gold';
        let lastHover = 0, lastType = 'mouse';
        if (FINE) {
          el.addEventListener('pointerenter', (e) => {
            if (e.pointerType !== 'mouse' || performance.now() - lastHover < 900) return;
            lastHover = performance.now();
            shed(pillOf(el).getBoundingClientRect(), palette);
          });
        }
        // (the menu sheet's CTA keeps its CSS entrance transform: no squash there)
        const canSquash = () => !(el.classList.contains('nav-cta') && isMenuOpen());
        el.addEventListener('pointerdown', (e) => {
          lastType = e.pointerType;
          if (canSquash()) gsap.to(el, { scale: squash, duration: 0.16, ease: 'power2.out', overwrite: 'auto' });
          if (e.pointerType === 'mouse' && e.button === 0) burst(e.clientX, e.clientY, palette);
        });
        const release = () => {
          if (gsap.getProperty(el, 'scale') === 1) return;
          gsap.to(el, {
            scale: 1, duration: 0.85, ease: 'elastic.out(1, 0.42)', overwrite: 'auto',
            // at rest (and not magnetised) hand the transform back to CSS
            onComplete: () => { if (!gsap.getProperty(el, 'x') && !gsap.getProperty(el, 'y')) gsap.set(el, { clearProps: 'transform' }); },
          });
        };
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, release));
        // touch / pen: the burst waits for a real tap (a scroll that starts on the button cancels it)
        // (keyboard activation has detail 0: the burst comes from the pill's centre)
        el.addEventListener('click', (e) => {
          if (sky) sky.shoot(); // …and a star falls across the sky behind the page
          if (e.detail !== 0 && lastType === 'mouse') return;
          const [x, y] = e.detail !== 0 && (e.clientX || e.clientY) ? [e.clientX, e.clientY] : centre(el);
          burst(x, y, palette);
        });
      });
    }

    /* 8. Tactile layer — fine pointers only ------------------------------------ */
    function buildTactile() {
      /* Custom cursor: a precise gold sparkle + lagging ring; GSAP moves the wrappers, CSS scales the inner <i> */
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
      const depthField = (el, { depth = 30, light = false }) => {
        let spot = null, lx, ly;
        if (light) {
          spot = doc.createElement('span');
          spot.className = 'card-light';
          spot.setAttribute('aria-hidden', 'true');
          el.appendChild(spot);
          lx = gsap.quickTo(spot, 'x', { duration: 0.45, ease: 'power3' });
          ly = gsap.quickTo(spot, 'y', { duration: 0.45, ease: 'power3' });
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
          layers.forEach((l) => { l.x(-px * depth * l.d); l.y(-py * depth * l.d); });
        });
        el.addEventListener('pointerleave', () => {
          el.classList.remove('is-hover');
          layers.forEach((l) => { l.x(0); l.y(0); });
        });
      };
      const gameCard = $('.game-card');
      if (gameCard) depthField(gameCard, { depth: 34, light: true });

      /* Social cards: a brand-coloured light follows the pointer inside the card */
      $$('.social-card').forEach((card) => {
        const spot = $('.social-light', card);
        if (!spot) return;
        const sx = gsap.quickTo(spot, 'x', { duration: 0.5, ease: 'power3' });
        const sy = gsap.quickTo(spot, 'y', { duration: 0.5, ease: 'power3' });
        let r = null, stamp = -1;
        const measure = () => { r = card.getBoundingClientRect(); stamp = scrollStamp; };
        card.addEventListener('pointerenter', (e) => { measure(); gsap.set(spot, { x: e.clientX - r.left, y: e.clientY - r.top }); });
        card.addEventListener('pointermove', (e) => { if (!r || stamp !== scrollStamp) measure(); sx(e.clientX - r.left); sy(e.clientY - r.top); });
      });

      /* Hero mark leans toward the pointer: the logo drifts, the star a touch more
         than its tail, the chart counter-moves — a little parallax of depth */
      const hero = $('.hero');
      const art = $('[data-mark-art]');
      const star = $('[data-mark-star]');
      const chart = $('.mark-chart-wrap');
      if (hero && art && star && chart) {
        const q = (n, p, d) => gsap.quickTo(n, p, { duration: d, ease: 'power3' });
        const ax = q(art, 'x', 1.4), ay = q(art, 'y', 1.4), sx = q(star, 'x', 1.6), sy = q(star, 'y', 1.6), cx = q(chart, 'x', 1.8), cy = q(chart, 'y', 1.8);
        hero.addEventListener('pointermove', (e) => {
          const px = e.clientX / window.innerWidth - 0.5;
          const py = e.clientY / window.innerHeight - 0.5;
          ax(-px * 22); ay(-py * 18); sx(-px * 6); sy(-py * 5); cx(px * 12); cy(py * 10);
        });
        hero.addEventListener('pointerleave', () => { ax(0); ay(0); sx(0); sy(0); cx(0); cy(0); });
      }
    }
  } // end boot()
})();
