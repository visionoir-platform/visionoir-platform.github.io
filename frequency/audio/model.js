/** FREQUENCY editing model. MIDI pitches, 16th-note time, normalized synth parameters. */
import { validateAutomation } from './automation.js';
import { validateRegions } from './regions.js';
import { additionalSession, EXTRA_DEMOS } from './library.js';
const specs = [
  [
    'kick',
    'Kick Forge',
    'kick',
    {
      pitch: 0.33,
      sweep: 0.72,
      attack: 0,
      punch: 0.72,
      body: 0.64,
      decay: 0.42,
      tail: 0.36,
      click: 0.28,
      distortion: 0.28,
      saturation: 0.22,
      drive: 0.42,
      harmonics: 0.18,
      transient: 0.6,
      tuning: 0.5,
      output: 0.85,
    },
  ],
  [
    'rumble',
    'Rumble Engine',
    'bass',
    {
      tone: 0.32,
      bassEq: 0.5,
      decay: 0.72,
      drive: 0.55,
      feedback: 0.32,
      delay: 0.48,
      reverb: 0.37,
      phase: 0.4,
      sidechain: 0.7,
      width: 0.23,
    },
  ],
  [
    'acid',
    'Acid 303',
    'bass',
    { wave: 0.15, cutoff: 0.35, resonance: 0.72, env: 0.68, decay: 0.34, glide: 0.26, drive: 0.42, filterDecay: 0.5 },
  ],
  [
    'industrial',
    'Industrial Bass',
    'bass',
    { ratio: 0.3, mod: 0.58, cutoff: 0.46, drive: 0.5, decay: 0.4 },
  ],
  ['sub', 'Sub Engine', 'bass', { phase: 0, tone: 0.27, decay: 0.52, sidechain: 0.55 }],
  ['schranz', 'Schranz Drums', 'drums', { metal: 0.54, body: 0.45, decay: 0.26, drive: 0.65 }],
  ['closed', 'Closed Hi Hat', 'drums', { color: 0.64, decay: 0.18, metal: 0.32 }],
  ['open', 'Open Hi Hat', 'drums', { color: 0.56, decay: 0.48, metal: 0.57 }],
  ['snare', 'Snare & Clap', 'drums', { body: 0.4, noise: 0.65, clap: 0.65, decay: 0.34 }],
  ['ride', 'Cymbals & Ride', 'drums', { bell: 0.65, shimmer: 0.61, decay: 0.48, noiseFilter: 0 }],
  ['stab', 'Rave Stab', 'synths', { detune: 0.28, color: 0.47, chord: 0.4, decay: 0.36 }],
  ['lead', 'Noir Lead', 'synths', { wave: 0.55, cutoff: 0.52, detune: 0.2, decay: 0.44, mono: 0 }],
  ['atmos', 'Dark Atmosphere', 'synths', { attack: 0.48, drift: 0.6, color: 0.46, decay: 0.68 }],
  ['noise', 'Noise & FX', 'fx', { sweep: 0.76, color: 0.37, grain: 0.32, decay: 0.65 }],
  ['fm', 'FM Machine', 'synths', { ratio: 0.44, index: 0.62, algorithm: 0.32, decay: 0.38 }],
  [
    'sampler',
    'Sampler',
    'fx',
    {
      start: 0,
      end: 1,
      reverse: 0,
      loop: 0,
      oneShot: 1,
      attack: 0,
      pitch: 0.5,
      decay: 0.72,
      cutoff: 0.88,
      gain: 0.64,
      slice: 0,
      slicePad: 0,
    },
  ],
];
export const INSTRUMENTS = specs.map(([id, name, bus, params]) => ({ id, name, bus, params }));
export const BUSSES = ['kick', 'drums', 'bass', 'synths', 'fx', 'returns'];
const fxNames = [
  ['eq', 'Parametric EQ'],
  ['compressor', 'Compressor'],
  ['sidechain', 'Sidechain compressor'],
  ['limiter', 'Limiter'],
  ['softclip', 'Soft clipper'],
  ['hardclip', 'Hard clipper'],
  ['saturation', 'Saturation'],
  ['overdrive', 'Overdrive'],
  ['distortion', 'Distortion'],
  ['waveshaper', 'Waveshaper'],
  ['bitcrusher', 'Bitcrusher'],
  ['reduction', 'Rate reduction'],
  ['delay', 'Delay'],
  ['pingpong', 'Ping-pong delay'],
  ['reverb', 'Room reverb'],
  ['industrialverb', 'Industrial reverb'],
  ['filter', 'Filter'],
  ['resonant', 'Resonant filter'],
  ['chorus', 'Chorus'],
  ['phaser', 'Phaser'],
  ['flanger', 'Flanger'],
  ['transient', 'Transient shaper'],
  ['stereo', 'Stereo utility'],
  ['gate', 'Noise gate'],
  ['dj', 'DJ filter'],
  ['freeze', 'Freeze'],
  ['glitch', 'Glitch'],
  ['repeat', 'Beat repeat'],
  ['multiband', 'Multiband compression'],
  ['mastering', 'Mastering chain'],
];
export const EFFECTS = fxNames.map(([id, name]) => ({ id, name, amount: 0.4 }));
export const PARAMETER_BANK = Object.fromEntries(INSTRUMENTS.map((x) => [x.id, x.params]));
export const DEMOS = [
  { id: 'forge', name: 'Furnace Ledger', bpm: 155, root: 32, swing: 0.05, ref: 'jtRV9DWKTKo' },
  { id: 'glass', name: 'Glass Meridian', bpm: 146, root: 38, swing: 0.115, ref: 'MqsQI2Di2xY' },
  { id: 'relay', name: 'Relay / Black Current', bpm: 162, root: 31, swing: 0.025, ref: 'ukSiQ34iHvo' },
  { id: 'rift', name: 'Rift Ceremony', bpm: 151, root: 35, swing: 0.08, ref: 'VUFr92i5jkA' },
];
export const MAX_RATCHETS = 8, MAX_CHORD_INTERVALS = 7;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const noteHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
export function hash(a, b = 0, c = 0) {
  let x =
    Math.imul(a + 0x45d9f3b, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1) ^ Math.imul(c + 1, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const gains = [
  0.88, 0.34, 0.43, 0.42, 0.47, 0.47, 0.33, 0.31, 0.53, 0.29, 0.38, 0.32, 0.24, 0.23, 0.34, 0.28,
];
export function createTrack(instrumentId, index = 0) {
  const s = INSTRUMENTS.find((i) => i.id === instrumentId);
  if (!s) throw Error('instrument');
  return {
    id: 'ch-' + (index + 1),
    instrument: s.id,
    name: s.name,
    params: { ...s.params },
    bus: s.bus,
    volume: gains[INSTRUMENTS.indexOf(s)],
    gain: 1,
    pan: 0,
    width: 1,
    invert: false,
    mute: false,
    solo: false,
    fx: [],
    sendDelay: 0,
    sendReverb: 0,
  };
}
const titles = [
  [
    'Cold start',
    'Pressurise',
    'First strike',
    'Furnace floor',
    'Air pocket',
    'Overload',
    'Second shift',
    'Cooling',
  ],
  [
    'Prism',
    'Refraction',
    'Chromed glass',
    'Parallel lines',
    'Vapour',
    'Crossing',
    'Fracture',
    'Daylight',
  ],
  [
    'Carrier',
    'Packet loss',
    'Contact',
    'Pulse train',
    'Dead channel',
    'Retransmit',
    'Black current',
    'Disconnect',
  ],
  ['Threshold', 'Brass rite', 'First circle', 'Obsidian', 'Still water', 'Summoning', 'Rift', 'Ash'],
];
// Selected motifs and percussion placements are authored independently for each composition.
const basslines = [
  [0, 0, 12, 0, 3, 0, 7, 1, 0, 10, 0, 7, 3, 0, 1, -2],
  [0, 7, 0, 10, 5, 12, 7, 3, 0, 5, 10, 7, 5, 3, -2, 0],
  [0, 0, 1, 13, 1, 0, -5, 7, 0, 12, 1, 0, 6, 1, -5, 0],
  [0, -5, 0, 3, 7, 12, 10, 7, 3, 0, -2, 3, 8, 7, 3, -2],
];
const bassHits = [
  [2, 3, 6, 9, 10, 13, 14],
  [1, 4, 6, 10, 11, 13],
  [0, 3, 5, 7, 8, 11, 14, 15],
  [2, 5, 6, 9, 10, 14],
];
const leads = [
  [0, 12, 7, 3, 1, 0, -2, 7],
  [12, 10, 7, 5, 3, 5, 7, 10],
  [0, 1, 7, 6, 1, 13, 12, -5],
  [7, 3, 0, -2, 3, 8, 7, 0],
];
const phrases = [
  [8, 8, 16, 16, 8, 8, 16, 8],
  [8, 16, 16, 8, 8, 8, 16, 8],
  [8, 8, 16, 8, 8, 8, 24, 8],
  [8, 8, 16, 16, 16, 8, 16, 8],
];
const energy = [0.26, 0.49, 0.75, 0.96, 0.32, 0.64, 1, 0.38];
const baseNotes = [36, 32, 38, 38, 32, 47, 72, 72, 48, 64, 56, 64, 52, 40, 59, 60];
const event = (note, velocity, extra = {}) => ({
  note,
  velocity,
  gate: 0.8,
  probability: 1,
  ratchet: 1,
  offset: 0,
  accent: false,
  slide: false,
  flam: false,
  condition: 1,
  locks: {},
  ...extra,
});
function demoPattern(t, i, s, d) {
  const length =
    (i === 6 || i === 5) && d === 1
      ? 24
      : i === 12 || i === 13 || i === 11
        ? 64
        : i === 2 || i === 10
          ? 32
          : 16;
  const steps = Array(length).fill(null),
    root = DEMOS[d].root,
    e = energy[s],
    salt = d * 71 + s * 19 + i * 7;
  for (let n = 0; n < length; n++) {
    const p = n % 16,
      beat = p % 4,
      cycle = n >> 4,
      r = hash(n, salt),
      mel = basslines[d][(n + cycle * 3 + s) % 16];
    let on = false,
      note = baseNotes[i],
      velocity = 0.65 + 0.19 * r,
      gate = 0.7,
      locks = {},
      ratchet = 1,
      slide = false,
      flam = false;
    switch (t.instrument) {
      case 'kick':
        on =
          s === 4
            ? p === 0 && d === 2
            : s === 0
              ? p % 8 === 0
              : beat === 0 || (s === 6 && p === 15 && d % 2 === 0);
        velocity = beat === 0 ? 0.94 : 0.57;
        break;
      case 'rumble':
        on = s !== 4 && s !== 0 && beat === 1;
        note = root;
        gate = 2.8;
        break;
      case 'acid':
        on = s !== 0 && s !== 7 && bassHits[d].includes(p);
        note = root + mel + (cycle && p > 8 ? 12 : 0);
        slide = p === 6 || p === 14;
        gate = slide ? 1.6 : 0.64;
        locks = { cutoff: clamp(0.15 + e * 0.38 + 0.04 * cycle + 0.12 * r, 0, 1) };
        break;
      case 'industrial':
        on = (s === 2 || s === 3 || s === 6) && [1, 7, 11, 15].includes((p + d * 2) % 16);
        note = root + (p === 15 ? 7 : 0);
        break;
      case 'sub':
        on = (s === 4 || s === 2 || s === 6) && [0, 6, 12].includes(p);
        note = root - (d === 1 ? 12 : 0);
        gate = 2.7;
        break;
      case 'schranz':
        on = e > 0.48 && [3, 7, 9, 14].includes((p + d) % 16);
        flam = p === 14 && s === 6;
        break;
      case 'closed':
        on = s !== 4 && (beat === 0 || beat === 2 || (e > 0.6 && r < 0.4));
        velocity = beat === 2 ? 0.79 : 0.35 + 0.2 * r;
        ratchet = s === 5 && p === 15 ? 3 : 1;
        break;
      case 'open':
        on = e > 0.47 && beat === 2 && ((p >> 2) + d) % 3 !== 0;
        velocity = 0.72 + 0.17 * r;
        gate = 1.6;
        break;
      case 'snare':
        on = s !== 0 && s !== 4 && (p === 4 || p === 12 || (s === 5 && p > 11));
        velocity = s === 5 ? 0.48 + (0.45 * (p % 4)) / 3 : 0.86;
        flam = p === 12 && d === 1;
        break;
      case 'ride':
        on = e > 0.7 && (beat === 2 || (d === 2 && p % 2 === 1));
        velocity = 0.45 + 0.25 * r;
        break;
      case 'stab':
        on = e > 0.45 && [2, 8, 14].includes((p + 3 * d) % 16) && ((n >> 3) + s) % 3 !== 1;
        note = root + 24 + [0, 3, 5, 7][(cycle + d) % 4];
        gate = 1.7;
        break;
      case 'lead':
        on = (s === 3 || s === 4 || s === 6) && [0, 3, 7, 10, 14].includes((p + 2 * d) % 16);
        note = root + 36 + leads[d][(cycle * 2 + (p >> 1)) % 8];
        gate = p < 5 ? 2.1 : 0.9;
        break;
      case 'atmos':
        on = (s === 0 || s === 4 || s === 5 || s === 7) && n % 32 === 0;
        note = root + 12 + (n === 32 ? 7 : 0);
        gate = 23;
        break;
      case 'noise':
        on = (s === 1 || s === 5 || s === 7) && n === 48;
        gate = 14;
        locks = { sweep: s === 7 ? 0.16 : 0.95 };
        break;
      case 'fm':
        on = (s === 1 || s === 3 || s === 6) && [5, 11, 15].includes((p + d) % 16);
        note = root + 24 + mel;
        gate = 0.85;
        break;
      case 'sampler':
        on = (s === 2 || s === 6) && p === (11 + d) % 16;
        note = 60 + d * 2;
        break;
    }
    if (on)
      steps[n] = event(note, velocity, {
        gate,
        locks,
        ratchet,
        flam,
        slide,
        accent: p === 0 || p === 10,
      });
  }
  return { length, steps };
}
export function createProject(demoId = 'blank') {
  if (EXTRA_DEMOS.some((item) => item.id === demoId))
    return additionalSession(createProject('blank'), demoId);
  const d = DEMOS.findIndex((i) => i.id === demoId),
    demo = DEMOS[d];
  const tracks = INSTRUMENTS.map((s, i) => createTrack(s.id, i));
  if (d >= 0) {
    for (const [i, t] of tracks.entries()) {
      if (i >= 5) t.pan = (hash(i, d) - 0.5) * 0.48;
      if ([2, 10, 11, 14].includes(i)) t.sendDelay = 0.1 + 0.04 * d;
      if ([8, 9, 10, 12, 13].includes(i)) t.sendReverb = 0.16 + i * 0.008;
    }
    tracks[0].params.pitch = [0.33, 0.46, 0.3, 0.36][d];
    tracks[0].params.decay = [0.4, 0.34, 0.28, 0.47][d];
    tracks[2].params.wave = [0.1, 0.9, 0.17, 0.56][d];
    tracks[2].params.resonance = [0.71, 0.62, 0.83, 0.76][d];
    tracks[5].fx = [
      { id: d === 2 ? 'bitcrusher' : 'overdrive', amount: 0.19 + 0.04 * d, bypass: false },
    ];
  }
  return {
    version: 1,
    name: demo?.name ?? 'Untitled',
    bpm: demo?.bpm ?? 155,
    swing: demo?.swing ?? 0,
    seed: d + 730,
    tracks,
    scenes: Array.from({ length: 8 }, (_, s) => ({
      id: 'scene-' + (s + 1),
      name: demo ? titles[d][s] : 'Scene ' + (s + 1),
      patterns: tracks.map((t, i) =>
        demo ? demoPattern(t, i, s, d) : { length: 16, steps: Array(16).fill(null) },
      ),
    })),
    arrangement: Array.from({ length: 8 }, (_, scene) => ({
      scene,
      bars: demo ? phrases[d][scene] : 1,
    })),
    master: { volume: 0.88, ceiling: 0.91, fx: [] },
    midiMappings: {},
    buses: Object.fromEntries(BUSSES.map((bus) => [bus, { volume: 1, mute: false }])),
  };
}
const finite = (n, l, h) => Number.isFinite(n) && n >= l && n <= h;
const effectNames = new Set(EFFECTS.map((f) => f.id));
export const EQ_LIMITS = { frequency: [20, 20000], gain: [-18, 18], q: [0.1, 12] };
export function macroEq(amount) {
  return { frequency: 180 + amount * 3100, gain: (amount - 0.5) * 12, q: 0.7 };
}
const plain = (o) =>
  !!o &&
  typeof o === 'object' &&
  !Array.isArray(o) &&
  (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const label = (s) => typeof s === 'string' && s.length <= 512;
const optionalNumber = (o, key, min, max) => o[key] === undefined || finite(o[key], min, max);
function instrumentValues(o, kind) {
  return (
    plain(o) &&
    Object.entries(o).every(
      ([key, value]) => Object.hasOwn(PARAMETER_BANK[kind], key) && finite(value, 0, 1),
    )
  );
}
function validRack(list) {
  return (
    list === undefined ||
    (Array.isArray(list) &&
      list.length <= 12 &&
      list.every(
        (f) =>
          plain(f) &&
          effectNames.has(f.id) &&
          finite(f.amount, 0, 1) &&
          (f.eq === undefined || (f.id === 'eq' && plain(f.eq) &&
            Object.entries(EQ_LIMITS).every(([key, bounds]) => finite(f.eq[key], ...bounds)))) &&
          (f.bypass === undefined || typeof f.bypass === 'boolean'),
      ))
  );
}
function validNote(n, kind) {
  if (n === null) return true;
  if (!plain(n) || !Number.isInteger(n.note) || !finite(n.note, 0, 127) || !finite(n.velocity, 0, 1))
    return false;
  if (
    !optionalNumber(n, 'gate', 0.01, 128) ||
    !optionalNumber(n, 'offset', -0.49, 0.49) ||
    !optionalNumber(n, 'probability', 0, 1)
  )
    return false;
  for (const [key, max] of [
    ['condition', 128],
    ['ratchet', MAX_RATCHETS],
  ])
    if (n[key] !== undefined && (!Number.isInteger(n[key]) || !finite(n[key], 1, max))) return false;
  if (['flam', 'slide', 'accent'].some((key) => n[key] !== undefined && typeof n[key] !== 'boolean'))
    return false;
  return (
    (!n.chord ||
      (Array.isArray(n.chord) &&
        n.chord.length <= MAX_CHORD_INTERVALS &&
        n.chord.every((interval) => Number.isInteger(interval) && finite(interval, -48, 48)))) &&
    (!n.locks || instrumentValues(n.locks, kind))
  );
}
const MAX_PATTERN_STEPS = 128;
const MAX_PROJECT_STEPS = 350000;
export function validateProject(p) {
  if (
    !plain(p) ||
    p.version !== 1 ||
    !optionalNumber(p, 'crossfadeBeats', 0, 4) ||
    !label(p.name) ||
    !finite(p.bpm, 40, 300) ||
    !finite(p.swing, 0, 0.5)
  )
    throw Error('project.header');
  if (
    !Array.isArray(p.tracks) ||
    p.tracks.length < 1 ||
    p.tracks.length > 32 ||
    !Array.isArray(p.scenes) ||
    !p.scenes.length ||
    p.scenes.length > 128
  )
    throw Error('project.size');
  if (p.exportInfo !== undefined &&
      (!plain(p.exportInfo) || ['title', 'artist', 'filename'].some(key =>
        p.exportInfo[key] !== undefined && (typeof p.exportInfo[key] !== 'string' || p.exportInfo[key].length > 240))))
    throw Error('project.header');
  if (p.metronome !== undefined && typeof p.metronome !== 'boolean') throw Error('project.header');
  if (
    p.loop !== undefined &&
    (!plain(p.loop) ||
      typeof p.loop.on !== 'boolean' ||
      !Number.isInteger(p.loop.start) ||
      p.loop.start < 0 ||
      !Number.isInteger(p.loop.end) ||
      p.loop.end <= p.loop.start)
  )
    throw Error('project.arrangement');
  const ids = new Set();
  let totalPCM = 0;
  for (const t of p.tracks) {
    if (
      !plain(t) ||
      !label(t.id) ||
      ids.has(t.id) ||
      !label(t.name) ||
      !Object.hasOwn(PARAMETER_BANK, t.instrument) ||
      !finite(t.volume, 0, 1) ||
      !finite(t.pan, -1, 1)
    )
      throw Error('project.track');
    if (
      !instrumentValues(t.params, t.instrument) ||
      !BUSSES.includes(t.bus) ||
      (t.sidechainBus !== undefined && !BUSSES.includes(t.sidechainBus)) ||
      !validRack(t.fx) ||
      !optionalNumber(t, 'gain', 0, 3) ||
      !optionalNumber(t, 'width', 0, 2) ||
      ['mute', 'solo', 'invert'].some((key) => t[key] !== undefined && typeof t[key] !== 'boolean') ||
      !finite(t.sendReverb, 0, 1) ||
      !finite(t.sendDelay, 0, 1)
    )
      throw Error('project.mixer');
    ids.add(t.id);
    if (t.sample) {
      const sample = t.sample;
      if (
        !plain(sample) ||
        !finite(sample.rate, 8000, 192000) ||
        typeof sample.pcm !== 'string' ||
        sample.pcm.length > 12e6 ||
        sample.pcm.length < 4 ||
        sample.pcm.length % 4 !== 0 ||
        /[^A-Za-z0-9+/=]/.test(sample.pcm) ||
        !/^={0,2}$/.test(
          sample.pcm.slice(sample.pcm.indexOf('=') < 0 ? sample.pcm.length : sample.pcm.indexOf('=')),
        )
      )
        throw Error('project.sample');
      totalPCM += sample.pcm.length;
    }
  }
  if (
    totalPCM > 64e6 ||
    !plain(p.master) ||
    !finite(p.master.volume, 0, 2) ||
    (p.master.mute !== undefined && typeof p.master.mute !== 'boolean') ||
    !finite(p.master.ceiling, 0.1, 0.999) ||
    !validRack(p.master.fx)
  )
    throw Error('project.master');
  if (
    p.buses !== undefined &&
    (!plain(p.buses) ||
      !Object.entries(p.buses).every(
        ([key, bus]) =>
          BUSSES.includes(key) &&
          plain(bus) &&
          finite(bus.volume, 0, 2) &&
          (bus.mute === undefined || typeof bus.mute === 'boolean'),
      ))
  )
    throw Error('project.bus');
  let cells = 0;
  for (const s of p.scenes) {
    if (
      !plain(s) ||
      !label(s.name) ||
      !Array.isArray(s.patterns) ||
      s.patterns.length !== p.tracks.length
    )
      throw Error('project.scene');
    for (let i = 0; i < s.patterns.length; i++) {
      const pat = s.patterns[i];
      if (
        !plain(pat) ||
        !Number.isInteger(pat.length) ||
        !finite(pat.length, 1, MAX_PATTERN_STEPS) ||
        !Array.isArray(pat.steps) ||
        pat.steps.length < pat.length ||
        pat.steps.length > MAX_PATTERN_STEPS
      )
        throw Error('project.pattern');
      cells += pat.steps.length;
      for (const n of pat.steps) if (!validNote(n, p.tracks[i].instrument)) throw Error('project.note');
    }
  }
  if (
    cells > MAX_PROJECT_STEPS ||
    !Array.isArray(p.arrangement) ||
    !p.arrangement.length ||
    p.arrangement.length > 2048 ||
    p.arrangement.some(
      (c) =>
        !plain(c) ||
        !Number.isInteger(c.scene) ||
        !p.scenes[c.scene] ||
        !Number.isInteger(c.bars) ||
        !finite(c.bars, 1, 4096),
    )
  )
    throw Error('project.arrangement');
  for (const clip of p.arrangement) {
    if (clip.marker !== undefined && !label(clip.marker)) throw Error('project.marker');
    if (
      clip.trackScenes !== undefined &&
      (!Array.isArray(clip.trackScenes) ||
        clip.trackScenes.length > p.tracks.length ||
        clip.trackScenes.some(
          (id) => id != null && id !== -1 && (!Number.isInteger(id) || !p.scenes[id]),
        ))
    )
      throw Error('project.clip');
  }
  validateRegions(p.arrangement, p.tracks);
  validateAutomation(p.arrangement, p.tracks);
  return p;
}
export function totalBars(p) {
  return p.arrangement.reduce((n, a) => n + a.bars, 0);
}
export const MAX_PROJECT_BYTES = 80e6;
export const NATIVE_FILE_VERSION = 2;

// Only the file representation is packed. The editor, IndexedDB and DSP keep addressable cells.
function packPattern(pattern) {
  const steps = [];
  let rests = 0;
  for (const note of pattern.steps) {
    if (note === null) {
      rests++;
    } else {
      if (rests) steps.push(rests);
      rests = 0;
      steps.push(note);
    }
  }
  if (rests) steps.push(rests);
  return { ...pattern, steps };
}

export function projectFile(project, version = NATIVE_FILE_VERSION) {
  validateProject(project);
  let data = project;
  if (version === 2) {
    const scenes = project.scenes.map(scene => ({ ...scene, patterns: scene.patterns.map(packPattern) }));
    data = { ...project, version, scenes };
  } else if (version !== 1) {
    throw Error('project.version');
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  if (blob.size > MAX_PROJECT_BYTES) throw Error('project.size');
  return blob;
}

function unpackProject(data) {
  if (data?.version === 1) return validateProject(data);
  if (data?.version !== 2) throw Error('project.version');
  if (!Array.isArray(data.tracks) || data.tracks.length < 1 || data.tracks.length > 32 ||
      !Array.isArray(data.scenes) || data.scenes.length < 1 || data.scenes.length > 128) {
    throw Error('project.size');
  }
  let cells = 0;
  for (const scene of data.scenes) {
    if (!Array.isArray(scene?.patterns) || scene.patterns.length !== data.tracks.length) throw Error('project.scene');
    for (const pattern of scene.patterns) {
      if (!Array.isArray(pattern?.steps) || pattern.steps.length > MAX_PATTERN_STEPS) throw Error('project.pattern');
      const steps = [];
      for (const token of pattern.steps) {
        const isRest = typeof token === 'number';
        const count = isRest ? token : 1;
        if (!Number.isInteger(count) || count < 1 || steps.length + count > MAX_PATTERN_STEPS) throw Error('project.pattern');
        cells += count;
        if (cells > MAX_PROJECT_STEPS) throw Error('project.size');
        if (isRest) {
          for (let i = 0; i < count; i++) steps.push(null);
        } else {
          steps.push(token);
        }
      }
      pattern.steps = steps;
    }
  }
  data.version = 1;
  return validateProject(data);
}

export async function readProject(file) {
  if (file.size > MAX_PROJECT_BYTES) throw Error('project.size');
  return unpackProject(JSON.parse(await file.text()));
}
