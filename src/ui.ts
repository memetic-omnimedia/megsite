import { gsap } from 'gsap';
import {
  asset,
  bioParagraphs,
  content,
  decodeEmail,
  DEV,
  esc,
  filled,
  hasBio,
  text,
  todo,
  upcomingEvents,
  visibleAlbums,
  type EventItem,
} from './content';

type Picture = { sources: Record<string, string>; img: { src: string; w: number; h: number } };

// Responsive variants (AVIF / WebP / JPEG at 800 and 1600px) generated at build time by vite-imagetools.
// Eager import only pulls in URL strings; image bytes load when the Bio overlay first opens.
const photoModules = import.meta.glob<Picture>('./assets/photos/*.{jpg,jpeg,png}', {
  eager: true,
  import: 'default',
  query: { w: '800;1600', format: 'webp;jpg', quality: '68', as: 'picture' },
});
// AVIF gets its own (lower) quality setting: at equal settings it is larger than JPEG on these grainy photos.
const avifModules = import.meta.glob<string>('./assets/photos/*.{jpg,jpeg,png}', {
  eager: true,
  import: 'default',
  query: { w: '800;1600', format: 'avif', quality: '42', as: 'srcset' },
});
function photoFor(name: string): Picture | undefined {
  const key = Object.keys(photoModules).find((path) => path.endsWith('/' + name));
  if (!key) return undefined;
  const pic = photoModules[key];
  return { ...pic, sources: { avif: avifModules[key], ...pic.sources } };
}

interface Section {
  id: string;
  label: string;
  wide?: boolean;
  render: () => string;
  onFirstOpen?: (el: HTMLElement) => void;
}

let reduced = false;
let opened: { dialog: HTMLDialogElement; trigger: Element | null } | null = null;
const firstOpened = new Set<string>();

// ── Section renderers ─────────────────────────────────────────────────────────

function bioHtml(): string {
  const paras = bioParagraphs();
  const body = paras.length ? paras.map((p) => `<p>${esc(p)}</p>`).join('') : todo('bio.paragraphs');
  return `
    <div class="bio${body ? '' : ' bio--photos-only'}">
      ${body ? `<div class="bio__text">${body}</div>` : ''}
      <div class="bio__lead" data-photos="lead"></div>
      <div class="bio__rest" data-photos="rest"></div>
    </div>`;
}

function pictureHtml(name: string, sizes: string): string {
  const pic = photoFor(name);
  if (!pic) return todo(`photo ${name} not found in src/assets/photos`);
  const sources = ['avif', 'webp']
    .filter((f) => pic.sources[f])
    .map((f) => `<source type="image/${f}" srcset="${pic.sources[f]}" sizes="${sizes}">`)
    .join('');
  const jpg = pic.sources.jpeg ?? pic.sources.jpg;
  const name0 = filled(content.artistName) ? content.artistName : 'The artist';
  return `<figure class="photo" style="aspect-ratio:${pic.img.w}/${pic.img.h}"><picture>${sources}<img src="${pic.img.src}" ${
    jpg ? `srcset="${jpg}" sizes="${sizes}"` : ''
  } width="${pic.img.w}" height="${pic.img.h}" alt="${esc(name0)}, photo ${esc(name.replace(/\.\w+$/, ''))}" decoding="async"></picture></figure>`;
}

function loadBioPhotos(root: HTMLElement) {
  const [lead, ...rest] = content.bio?.photos ?? [];
  if (lead) root.querySelector('[data-photos="lead"]')!.innerHTML = pictureHtml(lead, '(max-width: 900px) 92vw, 440px');
  root.querySelector('[data-photos="rest"]')!.innerHTML = rest
    .map((p) => pictureHtml(p, '(max-width: 900px) 92vw, 300px'))
    .join('');
  root.querySelectorAll('img').forEach((img) => {
    const fig = img.closest('figure')!;
    if (img.complete) fig.classList.add('is-loaded');
    else img.addEventListener('load', () => fig.classList.add('is-loaded'), { once: true });
  });
}

