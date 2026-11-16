# Changelog

## 0.2.0 (2026-11-15)

- Content: artist name set to "Meggie is Dreaming"; bio paragraphs added from Meg's "Artist Bio" PDF
  (verbatim). Page title, meta description, share card and `<noscript>` pick these up automatically.
- Meta description now trims to a whole word with an ellipsis instead of cutting mid-word.
- Overlays: the HUD (name, menu, clock) fades out while a panel is open so it no longer shows
  through; initial focus goes to the close button instead of the scrollable panel.
- Bio text set slightly smaller with a max line length for the longer copy.

## 0.1.0 (2026-11-15)

Initial site.

- Vite + vanilla TypeScript scaffold; `dev`, `build`, `preview` scripts.
- Raw WebGL renderer: full-screen video texture with cover/contain UV fitting, slow
  noise-displacement drift, film grain, vignette, and a `uProgress` noise-wipe transition used for
  poster → video and slide changes. Frame upload via `requestVideoFrameCallback` where supported.
  DPR capped at 2; rendering pauses when the tab is hidden; context loss degrades to plain video.
- Video source selection (720p on narrow screens, Save-Data, or 2G/3G; else 1080p), with exactly one file loaded.
- Fallbacks: no WebGL → plain `<video>`; reduced motion → poster + Play button, no shader or GSAP motion.
  Autoplay blocked → poster stays, playback starts on first interaction.
- Overlays (Bio, Music, Upcoming, Contact) on native `<dialog>`: hash routing (`#bio`), Back closes,
  Escape / ✕ / backdrop click close, focus trapped and restored, GSAP motion.
- `src/content.json` as the single content source; TODO/empty values hidden in production and
  marked in dev; past events auto-hide; empty sections drop out of the menu; optional looping audio toggle.
- `?v=<slug>` slide selection, plus a numbered slide menu once there are two or more slides.
- Email encoded at build time and assembled at runtime, with a copy button.
- Responsive bio photos (AVIF/WebP/JPEG at 800/1600px) via vite-imagetools, loaded on first open.
- Self-hosted Instrument Serif + Hanken Grotesk (latin, `font-display: swap`, preloaded).
- SEO/social: title, description, canonical, Open Graph + Twitter card with 1200×630 `og.jpg`,
  `<noscript>` fallback, SVG + PNG favicons.
- Hero media encoded from the source clip with the documented ffmpeg commands.
- GitHub Pages deploy workflow; README covering content editing, slides, audio, custom domain.
