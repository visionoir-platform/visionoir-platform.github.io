// The audio meter averages half a second of callback timings. Leave headroom
// before its deadline, and keep the visual reduction through brief load dips.
export function visualLimitDeadline(previous, dspLoad, now) {
  return Number.isFinite(dspLoad) && dspLoad >= .70 ? now + 3000 : previous;
}

// Normalized visual intensity from the browser analyser's display-scale dB values.
// No values returned here are calibrated loudness measurements.
export function createSpectrumMeter(analyser) {
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const nyquist = analyser.context.sampleRate / 2;
  const binHz = nyquist / bins.length;
  const indexAt = (hz) => Math.min(bins.length, Math.max(1, Math.ceil(hz / binHz)));
  const bands = [
    [20, 250],
    [250, 4000],
    [4000, nyquist],
  ].map(([lo, hi]) => [indexAt(lo), indexAt(hi)]);
  const scales = new Map();
  function level([start, end]) {
    let peak = 0,
      sum = 0;
    for (let i = start; i < end; i++) {
      peak = Math.max(peak, bins[i]);
      sum += bins[i] * bins[i];
    }
    return end > start ? (0.65 * peak + 0.35 * Math.sqrt(sum / (end - start))) / 255 : 0;
  }
  function bucket(index, count) {
    let edges = scales.get(count);
    if (!edges) {
      edges = Array.from({ length: count + 1 }, (_, i) => indexAt(20 * (nyquist / 20) ** (i / count)));
      edges[count] = bins.length;
      scales.set(count, edges);
    }
    const first = Math.min(bins.length - 1, edges[index]);
    const end = Math.max(first + 1, edges[index + 1]);
    let peak = 0;
    for (let i = first; i < end; i++) peak = Math.max(peak, bins[i]);
    return peak / 255;
  }
  return {
    bins,
    bucket,
    read(signal) {
      analyser.getByteFrequencyData(bins);
      signal.bass = level(bands[0]);
      signal.mid = level(bands[1]);
      signal.high = level(bands[2]);
    },
  };
}
