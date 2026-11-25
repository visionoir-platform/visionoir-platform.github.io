// ITU-R BS.1770-5, Annex 1 tables 1/2 and Annex 2 (4-phase interpolating FIR).
// EBU Tech 3341 defines the ungated 400 ms and 3 s windows used here.
const shelf48 = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585];
const highpass48 = [1, -2, 1, -1.99004745483398, 0.99007225036621];

function coefficients(reference, rate) {
  if (rate === 48000) return reference;
  // Re-express the 48 kHz digital transfer function through its bilinear analogue prototype.
  const q = (48000 - rate) / (48000 + rate);
  const polynomial = (a, b, c) => [
    a + b * q + c * q * q,
    2 * q * (a + c) + b * (1 + q * q),
    a * q * q + b * q + c,
  ];
  const [b0,b1,b2,a1,a2] = reference;
  const top = polynomial(b0,b1,b2), bottom = polynomial(1,a1,a2);
  return [top[0],top[1],top[2],bottom[1],bottom[2]].map(v => v / bottom[0]);
}

class Biquad {
  constructor(coeffs) {
    [this.b0,this.b1,this.b2,this.a1,this.a2] = coeffs;
    this.reset();
  }
  reset() {
    this.s1 = this.s2 = 0;
  }
  filter(x) {
    const y = this.b0 * x + this.s1;
    this.s1 = this.b1 * x - this.a1 * y + this.s2;
    this.s2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

const phase0 = [0.001708984375,0.010986328125,-0.0196533203125,0.033203125,-0.0594482421875,
  0.1373291015625,0.97216796875,-0.102294921875,0.047607421875,-0.026611328125,0.014892578125,-0.00830078125];
const phase1 = [-0.0291748046875,0.029296875,-0.0517578125,0.089111328125,-0.16650390625,
  0.465087890625,0.77978515625,-0.2003173828125,0.1015625,-0.0582275390625,0.0330810546875,-0.0189208984375];
const phases = [phase0,phase1,[...phase1].reverse(),[...phase0].reverse()];

class TruePeak {
  constructor() {
    this.left = new Float64Array(24);
    this.right = new Float64Array(24);
    this.reset();
  }
  reset() {
    this.left.fill(0);
    this.right.fill(0);
    this.head = 0;
    this.maximum = 0;
  }
  push(l,r) {
    this.head = this.head ? this.head - 1 : 11;
    const first = this.head;
    this.left[first] = this.left[first+12] = l;
    this.right[first] = this.right[first+12] = r;
    let peak = Math.max(this.maximum,Math.abs(l),Math.abs(r));
    for (let p=0; p<4; p++) {
      const weights = phases[p];
      let a=0, b=0;
      for (let tap=0; tap<12; tap++) {
        a += this.left[first+tap] * weights[tap];
        b += this.right[first+tap] * weights[tap];
      }
      peak = Math.max(peak,Math.abs(a),Math.abs(b));
    }
    this.maximum = peak;
  }
  flush() {
    // An abrupt Stop can arrive before the 12-tap reconstruction of the final frames.
    for (let i=0; i<11; i++) this.push(0,0);
  }
}

export class MasterAnalysis {
  constructor(rate) {
    this.rate = rate;
    const shelf = coefficients(shelf48,rate), hp = coefficients(highpass48,rate);
    this.shelfL = new Biquad(shelf);
    this.shelfR = new Biquad(shelf);
    this.hpL = new Biquad(hp);
    this.hpR = new Biquad(hp);
    this.truePeak = new TruePeak();
    this.energies = new Float64Array(30);
    this.sizes = new Uint32Array(30);
    this.reset();
  }
  reset() {
    this.shelfL.reset(); this.shelfR.reset();
    this.hpL.reset(); this.hpR.reset();
    this.truePeak.reset();
    this.energies.fill(0); this.sizes.fill(0);
    this.hops = this.frames = this.hopFrames = this.energy = this.head = 0;
    this.nextBoundary = Math.round(this.rate / 10);
    this.momentary = this.shortTerm = null;
  }
  consume(left,right,length) {
    for (let i=0; i<length; i++) {
      const l = left[i], r = right[i];
      this.truePeak.push(l,r);
      const weightedL = this.hpL.filter(this.shelfL.filter(l));
      const weightedR = this.hpR.filter(this.shelfR.filter(r));
      this.energy += weightedL * weightedL + weightedR * weightedR;
      this.hopFrames++;
      if (++this.frames === this.nextBoundary) {
        this.energies[this.head] = this.energy;
        this.sizes[this.head] = this.hopFrames;
        this.head = (this.head+1) % 30;
        this.hops++;
        this.momentary = this.loudness(4);
        this.shortTerm = this.loudness(30);
        this.energy = this.hopFrames = 0;
        this.nextBoundary = Math.round((this.hops+1) * this.rate / 10);
      }
    }
  }
  loudness(hops) {
    if (this.hops < hops) return null;
    let energy = 0, frames = 0;
    for (let i=1; i<=hops; i++) {
      const slot = (this.head + 30 - i) % 30;
      energy += this.energies[slot];
      frames += this.sizes[slot];
    }
    return -0.691 + 10 * Math.log10(energy / frames);
  }
}
