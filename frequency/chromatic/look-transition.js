import { parameters } from './model.js';

const names = Object.keys(parameters);

// This clock is shared by the studio and its same-origin projector.
export const lookTime = () => performance.timeOrigin + performance.now();

export function recallLook(id, target, now) {
  return { id, start: now, duration: 450 + (1 - target.rebuild) * 850,
    pausedAt: target.freeze ? now : null, direct: [] };
}

export function editLook(cue, change, now) {
  if (!cue) return;
  if (change.freeze === true && cue.pausedAt === null) cue.pausedAt = now;
  if (change.freeze === false && cue.pausedAt !== null) {
    cue.start += now - cue.pausedAt;
    cue.pausedAt = null;
  }
  for (const name of Object.keys(change)) {
    if ((name === 'color' || Object.hasOwn(parameters, name)) && !cue.direct.includes(name)) cue.direct.push(name);
  }
}

export class LookTransition {
  state = null;
  source = null;
  id = null;
  target = null;
  mix = 1;
  started = false;

  sample(target, cue, now, reduced) {
    this.started = (cue?.id ?? null) !== this.id;
    if (this.started) {
      this.id = cue?.id ?? null;
      // An interrupted recall starts with the last frame this surface displayed.
      this.source = cue && this.state ? { ...this.state } : null;
    }
    this.mix = 1;
    if (this.source && !reduced) {
      const elapsed = (cue.pausedAt ?? now) - cue.start;
      this.mix = Math.min(1, Math.max(0, elapsed / cue.duration));
    }
    if (this.mix === 1) {
      this.source = null;
      this.state = target;
    } else {
      if (this.started || target !== this.target) this.state = { ...target };
      for (const name of names) {
        const from = this.source[name];
        this.state[name] = cue.direct.includes(name) ? target[name] : from + (target[name] - from) * this.mix;
      }
    }
    this.target = target;
    return this.state;
  }
}