function musicHtml(): string {
  const items = visibleAlbums()
    .map((a) => {
      const cover = filled(a.cover)
        ? `<img src="${esc(asset(a.cover))}" alt="" loading="lazy" decoding="async" width="600" height="600">`
        : `<span class="album__blank" aria-hidden="true"></span>`;
      const meta = `<span class="album__title">${text(a.title, 'album title')}</span>${
        filled(a.year) ? `<span class="album__year">${esc(a.year)}</span>` : ''
      }`;
      const inner = `<span class="album__cover">${cover}</span><span class="album__meta">${meta}</span>`;
      return filled(a.url)
        ? `<li><a class="album is-link" href="${esc(a.url)}" target="_blank" rel="noopener">${inner}<span class="sr-only"> (opens in a new tab)</span></a></li>`
        : `<li><div class="album">${inner}${DEV ? todo('album url') : ''}</div></li>`;
    })
    .join('');
  return `<ul class="albums">${items}</ul>`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function eventHtml(e: EventItem): string {
  const d = filled(e.date) ? new Date(e.date) : null;
  const when =
    d && !Number.isNaN(+d)
      ? `<time datetime="${esc(e.date!)}"><span>${dateFmt.format(d)}</span><span>${timeFmt.format(d)}</span></time>`
      : todo('event date (ISO, e.g. 2026-11-28T21:00:00-05:00)');
  const where = [e.venue, e.city].filter(filled).map(esc).join(', ');
  return `
    <article class="event">
      <p class="event__when label">${when}</p>
      <h3 class="event__title">${text(e.title, 'event title')}</h3>
      ${filled(e.subtitle) ? `<p class="event__sub">${esc(e.subtitle)}</p>` : todo('event subtitle')}
      ${where ? `<p class="event__where">${where}</p>` : todo('event venue / city')}
      ${
        filled(e.url)
          ? `<a class="ui-btn ui-btn--solid" href="${esc(e.url)}" target="_blank" rel="noopener">Details<span class="sr-only"> for ${esc(e.title ?? 'event')} (opens in a new tab)</span> <span aria-hidden="true">↗</span></a>`
          : todo('event url')
      }
    </article>`;
}

function contactHtml(): string {
  return `
    <div class="contact">
      <p class="contact__lead">For bookings, collaborations and everything else.</p>
      <p class="contact__email" data-email></p>
      <p class="contact__actions">
        <button type="button" class="ui-btn" data-copy hidden>Copy address</button>
        <span class="contact__status label" role="status" aria-live="polite"></span>
      </p>
    </div>`;
}

function wireContact(root: HTMLElement) {
  const email = decodeEmail();
  const slot = root.querySelector<HTMLElement>('[data-email]')!;
  if (!email) {
    slot.innerHTML = todo('contact.email');
    return;
  }
  const a = document.createElement('a');
  a.href = 'mailto:' + email;
  a.textContent = email;
  slot.append(a);
  const btn = root.querySelector<HTMLButtonElement>('[data-copy]')!;
  const status = root.querySelector<HTMLElement>('.contact__status')!;
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(email);
      status.textContent = 'Copied';
    } catch {
      getSelection()?.selectAllChildren(a);
      status.textContent = 'Press ⌘C / Ctrl+C to copy';
    }
    setTimeout(() => (status.textContent = ''), 2400);
  });
}

// ── Overlays ─────────────────────────────────────────────────────────────────

function sections(): Section[] {
  const list: Section[] = [];
  if (hasBio()) list.push({ id: 'bio', label: 'Bio', wide: true, render: bioHtml, onFirstOpen: loadBioPhotos });
  if (visibleAlbums().length) list.push({ id: 'music', label: 'Music', wide: true, render: musicHtml });
  const events = upcomingEvents();
  if (events.length) list.push({ id: 'upcoming', label: 'Upcoming', render: () => events.map(eventHtml).join('') });
  list.push({ id: 'contact', label: 'Contact', render: contactHtml, onFirstOpen: wireContact });
  return list;
}

