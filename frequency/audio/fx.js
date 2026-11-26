import { clamp, macroEq } from './model.js';

const tau = Math.PI * 2;
const eqKeys = ['b0', 'b1', 'b2', 'a1', 'a2'];
const soft = (x) => x / (1 + Math.abs(x));
const comp = (x, k) => Math.sign(x) * (Math.min(Math.abs(x), k) + Math.max(0, Math.abs(x) - k) * 0.22);
const delayed = new Set([
  'delay',
  'pingpong',
  'reverb',
  'industrialverb',
  'chorus',
  'flanger',
  'freeze',
  'glitch',
  'repeat',
]);
export class Effect {
  constructor(spec, rate, bpm) {
    this.id = spec.id;
    this.rate = rate;
    this.amount = clamp(Number(spec.amount) || 0, 0, 1);
    this.target = spec.bypass ? 0 : 1;
    this.bufL = this.bufR = null;
    if (delayed.has(this.id)) {
      const time = ['chorus', 'flanger'].includes(this.id)
        ? 0.05
        : ['reverb', 'industrialverb'].includes(this.id)
          ? 0.21
          : 1.55;
      this.bufL = new Float32Array(Math.ceil(time * rate) + 3);
      this.bufR = new Float32Array(this.bufL.length);
    }
    this.reset();
    this.configure(spec, bpm);
  }
  reset() {
    this.bufL?.fill(0);
    this.bufR?.fill(0);
    this.lastL = this.lastR = this.lowL = this.lowR = this.highL = this.highR = 0;
    this.zL = this.zR = this.env = this.wet = this.L = this.R = 0;
    this.write = this.phase = this.head = this.frame = 0;
    this.freezeSize = this.captured = this.freezePos = 0;
    if (this.eqTarget) this.finishEqRamp();
    if (this.id === 'dj') {
      this.djCut = this.djCutTarget;
      this.djMix = this.djMixTarget;
      this.djRamp = 0;
    }
  }
  configure(spec, bpm) {
    if (this.id === 'freeze' && this.target === 0 && !spec.bypass) {
      this.freezeSize = this.captured = this.freezePos = 0;
    }
    this.target = spec.bypass ? 0 : 1;
    this.amount = clamp(Number.isFinite(spec.amount) ? spec.amount : 0.4, 0, 1);
    this.beat = 60 / bpm;
    this.block = Math.max(16, Math.round(this.beat * this.rate * (this.amount > 0.55 ? 0.25 : 0.5)));
    if (this.id === 'eq') {
      const settings = spec.eq ?? macroEq(this.amount);
      const frequency = spec.eq ? Math.min(settings.frequency, this.rate * 0.49) : settings.frequency;
      if (frequency !== this.eqFrequency || settings.gain !== this.eqGain || settings.q !== this.eqQ) {
        this.eqFrequency = frequency;
        this.eqGain = settings.gain;
        this.eqQ = settings.q;
        const w = (2 * Math.PI * frequency) / this.rate;
        const A = 10 ** (settings.gain / 40);
        const alpha = Math.sin(w) / (2 * settings.q);
        const a0 = 1 + alpha / A;
        const b1 = (-2 * Math.cos(w)) / a0;
        this.eqTarget = [(1 + alpha * A) / a0, b1, (1 - alpha * A) / a0, b1, (1 - alpha / A) / a0];
        if (this.b0 === undefined || (!this.target && this.wet < 0.0001)) this.finishEqRamp();
        else {
          this.eqRamp = Math.max(1, Math.round(0.008 * this.rate));
          this.eqDelta = this.eqTarget.map((value, i) => (value - this[eqKeys[i]]) / this.eqRamp);
        }
      }
    }
    this.cut = 1 - Math.exp((-tau * (160 + this.amount * this.amount * 12000)) / this.rate);
    this.hicut = 1 - Math.exp((-tau * 2800) / this.rate);
    this.locut = 1 - Math.exp((-tau * 180) / this.rate);
    this.smooth = 1 - Math.exp(-1 / (0.006 * this.rate));
    if (this.id === 'dj') this.configureDjFilter();
  }
  finishEqRamp() {
    for (let i = 0; i < eqKeys.length; i++) this[eqKeys[i]] = this.eqTarget[i];
    this.eqRamp = 0;
  }
  configureDjFilter() {
    if (this.djAmount === this.amount) return;
    this.djAmount = this.amount;
    const position = 2 * this.amount - 1;
    const upperHz = Math.min(16000, this.rate * 0.45);
    const octavePosition = position < 0 ? 1 + position : position;
    const hz = 30 * (upperHz / 30) ** octavePosition;
    const g = Math.tan(Math.PI * hz / this.rate);
    this.djCutTarget = g / (1 + g);
    // Within five percent of the centre, blend either filter continuously to dry.
    this.djMixTarget = clamp(position * 10, -1, 1);
    if (this.djCut === undefined) {
      this.djCut = this.djCutTarget;
      this.djMix = this.djMixTarget;
      return;
    }
    this.djRamp = Math.max(1, Math.round(0.006 * this.rate));
    this.djCutStep = (this.djCutTarget - this.djCut) / this.djRamp;
    this.djMixStep = (this.djMixTarget - this.djMix) / this.djRamp;
  }
  step(l, r, detector = 0) {
    this.wet += (this.target - this.wet) * this.smooth;
    if (this.wet < 0.0001 && this.target === 0) {
      if (this.eqRamp > 0) this.finishEqRamp();
      this.L = l;
      this.R = r;
      return;
    }
    const a = this.amount,
      rate = this.rate;
    let x = l,
      y = r;
    this.frame++;
    switch (this.id) {
      case 'eq': {
        // Change the coefficients from the current response, including when the user
        // moves the knob again before the previous adjustment has settled.
        if (this.eqRamp > 0) {
          if (--this.eqRamp === 0) this.finishEqRamp();
          else for (let i = 0; i < eqKeys.length; i++) this[eqKeys[i]] += this.eqDelta[i];
        }
        x = this.b0 * l + this.lowL;
        y = this.b0 * r + this.lowR;
        this.lowL = this.b1 * l - this.a1 * x + this.highL;
        this.lowR = this.b1 * r - this.a1 * y + this.highR;
        this.highL = this.b2 * l - this.a2 * x;
        this.highR = this.b2 * r - this.a2 * y;
        break;
      }
      case 'compressor':
      case 'sidechain':
      case 'gate':
      case 'transient': {
        const impulse = this.id === 'sidechain' ? detector : Math.max(Math.abs(l), Math.abs(r));
        this.env +=
          (impulse - this.env) * (impulse > this.env ? 0.013 : 0.00017) * Math.min(2, 48000 / rate);
        if (this.id === 'compressor') {
          const g = this.env > 0.6 - a * 0.49 ? ((0.6 - a * 0.49) / this.env) ** 0.72 : 1;
          x *= g;
          y *= g;
        } else if (this.id === 'sidechain') {
          x /= 1 + this.env * a * 14;
          y /= 1 + this.env * a * 14;
        } else if (this.id === 'gate') {
          const g = clamp((this.env - (0.001 + a * 0.07)) * 120, 0, 1);
          x *= g;
          y *= g;
        } else {
          const g = 1 + Math.max(-0.4, Math.min(1, (impulse - this.env) * 5)) * a * 2;
          x *= g;
          y *= g;
        }
        break;
      }
      case 'limiter': {
        const c = 1 - a * 0.65,
          g = Math.max(1, Math.abs(l) / c, Math.abs(r) / c);
        x /= g;
        y /= g;
        break;
      }
      case 'softclip':
        x = soft(l * (1 + 4 * a));
        y = soft(r * (1 + 4 * a));
        break;
      case 'hardclip':
        x = clamp(l, -1 + a * 0.85, 1 - a * 0.85);
        y = clamp(r, -1 + a * 0.85, 1 - a * 0.85);
        break;
      case 'saturation':
        x = Math.tanh(l * (1 + a * 4));
        y = Math.tanh(r * (1 + a * 4));
        break;
      case 'overdrive':
        x = Math.tanh(l * (1 + 9 * a) + 0.18) - 0.17808;
        y = Math.tanh(r * (1 + 9 * a) + 0.18) - 0.17808;
        break;
      case 'distortion':
        x = comp(l * (1 + a * 15), 0.38);
        y = comp(r * (1 + a * 15), 0.38);
        break;
      case 'waveshaper':
        x = Math.sin(clamp(l * (1 + a * 9), -4, 4));
        y = Math.sin(clamp(r * (1 + a * 9), -4, 4));
        break;
      case 'bitcrusher': {
        const n = 2 ** (12 - Math.floor(a * 10));
        x = Math.round(l * n) / n;
        y = Math.round(r * n) / n;
        break;
      }
      case 'reduction':
        if (this.frame % (1 + Math.floor(a * 26)) === 0) {
          this.lastL = l;
          this.lastR = r;
        }
        x = this.lastL;
        y = this.lastR;
        break;
      case 'freeze': {
        if (this.freezeSize === 0 && Math.max(Math.abs(l), Math.abs(r)) > 0.0001)
          this.freezeSize = Math.min(this.block, this.bufL.length);
        if (this.captured < this.freezeSize) {
          this.bufL[this.captured] = l;
          this.bufR[this.captured++] = r;
        } else if (this.freezeSize) {
          const pos = this.freezePos;
          const window = Math.min(1, pos / 32, (this.freezeSize - 1 - pos) / 32);
          x = l * (1 - a) + a * this.bufL[pos] * window;
          y = r * (1 - a) + a * this.bufR[pos] * window;
          this.freezePos = (pos+1) % this.freezeSize;
        }
        break;
      }
      case 'filter':
        this.lowL += this.cut * (l - this.lowL);
        this.lowR += this.cut * (r - this.lowR);
        x = this.lowL;
        y = this.lowR;
        break;
      case 'dj': {
        if (this.djRamp > 0) {
          this.djRamp--;
          this.djCut = this.djRamp ? this.djCut + this.djCutStep : this.djCutTarget;
          this.djMix = this.djRamp ? this.djMix + this.djMixStep : this.djMixTarget;
        }
        // One trapezoidal integrator gives complementary low/high responses per channel.
        const deltaL = (l - this.lowL) * this.djCut;
        const deltaR = (r - this.lowR) * this.djCut;
        const lowL = this.lowL + deltaL;
        const lowR = this.lowR + deltaR;
        this.lowL = lowL + deltaL;
        this.lowR = lowR + deltaR;
        if (this.djMix < 0) {
          x += (l - lowL) * this.djMix;
          y += (r - lowR) * this.djMix;
        } else {
          x -= lowL * this.djMix;
          y -= lowR * this.djMix;
        }
        break;
      }
      case 'resonant': {
        const g = Math.min(0.7, this.cut);
        this.lowL += g * this.highL;
        this.highL += g * (l - this.lowL - (0.38 + 0.3 * (1 - a)) * this.highL);
        this.lowR += g * this.highR;
        this.highR += g * (r - this.lowR - (0.38 + 0.3 * (1 - a)) * this.highR);
        x = this.lowL;
        y = this.lowR;
        break;
      }
      case 'phaser': {
        this.phase += (tau * 0.33) / rate;
        const k = 0.4 + 0.37 * Math.sin(this.phase) * a;
        x = -k * l + this.lastL + k * this.zL;
        y = -k * r + this.lastR + k * this.zR;
        this.lastL = l;
        this.lastR = r;
        this.zL = x;
        this.zR = y;
        x = 0.5 * l + 0.5 * x;
        y = 0.5 * r + 0.5 * y;
        break;
      }
      case 'stereo': {
        const mid = (l + r) * 0.5,
          side = (l - r) * a;
        x = mid + side;
        y = mid - side;
        break;
      }
      case 'multiband':
      case 'mastering': {
        this.lowL += (l - this.lowL) * this.locut;
        this.lowR += (r - this.lowR) * this.locut;
        this.highL += (l - this.highL) * this.hicut;
        this.highR += (r - this.highR) * this.hicut;
        const thr = 0.72 - 0.48 * a;
        x =
          comp(this.lowL, thr) +
          comp(this.highL - this.lowL, thr * 0.7) +
          comp(l - this.highL, thr * 0.44);
        y =
          comp(this.lowR, thr) +
          comp(this.highR - this.lowR, thr * 0.7) +
          comp(r - this.highR, thr * 0.44);
        if (this.id === 'mastering') {
          x = Math.tanh(x * (1 + 0.8 * a));
          y = Math.tanh(y * (1 + 0.8 * a));
        }
        break;
      }
      default:
        if (this.bufL) {
          const n = this.bufL.length,
            w = this.write;
          let offL = this.beat * rate * 0.75,
            offR = offL,
            fb = 0.22 + 0.42 * a,
            wet = 0.22 + 0.41 * a;
          if (this.id === 'chorus' || this.id === 'flanger') {
            this.phase += (tau * (this.id === 'chorus' ? 0.68 : 0.18)) / rate;
            const base = this.id === 'chorus' ? 0.016 : 0.003;
            offL = rate * base * (1 + 0.55 * Math.sin(this.phase));
            offR = rate * base * (1 + 0.55 * Math.cos(this.phase));
            fb = this.id === 'flanger' ? 0.53 : 0.1;
          } else if (this.id === 'reverb' || this.id === 'industrialverb') {
            offL = rate * (this.id === 'reverb' ? 0.0361 : 0.0871);
            offR = rate * (this.id === 'reverb' ? 0.0497 : 0.1193);
            fb = 0.54 + 0.26 * a;
            wet = 0.2 + 0.4 * a;
          } else if (this.id === 'repeat' || this.id === 'glitch') {
            const size = Math.min(this.block, n - 1),
              pos = this.frame % size;
            if (pos === 0) {
              const blockNumber = Math.floor(this.frame / size);
              if (blockNumber % (this.id === 'repeat' ? 4 : 3) === 0)
                this.head = (w - size + n) % n;
            }
            const window = Math.min(1, pos / 32, (size - pos) / 32);
            x = l * (1 - a) + a * this.bufL[(this.head + pos) % n] * window;
            y = r * (1 - a) + a * this.bufR[(this.head + pos) % n] * window;
            this.bufL[w] = l;
            this.bufR[w] = r;
            this.write = (w + 1) % n;
            break;
          }
          const dl = this.bufL[(w - Math.min(n - 1, Math.max(1, Math.round(offL))) + n) % n],
            dr = this.bufR[(w - Math.min(n - 1, Math.max(1, Math.round(offR))) + n) % n];
          const pingPong = this.id === 'pingpong';
          let inputL = l, inputR = r;
          if (pingPong && l * r > 0) {
            // Send the common in-phase signal to the left first. Keep its stereo power
            // and leave already separated or opposite-polarity inputs in their channels.
            const common = Math.sign(l) * Math.min(Math.abs(l), Math.abs(r));
            inputL += common;
            inputR -= common;
            const gain = Math.sqrt((l*l + r*r) / (inputL*inputL + inputR*inputR));
            inputL *= gain;
            inputR *= gain;
          }
          const cross = pingPong || this.id === 'reverb' || this.id === 'industrialverb';
          const backL = cross ? dr : dl,
            backR = cross ? dl : dr;
          this.bufL[w] = clamp(inputL + fb * backL, -2, 2);
          this.bufR[w] = clamp(inputR + fb * backR, -2, 2);
          this.write = (w + 1) % n;
          x = l + dl * wet;
          y = r + dr * wet;
          if (this.id === 'industrialverb') {
            x += this.bufR[(w + Math.floor(n * 0.46)) % n] * wet * 0.45;
            y += this.bufL[(w + Math.floor(n * 0.62)) % n] * wet * 0.45;
          }
        }
    }
    this.L = l + (x - l) * this.wet;
    this.R = r + (y - r) * this.wet;
  }
}
