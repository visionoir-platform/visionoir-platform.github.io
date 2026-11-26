export const SAMPLER_PADS = 16;
export const FACTORY_SAMPLE_RATE = 24000;
export const FACTORY_SAMPLE_FRAMES = Math.floor(FACTORY_SAMPLE_RATE * 0.51);

// A zero pad preserves the original continuous start-offset mapping in saved sessions.
// Pads 1–16 partition the complete trim into nonoverlapping, end-exclusive PCM intervals.
export function samplerBounds(length, params, out = {}) {
  const start = Math.min(length - 1, Math.floor(length * (params.start ?? 0)));
  const end = Math.max(start + 1, Math.floor(length * (params.end ?? 1)));
  const span = end - start;
  out.count = Math.min(SAMPLER_PADS, span);
  out.pad = Math.min(out.count, Math.round((params.slicePad ?? 0) * SAMPLER_PADS));
  if (out.pad) {
    out.lo = start + Math.floor(span * (out.pad - 1) / out.count);
    out.hi = start + Math.floor(span * out.pad / out.count);
  } else {
    out.lo = Math.min(Math.max(0, length - 2), Math.floor(length * ((params.start ?? 0) + (params.slice ?? 0) * 0.35)));
    out.hi = Math.max(out.lo + 1, Math.floor(length * (params.end ?? 1)));
  }
  return out;
}
