import { tracks } from './tracks.js';

export function createAudioEngine({ enabledTracks = tracks.map(track => track.id), onMediaAction } = {}) {
  const available = tracks.filter(track => enabledTracks.includes(track.id));
  const entries = new Map();
  const zero = Object.freeze({bass:0, mid:0, high:0, level:0});
  const data = { ...zero };
  const bands = ['bass', 'mid', 'high', 'level'];
  const media = navigator.mediaSession;
  const assetBase = import.meta.env?.BASE_URL || '/';
  const artwork = [96, 192, 512].map(size => ({
    src: new URL(assetBase + 'assets/visionoir-original-cover-v1-' + size + '.png', location.origin).href,
    sizes: size + 'x' + size,
    type: 'image/png',
  }));
  let selected = available[0];
  let active = null;
  let pending = null;
  let generation = 0;
  let volume = 0.23;
  let frame = 0;
  let disposed = false;
  let mediaActions = false;
  let metadataTrack = null;

  const playing = () => Boolean(active && !active.audio.paused && !active.audio.ended);
  function signal(error = null) {
    if (disposed) return;
    if (media && mediaActions) {
      media.playbackState = playing() ? 'playing' : 'paused';
      if (active && metadataTrack !== active.track && typeof MediaMetadata !== 'undefined') {
        metadataTrack = active.track;
        media.metadata = new MediaMetadata({title:active.track.title, artist:'VISIONOIR', album:'VISIONOIR', artwork});
      }
    }
    window.dispatchEvent(new CustomEvent('visionoir:audio', {
      detail:{playing:playing(), track:selected, loading:Boolean(pending), error},
    }));
  }

  function setMix(entry, gain) {
    entry.gain = gain;
    entry.audio.volume = volume * gain;
    // Some mobile versions reserve programmatic volume for the device controls.
    entry.audio.muted = volume === 0;
  }

  function stop(entry) {
    entry.request = 0;
    entry.audio.pause();
    setMix(entry, 0);
  }

  function cancelFade() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function finishFade() {
    cancelFade();
    for (const entry of entries.values()) {
      if (entry === active) setMix(entry, 1);
      else if (entry !== pending?.entry) stop(entry);
    }
  }

  function crossfade(previous) {
    cancelFade();
    if (!previous || !playing() || document.hidden || !active.adjustable || previous.audio.paused) {
      finishFade();
      return;
    }
    const mix = [...entries.values()].filter(entry => !entry.audio.paused).map(entry => [entry,entry.gain]);
    const start = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - start) / 600);
      for (const [entry,from] of mix) setMix(entry, from + ((entry === active ? 1 : 0) - from) * progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else finishFade();
    };
    frame = requestAnimationFrame(tick);
  }

  function pause() {
    generation++;
    pending = null;
    active = null;
    cancelFade();
    for (const entry of entries.values()) stop(entry);
    signal();
  }

  function bindMediaActions() {
    if (!media || mediaActions) return;
    mediaActions = true;
    const handlers = {
      play: () => { onMediaAction?.('play'); void selectTrack(selected.id); },
      pause: () => { onMediaAction?.('pause'); pause(); },
      stop: () => { onMediaAction?.('pause'); pause(); },
    };
    for (const [action,handler] of Object.entries(handlers)) {
      try { media.setActionHandler(action, handler); } catch { /* Optional platform action. */ }
    }
  }

  function loadLevels(entry) {
    if (entry.levels || entry.fetching) return;
    entry.fetching = true;
    const url = entry.track.src.replace(/\.mp3$/, '.levels.json');
    fetch(url).then(async response => {
      if (!response.ok) return;
      const {fps, frames} = await response.json();
      if (!(fps > 0) || typeof frames !== 'string') return;
      const bytes = Uint8Array.from(atob(frames), c => c.charCodeAt(0));
      if (bytes.length >= 4 && bytes.length % 4 === 0) entry.levels = {fps, bytes};
    }).catch(() => {}).finally(() => { entry.fetching = false; });
  }

  function entryFor(track) {
    if (entries.has(track.id)) return entries.get(track.id);
    const audio = document.createElement('audio');
    audio.hidden = true;
    audio.preload = 'none';
    audio.loop = true;
    audio.setAttribute('playsinline', '');
    audio.volume = 0.5;
    const adjustable = audio.volume === 0.5;
    const entry = {track, audio, adjustable, gain:0, request:0, levels:null, fetching:false};
    entry.onPlaying = () => {
      if (!entry.request || disposed) audio.pause();
      else signal();
    };
    entry.onPause = () => {
      if (entry === active && audio.paused) { finishFade(); signal(); }
    };
    entry.onError = () => {
      if (!pending && entry === active) { pause(); signal('audioError'); }
    };
    audio.addEventListener('playing', entry.onPlaying);
    audio.addEventListener('pause', entry.onPause);
    audio.addEventListener('error', entry.onError);
    audio.src = track.src;
    document.body.append(audio);
    entries.set(track.id, entry);
    return entry;
  }

  function selectTrack(id, { play = true, automatic = false } = {}) {
    if (disposed) return Promise.resolve(false);
    const track = available.find(item => item.id === id);
    if (!track) { signal('audioError'); return Promise.resolve(false); }
    if (!play) { selected = track; pause(); return Promise.resolve(false); }
    if (pending?.entry.track === track) return pending.promise;
    if (!pending && active?.track === track && playing()) return Promise.resolve(true);

    const request = ++generation;
    const previous = active;
    const entry = entryFor(track);
    if (pending && pending.entry !== active) stop(pending.entry);
    pending = null;
    finishFade();
    // On a fixed-volume device use a native hand-off instead of overlapping full-level tracks.
    if (previous && previous !== entry && !entry.adjustable) stop(previous);
    selected = track;
    entry.request = request;
    setMix(entry, previous && previous !== entry && playing() ? 0 : 1);
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* Optional. */ }

    // The native player owns output and looping. It does not need JavaScript frames
    // or a running Web Audio graph when the browser backgrounds this document.
    const promise = entry.audio.play().then(() => {
      if (disposed || request !== generation) {
        if (!entry.request || entry.request === request) stop(entry);
        return false;
      }
      pending = null;
      active = entry;
      bindMediaActions();
      crossfade(previous === entry ? null : previous);
      loadLevels(entry);
      signal();
      return true;
    }).catch(error => {
      if (request !== generation || disposed) return false;
      pending = null;
      if (entry !== active) stop(entry);
      if (playing()) selected = active.track;
      else { active = null; stop(entry); }
      signal(error?.name === 'NotAllowedError' ? (automatic ? null : 'audioBlocked') : 'audioError');
      return false;
    });
    pending = {entry, promise};
    signal();
    return promise;
  }

  // These envelopes are measured from the six MP3 masters used by the player.
  // Reading the native media clock also handles looping, seeking and interruptions.
  function getData() {
    if (!playing() || !volume || document.hidden) return zero;
    data.bass = data.mid = data.high = data.level = 0;
    for (const entry of entries.values()) {
      if (!entry.levels || entry.audio.paused || entry.gain === 0) continue;
      const {fps,bytes} = entry.levels;
      const last = bytes.length / 4 - 1;
      const time = Math.min(last, entry.audio.currentTime * fps);
      const frame = Math.floor(time);
      const start = frame * 4, end = Math.min(last,frame + 1) * 4;
      const fraction = time - frame;
      for (let i = 0; i < bands.length; i++) {
        const interpolated = bytes[start+i] + (bytes[end+i] - bytes[start+i]) * fraction;
        data[bands[i]] += entry.gain * interpolated / 255;
      }
    }
    return data;
  }

  function onVisibility() {
    // Animation frames are throttled in background tabs. Settle only an in-flight
    // mix; the active native track keeps its current position and playback intent.
    if (document.hidden && frame) finishFade();
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', pause);

  return {
    selectTrack, pause, getData,
    toggle() {
      if (playing() || pending) { pause(); return Promise.resolve(false); }
      return selectTrack(selected.id);
    },
    setVolume(next) {
      if (!Number.isFinite(Number(next))) return;
      volume = Math.min(1, Math.max(0, Number(next)));
      for (const entry of entries.values()) setMix(entry, entry.gain);
    },
    get currentTrack() { return selected; },
    get isPlaying() { return playing(); },
    get isLoading() { return Boolean(pending); },
    get currentTime() { return entries.get(selected.id)?.audio.currentTime || 0; },
    get duration() {
      const duration = entries.get(selected.id)?.audio.duration;
      return Number.isFinite(duration) && duration > 0 ? duration : selected.duration;
    },
    dispose() {
      if (disposed) return;
      pause();
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', pause);
      if (mediaActions) {
        for (const action of ['play','pause','stop']) {
          try { media.setActionHandler(action,null); } catch { /* Optional platform action. */ }
        }
        media.metadata = null; media.playbackState = 'none';
      }
      for (const entry of entries.values()) {
        entry.audio.removeEventListener('playing', entry.onPlaying);
        entry.audio.removeEventListener('pause', entry.onPause);
        entry.audio.removeEventListener('error', entry.onError);
        entry.audio.removeAttribute('src'); entry.audio.load(); entry.audio.remove();
      }
      entries.clear();
    },
  };
}
