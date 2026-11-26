// Slots are reserved on project/tempo changes. Use length for the active heap only.
export class ScheduledEvents {
  constructor() {
    this.slots = [];
    this.length = 0;
    this.serial = 0;
  }
  reserve(capacity) {
    while (this.slots.length < capacity)
      this.slots.push({ at: 0, serial: 0, step: 0, offset: 0, track: 0, source: null, pitch: 0, velocity: 0, gate: 0, seed: 0 });
  }
  add(at, step, offset, track, source, pitch, velocity, gate, seed) {
    let i = this.length++;
    const e = this.slots[i];
    e.at = at; e.step = step; e.offset = offset; e.track = track; e.source = source; e.pitch = pitch;
    e.velocity = velocity; e.gate = gate; e.seed = seed; e.serial = ++this.serial;
    while (i) {
      const parent = (i - 1) >>> 1;
      if (!earlier(e, this.slots[parent])) break;
      this.slots[i] = this.slots[parent];
      i = parent;
    }
    this.slots[i] = e;
  }
  pop() {
    const first = this.slots[0], last = --this.length;
    this.slots[0] = this.slots[last];
    this.slots[last] = first;
    if (last) this.sink(0);
    return first;
  }
  sink(i) {
    const root = this.slots[i];
    for (let child = 2*i+1; child < this.length; child = 2*i+1) {
      const right = child+1;
      if (right < this.length && earlier(this.slots[right], this.slots[child])) child = right;
      if (!earlier(this.slots[child], root)) break;
      this.slots[i] = this.slots[child];
      i = child;
    }
    this.slots[i] = root;
  }
  discardFrom(step) {
    let keep = 0;
    for (let i = 0; i < this.length; i++) {
      const e = this.slots[i];
      if (e.step >= step) { e.source = null; continue; }
      this.slots[i] = this.slots[keep];
      this.slots[keep++] = e;
    }
    this.length = keep;
    this.heapify();
  }
  retime(frame, nextStep, nextBoundary, stepSamples) {
    for (let i = 0; i < this.length; i++) {
      const e = this.slots[i];
      // Preserve musical position across edits, including hits from the previous step.
      const stepsFromBoundary = (e.step - nextStep) + e.offset;
      e.at = Math.max(frame, Math.round(nextBoundary + stepsFromBoundary * stepSamples));
    }
    // Different hits can now round to the same sample, or split across adjacent samples.
    this.heapify();
  }
  heapify() {
    for (let i = (this.length >>> 1) - 1; i >= 0; i--) this.sink(i);
  }
  clear() {
    for (let i = 0; i < this.length; i++) this.slots[i].source = null;
    this.length = this.serial = 0;
  }
}
// The old stable descending sort consumed from the end, so equal-frame hits play newest first.
function earlier(a, b) {
  return a.at < b.at || (a.at === b.at && a.serial > b.serial);
}
