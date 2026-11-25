import { pcmReader, readPCM } from './resample.js';
// Region bounds are source PCM frames, end exclusive. Placement is in sixteenth notes of the arrangement part.
export function sampleFrameCount(sample) {
  if (!sample?.pcm) return 0;
  const text = sample.pcm;
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.floor(((text.length / 4) * 3 - pad) / 2);
}
export function validateRegions(parts, tracks) {
  const sources = new Map(tracks.filter((t) => t.sample).map((t) => [t.id, sampleFrameCount(t.sample)]));
  let count = 0;
  for (const part of parts) {
    if (part.audioRegions === undefined) continue;
    if (
      !Array.isArray(part.audioRegions) ||
      part.audioRegions.length > 64 ||
      (count += part.audioRegions.length) > 512
    )
      throw Error('project.regions');
    for (const r of part.audioRegions) {
      if (
        !r ||
        !sources.has(r.track) ||
        !Number.isInteger(r.step) ||
        r.step < 0 ||
        r.step >= part.bars * 16 ||
        !Number.isInteger(r.from) ||
        !Number.isInteger(r.to) ||
        r.from < 0 ||
        r.to <= r.from ||
        r.to > sources.get(r.track)
      )
        throw Error('project.region');
    }
  }
}
// Resampling is independent of tempo. A short envelope at either trimmed/part edge prevents a discontinuity.
export function regionPlayer(region, sample, elapsed, outputRate) {
  const ratio = sample.rate / outputRate;
  const cursor = region.from + elapsed * ratio;
  const frames = Math.ceil((region.to - cursor) / ratio);
  if (frames <= 0) return null;
  return {
    reader: pcmReader(sample,ratio,region.from,region.to),
    cursor,
    ratio,
    remaining: frames,
    age: elapsed,
    fade: Math.max(1, Math.round(outputRate * 0.003)),
  };
}
export function mixRegion(player, partFramesRemaining) {
  const gain = Math.max(
    0,
    Math.min(
      1,
      player.age / player.fade,
      (Math.min(player.remaining, partFramesRemaining) - 1) / player.fade,
    ),
  );
  const sample = readPCM(player.reader,player.cursor);
  player.cursor += player.ratio;
  player.age++;
  player.remaining--;
  return sample * gain;
}
