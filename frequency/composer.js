import { newNote } from './ui-kit.js';

// Build an editable session from one motif. The PRNG affects ornamentation; section
// roles, downbeats, voice-leading and harmonic destinations remain explicit.
export const genres = ['Hard techno', 'Acid techno', 'Warehouse dub', 'Broken beat'];
const sections = ['Ingress', 'Pressure', 'Build', 'Drop', 'Break', 'Rebuild', 'Peak', 'Exit'];
const shapes = [
  [4, 4, 8, 16, 4, 4, 16, 4],
  [4, 8, 4, 8, 8, 4, 16, 4],
  [8, 8, 4, 8, 8, 8, 8, 8],
  [4, 8, 4, 8, 4, 4, 8, 4],
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
    g = clamp(genre | 0, 0, 3),
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
  p.swing = [0.035, 0.075, 0.125, 0.17][g];
  for (const tr of p.tracks) {
    for (const prop of ['cutoff', 'color', 'tone', 'body', 'drift', 'metal', 'detune'])
      if (prop in tr.params)
        tr.params[prop] = clamp(tr.params[prop] + (rng() - 0.5) * 0.28, 0.05, 0.95);
  }
  p.scenes.forEach((scene, k) => {
    const air = [0.23, 0.48, 0.66, 0.93, 0.21, 0.59, 1, 0.37][k] * drive;
    scene.name = sections[k];
    scene.patterns = scene.patterns.map((_, i) => {
      const span = i >= 10 ? 32 : i === 2 && density > 0.5 ? 32 : i === 5 && density > 0.75 ? 15 : 16;
      const steps = Array(span).fill(null);
      for (let n = 0; n < span; n++) {
        const beat = n % 16,
          turn = n >> 4,
          peak = k === 3 || k === 6,
          build = k === 2 || k === 5,
          breakdown = k === 4;
        const deg = motif[(Math.floor(n / (g === 1 ? 2 : 4)) + turn + (k % 4 === 3 ? 2 : 0)) % 8];
        const pulses = new Set([0, 4, 8, 12]);
        if (g === 3) {
          pulses.delete(4);
          pulses.add(6);
          if (peak) pulses.add(11);
        }
        let on = false,
          note = root,
          gate = 0.74;
        switch (i) {
          case 0:
            on = !breakdown && pulses.has(beat) && (k !== 0 || beat % 8 === 0);
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
