# Starfall Inc. Website

A static, responsive one-page website for **Starfall Inc.**, the solo Roblox studio of BKProsYT, and its game **Pet Dimensions**.
No build step: open `index.html` or upload the folder.

## Files
- `index.html`: the page, organised by section (header, hero, rift, games, creator, quote, community, contact, footer).
- `styles.css`: the night-sky visual system, motion states and responsive layout, organised in numbered sections (see the table of contents at the top).
  - Type: **Unbounded** for display, **Fredoka** for the rounded "STARFALL INC." banner voice (wordmark, game title, accent words, buttons), **DM Sans** for body copy. All three load from Google Fonts without blocking the page.
  - Palette: night navy, comet cyan and electric blue, and star gold and orange, all taken from the logo.
- `script.js`: every bit of behaviour, organised in numbered sections:
  - mobile menu, header and in-page anchors
  - the starfield sky canvas with logo-built shooting stars and a pause-motion toggle
  - Lenis smooth scroll and the intro handoff
  - GSAP reveals and constellation lines
  - the rift marquee
  - the falling-star comet and the Pet Dimensions portal set piece
  - the creator, quote, community and finale
  - star bursts on the calls to action
  - cursor, magnetic buttons and pointer depth (mouse only)
- `assets/brand/`:
  - `starfall-logo-sm.webp`: the header and footer mark
  - `starfall-star.webp` and `starfall-trail.webp`: the logo split into two layers, so the star can fly on its own
  - `starfall-star-head.webp`: the small star used for shooting stars, the portal core and the creator orbit
  - favicons and the share image
  - `bkprosyt-avatar.webp`: the creator avatar
- `assets/fx/`: two pre-rendered light textures for the Pet Dimensions portal (the vortex swirl and a warp ring), so the running portal never re-blurs or re-masks anything per frame
- `assets/vendor/`: GSAP, ScrollTrigger, SplitText, CustomEase and Lenis, bundled locally (see `assets/vendor/LICENSES.md`).

## Where to edit things
- **Pet Dimensions copy**: in `index.html`, between the `========== PET DIMENSIONS COPY ==========` comments inside the games section. This holds the big art title, the name, blurb, the "500+ pets" stat, the facts and the Play button. A few of those words are repeated elsewhere, so change them there too:
  - the `<head>`: the meta `description`, `og:description` and `twitter:description` tags (they mention "500+ pets");
  - the rift marquee just above the games section (two identical lines; the second is the seamless-loop copy);
  - the hero copy, which mentions the game once.
- **Roblox game link**: `https://www.roblox.com/games/101553263361830/Pet-Dimensions`. It appears in the header CTA, the hero button, the game card, the creator section's "Play" row and the footer links. Search `index.html` for `roblox.com` to change it everywhere.
- **YouTube** (`@BKProsYT`) and **Discord** (`discord.gg/petdimensions`): they appear in the community cards, the creator section's rows, the mobile menu and the footer. Search for `youtube.com` and `discord.gg`.
- **Contact email**: the `mailto:` link in the contact section.
- **Share preview**: the `og:image` and `twitter:image` tags in the `<head>` use a relative path. Once the domain is live, change them to absolute URLs (`https://your-domain/assets/brand/og-image.jpg`).

## Motion & accessibility notes
- **Three tiers.**
  - Without JavaScript, every section is fully visible and readable, with a CSS star sky and plain header links.
  - With "reduce motion" switched on, visitors get a calm, static version. There is no smooth scroll, intro, comet, parallax, pinning, cursor or tilt.
  - Everyone else gets the full motion layer.
- **Safety nets.** If any script fails to load or throws while starting, the page falls back to the static version. A timer in the `<head>` also reveals everything if the scripts have not started within 1.5 s.
- **Intro.** The short intro curtain (≈1.75 s) plays once per browser tab session and has a failsafe.
- **The comet** (desktop, 1024 px and wider): on the first scroll the hero's star breaks away and falls down the page into the rift in the Pet Dimensions card, which then tears open. It is scrubbed by scroll, so scrolling back rewinds it. The trail and the star sit under the page content, so they never cover text. Smaller screens get the same portal opening as you scroll, without the comet.
- **Performance.** Animations use transform, opacity and clip-path. Layout is never read per frame. Canvases draw at 1× resolution (their soft light gains nothing from more). The sky redraws about 60 times a second while a shooting star crosses it (also on 120 Hz and 144 Hz screens), about 30 while it leans toward the pointer, and about 20 otherwise. On phones and low-core devices it redraws about 30 times a second during a shooting star and about 15 otherwise. Loops pause while their section is off-screen and when the tab is hidden.
- **Pause motion.** The footer button stops every self-running animation, and the choice is remembered on that device.
- **Pointer and keyboard.**
  - Touch screens get no custom cursor, magnetism or tilt, and nothing relies on hover.
  - Keyboard focus is always visible. Tabbing into the game card carries you to its finished state.
  - The mobile menu traps focus and closes with Escape.

## Before publishing
1. Check the links and the email above.
2. Change the share-image paths to absolute URLs once the domain is known.
3. Upload the whole folder (including `assets/`) to your hosting provider.

## Custom domain
Your domain can point to the hosting provider later. The exact DNS records depend on where you host the site, so leave DNS alone until you have chosen a host. Then follow that host's "connect a custom domain" instructions and add the DNS records it asks for at your domain registrar.
