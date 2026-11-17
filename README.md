# megsite

A small, static artist site: a full-screen video drawn on a WebGL canvas with a subtle
noise-displacement shader, minimal type over it, and a few overlay panels (Bio, Music,
Upcoming, Contact).

Stack: Vite + vanilla TypeScript, raw WebGL (no three.js), GSAP for UI motion, self-hosted
fonts (Instrument Serif + Hanken Grotesk, both OFL). Deployed to GitHub Pages by GitHub Actions.

```bash
npm install
npm run dev       # local dev server (shows yellow TODO markers for missing content)
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

---

## Editing content (`src/content.json`)

Everything you see on the site comes from **one file**: `src/content.json`. Edit it on GitHub
(pencil icon → "Commit changes") and the site redeploys itself within a minute or two.

| Field | What it does |
| --- | --- |
| `artistName` | The big name in the corner, the page title, and the share-card title. |
| `tagline` | Optional short line in the top-left corner. Leave `""` for none. |
| `slides` | The background videos (see "Adding a video slide" below). |
| `bio.paragraphs` | List of paragraphs, e.g. `["First paragraph.", "Second paragraph."]`. |
| `bio.photos` | File names of photos in `src/assets/photos/`. The first one leads on phones, so make it the portrait. |
| `albums` | `{ "title", "year", "cover", "url" }`. `cover` is a path like `"media/covers/my-album.jpg"` (put the image in `public/media/covers/`). With no `url` the cover isn't clickable. |
| `events` | `{ "title", "subtitle", "date", "venue", "city", "url" }`. `date` is ISO 8601 **with timezone**, e.g. `"2026-11-28T21:00:00-05:00"`. |
| `contact.email` | Shown in the Contact panel. It is never written into the HTML as plain text (it's encoded at build time and assembled in the browser), so simple scrapers don't pick it up. |
| `audio` | `null` for now. See "Adding background audio". |

Rules the site follows automatically:

- **Anything empty or containing `TODO` is hidden** in the live site. In `npm run dev` it shows
  as a small yellow `TODO:` badge so gaps are easy to spot.
- **Past events disappear by themselves**, checked in the visitor's browser. An event stays
  listed until 6 hours after its start time, so it's still visible while the set is happening.
  If no upcoming events are left, the Upcoming menu item and panel are hidden.
- Albums with nothing filled in are hidden; if none remain, the Music section is hidden.

Be careful with JSON syntax: strings in double quotes, commas between items, no trailing comma.
If the build fails after an edit, the Actions tab on GitHub will show the error.

## Adding a video slide

1. Encode the new clip (no audio, 30fps, H.264, faststart), plus a 720p version and a poster still:

   ```bash
   ffmpeg -i input.mov -an -vf "fps=30" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart out-1080.mp4
   ffmpeg -i input.mov -an -vf "fps=30,scale=-2:720" -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart out-720.mp4
   ffmpeg -ss 5 -i input.mov -frames:v 1 -q:v 4 poster.jpg
   ```

   (`-ss 5` takes the poster frame at 5 seconds; pick whatever moment looks best.)

2. Copy the three files into `public/media/`, with distinct names (e.g. `studio-1080.mp4`,
   `studio-720.mp4`, `studio-poster.jpg`). Don't re-encode the files again after this.

3. Add an entry to `slides` in `src/content.json`:

   ```json
   {
     "slug": "studio",
     "title": "Studio",
     "video": { "src1080": "media/studio-1080.mp4", "src720": "media/studio-720.mp4", "poster": "media/studio-poster.jpg" },
     "fit": "cover"
   }
   ```

   - `slug` is used in links: `https://…/?v=studio` opens straight on that video.
   - `title` is optional (defaults to the slug); it's shown in the numbered video menu that
     appears bottom-right as soon as there are two or more slides.
   - `fit`: `"cover"` fills the screen (cropping edges), `"contain"` shows the whole frame.

Switching slides plays a shader dissolve between the two videos. Visitors on phones, with
Data Saver on, or on 2G/3G get the 720p file; everyone else gets 1080p. Only one is downloaded.

## Background audio

The site currently plays **"just gotta clear my head"** (`public/media/just-gotta-clear-my-head.m4a`).
In `content.json`:

```json
"audio": { "src": "media/just-gotta-clear-my-head.m4a", "title": "just gotta clear my head" }
```

- An **Unmute** button sits bottom-right. Nothing downloads until someone presses it; the song then
  fades in, loops, and fades out again on **Mute**.
- `title` is optional. While the song plays it shows as a small "Now playing" credit next to the button.
- Set `"audio": null` to remove the button entirely.

To swap in a new track, convert the original WAV to AAC (≈1/7 the size, plays in every current browser),
put it in `public/media/`, and point `src` at it:

```bash
ffmpeg -i "input.wav" -vn -c:a aac -b:a 192k -movflags +faststart public/media/my-track.m4a
```

## Photos

Bio photos live in `src/assets/photos/`. At build time each one is turned into AVIF, WebP and
JPEG at 800px and 1600px wide; browsers pick the best one. Drop in large originals (~2000px):
don't resize them yourself. They only load when the Bio panel is opened.

## Deploying

Every push to `main` builds and deploys via `.github/workflows/deploy.yml`.

One-time GitHub setup: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

The site is served at `https://memetic-omnimedia.github.io/megsite/`. If the repo is renamed,
change `REPO_NAME` at the top of `vite.config.ts`.

### Custom domain

1. In `vite.config.ts`, set `BASE_PATH` to `'/'` and `SITE_URL` to your domain, e.g.
   `'https://meg.example.com/'`.
2. Create `public/CNAME` containing just the domain (one line, e.g. `meg.example.com`). Vite
   copies it into the build, which keeps GitHub Pages from forgetting the domain on each deploy.
3. At your DNS provider: for a subdomain, add a `CNAME` record pointing to
   `memetic-omnimedia.github.io`. For an apex domain (`example.com`), add `A` records to
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
4. In **Settings → Pages**, enter the custom domain and tick **Enforce HTTPS** once it's available.

## How it works (for developers)

- `src/stage.ts` picks the video source, keeps a hidden `<video>` as the texture source, shows the
  poster first, then swaps to the video on its first `playing` event. If autoplay is blocked
  (e.g. iOS Low Power Mode) the poster stays up and playback starts on the first tap/key.
  Rendering and playback pause when the tab is hidden.
- `src/renderer.ts` is raw WebGL1: one full-screen triangle, two texture layers (A/B) with
  cover/contain UV fitting, a procedural tiling noise texture for slow displacement drift,
  grain, vignette, and a `uProgress` noise-wipe transition between layers. Video frames are
  uploaded only when new (`requestVideoFrameCallback`, else every animation frame). DPR is capped at 2.
- Fallbacks: no WebGL → the plain `<video>` with `object-fit`; `prefers-reduced-motion` → poster
  still with a Play button, no shader, no GSAP motion, and no video download until Play is pressed.
- `vite.config.ts` injects the title, meta description, Open Graph/Twitter tags, the `<noscript>`
  fallback and the poster/font preloads from `content.json` at build time, and encodes the email.
- `scripts/make-icons.mjs` regenerates the favicon PNGs and the 1200×630 share image
  (`public/og.jpg`, cropped from the poster). Run `node scripts/make-icons.mjs` after changing the poster.
