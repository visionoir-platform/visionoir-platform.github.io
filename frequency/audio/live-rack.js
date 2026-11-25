import { LiveBudget } from './live-budget.js';
import { DSP } from './dsp.js';
import { clamp } from './model.js';

/**
 * Two live decks share a sample clock. Prepare the next deck when a scene is
 * requested, switch exactly on its bar, then recycle the outgoing effect buffers.
 * Offline arrangements require one DSP and never allocate a second deck.
 */
export class LiveRack {
  constructor(project, rate) {
    this.rate = rate;
    this.budget = new LiveBudget(rate);
    this.project = project;
    this.active = new DSP(project, rate);
    this.spare = null;
    this.held = new Map();
    this.outgoing = null;
    this.queued = null;
    this.fade = 0;
    this.fadeLength = 0;
    this.left = new Float32Array(1024);
    this.right = new Float32Array(1024);
    this.clearMeters();
  }
  observeBudget(elapsed, frames) {
    const before = this.budget.protected;
    this.budget.observe(elapsed, frames);
    if (before !== this.budget.protected) this.applyBudget();
  }
  applyBudget() {
    for (const dsp of [this.active, this.outgoing, this.spare]) {
      if (dsp) dsp.meterStride = this.budget.protected ? 4 : 1;
    }
  }
  clearMeters() {
    this.peakL = this.peakR = this.powerL = this.powerR = this.cross = this.count = 0;
  }
  get running() {
    return this.active.running;
  }
  update(project) {
    this.project = project;
    this.active.update(project);
    this.spare?.update(project);
    this.outgoing?.update(project);
  }
  control(id, value) {
    this.active.control(id, value);
    this.outgoing?.control(id, value);
    this.spare?.control(id, value);
  }
  start(options = {}) {
    this.stop();
    this.active.start(options);
  }
  stop() {
    this.budget.reset();
    this.applyBudget();
    this.clearMeters();
    this.held.clear();
    this.active.stop();
    this.outgoing?.stop();
    if (this.outgoing) this.spare = this.outgoing;
    this.outgoing = null;
    this.queued = null;
  }
  trigger(...args) {
    this.active.trigger(...args);
  }
  noteOn(track, pitch, velocity, token) {
    if (!Number.isSafeInteger(token) || token < 1) return;
    this.held.set(token, {track, pitch, velocity});
    this.active.trigger(track, pitch, velocity, null, {voiceToken: token});
  }
  release(track, pitch, token) {
    if (token !== undefined) this.held.delete(token);
    this.active.release(track, pitch, token);
    this.outgoing?.release(track, pitch, token);
  }
  queueScene(scene) {
    if (!Number.isInteger(scene) || !this.project.scenes[scene]) return;
    if (!this.running) return;
    const step = (Math.floor(Math.max(0, this.active.step) / 16) + 1) * 16;
    this.queued = { scene, step };
    if (!this.outgoing) this.arm();
  }
  arm() {
    if (!this.queued) return;
    this.spare ??= new DSP(this.project, this.rate);
    this.spare.meterStride = this.budget.protected ? 4 : 1;
    this.spare.start({ scene: this.queued.scene, absoluteStep: this.queued.step });
  }
  status() {
    const status = this.active.status(),
      n = Math.max(1, this.count);
    status.masterPeak = [this.peakL, this.peakR];
    status.masterRms = [Math.sqrt(this.powerL / n), Math.sqrt(this.powerR / n)];
    status.correlation =
      this.powerL && this.powerR ? clamp(this.cross / Math.sqrt(this.powerL * this.powerR), -1, 1) : 0;
    status.dspLoad = this.budget.load;
    status.meterStride = this.active.meterStride;
    status.queuedScene = this.queued?.scene ?? null;
    this.clearMeters();
    return status;
  }
  render(left, right, length = left.length) {
    let offset = 0;
    while (offset < length) {
      let count = length - offset;
      if (this.outgoing) {
        count = Math.min(count, this.fadeLength - this.fade, this.left.length);
        this.outgoing.render(this.left, this.right, count);
        const l = offset ? left.subarray(offset, offset + count) : left;
        const r = offset ? right.subarray(offset, offset + count) : right;
        this.active.render(l, r, count);
        for (let i = 0; i < count; i++) {
          const pos = (this.fade + i) / (this.fadeLength - 1),
            a = Math.cos((pos * Math.PI) / 2),
            b = Math.sin((pos * Math.PI) / 2);
          let x = a * this.left[i] + b * l[i],
            y = a * this.right[i] + b * r[i];
          const gain = Math.min(1, this.active.ceil / Math.max(0.000001, Math.abs(x), Math.abs(y)));
          l[i] = x * gain;
          r[i] = y * gain;
        }
        this.fade += count;
        if (this.fade === this.fadeLength) {
          this.spare = this.outgoing;
          this.outgoing = null;
          this.arm();
        }
      } else {
        if (this.queued && this.running) {
          const d = this.active,
            at = d.nextBoundary + (this.queued.step - d.step - 1) * d.stepSamples;
          count = Math.min(count, Math.max(0, Math.ceil(at) - d.frame));
          if (count === 0) {
            const beats = clamp(this.project.crossfadeBeats ?? 1, 0, 4);
            this.fadeLength = Math.max(2, Math.round((beats * 60 * this.rate) / this.project.bpm));
            this.outgoing = this.active;
            this.active = this.spare;
            for (const [token, note] of this.held)
              this.active.trigger(note.track, note.pitch, note.velocity, null, {voiceToken: token});
            this.spare = null;
            this.queued = null;
            this.fade = 0;
            continue;
          }
        }
        this.active.render(
          offset ? left.subarray(offset, offset + count) : left,
          offset ? right.subarray(offset, offset + count) : right,
          count,
        );
      }
      for (let i = offset; i < offset + count; i++) {
        const l = left[i],
          r = right[i];
        this.peakL = Math.max(this.peakL, Math.abs(l));
        this.peakR = Math.max(this.peakR, Math.abs(r));
        this.powerL += l * l;
        this.powerR += r * r;
        this.cross += l * r;
      }
      this.count += count;
      offset += count;
    }
  }
}
