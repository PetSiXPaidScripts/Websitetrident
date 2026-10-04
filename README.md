# Trident Studio Website

A static, responsive one-page website for Trident.

## Files
- `index.html` — page structure/content
- `styles.css` — dark luxury visual system (Manrope + Instrument Serif italic accents + DM Sans), motion states + responsive layout (organised by section)
- `script.js` — mobile menu, Lenis smooth scroll, intro handoff, GSAP reveals, pinned games sequence, scroll-velocity marquee and grid floors, hero gold-dust canvas, sunrise footer finale, custom cursor, magnetic buttons and pointer depth
- `assets/trident-logo.jpeg` — supplied Trident logo (also used as favicon)
- `assets/vendor/` — GSAP, ScrollTrigger, SplitText, CustomEase and Lenis, bundled locally (see `LICENSES.md`)

## Motion & accessibility notes
- Visitors with "reduce motion" enabled get a calm, static version (no smooth scroll, intro, parallax, pinning, cursor or tilt).
- If a script fails to load or throws while starting, the page falls back to the same static version.
- Looping effects pause while their section is off-screen, and the dust canvas stops when the tab is hidden.
- Without JavaScript every section is fully visible; animations only hide content once scripts are confirmed running.
- The short intro curtain plays once per browser tab session.

## Before publishing
1. If you change your contact email, update the `mailto:` link in the contact section of `index.html`.
2. If you change your Roblox game, replace the three Roblox URLs in `index.html`.
3. Upload the whole folder (including `assets/`) to your hosting provider.

## Custom domain
Your `bkprosyt.com` domain can point to the hosting provider later. The exact DNS records depend on where you host the site, so don't change DNS yet unless you know the host. Once you choose the host, follow its "connect custom domain" instructions and add the requested DNS records at your domain registrar.
