const profiles = Object.freeze({ chrome: 0, acid: 1, noir: 2, afterimage: 3, alloy: 4, aura: 5 });
export const portraitProfile = (mode) => profiles[mode] ?? 0;

// The same envelope runs forward and backward. Snap the inaudible tail to zero
// so the rest mesh is reproduced exactly, even after many starts and pauses.
export function easePortrait(current, target, seconds, duration) {
  const next = target + (current - target) * Math.exp(-seconds / duration);
  return Math.abs(next - target) < 0.002 ? target : next;
}

// Coefficients for bass, midrange and high frequencies in track order.
const scatterBands = [
  [0.30, 0.12, 0], [0.33, 0.47, 0.25], [0, 0.26, 0.06],
  [0, 0.42, 0.25], [0.62, 0, 0.50], [0, 0.29, 0.53],
];

export function scatterTarget(profile, bass, mid, high, level) {
  const bands = scatterBands[profile];
  return Math.min(1, 0.32 * level + bands[0] * bass + bands[1] * mid + bands[2] * high);
}
