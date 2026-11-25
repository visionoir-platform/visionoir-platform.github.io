// Mixer envelopes belong to arrangement parts; manual faders remain the baseline.
export function validateAutomation(parts, tracks) {
  const sources = new Set(tracks.map((t) => t.id));
  let points = 0;
  for (const part of parts) {
    if (part.automation === undefined) continue;
    if (!Array.isArray(part.automation) || part.automation.length > 64) throw Error('project.automation');
    const keys = new Set();
    for (const lane of part.automation) {
      if (
        !lane ||
        !sources.has(lane.track) ||
        !['volume', 'pan'].includes(lane.target) ||
        !Array.isArray(lane.points) ||
        !lane.points.length ||
        lane.points.length > 128
      )
        throw Error('project.automation');
      const key = lane.track + ':' + lane.target;
      if (keys.has(key) || (points += lane.points.length) > 8192) throw Error('project.automation');
      keys.add(key);
      let previous = -1;
      for (const p of lane.points) {
        if (
          !p ||
          !Number.isInteger(p.step) ||
          p.step <= previous ||
          p.step >= part.bars * 16 ||
          !Number.isFinite(p.value) ||
          p.value < (lane.target === 'pan' ? -1 : 0) ||
          p.value > 1
        )
          throw Error('project.automation');
        previous = p.step;
      }
    }
  }
}

export function setSegment(state, points, position, samplesPerStep) {
  let lo = 0,
    hi = points.length;
  while (lo < hi) {
    const middle = (lo + hi) >>> 1;
    if (points[middle].step <= position) lo = middle + 1;
    else hi = middle;
  }
  const previous = points[lo - 1],
    next = points[lo];
  if (!previous) {
    state.value = null;
    state.increment = 0;
    return;
  }
  const slope = next ? (next.value - previous.value) / (next.step - previous.step) : 0;
  state.value = previous.value + (position - previous.step) * slope;
  state.increment = slope / samplesPerStep;
}

export function midiAutomation(project, ticksPerStep, emit) {
  const channels = new Map(project.tracks.map((t, i) => [t.id, i]));
  const encode = (value, pan) => Math.round((pan ? (value + 1) / 2 : value) * 127);
  let start = 0;
  for (const part of project.arrangement) {
    for (const lane of part.automation || []) {
      const channel = channels.get(lane.track),
        pan = lane.target === 'pan',
        cc = pan ? 10 : 7;
      let previous;
      for (const p of lane.points) {
        const tick = start + p.step * ticksPerStep,
          value = encode(p.value, pan);
        if (previous) {
          const from = encode(previous.value, pan),
            delta = value - from;
          // MIDI CC is seven-bit: emit only the instants at which its rounded value changes.
          const v0 = (pan ? (previous.value + 1) / 2 : previous.value) * 127;
          const v1 = (pan ? (p.value + 1) / 2 : p.value) * 127;
          for (let i = 1; i <= Math.abs(delta); i++) {
            const setting = from + i * Math.sign(delta);
            const fraction = (setting - Math.sign(delta) * 0.5 - v0) / (v1 - v0);
            const pos = previous.step + fraction * (p.step - previous.step);
            emit(channel, start + Math.round(pos * ticksPerStep), cc, setting);
          }
        } else emit(channel, tick, cc, value);
        previous = p;
      }
      emit(
        channel,
        start + part.bars * 16 * ticksPerStep,
        cc,
        encode(project.tracks[channel][lane.target], pan),
      );
    }
    start += part.bars * 16 * ticksPerStep;
  }
}