function buildOverlay(s: Section): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = `overlay${s.wide ? ' overlay--wide' : ''}`;
  d.id = `ov-${s.id}`;
  d.dataset.section = s.id;
  d.setAttribute('aria-labelledby', `ov-${s.id}-title`);
  d.innerHTML = `
    <div class="overlay__panel">
      <header class="overlay__head">
        <h2 class="overlay__title label" id="ov-${s.id}-title">${s.label}</h2>
        <button type="button" class="overlay__close" aria-label="Close ${s.label}" autofocus><span aria-hidden="true">✕</span></button>
      </header>
      <div class="overlay__body">${s.render()}</div>
    </div>`;
  d.querySelector('.overlay__close')!.addEventListener('click', () => requestClose());
  // Click on the backdrop (the dialog box itself, outside the panel) closes.
  d.addEventListener('click', (e) => {
    if (e.target === d) requestClose();
  });
  // Keep Tab / Shift+Tab cycling inside the open overlay.
  d.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...d.querySelectorAll<HTMLElement>('a[href], button:not([hidden]), [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.offsetParent !== null,
    );
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
  });
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestClose();
  });
  return d;
}

function openOverlay(id: string) {
  const d = document.getElementById(`ov-${id}`) as HTMLDialogElement | null;
  if (!d) return;
  if (opened?.dialog === d) return;
  if (opened) closeOverlay(true);
  const s = sectionList.find((x) => x.id === id)!;
  if (!firstOpened.has(id)) {
    firstOpened.add(id);
    s.onFirstOpen?.(d);
  }
  const trigger = document.activeElement;
  d.showModal();
  document.documentElement.classList.add('has-overlay');
  opened = { dialog: d, trigger };
  document.querySelectorAll<HTMLAnchorElement>('#menu a').forEach((a) =>
    a.getAttribute('href') === `#${id}` ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'),
  );
  const panel = d.querySelector('.overlay__panel')!;
  if (!reduced) {
    gsap.killTweensOf([d, panel]);
    gsap.fromTo(d, { '--bd': 0 }, { '--bd': 1, duration: 0.5, ease: 'power2.out' });
    gsap.fromTo(panel, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' });
    gsap.fromTo(
      panel.querySelectorAll('.overlay__body > * > *, .overlay__body > article'),
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.05, delay: 0.1 },
    );
  }
}

