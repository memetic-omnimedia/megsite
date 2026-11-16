import { defineConfig, type Plugin } from 'vite';
import { imagetools } from 'vite-imagetools';
import { readFileSync } from 'node:fs';

/**
 * Deployment settings. These are the only two values you need to touch
 * when moving to a custom domain (see README → "Custom domain").
 *
 *   BASE_PATH  – '/<repo-name>/' for a GitHub Pages project site, '/' for a custom domain.
 *   SITE_URL   – absolute URL of the live site, used for Open Graph / Twitter tags.
 *
 * Both can also be overridden with environment variables of the same name.
 */
const REPO_NAME = 'megsite';
const BASE_PATH = process.env.BASE_PATH ?? `/${REPO_NAME}/`;
const SITE_URL = (process.env.SITE_URL ?? `https://memetic-omnimedia.github.io/${REPO_NAME}/`).replace(/\/?$/, '/');

const CONTENT_PATH = new URL('./src/content.json', import.meta.url);

const isFilled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && !/TODO/.test(v);
/** Trim to the last whole word under `max` chars, for meta descriptions. */
const clip = (s: string, max: number) => (s.length <= max ? s : s.slice(0, s.lastIndexOf(' ', max - 1)).replace(/[,;:]$/, '') + '…');
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Split + reverse the address so it never appears verbatim in built HTML or JS. */
function encodeEmail(email: string): string[] {
  return email
    .split('')
    .reverse()
    .join('')
    .match(/.{1,4}/g)!
    .map((chunk) => btoa(chunk));
}

function siteContent(): Plugin {
  return {
    name: 'site-content',
    enforce: 'pre',
    transform(code, id) {
      // Replace the plain email with encoded fragments before Vite turns the JSON into a module.
      if (!id.endsWith('/src/content.json')) return;
      const data = JSON.parse(code);
      const email = data.contact?.email;
      if (typeof email === 'string') {
        data.contact = { ...data.contact, email: undefined, e: encodeEmail(email) };
      }
      return { code: JSON.stringify(data), map: null };
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const c = JSON.parse(readFileSync(CONTENT_PATH, 'utf8'));
        const name = isFilled(c.artistName) ? c.artistName : 'Meg';
        const paragraphs: string[] = (c.bio?.paragraphs ?? []).filter(isFilled);
        const description = isFilled(c.tagline)
          ? c.tagline
          : (paragraphs[0] && clip(paragraphs[0], 155)) ?? `${name}: DJ and artist. Music, upcoming shows and contact.`;
        const ogImage = `${SITE_URL}og.jpg`;
        const head = `
    <title>${esc(name)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${SITE_URL}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(name)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE_URL}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(name)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${ogImage}" />`;
        const noscript = `
    <noscript>
      <div class="noscript">
        <h1>${esc(name)}</h1>
        ${isFilled(c.tagline) ? `<p>${esc(c.tagline)}</p>` : ''}
        ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
        <p>For contact details, please enable JavaScript.</p>
      </div>
    </noscript>`;
        const poster = BASE_PATH + c.slides[0].video.poster;
        const preload = `\n    <link rel="preload" as="image" href="${poster}" fetchpriority="high" />`;
        return html
          .replace('<!--head-meta-->', head + preload)
          .replace('<!--noscript-->', noscript)
          .replace('<!--artist-->', isFilled(c.artistName) ? esc(c.artistName) : '')
          .replace('%POSTER%', poster);
      },
    },
  };
}

/**
 * Preload the UI text face, which is visible on first paint. The serif display face is only used
 * inside the overlays, so it loads on demand instead of competing with the poster.
 */
function preloadFonts(): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const fonts = Object.keys(ctx.bundle ?? {}).filter((f) =>
          /hanken-grotesk-latin-400-normal.*\.woff2$/.test(f),
        );
        return fonts.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: BASE_PATH + f, as: 'font', type: 'font/woff2', crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

export default defineConfig({
  base: BASE_PATH,
  plugins: [siteContent(), preloadFonts(), imagetools()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
