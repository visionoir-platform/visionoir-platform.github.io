import { newNote } from './ui-kit.js';

// Build an editable session from one motif. The PRNG affects ornamentation; section
// roles, downbeats, voice-leading and harmonic destinations remain explicit.
export const genres = [
  'Hard techno',
  'Acid techno',
  'Warehouse dub',
  'Broken beat',
  'Schranz',
  'Hardgroove',
  'Industrial techno',
  'Neo rave',
  'Dark electro',
];
export const sections = ['Ingress', 'Pressure', 'Build', 'Drop', 'Break', 'Rebuild', 'Peak', 'Exit'];
const shapes = [
  [4, 4, 8, 16, 4, 4, 16, 4],
  [4, 8, 4, 8, 8, 4, 16, 4],
  [8, 8, 4, 8, 8, 8, 8, 8],
  [4, 8, 4, 8, 4, 4, 8, 4],
  [8, 8, 4, 16, 4, 8, 16, 8],
  [8, 16, 4, 8, 8, 8, 16, 8],
  [4, 8, 8, 12, 8, 4, 16, 4],
  [4, 8, 8, 16, 8, 8, 16, 4],
  [8, 8, 4, 12, 8, 4, 16, 8],
];
function random(seed) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function generateSession(
  createProject,
  { seed = 81, genre = 0, bpm = 155, root = 36, intensity = 0.7, complexity = 0.55, scale = 1 } = {},
) {
  const p = createProject('blank'),
    g = clamp(genre | 0, 0, genres.length - 1),
    rng = random(seed),
    modes = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      [0, 2, 3, 5, 7, 8, 10],
      [0, 2, 4, 5, 7, 9, 11],
      [0, 1, 3, 5, 7, 8, 10],
    ],
    degrees = modes[scale] || modes[1];
  const motif = Array.from({ length: 8 }, (_, i) =>
      i === 0 ? 0 : i === 4 ? 7 : degrees[Math.floor(rng() * degrees.length)],
    ),
    rotate = Math.floor(rng() * 8);
  const density = clamp(complexity, 0, 1),
    drive = clamp(intensity, 0, 1);
  p.seed = seed;
  p.bpm = bpm;
  p.name = genres[g] + ' · ' + seed;
  p.swing = [0.035, 0.075, 0.125, 0.17, 0.027, 0.19, 0.065, 0.041, 0.12][g];
  for (const tr of p.tracks) {
    for (const prop of ['cutoff', 'color', 'tone', 'body', 'drift', 'metal', 'detune'])
      if (prop in tr.params) tr.params[prop] = clamp(tr.params[prop] + (rng() - 0.5) * 0.28, 0.05, 0.95);
  }
  // Set distinct source timbres as well as rhythms. All parameter values remain editable in the rack.
  if (g === 4) {
    Object.assign(p.tracks[0].params, { drive: 0.83, tail: 0.3, punch: 0.92 });
    Object.assign(p.tracks[5].params, { metal: 0.82, decay: 0.21, drive: 0.88 });
  } else if (g === 5) {
    Object.assign(p.tracks[3].params, { drive: 0.22, cutoff: 0.51, decay: 0.26 });
    Object.assign(p.tracks[6].params, { metal: 0.18, decay: 0.24, color: 0.72 });
  } else if (g === 6) {
    Object.assign(p.tracks[14].params, { ratio: 0.73, algorithm: 0.85, index: 0.82 });
    Object.assign(p.tracks[1].params, { feedback: 0.57, drive: 0.81, width: 0.35 });
  } else if (g === 7) {
    Object.assign(p.tracks[10].params, { detune: 0.54, chord: 0.76, color: 0.78 });
    Object.assign(p.tracks[11].params, { detune: 0.42, cutoff: 0.78, wave: 0.27 });
  }
  if (g === 8) {
    Object.assign(p.tracks[0].params, { sweep: 0.46, punch: 0.84, decay: 0.28 });
    Object.assign(p.tracks[3].params, { ratio: 0.36, mod: 0.66, cutoff: 0.32, decay: 0.25 });
    Object.assign(p.tracks[14].params, { ratio: 0.64, index: 0.47, decay: 0.44 });
  }
  p.scenes.forEach((scene, k) => {
    const air = [0.23, 0.48, 0.66, 0.93, 0.21, 0.59, 1, 0.37][k] * drive;
    scene.name = sections[k];
    scene.patterns = scene.patterns.map((_, i) => {
      const span =
        g === 6 && i === 5
          ? 14
          : g === 4 && i === 5
            ? 15
            : i >= 10
              ? 32
              : i === 2 && density > 0.5
                ? 32
                : i === 5 && density > 0.75
                  ? 15
                  : 16;
      const steps = Array(span).fill(null);
      for (let n = 0; n < span; n++) {
        const beat = n % 16,
          turn = n >> 4,
          peak = k === 3 || k === 6,
          build = k === 2 || k === 5,
          breakdown = k === 4;
        const deg = motif[(Math.floor(n / (g === 1 ? 2 : 4)) + turn + (k % 4 === 3 ? 2 : 0)) % 8];
        let on = false,
          note = root,
          gate = 0.74;
        switch (i) {
          case 0:
            on =
              !breakdown &&
              (g === 3 ? [0, 6, 8, 12].includes(beat) || (peak && beat === 11) : beat % 4 === 0) &&
              (k !== 0 || beat % 8 === 0);
            note = 36;
            break;
          case 1:
            on = air > 0.3 && beat % 4 === 1;
            gate = g === 2 ? 2.8 : 1.7;
            break;
          case 2:
            on =
              air > 0.3 &&
              ((n + rotate) * (g === 1 ? 7 : 3 + Math.round(density * 2))) % 16 < (g === 1 ? 7 : 4);
            note = root + deg + (turn && n % 3 === 0 ? 12 : 0);
            break;
          case 3:
            on = g !== 1 && air > 0.4 && [3, 7, 10, 15].includes(beat);
            note = root + (beat < 8 ? 0 : 7);
            break;
          case 4:
            on = breakdown && beat % 8 === 0;
            note = root + (beat === 8 ? 7 : 0);
            gate = 5.5;
            break;
          case 5:
            on = air > 0.36 && ((n + rotate) * 5) % 16 < 4 + Math.round(density * 3);
            note = 45 + deg;
            break;
          case 6:
            on = !breakdown && (beat % 2 === 0 || (peak && density > 0.68 && beat % 4 === 3));
            note = 72;
            gate = 0.4;
            break;
          case 7:
            on = air > 0.35 && beat % 4 === 2;
            note = 70;
            break;
          case 8:
            on = !breakdown && (beat === 4 || beat === 12 || (build && beat > 12));
            note = 48;
            break;
          case 9:
            on = peak && beat % 4 === 2;
            note = 68;
            break;
          case 10:
            on = air > 0.45 && [2, 10, 15].includes(beat);
            note = root + 12 + (beat >= 10 ? 7 : 0);
            gate = g === 2 ? 2.5 : 1.1;
            break;
          case 11:
            on = (peak || breakdown) && n % 8 === rotate % 4;
            note = root + 24 + deg;
            gate = 3;
            break;
          case 12:
            on = (k === 0 || breakdown || k === 7) && n === 0;
            note = root + 12;
            gate = 24;
            break;
          case 13:
            on = build && n === 16;
            note = 56;
            gate = 14;
            break;
          case 14:
            on = air > 0.39 && ((n + rotate) * 3) % 16 < 3;
            note = root + 24 + deg;
            break;
          case 15:
            on = peak && n % 16 === 13;
            note = 60 + deg;
            break;
        }
        if (g === 4 && i === 5) {
          on = !breakdown && (beat % 3 === 0 || (peak && beat % 3 === 2));
          note = [41, 53, 47, 42, 59][Math.floor(beat / 3)];
        } else if (g === 5 && i === 5) {
          on = !breakdown && [0, 3, 6, 10, 12].includes(beat);
          note = [51, 55, 48, 58, 53][[0, 3, 6, 10, 12].indexOf(beat)] ?? 48;
        } else if (g === 5 && i === 3) {
          on = air > 0.26 && [1, 4, 7, 11, 14].includes(beat);
          note = root + (beat === 11 ? 7 : degrees[beat === 7 ? 2 : 0]);
          gate = beat === 14 ? 1.6 : 0.57;
        } else if (g === 6 && i === 14) {
          on = k > 0 && [0, 5, 9, 15].includes(n % 16);
          note = root + 12 + degrees[(turn * 3 + (beat === 9 ? 4 : 0)) % degrees.length];
          gate = beat === 9 ? 2.5 : 0.34;
        } else if (g === 7 && i === 10) {
          on = (peak || build) && [0, 3, 6, 10, 14].includes(beat);
          note = root + 12 + degrees[turn ? 4 : 0];
          gate = beat === 10 ? 2.25 : 0.7;
        } else if (g === 7 && i === 11) {
          on = (peak || breakdown) && [2, 6, 9, 14].includes(beat);
          note = root + 24 + degrees[(turn * 2 + Math.floor(beat / 4)) % degrees.length];
          gate = breakdown ? 4.8 : 1.6;
        }
        if (g === 8) {
          if (i === 0) on = !breakdown && (beat === 0 || (k > 0 && [7, 10].includes(beat)) || (peak && beat === 14));
          if (i === 3) {
            on = !breakdown && [2, 5, 9, 12, 15].includes(beat);
            note = root + [0, 0, degrees[2], 7, 12][[2, 5, 9, 12, 15].indexOf(beat)];
            gate = beat === 5 ? 1.4 : 0.48;
          }
          if (i === 14) {
            on = k > 0 && [1, 6, 13].includes(beat);
            note = root + 12 + degrees[(turn + Math.floor(beat / 5)) % degrees.length];
            gate = breakdown ? 3.2 : 0.62;
          }
        }
        if (!on) continue;
        const e = newNote(note);
        e.gate = gate;
        e.velocity = i === 0 ? 0.9 : Math.min(0.95, 0.5 + drive * 0.25 + rng() * 0.17);
        e.accent = beat % 8 === 0;
        e.slide = i === 2 && n % 8 === 6;
        e.ratchet = build && beat === 15 && density > 0.4 ? 3 : 1;
        if (i === 2) {
          e.locks = { cutoff: clamp(0.2 + air * 0.45 + deg / 24, 0.1, 0.94) };
          e.probability = beat % 4 === 0 ? 1 : 0.83 + density * 0.16;
        }
        if (g === 4 && i === 5) {
          e.accent = beat % 3 === 0;
          e.ratchet = build && beat === 12 ? 4 : 1;
        }
        if (g === 5 && i === 5) {
          e.offset = beat === 3 || beat === 10 ? -0.08 : 0.04;
          e.velocity *= beat === 6 ? 0.65 : 1;
        }
        if (g === 6 && i === 14) e.locks = { index: beat === 9 ? 0.9 : 0.42 };
        if (g === 7 && i === 10) e.chord = [degrees[2], 7];
        if (i === 10 && g === 2) e.chord = [3, 7];
        if (i === 8 && g === 3 && beat === 12) e.flam = true;
        steps[n] = e;
      }
      return { length: span, steps };
    });
  });
  p.arrangement = shapes[g].map((bars, scene) => ({ scene, bars, marker: sections[scene] }));
  p.workspace = { scene: 3 };
  return p;
}


