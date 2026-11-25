import { clamp, hash } from './model.js';
export function arrangementAt(project, step) {
  let rest = step;
  for (const part of project.arrangement) {
    const size = part.bars * 16;
    if (rest < size) return { scene: part.scene, local: rest, clip: part };
    rest -= size;
  }
  return null;
}
export function planStep(project, absolute, scene, local, emit, clip) {
  const patterns = project.scenes[scene]?.patterns;
  if (!patterns) return;
  for (let i = 0; i < patterns.length; i++) {
    const override = clip?.trackScenes?.[i];
    if (override === -1) continue;
    const pat = override == null ? patterns[i] : project.scenes[override]?.patterns[i];
    if (!pat) continue;
    const s = pat.steps[local % pat.length];
    if (!s) continue;
    const chance = hash(project.seed | 0, absolute, i);
    if (chance >= (s.probability ?? 1)) continue;
    if (s.condition > 1 && Math.floor(local / pat.length) % s.condition !== 0) continue;
    const repeats = clamp(Math.round(s.ratchet || 1), 1, 8);
    const when = (absolute % 2 ? project.swing : 0) + clamp(s.offset || 0, -0.49, 0.49);
    for (let n = 0; n < repeats; n++) {
      const t = when + n / repeats;
      emit(
        i,
        s,
        t,
        clamp((s.gate ?? 0.8) / repeats, 0.035, 128),
        s.velocity * (n ? 1 - (0.23 * n) / repeats : 1),
        absolute,
        n,
      );
      if (s.chord)
        for (const interval of s.chord)
          if (interval)
            emit(
              i,
              { ...s, note: clamp(s.note + interval, 0, 127) },
              t,
              clamp((s.gate ?? 0.8) / repeats, 0.035, 128),
              s.velocity * 0.73,
              absolute,
              n + 11,
            );
      if (s.flam && n === 0) emit(i, s, t + 0.11, 0.28, s.velocity * 0.55, absolute, 9);
    }
  }
}
