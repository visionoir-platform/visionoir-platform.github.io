// The two endpoints for each instrument are voiced as contrasting timbres. A shared
// morph holds their character together; a smaller per-control variation adds detail.
const voices = {
  kick: { sweep:[0.25,0.84], punch:[0.42,0.9], body:[0.85,0.51], click:[0.12,0.72], decay:[0.65,0.29], harmonics:[0.12,0.46] },
  rumble: { tone:[0.13,0.62], decay:[0.82,0.48], feedback:[0.55,0.32], drive:[0.47,0.79], reverb:[0.46,0.22] },
  acid: { wave:[0.18,0.83], cutoff:[0.28,0.57], resonance:[0.58,0.88], env:[0.84,0.42], decay:[0.47,0.26], drive:[0.34,0.62] },
  industrial: { ratio:[0.21,0.75], mod:[0.35,0.82], cutoff:[0.35,0.6], drive:[0.43,0.71], decay:[0.57,0.25] },
  sub: { tone:[0.12,0.68], decay:[0.76,0.32] },
  schranz: { metal:[0.23,0.86], body:[0.75,0.41], drive:[0.54,0.85], decay:[0.46,0.21] },
  closed: { color:[0.3,0.86], decay:[0.28,0.09], metal:[0.23,0.75] },
  open: { color:[0.32,0.83], decay:[0.69,0.39], metal:[0.21,0.77] },
  snare: { body:[0.72,0.31], noise:[0.38,0.86], clap:[0.24,0.82], decay:[0.47,0.23] },
  ride: { bell:[0.24,0.88], shimmer:[0.38,0.8], decay:[0.72,0.43] },
  stab: { color:[0.27,0.78], chord:[0.26,0.83], detune:[0.18,0.55], decay:[0.61,0.28] },
  lead: { wave:[0.23,0.78], cutoff:[0.32,0.79], detune:[0.16,0.49], decay:[0.65,0.32] },
  atmos: { attack:[0.68,0.32], drift:[0.31,0.76], color:[0.26,0.72], decay:[0.88,0.62] },
  noise: { sweep:[0.26,0.85], color:[0.29,0.79], grain:[0.19,0.74], decay:[0.82,0.37] },
  fm: { ratio:[0.24,0.76], index:[0.28,0.83], algorithm:[0.19,0.78], decay:[0.72,0.24] },
  sampler: { attack:[0.19,0.004], cutoff:[0.32,0.91], decay:[0.83,0.48] },
};

export function designTimbre(instrument, seed) {
  // Mix adjacent integer seeds before sampling; requesting seed+1 yields a distinct voice.
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let bits = Math.imul(state ^ (state >>> 15), state | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  }
  const morph = next();
  const params = {};
  for (const [key, [soft, bright]] of Object.entries(voices[instrument])) {
    const amount = morph * 0.78 + next() * 0.22;
    params[key] = Number((soft + (bright - soft) * amount).toFixed(4));
  }
  return params;
}
