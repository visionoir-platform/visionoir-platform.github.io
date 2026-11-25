/** Stereo-linked lookahead limiter. A monotonic queue bounds DSP work per sample. */
export class MasterLimiter {
  constructor(rate) {
    this.lookahead = Math.ceil(0.0025 * rate);
    this.size = this.lookahead + 2;
    this.left = new Float32Array(this.size);
    this.right = new Float32Array(this.size);
    this.values = new Float32Array(this.size);
    this.positions = new Float64Array(this.size);
    this.release = 1 - Math.exp(-1 / (rate * 0.09));
    // High-frequency cleanup before peak detection conserves reconstruction headroom.
    this.tone = 1 - Math.exp((-2 * Math.PI * Math.min(18400, rate * 0.38)) / rate);
    this.reset();
  }
  reset() {
    this.left.fill(0);
    this.right.fill(0);
    this.head = this.tail = this.frame = this.write = 0;
    this.gain = 1;
    this.lowL = this.lowR = this.L = this.R = 0;
  }
  step(l, r, ceiling) {
    this.lowL += (l - this.lowL) * this.tone;
    this.lowR += (r - this.lowR) * this.tone;
    const value = Math.max(Math.abs(this.lowL), Math.abs(this.lowR)),
      i = this.frame++,
      n = this.size;
    while (this.head !== this.tail && this.positions[this.head] < i - this.lookahead)
      this.head = (this.head + 1) % n;
    while (this.head !== this.tail) {
      const prev = (this.tail + n - 1) % n;
      if (this.values[prev] > value) break;
      this.tail = prev;
    }
    this.values[this.tail] = value;
    this.positions[this.tail] = i;
    this.tail = (this.tail + 1) % n;
    const target = Math.min(1, (0.88 * ceiling) / Math.max(1e-9, this.values[this.head]));
    this.gain = target < this.gain ? target : this.gain + (target - this.gain) * this.release;
    this.left[this.write] = this.lowL;
    this.right[this.write] = this.lowR;
    const read = (this.write + n - this.lookahead) % n; // Reserve 2 dB after gain reduction for reconstruction/transcoding headroom.
    const outputGain = this.gain * 0.794328235;
    this.L = this.left[read] * outputGain;
    this.R = this.right[read] * outputGain;
    this.write = (this.write + 1) % n;
  }
}
