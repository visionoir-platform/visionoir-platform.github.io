// Eight beats per chapter. The score moves from mineral surfaces through heat,
// fragmentation and echoes, then resolves through chrome to its own final look.
export const unseenMode = 15;
const score = [7, 5, 4, 1, 10, 2, 3, 9, 6, 12, 8, 11, 0, 13, 14, unseenMode];

export function phraseMode(beat, scene) {
  return score[(Math.floor(beat / 8) + scene) % score.length];
}

export function advanceBlend(blend, target, step) {
  if (step >= 1) {
    blend.from = blend.to = target;
    blend.mix = 1;
    return;
  }
  if (blend.from !== blend.to && target !== blend.to &&
      (target === blend.from || blend.mix < 0.5)) {
    // Reverse the current blend without changing the image at the interruption.
    [blend.from, blend.to] = [blend.to, blend.from];
    blend.mix = 1 - blend.mix;
  }
  if (blend.from !== blend.to) {
    const remaining = 1 - blend.mix;
    if (step < remaining) {
      blend.mix += step;
      return;
    }
    step -= remaining;
    blend.from = blend.to;
    blend.mix = 1;
  }
  if (target !== blend.to) {
    blend.to = target;
    blend.mix = step;
  }
}