function closeOverlay(instant = false) {
  if (!opened) return;
  const { dialog: d, trigger } = opened;
  opened = null;
  document.querySelectorAll('#menu a[aria-current]').forEach((a) => a.removeAttribute('aria-current'));
  const finish = () => {
    d.close();
    document.documentElement.classList.remove('has-overlay');
    if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  if (reduced || instant) return finish();
  const panel = d.querySelector('.overlay__panel')!;
  gsap.killTweensOf([d, panel]);
  gsap.to(d, { '--bd': 0, duration: 0.35, ease: 'power1.in' });
  gsap.to(panel, { autoAlpha: 0, y: 16, duration: 0.3, ease: 'power2.in', onComplete: finish });
}

/** Close via ✕ / Escape / backdrop. If we pushed the hash ourselves, go Back so history stays tidy. */
function requestClose() {
  if (history.state?.overlay) history.back();
  else {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}

function route() {
  const id = location.hash.slice(1);
  if (id && sectionList.some((s) => s.id === id)) openOverlay(id);
  else closeOverlay();
}

// ── Chrome: menu, slides, clock, audio ───────────────────────────────────────

let sectionList: Section[] = [];

function buildMenu() {
  const menu = document.getElementById('menu')!;
  menu.innerHTML = sectionList.map((s) => `<li><a href="#${s.id}">${s.label}</a></li>`).join('');
  menu.addEventListener('click', (e) => {
    const a = (e.target as Element).closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const hash = a.getAttribute('href')!;
    if (location.hash === hash) return;
    // If an overlay we pushed is open, replace instead of stacking history entries.
    if (history.state?.overlay) history.replaceState({ overlay: true }, '', location.pathname + location.search + hash);
    else history.pushState({ overlay: true }, '', location.pathname + location.search + hash);
    route();
  });
}

const humanize = (slug: string) => slug.replace(/[-_]+/g, ' ');

export function buildSlidesNav(onSelect: (i: number) => void, current: number) {
  const slides = content.slides;
  if (slides.length < 2) return;
  const nav = document.getElementById('slides-nav')!;
  nav.hidden = false;
  nav.innerHTML = slides
    .map(
      (s, i) =>
        `<li><a href="?v=${encodeURIComponent(s.slug)}" data-i="${i}"><span class="slides-nav__n">${String(i + 1).padStart(2, '0')}</span> ${esc(
          filled(s.title) ? s.title : humanize(s.slug),
        )}</a></li>`,
    )
    .join('');
  const mark = (i: number) =>
    nav.querySelectorAll('a').forEach((a) => (+a.dataset.i! === i ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  mark(current);
  nav.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const i = +a.dataset.i!;
    const url = new URL(location.href);
    url.searchParams.set('v', slides[i].slug);
    history.replaceState(history.state, '', url);
    mark(i);
    onSelect(i);
  });
}

function startClock() {
  const t = document.getElementById('clock-time')!;
  const d = document.getElementById('clock-date')!;
  const tf = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
  const df = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const tick = () => {
    const now = new Date();
    t.textContent = tf.format(now);
    d.textContent = df.format(now);
    setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
}

/**
 * "Meggie is Dreaming" → MEGGIE (spaced uppercase label) + "is dreaming" (softer lowercase, same face).
 * Letters are wrapped individually for the wake-up animation; screen readers get the plain name.
 */
function renderArtist(el: HTMLElement) {
  const name = content.artistName;
  if (!filled(name)) {
    el.innerHTML = text(name, 'artistName');
    if (!DEV) el.classList.add('sr-only'), (el.textContent = 'Meg');
    el.classList.add('is-split');
    return;
  }
  const letters = (str: string) =>
    [...str].map((ch) => (ch === ' ' ? ' ' : `<span class="artist__ch">${esc(ch)}</span>`)).join('');
  const [first, ...rest] = name.trim().split(/\s+/);
  el.innerHTML =
    `<span class="sr-only">${esc(name)}</span>` +
    `<span class="artist__vis" aria-hidden="true"><span class="artist__lead">${letters(first)}</span>` +
    (rest.length ? ` <span class="artist__rest">${letters(rest.join(' '))}</span>` : '') +
    `</span>`;
  el.classList.add('is-split');
  if (!reduced) {
    // Wake up: each letter resolves out of a soft blur, one after another, then the name starts breathing (CSS).
    gsap.fromTo(
      el.querySelectorAll('.artist__ch'),
      { autoAlpha: 0, filter: 'blur(7px)' },
      { autoAlpha: 1, filter: 'blur(0px)', duration: 1.8, ease: 'power2.out', stagger: 0.075, delay: 0.7, clearProps: 'filter' },
    );
  }
}

function setupAudio() {
  const src = content.audio && filled(content.audio.src) ? content.audio.src : null;
  if (!src) return;
  const btn = document.getElementById('unmute') as HTMLButtonElement;
  btn.hidden = false;
  let audio: HTMLAudioElement | null = null;
  btn.addEventListener('click', () => {
    if (!audio) {
      audio = new Audio(asset(src));
      audio.loop = true;
    }
    const on = audio.paused;
    if (on) audio.play().catch(() => {});
    else audio.pause();
    btn.textContent = on ? 'Mute' : 'Unmute';
    btn.setAttribute('aria-pressed', String(on));
  });
}

export function initUI(opts: { reducedMotion: boolean }) {
  reduced = opts.reducedMotion;
  sectionList = sections();

  renderArtist(document.getElementById('artist')!);
  const tagline = document.getElementById('tagline')!;
  tagline.innerHTML = text(content.tagline, 'tagline (optional)');

  buildMenu();
  const host = document.getElementById('overlays')!;
  sectionList.forEach((s) => host.append(buildOverlay(s)));
  addEventListener('popstate', route);
  addEventListener('hashchange', route);
  route();

  startClock();
  setupAudio();

  if (!reduced) {
    gsap.from('.hud--top > *, .meta > *', { autoAlpha: 0, y: 14, duration: 1.4, ease: 'power3.out', stagger: 0.08, delay: 0.25 });
  }
}
