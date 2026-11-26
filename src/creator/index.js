import './portrait.css';
import { bindPortraitOrbit } from './orbit.js';
import { createPortraitSpin, turnDuration } from './spin.js';
import { makeTurntable } from './turntable.js';
import { fallbackMaterial } from './fallback-material.js';
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
    auto = true, visible = false, pageActive = true, timer = 0;
  const spin = createPortraitSpin();
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
    return spin.value() + (motion && !reduced.matches ? deviceTilt.yaw + deviceTilt.x * .16 : 0);
  }
  function pitch() { return motion && !reduced.matches ? deviceTilt.y * .15 : 0; }
  function syncPoster() {
    clearTimeout(timer);
    timer = 0;
    if (host.dataset.render === 'webgl' || !posterURL.endsWith('/creator/poster.webp')) return;
    const fallback = flat || host.dataset.render === 'context-lost';
    const track = getMode();
    // Keep the initial poster while WebGL starts. The extra grades are fetched only in fallback.
    const material = fallbackMaterial(fallback || track === 'acid' ? track : 'chrome', look);
    const next = base + 'creator/poster' + material.poster + '.webp';
    if (poster.getAttribute('src') !== next) poster.setAttribute('src', next);
    if (fallback) {
      // The natural material uses its photographed colours in every track.
      atlas.show(yaw(), material.atlas);
      if (spin.running) timer = setTimeout(() => { syncPoster(); orbit?.updateReadout(); }, turnDuration / 48);
    }
  }
  function refresh() {
    syncPoster();
    stage?.invalidate();
  }
  const controls = host.closest('.creator-column')?.querySelector('.creator-orbit-controls');
  const spinButton = controls?.querySelector('[data-orbit="spin"]');
  let orbit;
  function syncSpin() {
    const allowed = motion && !reduced.matches;
    spin.setRunning(allowed && auto && visible && pageActive && !document.hidden && !!(stage || flat));
    if (spinButton) {
      spinButton.hidden = !allowed;
      spinButton.querySelector('[data-auto-label=pause]').hidden = !auto;
      spinButton.querySelector('[data-auto-label=play]').hidden = auto;
    }
    orbit?.updateReadout();
    refresh();
  }
  if (controls) orbit = bindPortraitOrbit(host, controls, value => {
    auto = false;
    spin.setRunning(false);
    spin.set(value);
    syncSpin();
  }, recenterDeviceTilt, spin.value, () => { auto = !auto; syncSpin(); });
  const syncReadout = () => { if (document.activeElement === host) orbit?.updateReadout(); };
  syncSpin();
  async function start() {
    try {
      const { createPortraitStage } = await import('./stage.js');
      if (abort.signal.aborted) return;
      const mobile = window.matchMedia('(max-width:800px)').matches || navigator.connection?.saveData;
      stage = await createPortraitStage(host, {
        url: modelURL || base + 'creator/creator-' + (mobile ? 'mobile' : 'desktop') + '.glb',
        syncPoster, yaw, pitch,
        beat: getSignal,
        playing: () => spin.running || (look !== 'natural' && isPlaying()),
        afterDraw: syncReadout,
        track: getMode,
        look: () => look,
        moving: () => motion,
        signal: abort.signal,
      });
    } catch (error) {
      if (!abort.signal.aborted) {
        flat = true;
        host.dataset.render = 'fallback';
      }
    }
    if (!abort.signal.aborted) syncSpin();
  }
  let nearView = false, started = false;
  const observeNear = entries => {
    nearView = entries.some(e => e.isIntersecting);
    if (nearView && !started) { started = true; void start(); }
  };
  let near, viewport;
  const visibility = () => syncSpin();
  const hide = () => { pageActive = false; syncSpin(); };
  const show = () => { pageActive = true; syncSpin(); };
  if ('IntersectionObserver' in window) {
    near = new IntersectionObserver(observeNear,{rootMargin:'160px'});
    near.observe(host);
    viewport = new IntersectionObserver(entries => { visible = entries.some(e=>e.isIntersecting); syncSpin(); });
    viewport.observe(host);
  } else {
    visible = nearView = started = true;
    void start();
  }
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',hide);
  window.addEventListener('pageshow',show);
  reduced.addEventListener?.('change',visibility);
  window.addEventListener('visionoir:audio', refresh);
  const tiltChanged = () => { if (nearView && !document.hidden) refresh(); };
  window.addEventListener('visionoir:tilt', tiltChanged);
  return {
    setMotion(value) {
      motion = !!value;
      syncSpin();
    },
    setLook(value) {
      look = ['metal', 'natural', 'liquid'].includes(value) ? value : 'metal';
      refresh();
    },
    dispose() {
      abort.abort();
      near?.disconnect();
      viewport?.disconnect();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',hide);
      window.removeEventListener('pageshow',show);
      reduced.removeEventListener?.('change',visibility);
      stage?.dispose();
      orbit?.dispose();
      atlas.dispose();
      window.removeEventListener('visionoir:tilt', tiltChanged);
      if (ownPoster) poster.remove();
      window.removeEventListener('visionoir:audio', refresh);
    },
  };
}
