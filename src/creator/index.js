import './portrait.css';
import { bindPortraitOrbit } from './orbit.js';
import { makeTurntable } from './turntable.js';
import { deviceTilt, recenterDeviceTilt } from '../device-tilt.js';

const base = import.meta.env?.BASE_URL || '/';
export function mountCreator(
  host,
  {
    getSignal = () => ({}),
    isPlaying = () => true,
    getMode = () => 'chrome',
    modelURL,
    posterURL = base + 'creator/poster.webp',
    reducedMotion = false,
  } = {},
) {
  const abort = new AbortController();
  let motion = !reducedMotion,
    look = 'metal',
    stage = null,
    poster = host.querySelector('img'),
    ownPoster = false,
    flat = false,
    angle = 0;
  host.classList.add('creator-render-surface');
  host.dataset.render = 'fallback';
  if (!poster) {
    poster = document.createElement('img');
    poster.alt = '';
    poster.src = posterURL;
    host.prepend(poster);
    ownPoster = true;
  }
  poster.classList.add('creator-poster');
  const atlas = makeTurntable(host, base);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function yaw() {
    return angle + (motion && !reduced.matches ? deviceTilt.yaw + deviceTilt.x * .16 : 0);
  }
  function pitch() { return motion && !reduced.matches ? deviceTilt.y * .15 : 0; }
  function syncPoster() {
    if (host.dataset.render === 'webgl' || !posterURL.endsWith('/creator/poster.webp')) return;
    const acid = getMode() === 'acid';
    const variant = (acid ? '-acid' : '') + (look === 'metal' ? '' : '-' + look);
    const next = base + 'creator/poster' + variant + '.webp';
    if (poster.getAttribute('src') !== next) poster.setAttribute('src', next);
    if (flat || host.dataset.render === 'context-lost') {
      // The natural material uses its photographed colours in every track.
      atlas.show(yaw(), look === 'natural' ? '-natural' : variant);
    }
  }
  function refresh() {
    syncPoster();
    stage?.invalidate();
  }
  const controls = host.closest('.creator-column')?.querySelector('.creator-orbit-controls');
  const releaseOrbit = controls ? bindPortraitOrbit(host, controls, value => {
    angle = value;
    refresh();
  }, recenterDeviceTilt) : null;
  syncPoster();
  async function start() {
    try {
      const { createPortraitStage } = await import('./stage.js');
      if (abort.signal.aborted) return;
      const mobile = window.matchMedia('(max-width:800px)').matches || navigator.connection?.saveData;
      stage = await createPortraitStage(host, {
        url: modelURL || base + 'creator/creator-' + (mobile ? 'mobile' : 'desktop') + '.glb',
        syncPoster, yaw, pitch,
        beat: getSignal,
        playing: isPlaying,
        track: getMode,
        look: () => look,
        moving: () => motion,
        signal: abort.signal,
      });
    } catch (error) {
      if (!abort.signal.aborted) {
        flat = true;
        host.dataset.render = 'fallback';
        syncPoster();
      }
    }
  }
  let nearView = false, started = false;
  const near = new IntersectionObserver(
    (entries) => {
      nearView = entries.some(entry => entry.isIntersecting);
      if (!nearView) return;
      if (!started) { started = true; void start(); }
      else refresh();
    },
    { rootMargin: '160px' },
  );
  near.observe(host);
  window.addEventListener('visionoir:audio', refresh);
  const tiltChanged = () => { if (nearView && !document.hidden) refresh(); };
  window.addEventListener('visionoir:tilt', tiltChanged);
  return {
    setMotion(value) {
      motion = !!value;
      refresh();
    },
    setLook(value) {
      look = ['metal', 'natural', 'liquid'].includes(value) ? value : 'metal';
      refresh();
    },
    dispose() {
      abort.abort();
      near.disconnect();
      stage?.dispose();
      releaseOrbit?.();
      atlas.dispose();
      window.removeEventListener('visionoir:tilt', tiltChanged);
      if (ownPoster) poster.remove();
      window.removeEventListener('visionoir:audio', refresh);
    },
  };
}
