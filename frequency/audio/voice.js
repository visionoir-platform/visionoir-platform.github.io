import { preparePCM, pcmReader, readPCM } from './resample.js';
import { clamp, noteHz, PARAMETER_BANK } from './model.js';
const TABLE = new Float32Array(8193);
for (let i = 0; i < TABLE.length; i++) TABLE[i] = Math.sin((2 * Math.PI * i) / 8192);
const osc = (p) => {
  const x = (p - Math.floor(p)) * 8192,
    i = x | 0;
  return TABLE[i] + (TABLE[i + 1] - TABLE[i]) * (x - i);
};
function blep(p, dt) {
  if (p < dt) {
    const t = p / dt;
    return 2 * t - t * t - 1;
  }
  if (p > 1 - dt) {
    const t = (p - 1) / dt;
    return t * t + 2 * t + 1;
  }
  return 0;
}
const saw = (p, inc) => 2 * p - 1 - blep(p, Math.min(0.49, inc));
const square = (p, inc) =>
  (p < 0.5 ? 1 : -1) + blep(p, Math.min(0.49, inc)) - blep((p + 0.5) % 1, Math.min(0.49, inc));
const envelope = (seconds, rate) => Math.exp(-1 / Math.max(1, rate * seconds));
function rideNoiseCoefficient(amount, rate) {
  const cutoff = Math.min(5000, 0.35 * rate) * amount * amount;
  const g = Math.tan(Math.PI * cutoff / rate);
  return g / (1 + g);
}
// Normalized midpoint recalls the original 42 ms filter envelope exactly.
const acidFilterRate = (value, rate) => envelope(0.042 * 2 ** (8 * (value - 0.5)), rate);
const SAT = (x) => x / (1 + Math.abs(x));
const durations = [
  0.17, 0.41, 0.16, 0.14, 0.19, 0.085, 0.035, 0.18, 0.095, 0.29, 0.13, 0.22, 0.74, 0.3, 0.19, 0.23,
];
const decodedSources = new WeakMap();
export function decodePCM(sample) {
  if (!sample) return null;
  const str = sample.pcm;
  const cached = decodedSources.get(sample);
  if (cached?.source === str && cached.decoded.rate === sample.rate) return cached.decoded;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(
    (str.length >> 2) * 3 - (str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0),
  );
  const map = new Uint8Array(128);
  for (let i = 0; i < 64; i++) map[alphabet.charCodeAt(i)] = i;
  let j = 0;
  for (let i = 0; i < str.length; i += 4) {
    const bits =
      (map[str.charCodeAt(i)] << 18) |
      (map[str.charCodeAt(i + 1)] << 12) |
      (map[str.charCodeAt(i + 2)] << 6) |
      map[str.charCodeAt(i + 3)];
    bytes[j++] = bits >> 16;
    bytes[j++] = bits >> 8;
    bytes[j++] = bits;
  }
  const view = new DataView(bytes.buffer),
    pcm = new Float32Array(bytes.length >> 1);
  for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(i * 2, true) / 32768;
  const decoded = preparePCM({ rate: sample.rate, pcm });
  decodedSources.set(sample,{source:str,decoded});
  return decoded;
}
let factorySample;
export function factoryGlass() {
  if (factorySample) return factorySample;
  const rate = 24000,
    pcm = new Float32Array(Math.floor(rate * 0.51));
  let rnd = 41295514;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / rate;
    rnd = (Math.imul(1664525, rnd) + 1013904223) | 0;
    const strike =
      0.44 * osc(t * 411) * Math.exp(-12 * t) +
      0.31 * osc(t * 949.8) * Math.exp(-27 * t) +
      0.22 * osc(t * 1671.3) * Math.exp(-34 * t);
    pcm[i] = (strike + ((0.16 * rnd) / 2147483648) * Math.exp(-130 * t)) * Math.min(1, i / 9);
  }
  factorySample = preparePCM({ rate, pcm });
  return factorySample;
}
const defaults = Object.values(PARAMETER_BANK);
const heldKinds = new Set([2, 3, 4, 10, 11, 12, 13, 14, 15]);
export class Voice {
  constructor(rate) {
    this.rate = rate;
    this.active = false;
    this.p = {};
    this.reader = {};
  }
  start(
    kind,
    note,
    velocity,
    gate,
    spec,
    locks,
    seed,
    oldFreq = 0,
    slide = false,
    accent = false,
    sample = null,
    token,
  ) {
    this.token = token;
    const p = this.p;
    Object.assign(p, defaults[kind], spec, locks);
    this.kind = kind;
    this.note = note;
    this.vel = clamp(velocity * (accent ? 1.17 : 1), 0, 1.4);
    this.frequency = clamp(noteHz(note), 8, this.rate * 0.32);
    this.inc = this.frequency / this.rate;
    this.from = oldFreq && slide ? (oldFreq - this.frequency) / this.rate : 0;
    this.glide = oldFreq && slide ? 1 : 0;
    this.glideRate = envelope(0.005 + 0.18 * (p.glide || 0), this.rate);
    this.ph = kind === 4 ? p.phase : 0;
    this.ph2 = this.ph3 = this.ph4 = 0;
    this.env = 1;
    this.fast = 1;
    this.slow = 1;
    this.fastRate = envelope(0.006, this.rate);
    this.slowRate = kind === 2 ? acidFilterRate(p.filterDecay, this.rate) : envelope(0.042, this.rate);
    this.age = 0;
    this.attack =
      1 /
      Math.max(
        4,
        this.rate *
          (kind === 12
            ? 0.04 + p.attack * 0.55
            : kind === 0
              ? 0.0006 + p.attack * 0.03
              : kind === 15
                ? 0.001 + p.attack * 0.4
                : 0.0017),
      );
    this.gate = gate === null ? Infinity : Math.max(1, Math.round(gate * this.rate));
    this.held = heldKinds.has(kind);
    if (kind === 15 && p.oneShot > 0.5 && p.loop <= 0.5) this.gate = this.rate * 95;
    this.release = envelope(
      durations[kind] * (0.24 + 2.2 * (p.decay ?? 0.4)) * (kind === 0 ? 0.74 + p.tail : 1),
      this.rate,
    );
    if (kind === 1) {
      this.rumbleBassState = 0;
      this.rumbleBassSlew = 1 - envelope(0.005, this.rate);
      this.setRumbleBassEq(p.bassEq);
      this.rumbleBassGain = this.rumbleBassTarget;
    }
    if (kind === 9) this.rideCut = rideNoiseCoefficient(p.noiseFilter, this.rate);
    this.noise = seed | 1;
    this.lp = this.bp = this.hp = this.lastNoise = 0;
    this.active = true;
    this.cut = clamp(
      ((110 + 6500 * (p.cutoff ?? p.color ?? 0.5) ** 2) * 6.283) / this.rate,
      0.002,
      0.77,
    );
    this.bright = p.color ?? p.cutoff ?? 0.5;
    this.freq1 = noteHz(note + 7) / this.rate;
    this.freq2 = noteHz(note + (p.chord > 0.6 ? 4 : 3)) / this.rate;
    this.sample = sample;
    this.idx = 0;
    this.step = 1;
    if (kind === 15 && sample) {
      const len = sample.pcm.length;
      this.lo = clamp(Math.floor(len * (p.start + (p.slice || 0) * 0.35)), 0, Math.max(0, len - 2));
      this.hi = clamp(Math.floor(len * p.end), this.lo + 1, len);
      this.updatePlaybackRate();
      this.idx = this.step < 0 ? this.hi - 1 : this.lo;
    }
    if (kind === 0)
      this.kickInc = ((32 + 39 * p.pitch) * 2 ** ((note - 36 + (p.tuning - 0.5) * 12) / 12)) / this.rate;
  }
  updatePlaybackRate() {
    const p = this.p;
    this.step =
      (this.sample.rate / this.rate) *
      2 ** ((this.note - 60 + (p.pitch - 0.5) * 24) / 12) *
      (p.reverse > 0.5 ? -1 : 1);
    pcmReader(this.sample, this.step, this.lo, this.hi, this.reader);
  }
  setRumbleBassEq(value) {
    // A first-order +/-9 dB low shelf, with its half-gain frequency at 100 Hz.
    const gain = 10 ** ((value - 0.5) * 18 / 20);
    const g = Math.tan(Math.PI * 100 / (this.rate * Math.sqrt(gain)));
    this.rumbleBassPole = g / (1 + g);
    this.rumbleBassTarget = gain - 1;
  }
  control(key, value) {
    this.p[key] = value;
    if (this.kind === 15 && this.sample && (key === 'pitch' || key === 'reverse')) {
      const previousStep = this.step;
      this.updatePlaybackRate();
      // A turn between the last valid sample and the next render stays at this end.
      if (previousStep > 0 && this.step < 0 && this.idx >= this.hi) this.idx = this.hi - 1;
      if (previousStep < 0 && this.step > 0 && this.idx < this.lo) this.idx = this.lo;
    }
    if (this.kind === 1 && key === 'bassEq') this.setRumbleBassEq(value);
    if (this.kind === 9 && key === 'noiseFilter') {
      this.rideCut = rideNoiseCoefficient(value, this.rate);
      if (!this.rideCut) this.lp = 0;
    }
    if (this.kind === 2 && key === 'filterDecay') this.slowRate = acidFilterRate(value, this.rate);
    if (key === 'cutoff' || key === 'color') {
      this.cut = clamp(
        ((110 + 6500 * (this.p.cutoff ?? this.p.color ?? 0.5) ** 2) * 6.283) / this.rate,
        0.002,
        0.77,
      );
      this.bright = this.p.color ?? this.p.cutoff ?? 0.5;
    }
    if (this.kind === 0 && (key === 'pitch' || key === 'tuning'))
      this.kickInc =
        ((32 + 39 * this.p.pitch) * 2 ** ((this.note - 36 + (this.p.tuning - 0.5) * 12) / 12)) /
        this.rate;
  }
  stopGate() {
    this.gate = Math.min(this.gate, this.age);
  }
  choke() {
    this.gate = 0;
    this.release = envelope(0.004, this.rate);
    this.held = false;
  }
  next() {
    if (!this.active) return 0;
    const p = this.p,
      n = this.age++,
      inc = this.inc + this.from * this.glide;
    let ph = this.ph;
    this.glide *= this.glideRate;
    const rnd = (this.noise = (Math.imul(this.noise, 1664525) + 1013904223) | 0);
    const noise = rnd / 2147483648;
    this.fast *= this.fastRate;
    this.slow *= this.slowRate;
    if (!this.held || n > this.gate) this.env *= this.release;
    if (this.env < 0.00016 || n > this.gate + this.rate * 7) {
      this.active = false;
      return 0;
    }
    let x = 0,
      step = inc,
      near = 0;
    switch (this.kind) {
      case 0: {
        step = this.kickInc * (1 + this.fast * (4 + 29 * p.sweep) + this.slow * p.punch * 2.7);
        const sine = osc(ph),
          harm = osc(2 * ph) * p.harmonics * 0.38,
          body = (sine + harm) * (0.65 + p.body * 0.55);
        const click = (noise * 0.55 + osc(ph * 7) * 0.45) * this.fast * (p.click + 0.2 * p.transient);
        const drive = body + click,
          asym = SAT(drive * (1 + p.drive * 4) + 0.06 * p.distortion) - SAT(0.06 * p.distortion);
        x =
          (asym * (0.7 + 0.48 * p.drive) + Math.tanh(drive * (1 + 3 * p.saturation)) * 0.35) * p.output;
        break;
      }
      case 1: {
        const phase = ph + p.phase * 0.17,
          rough = osc(phase + osc(phase * 1.5) * 0.32 * p.drive);
        this.lp += (rough - this.lp) * (0.007 + 0.09 * p.tone);
        x = SAT(
          (this.lp + osc(phase * 0.5 + this.slow * p.delay) * p.feedback * 0.64) * (1 + 3 * p.drive),
        );
        const delta = (x - this.rumbleBassState) * this.rumbleBassPole;
        const bass = this.rumbleBassState + delta;
        this.rumbleBassState = bass + delta;
        this.rumbleBassGain += (this.rumbleBassTarget - this.rumbleBassGain) * this.rumbleBassSlew;
        x += this.rumbleBassGain * bass;
        break;
      }
      case 2: {
        const source = p.wave > 0.5 ? square(ph, inc) : saw(ph, inc);
        const fc = Math.min(
          0.74,
          this.cut + this.slow * (0.06 + 0.58 * p.env) * Math.min(1, 48000 / this.rate),
        );
        this.lp += fc * this.bp;
        this.bp += fc * (source - this.lp - (1.3 - 1.13 * p.resonance) * this.bp);
        x = SAT((this.lp + 0.16 * this.bp) * (1 + 5 * p.drive));
        break;
      }
      case 3: {
        const mod = osc(ph * (1 + Math.round(p.ratio * 7))) * p.mod * (0.21 + 0.62 * this.slow);
        const raw = osc(ph + mod) + 0.34 * saw(ph, inc);
        this.lp += this.cut * (raw - this.lp);
        x = SAT(this.lp * (1 + 6 * p.drive));
        break;
      }
      case 4:
        x = 0.8 * osc(ph) + p.tone * 0.24 * osc(2 * ph);
        break;
      case 5:
        x = SAT(
          (osc(ph * (1.4 + this.slow * 1.8)) * p.body +
            osc(ph * 3.31 + osc(ph * 5.7) * 0.38) * p.metal +
            noise * this.fast * 0.64) *
            (1 + 8 * p.drive),
        );
        break;
      case 6:
      case 7: {
        const hp = noise - this.lastNoise;
        this.lastNoise = noise;
        this.lp += (hp - this.lp) * (0.19 + 0.76 * p.color);
        const metal = (osc(ph * 4.15) * osc(ph * 6.32) + osc(ph * 9.28) * osc(ph * 5.38)) * 0.4;
        x = (this.lp * 0.65 + metal * p.metal) * 0.85;
        break;
      }
      case 8: {
        const t = n / this.rate;
        const clap =
          this.fast +
          0.62 * Math.exp(-Math.abs(t - 0.012) * 630) +
          0.52 * Math.exp(-Math.abs(t - 0.024) * 600);
        this.lp += (noise - this.lp) * Math.min(0.7, 3400 / this.rate);
        x =
          osc(ph * (1 + this.slow * 0.3)) * p.body * 0.83 +
          (noise - this.lp) * p.noise * (0.55 + 0.85 * p.clap * clap);
        break;
      }
      case 9: {
        // One-pole high-pass on the hiss alone. Zero preserves the original voice.
        let hiss = noise;
        if (this.rideCut) {
          const delta = (noise - this.lp) * this.rideCut;
          const low = this.lp + delta;
          this.lp = low + delta;
          hiss -= low;
        }
        x =
          (osc(ph * 2.73) * osc(ph * 7.19) + 0.65 * osc(ph * 4.17) * osc(ph * 8.27)) * 0.33 * p.shimmer +
          osc(ph * 3.23) * p.bell * (0.24 + this.slow * 0.48) +
          hiss * 0.11;
        break;
      }
      case 10: {
        const raw = (saw(ph, inc) + saw(this.ph2, this.freq1) + saw(this.ph3, this.freq2)) * 0.4;
        this.ph2 = (this.ph2 + this.freq1 * (1 + 0.009 * p.detune)) % 1;
        this.ph3 = (this.ph3 + this.freq2 * (1 - 0.008 * p.detune)) % 1;
        this.lp += (raw - this.lp) * (0.03 + p.color * 0.31 + this.slow * 0.22);
        x = this.lp;
        break;
      }
      case 11: {
        const dst =
          (saw(ph, inc) * (1 - p.wave) + square(ph, inc) * p.wave + 0.48 * saw(this.ph2, inc)) * 0.65;
        this.ph2 = (this.ph2 + inc * (1 + 0.022 * p.detune)) % 1;
        this.lp += this.cut * (dst - this.lp);
        x = this.lp;
        break;
      }
      case 12: {
        this.ph2 = (this.ph2 + this.freq1 * (1 + 0.005 * p.drift)) % 1;
        this.ph3 = (this.ph3 + this.freq2) % 1;
        x =
          (osc(ph + this.ph2 * 0.022 * p.color) +
            0.58 * osc(this.ph2) +
            0.48 * osc(this.ph3) +
            0.18 * saw(ph, inc) * p.color) *
          0.51;
        break;
      }
      case 13: {
        const prog = Math.min(1, n / (Number.isFinite(this.gate) ? Math.max(1, this.gate) : this.rate)),
          motion = p.sweep > 0.5 ? prog : 1 - prog;
        const fc = clamp(((0.003 + 0.48 * motion * motion) * 48000) / this.rate, 0.001, 0.65);
        this.lp += fc * this.bp;
        this.bp += fc * (noise - this.lp - 0.3 * this.bp);
        const chop = osc((n / this.rate) * (4 + 18 * p.grain)) > 0.08 ? 1 : 1 - p.grain;
        x = (this.bp + this.lp * p.color) * chop;
        break;
      }
      case 14: {
        const ratio = 1 + Math.round(p.ratio * 9),
          mod = osc(ph * ratio + this.slow * osc(ph * 2.07) * p.algorithm * 0.7);
        x = osc(ph + mod * p.index * (0.08 + 0.82 * this.slow)) * 0.85;
        break;
      }
      case 15: {
        if (this.sample) {
          if (this.idx < this.lo || this.idx >= this.hi) {
            if (p.loop > 0.5) {
              const length = this.hi - this.lo;
              this.idx = this.lo + (((this.idx-this.lo) % length) + length) % length;
            }
            else {
              this.active = false;
              return 0;
            }
          }
          near = readPCM(this.reader, this.idx);
          this.idx += this.step;
        } else {
          // Original struck-glass factory one-shot, no external recording.
          near =
            osc(ph * 2.13) * this.slow + 0.52 * osc(ph * 3.72) * this.env + 0.24 * noise * this.fast;
        }
        this.lp += this.cut * (near - this.lp);
        x = this.lp * (0.2 + p.gain * 1.5);
        break;
      }
    }
    ph += step;
    this.ph = ph - Math.floor(ph);
    return x * this.vel * this.env * Math.min(1, (n + 1) * this.attack);
  }
}
