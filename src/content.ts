import raw from './content.json';

export type Fit = 'cover' | 'contain';

export interface Slide {
  slug: string;
  title?: string;
  video: { src1080: string; src720: string; poster: string };
  fit?: Fit;
}
export interface Album { title?: string; year?: string; cover?: string; url?: string }
export interface EventItem {
  title?: string;
  subtitle?: string;
  date?: string;
  venue?: string;
  city?: string;
  url?: string;
}
export interface Content {
  artistName?: string;
  tagline?: string;
  slides: Slide[];
  bio?: { paragraphs?: string[]; photos?: string[] };
  albums?: Album[];
  events?: EventItem[];
  /** `e` is the encoded address produced by the site-content plugin in vite.config.ts. */
  contact?: { e?: string[] };
  audio?: { src: string } | null;
}

export const content = raw as unknown as Content;
export const DEV = import.meta.env.DEV;
export const BASE = import.meta.env.BASE_URL;

/** A value counts as "filled" when it is a non-empty string that does not contain TODO. */
export const filled = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '' && !/TODO/.test(v);

/** Resolve a path from content.json (relative to /public) against the deploy base. */
export const asset = (p: string) => (/^(https?:)?\/\//.test(p) ? p : BASE + p.replace(/^\//, ''));

/** Visible TODO marker for `vite dev` only. Returns '' in production builds. */
export const todo = (label: string) => (DEV ? `<span class="todo">TODO: ${esc(label)}</span>` : '');

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Text if filled, otherwise a dev-only TODO marker (or nothing in production). */
export const text = (v: unknown, label: string) => (filled(v) ? esc(v) : todo(label));

export function decodeEmail(): string | null {
  const parts = content.contact?.e;
  if (!parts?.length) return null;
  return parts.map((p) => atob(p)).join('').split('').reverse().join('');
}

/** Events stay listed until a few hours after their start time, so a set in progress is still visible. */
const GRACE_MS = 6 * 60 * 60 * 1000;

export function upcomingEvents(now = Date.now()): EventItem[] {
  return (content.events ?? []).filter((e) => {
    const t = filled(e.date) ? Date.parse(e.date) : NaN;
    if (Number.isNaN(t)) return DEV && (filled(e.title) || filled(e.subtitle)); // show incomplete events in dev only
    return t + GRACE_MS >= now;
  });
}

export function visibleAlbums(): Album[] {
  return (content.albums ?? []).filter((a) => filled(a.title) || filled(a.cover) || (DEV && a.title !== undefined));
}

export const bioParagraphs = () => (content.bio?.paragraphs ?? []).filter(filled);

export function hasBio(): boolean {
  return bioParagraphs().length > 0 || (content.bio?.photos?.length ?? 0) > 0 || DEV;
}
