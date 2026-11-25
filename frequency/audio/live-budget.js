// Time only the render callback. AudioContext.currentTime is a sample clock and cannot measure CPU time.
export const renderClock =
  typeof globalThis.performance?.now === 'function'
    ? { now: () => performance.now(), coarse: false }
    : { now: () => Date.now(), coarse: true };

export class LiveBudget {
  constructor(rate, coarse = renderClock.coarse) {
    this.rate = rate;
    this.coarse = coarse;
    this.reset();
  }
  reset() {
    this.protected = false;
    this.load = undefined;
    this.clockConfirmed = !this.coarse;
    this.frames = this.elapsed = this.high = this.low = 0;
  }
  observe(elapsed, frames) {
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 250 || !(frames > 0)) {
      this.frames = this.elapsed = this.high = this.low = 0;
      return;
    }
    // A coarse wall clock is usable only after observing actual short nonzero callback timings.
    // An isolated stall, sleep cycle or privacy-rounded 100 ms tick cannot trigger a transition.
    if (elapsed > 0 && elapsed <= 2) this.clockConfirmed = true;
    const budget = (1000 * frames) / this.rate;
    this.elapsed += Math.min(elapsed, budget * 3);
    this.frames += frames;
    if (this.frames < this.rate / 2) return;
    const ratio = (this.elapsed * this.rate) / (1000 * this.frames);
    this.frames = this.elapsed = 0;
    if (!this.clockConfirmed) return;
    this.load = ratio;
    this.high = ratio >= 0.78 ? this.high + 1 : 0;
    this.low = ratio <= 0.5 ? this.low + 1 : 0;
    if (this.high >= 3) this.protected = true;
    else if (this.low >= 12) this.protected = false;
  }
}