// A part may intentionally leave a voice out. When the editor asks for a single
// phrase, give that voice a lead-in on its own rhythmic grid, in the requested key.
function featuredPhrase(instrument, options, length) {
  const { root, seed, scale, complexity, intensity } = options;
  const rhythm = {
    kick:[0,4,8,12], rumble:[1,5,9,13], acid:[0,3,6,10,15], industrial:[1,4,7,11,14],
    sub:[0,6,10], schranz:[0,3,7,10,13], closed:[0,2,4,6,8,10,12,14],
    open:[2,6,10,14], snare:[4,12], ride:[2,7,10,14], stab:[2,10,13],
    lead:[0,3,6,12], atmos:[0], noise:[6,14], fm:[1,6,9,15], sampler:[3,11,14],
  }[instrument];
  const voices = ['rumble','acid','industrial','sub','stab','lead','fm','atmos'];
  const intervals = scale === 2 ? [0,4,7,9] : [0,3,7,scale === 3 ? 8 : 10];
  const rng = random(seed);
  const steps = Array(length).fill(null);
  for (let n = 0; n < length; n++) {
    const rank = rhythm.indexOf((n + (length <= rhythm[0] ? rhythm[0] : 0)) % 16);
    if (rank < 0 || (rank > 0 && rng() > 0.5 + complexity * 0.5)) continue;
    const register = ['lead','stab','fm','atmos'].includes(instrument) ? 12 : 0;
    const interval = rank ? intervals[Math.floor(rng() * intervals.length)] : 0;
    const pitch = voices.includes(instrument) ? root + register + interval : instrument === 'kick' ? 36 : 60;
    const note = newNote(pitch);
    note.velocity = 0.44 + 0.37 * intensity + 0.13 * rng();
    note.gate = instrument === 'atmos' ? 12 : instrument === 'sub' ? 2.5 : 0.48 + 0.45 * rng();
    note.accent = rank === 0;
    if (instrument === 'acid') {
      note.slide = rank % 3 === 2;
      note.locks = { cutoff: 0.2 + 0.45 * rng() };
    }
    steps[n] = note;
  }
  return {length, steps};
}

// Match the actual instrument even if channels were renamed, duplicated or reordered.
// Keep the destination loop length and preserve notes outside its currently active range.
export function writeGeneratedPattern(composition, section, instrument, destination, options, featured) {
  const channel = composition.tracks.findIndex(track => track.instrument === instrument);
  let source = composition.scenes[section].patterns[channel];
  if (featured && !source.steps.slice(0, Math.min(source.length, destination.length)).some(Boolean)) source = featuredPhrase(instrument, options, destination.length);
  for (let step = 0; step < destination.length; step++) {
    destination.steps[step] = structuredClone(source.steps[step % source.length]);
  }
}
