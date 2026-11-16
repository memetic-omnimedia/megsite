import './styles.css';
import { gsap } from 'gsap';
import { content } from './content';
import { Stage } from './stage';
import { buildSlidesNav, initUI } from './ui';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) gsap.globalTimeline.timeScale(1000);

// ?v=<slug> picks the starting slide.
const slides = content.slides;
const requested = new URLSearchParams(location.search).get('v');
const startIndex = Math.max(0, slides.findIndex((s) => s.slug === requested));

const stage = new Stage(document.getElementById('stage')!, slides, reducedMotion, (set, done) => {
  const o = { p: 0 };
  gsap.to(o, { p: 1, duration: 2.4, ease: 'power2.inOut', onUpdate: () => set(o.p), onComplete: done });
});
stage.show(startIndex);

if (stage.mode === 'reduced') {
  const btn = document.getElementById('play-btn') as HTMLButtonElement;
  const label = btn.querySelector('span')!;
  btn.hidden = false;
  btn.addEventListener('click', () => stage.toggle());
  stage.onPlayState = (playing) => {
    label.textContent = playing ? 'Pause' : 'Play';
    btn.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
  };
}

initUI({ reducedMotion });
buildSlidesNav((i) => stage.show(i), startIndex);
