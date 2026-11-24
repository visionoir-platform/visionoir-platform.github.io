import { tracks } from './tracks.js';

export function createAudioEngine({ enabledTracks = tracks.map(track=>track.id) } = {}) {
  const TRACKS = tracks.filter(track=>enabledTracks.includes(track.id));
  const entries = new Map();
  const FADE_SECONDS = 0.6;
  let context, analyser, master, bins, waveform;
  let selected = TRACKS[0];
  let activeId = null;
  let volume = 0.23;
  let wanted = false;
  let loading = false;
  let disposed = false;
  let generation = 0;
  let pending = null;

  const isPlaying = () => Boolean(wanted && activeId && !entries.get(activeId)?.audio.paused && context?.state === 'running');
  function signal(error = null) {
    if (disposed) return;
    window.dispatchEvent(new CustomEvent('visionoir:audio', {
      detail: { playing: isPlaying(), track: selected, loading, error },
    }));
  }

  function clearTimer(entry) {
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = null;
  }

  function gainAt(entry) {
    const fade = entry.fade;
    if (!fade) return 0;
    const progress = fade.end > fade.start
      ? Math.max(0, Math.min(1, (context.currentTime - fade.start) / (fade.end - fade.start))) : 1;
    return fade.from + (fade.to - fade.from) * progress;
  }

  function ramp(entry, target, seconds = FADE_SECONDS) {
    clearTimer(entry);
    const now = context.currentTime;
    const from = gainAt(entry);
    entry.gain.gain.cancelScheduledValues(now);
    entry.gain.gain.setValueAtTime(from, now);
    if (seconds > 0) entry.gain.gain.linearRampToValueAtTime(target, now + seconds);
    else entry.gain.gain.setValueAtTime(target, now);
    entry.fade = { from, to: target, start: now, end: now + seconds };
    entry.fadeSerial++;
  }

  function stopEntry(entry) {
    entry.request = 0;
    ramp(entry, 0, 0);
    entry.audio.pause();
  }

  function pause() {
    if (disposed) return;
    wanted = false;
    loading = false;
    generation++;
    pending = null;
    activeId = null;
    for (const entry of entries.values()) stopEntry(entry);
    signal();
  }

  function onStateChange() {
    if (context?.state === 'interrupted') pause();
    else signal();
  }

  function setup() {
    if (context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('audioUnsupported');
    context = new AudioContext();
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.78;
    master = context.createGain();
    master.gain.value = volume;
    analyser.connect(master);
    master.connect(context.destination);
    bins = new Uint8Array(analyser.frequencyBinCount);
    waveform = new Uint8Array(analyser.fftSize);
    context.addEventListener('statechange', onStateChange);
  }

  function failSelection(attempt, entry, message = 'audioError') {
    if (attempt !== generation || disposed) return false;
    generation++;
    loading = false;
    pending = null;
    if (entry && entry.track.id !== activeId) stopEntry(entry);
    const previous = entries.get(activeId);
    if (previous && !previous.audio.paused) {
      selected = previous.track;
      wanted = true;
    } else {
      wanted = false;
      activeId = null;
      for (const item of entries.values()) stopEntry(item);
    }
    signal(message);
    return false;
  }

  function entryFor(track) {
    if (entries.has(track.id)) return entries.get(track.id);
    const audio = new Audio();
    audio.preload = 'none';
    audio.loop = true;
    audio.setAttribute('playsinline', '');
    const gain = context.createGain();
    gain.gain.value = 0;
    const source = context.createMediaElementSource(audio);
    source.connect(gain);
    gain.connect(analyser);
    const entry = { track, audio, gain, source, request: 0, fade: null, fadeSerial: 0, timer: null };
    const onPlaying = () => {
      // A late media event cannot revive an explicitly cancelled selection.
      if (disposed || !wanted || !entry.request) {
        audio.pause();
        return;
      }
      signal();
    };
    const onPause = () => {
      if (disposed || !audio.paused || !entry.request) return;
      if (activeId === track.id && !loading) pause();
      else signal();
    };
    const onError = () => {
      if (disposed) return;
      if (loading && selected.id === track.id) {
        failSelection(entry.request, entry, 'audioError');
      } else if (activeId === track.id) {
        pause();
        signal('audioError');
      }
    };
    entry.listeners = { playing: onPlaying, pause: onPause, error: onError };
    for (const [name, listener] of Object.entries(entry.listeners)) audio.addEventListener(name, listener);
    audio.src = track.src;
    entries.set(track.id, entry);
    return entry;
  }

  function crossfadeTo(next) {
    activeId = next.track.id;
    ramp(next, 1);
    for (const entry of entries.values()) {
      if (entry === next) continue;
      if (entry.audio.paused) { stopEntry(entry); continue; }
      ramp(entry, 0);
      const serial = entry.fadeSerial;
      entry.timer = setTimeout(() => {
        if (disposed || entry.fadeSerial !== serial || entry.track.id === activeId) return;
        stopEntry(entry);
      }, (FADE_SECONDS + 0.05) * 1000);
    }
  }

  function selectTrack(id, { play = true, automatic = false } = {}) {
    if (disposed) return Promise.resolve(false);
    const track = TRACKS.find(item => item.id === id);
    if (!track) { signal('audioError'); return Promise.resolve(false); }
    if (!play) {
      selected = track;
      pause();
      return Promise.resolve(false);
    }
    if (selected.id === id && loading && pending?.id === id) return pending.promise;
    if (selected.id === id && activeId === id && isPlaying() && !loading) return Promise.resolve(true);

    selected = track;
    wanted = true;
    loading = true;
    const attempt = ++generation;
    let entry;
    try {
      setup();
      entry = entryFor(track);
      entry.request = attempt;
      // Cancel superseded silent loads, while retaining the current audible mix.
      for (const item of entries.values()) {
        if (item !== entry && item.track.id !== activeId && gainAt(item) < 0.001) stopEntry(item);
      }
      // Both calls occur directly in the click stack, before any await (iOS).
      const resumed = context.resume();
      const played = entry.audio.play();
      const promise = Promise.all([resumed, played]).then(() => {
        if (attempt !== generation || !wanted || disposed) {
          // A newer request can own the very same element; do not stop it.
          if (!entry.request || entry.request === attempt) stopEntry(entry);
          return false;
        }
        loading = false;
        pending = null;
        crossfadeTo(entry);
        signal();
        return true;
      }).catch(error => failSelection(attempt, entry, error?.name === 'NotAllowedError' ? (automatic ? null : 'audioBlocked') : 'audioError'));
      pending = { id, promise };
      signal();
      return promise;
    } catch (error) {
      return Promise.resolve(failSelection(attempt, entry, error?.message === 'audioUnsupported' ? 'audioUnsupported' : 'audioError'));
    }
  }

  function toggle() {
    if (disposed) return Promise.resolve(false);
    if (wanted || loading || isPlaying()) { pause(); return Promise.resolve(false); }
    return selectTrack(selected.id);
  }

  function setVolume(next) {
    const value = Number(next);
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (master && context) master.gain.setTargetAtTime(volume, context.currentTime, 0.035);
  }

  const data = { bass:0, mid:0, high:0, level:0 };
  const zero = Object.freeze({ bass:0, mid:0, high:0, level:0 });
  function getData() {
    if (!analyser || !isPlaying() || volume === 0) return zero;
    analyser.getByteFrequencyData(bins);
    analyser.getByteTimeDomainData(waveform);
    const hzPerBin = context.sampleRate / analyser.fftSize;
    const band = (low, high) => {
      const first = Math.max(1, Math.floor(low / hzPerBin));
      const last = Math.min(bins.length - 1, Math.ceil(high / hzPerBin));
      let total = 0;
      for (let i = first; i <= last; i++) total += bins[i];
      return Math.min(1, total / ((last - first + 1) * 255));
    };
    let squareSum = 0;
    for (const sample of waveform) squareSum += ((sample - 128) / 128) ** 2;
    data.bass = band(30,200);
    data.mid = band(200,2200);
    data.high = band(2200,10000);
    data.level = Math.min(1,Math.sqrt(squareSum / waveform.length)*2.2);
    return data;
  }

  const onVisibility = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    toggle, pause, selectTrack, setVolume, getData,
    get currentTrack() { return selected; },
    get isPlaying() { return isPlaying(); },
    get isLoading() { return loading; },
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
      for (const entry of entries.values()) {
        clearTimer(entry);
        for (const [name, listener] of Object.entries(entry.listeners)) entry.audio.removeEventListener(name, listener);
        entry.source.disconnect();
        entry.gain.disconnect();
        entry.audio.removeAttribute('src');
        entry.audio.load();
      }
      entries.clear();
      analyser?.disconnect(); master?.disconnect();
      context?.removeEventListener('statechange', onStateChange);
      context?.close().catch(() => {});
    },
  };
}
