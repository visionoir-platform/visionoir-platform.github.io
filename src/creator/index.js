import './portrait.css';

const base = import.meta.env?.BASE_URL || '/';
export function mountCreator(
  host,
  {
    getSignal = () => ({}),
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
    ownPoster = false;
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
  function syncPoster() {
    if (host.dataset.render === 'webgl' || !posterURL.endsWith('/creator/poster.webp')) return;
    const acid = getMode() === 'acid';
    const variant = (acid ? '-acid' : '') + (look === 'metal' ? '' : '-' + look);
    const next = base + 'creator/poster' + variant + '.webp';
    if (poster.getAttribute('src') !== next) poster.setAttribute('src', next);
  }
  function refresh() {
    syncPoster();
    stage?.invalidate();
  }
  syncPoster();
  async function start() {
    try {
      const { createPortraitStage } = await import('./stage.js');
      if (abort.signal.aborted) return;
      const mobile = window.matchMedia('(max-width:800px)').matches || navigator.connection?.saveData;
      stage = await createPortraitStage(host, {
        url: modelURL || base + 'creator/creator-' + (mobile ? 'mobile' : 'desktop') + '.glb',
        syncPoster,
        beat: getSignal,
        track: getMode,
        look: () => look,
        moving: () => motion,
        signal: abort.signal,
      });
    } catch (error) {
      if (!abort.signal.aborted) host.dataset.render = 'fallback';
    }
  }
  const near = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near.disconnect();
        void start();
      }
    },
    { rootMargin: '160px' },
  );
  near.observe(host);
  window.addEventListener('visionoir:audio', refresh);
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
      if (ownPoster) poster.remove();
      window.removeEventListener('visionoir:audio', refresh);
    },
  };
}
