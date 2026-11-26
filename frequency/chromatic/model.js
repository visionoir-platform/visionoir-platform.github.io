// Indices are part of the saved .vfreq instrument-to-visual mapping.
export const modes = [
  ['chrome-pulse', 'Chrome Pulse', '#b4ddff'],
  ['liquid-collapse', 'Liquid Collapse', '#ccdcff'],
  ['inferno', 'Inferno', '#ff7848'],
  ['atomic-disintegration', 'Atomic Disintegration', '#d3e5ff'],
  ['acid-mutation', 'Acid Mutation', '#cbff46'],
  ['black-hole', 'Black Hole', '#b9a9ff'],
  ['digital-fracture', 'Digital Fracture', '#ff9271'],
  ['obsidian-core', 'Obsidian Core', '#cd96ff'],
  ['mercury-rain', 'Mercury Rain', '#c4f3ff'],
  ['spectral-echo', 'Spectral Echo', '#eeb3ff'],
  ['techno-vortex', 'Techno Vortex', '#5ae1d5'],
  ['fractal-machine', 'Fractal Machine', '#f2ba82'],
  ['quantum-distortion', 'Quantum Distortion', '#a2c1ff'],
  ['industrial-meltdown', 'Industrial Meltdown', '#e5a87c'],
  ['retro-media-player', 'Retro Media Player', '#77edda'],
  ['the-unseen', 'The Unseen', '#d0cbff'],
];
export const instruments = [
  'Kick Forge',
  'Rumble Engine',
  'Acid 303',
  'Industrial Bass',
  'Sub Engine',
  'Schranz Drums',
  'Closed Hi-Hat',
  'Open Hi-Hat',
  'Snare & Clap',
  'Cymbals & Ride',
  'Rave Stab',
  'Noir Lead',
  'Dark Atmosphere',
  'Noise & FX',
  'FM Machine',
  'Sampler',
];
export const routes = [
  'impact',
  'melt',
  'acid',
  'fracture',
  'mass',
  'spark',
  'glint',
  'trail',
  'shock',
  'rain',
  'burst',
  'twist',
  'haze',
  'noise',
  'fm',
  'scatter',
];
export const parameters = {
  intensity: 0.66,
  sensitivity: 0.9,
  warp: 0.45,
  turbulence: 0.32,
  dissolve: 0,
  density: 0.66,
  size: 0.42,
  rebuild: 0.55,
  refraction: 0.44,
  reflection: 0.8,
  distortion: 0.24,
  light: 0.65,
  camera: 0.25,
  rotation: 0.44,
  depth: 0.46,
  kick: 0.8,
  bass: 0.78,
  treble: 0.68,
  decay: 0.5,
  phase: 0,
};
export const defaultVisual = () => ({
  version: 1,
  mode: 'chrome-pulse',
  ...parameters,
  color: '',
  sync: true,
  auto: false,
  freeze: false,
  reduced: false,
  quality: 'auto',
  mapping: routes.slice(),
  automation: [],
  midi: {},
});
export const unit = (v, f = 0) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : f);
// A scene cue restores its look without changing performance controls, MIDI or the cue list.
export function sceneLook(raw) {
  const look = { color: /^#[\da-f]{6}$/i.test(raw.color) ? raw.color : '', sync: raw.sync !== false };
  for (const [name, initial] of Object.entries(parameters)) look[name] = unit(raw[name], initial);
  look.mapping = routes.map((normal, i) => routes.includes(raw.mapping?.[i]) ? raw.mapping[i] : normal);
  return look;
}
export function normalizeVisual(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const s = { ...defaultVisual(), ...sceneLook(raw) };
  if (modes.some((m) => m[0] === raw.mode)) s.mode = raw.mode;
  for (const name of ['auto', 'freeze', 'reduced'])
    if (typeof raw[name] === 'boolean') s[name] = raw[name];
  if (['auto', 'low', 'high'].includes(raw.quality)) s.quality = raw.quality;
  if (Array.isArray(raw.automation))
    s.automation = raw.automation
      .slice(0, 256)
      .filter(
        (v) =>
          Number.isInteger(v?.scene) && v.scene >= 0 && v.scene <= 4095 && modes.some((m) => m[0] === v.mode),
      )
      .map((v) => v.look && typeof v.look === 'object'
        ? { scene: v.scene, mode: v.mode, look: sceneLook(v.look) }
        : { scene: v.scene, mode: v.mode });
  if (raw.midi && typeof raw.midi === 'object' && !Array.isArray(raw.midi)) {
    for (const [key, param] of Object.entries(raw.midi).slice(0, 128)) {
      if (
        /^([0-9]|1[0-5]):([0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/.test(key) &&
        Object.hasOwn(parameters, param)
      )
        s.midi[key] = param;
    }
  }
  return s;
}
export function readPresetBank(raw) {
  const slots = Array(8).fill(null);
  if (Array.isArray(raw?.slots)) {
    raw.slots.slice(0, slots.length).forEach((value, i) => {
      if (modes.some(([id]) => id === value?.mode)) slots[i] = normalizeVisual(value);
    });
  } else if (modes.some(([id]) => id === raw?.mode)) {
    // The first local format held one full visual state in the same storage key.
    slots[0] = normalizeVisual(raw);
  }
  const selected = Number.isInteger(raw?.selected) && raw.selected >= 0 && raw.selected < slots.length ? raw.selected : 0;
  return { selected, slots };
}
export function mixVisualVoices(voice, envelope, hits, levels, state, decay) {
  voice.fill(0);
  for (let i = 0; i < instruments.length; i++) {
    hits[i] *= decay;
    envelope[i] = Math.max(envelope[i] * decay, levels[i], hits[i]);
    const destination = routes.indexOf(state.mapping[i]);
    const sensitivity = state.sensitivity * (i === 0 ? state.kick : 1);
    voice[destination] = Math.max(voice[destination], envelope[i] * sensitivity);
  }
}
export function applyNoteEdges(hits, envelopes, attacks, gates, releases) {
  for (let i = 0; i < hits.length; i++) {
    // A released chord member must not soften a note still held on this route.
    if ((releases & (1 << i)) && !gates[i]) {
      hits[i] *= .72;
      envelopes[i] *= .88;
    }
    // A very short note can begin and end within one report. Its attack survives.
    hits[i] = Math.max(hits[i], unit(attacks[i]));
  }
}
export function normalizeSignal(
  raw = {},
  target = { voices: new Float32Array(16), buses: new Float32Array(6) },
) {
  target.bass = unit(raw.bass);
  target.mid = unit(raw.mid);
  target.high = unit(raw.high);
  target.level = unit(raw.level);
  target.audioPressure = raw.audioPressure === true;
  target.bpm = Number.isFinite(raw.bpm) ? Math.max(20, Math.min(360, raw.bpm)) : 140;
  target.beat = Number.isFinite(raw.beat) ? Math.max(0, raw.beat) : 0;
  target.scene = Number.isInteger(raw.scene) ? Math.max(0, raw.scene) : 0;
  for (let i = 0; i < 16; i++) target.voices[i] = unit(raw.voices?.[i]);
  for (let i = 0; i < 6; i++) target.buses[i] = unit(raw.buses?.[i]);
  return target;
}
