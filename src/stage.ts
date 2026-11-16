import { asset, type Fit, type Slide } from './content';
import { Renderer } from './renderer';

export type Mode = 'webgl' | 'fallback' | 'reduced';
type Animate = (set: (p: number) => void, done: () => void) => void;

/** 720p on narrow screens, Save-Data, or slow connections; 1080p otherwise. Exactly one file is loaded. */
export function pickSource(v: Slide['video']): string {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const small =
    matchMedia('(max-width: 900px)').matches || conn?.saveData === true || /(^|-)(2g|3g)$/.test(conn?.effectiveType ?? '');
  return asset(small ? v.src720 : v.src1080);
}

const fitOf = (s: Slide): Fit => (s.fit === 'contain' ? 'contain' : 'cover');

function makeVideo(slide: Slide, autoplay: boolean): HTMLVideoElement {
  const v = document.createElement('video');
  v.muted = true;
  v.defaultMuted = true;
  v.loop = true;
  v.playsInline = true;
  v.autoplay = autoplay;
  v.crossOrigin = 'anonymous';
  v.preload = autoplay ? 'auto' : 'none';
  for (const a of ['muted', 'playsinline', 'loop', ...(autoplay ? ['autoplay'] : [])]) v.setAttribute(a, '');
  v.setAttribute('aria-hidden', 'true');
  v.tabIndex = -1;
  v.poster = asset(slide.video.poster);
  v.src = pickSource(slide.video);
  return v;
}

function release(v: HTMLVideoElement) {
  v.pause();
  v.removeAttribute('src');
  v.load();
  v.remove();
}

export class Stage {
  readonly mode: Mode;
  private el: HTMLElement;
  private renderer: Renderer | null = null;
  private video: HTMLVideoElement | null = null;
  private index = -1;
  private pending: number | null = null;
  private busy = false;
  private wantsPlay = true;
  private gestureArmed = false;
  private animate: Animate;
  onPlayState?: (playing: boolean) => void;

  constructor(el: HTMLElement, private slides: Slide[], reducedMotion: boolean, animate: Animate) {
    this.el = el;
    this.animate = animate;
    if (reducedMotion) this.mode = 'reduced';
    else {
      this.renderer = Renderer.create(() => this.loseContext());
      this.mode = this.renderer ? 'webgl' : 'fallback';
    }
    document.documentElement.dataset.stage = this.mode;

    addEventListener('resize', () => this.renderer?.resize(), { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.suspend() : this.resume()));
  }

  get current(): number {
    return this.index;
  }

  show(i: number) {
    if (i === this.index && this.video) return;
    if (this.busy) {
      this.pending = i;
      return;
    }
    const first = this.index === -1;
    const prev = this.video;
    this.index = i;
    const slide = this.slides[i];

    if (this.mode === 'webgl' && this.renderer) {
      const r = this.renderer;
      if (first) {
        // Poster first, so the screen is never blank.
        const img = new Image();
        img.decoding = 'async';
        img.src = asset(slide.video.poster);
        r.setImmediate(img, fitOf(slide));
        this.el.append(r.canvas);
        img.decode().catch(() => {}).finally(() => {
          r.play();
          requestAnimationFrame(() => r.canvas.classList.add('is-ready'));
        });
      }
      const v = makeVideo(slide, true);
      v.className = 'stage__source';
      this.el.append(v);
      this.video = v;
      this.busy = true;
      v.addEventListener(
        'playing',
        () => {
          r.transitionTo(v, fitOf(slide), (set, done) =>
            this.animate(set, () => {
              done();
              if (prev) release(prev);
              this.busy = false;
              this.flush();
            }),
          );
        },
        { once: true },
      );
      this.tryPlay(v);
      return;
    }

    // Fallback / reduced motion: the plain <video>, object-fit via CSS.
    const v = makeVideo(slide, this.mode === 'fallback');
    v.className = `stage__video${slide.fit === 'contain' ? ' is-contain' : ''}`;
    v.removeAttribute('aria-hidden');
    v.setAttribute('aria-label', 'Background video');
    this.el.append(v);
    if (prev) release(prev);
    this.video = v;
    v.addEventListener('play', () => this.onPlayState?.(true));
    v.addEventListener('pause', () => this.onPlayState?.(false));
    if (this.mode === 'fallback') this.tryPlay(v);
    else this.wantsPlay = false;
  }

  /** Reduced-motion play/pause toggle. */
  toggle() {
    const v = this.video;
    if (!v) return;
    if (v.paused) {
      this.wantsPlay = true;
      v.play().catch(() => {});
    } else {
      this.wantsPlay = false;
      v.pause();
    }
  }

  private flush() {
    if (this.pending !== null && this.pending !== this.index) {
      const n = this.pending;
      this.pending = null;
      this.show(n);
    } else this.pending = null;
  }

  private tryPlay(v: HTMLVideoElement) {
    const p = v.play();
    p?.catch(() => this.armGesture());
  }

  /** Autoplay blocked (e.g. iOS Low Power Mode): keep the poster and start on the first interaction anywhere. */
  private armGesture() {
    if (this.gestureArmed) return;
    this.gestureArmed = true;
    const start = () => {
      ['pointerdown', 'keydown', 'touchstart'].forEach((t) => removeEventListener(t, start, true));
      this.gestureArmed = false;
      if (this.video && this.wantsPlay) this.video.play().catch(() => this.armGesture());
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach((t) => addEventListener(t, start, { capture: true, passive: true }));
  }

  private suspend() {
    this.renderer?.stop();
    this.video?.pause();
  }

  private resume() {
    this.renderer?.play();
    if (this.video && this.wantsPlay) this.video.play().catch(() => this.armGesture());
  }

  private loseContext() {
    // Context lost (GPU reset, too many contexts): degrade to the plain video rather than a frozen frame.
    this.renderer?.canvas.remove();
    if (this.video) {
      this.video.className = 'stage__video';
      this.video.removeAttribute('aria-hidden');
    }
    document.documentElement.dataset.stage = 'fallback';
  }
}
