// A common band-limited reader for sample voices, timeline regions and native-rate offline prints.
const radius = 16;
const resolution = 512;
const kernel = new Float32Array(radius * resolution + 1);
for (let i = 0; i < kernel.length; i++) {
  const x = i / resolution;
  const window =
    0.42 + 0.5 * Math.cos((Math.PI * x) / radius) + 0.08 * Math.cos((2 * Math.PI * x) / radius);
  kernel[i] = x ? (window * Math.sin(Math.PI * x)) / (Math.PI * x) : 1;
}

const halfRadius = 15;
const half = new Float64Array(halfRadius + 1);
let gain = 0.5;
for (let k = 1; k <= halfRadius; k += 2) {
  const window =
    0.42 + 0.5 * Math.cos((Math.PI * k) / halfRadius) + 0.08 * Math.cos((2 * Math.PI * k) / halfRadius);
  half[k] = (window * Math.sin((Math.PI * k) / 2)) / (Math.PI * k);
  gain += 2 * half[k];
}
const levels = new WeakMap();
export function preparePCM(sample) {
  if (levels.has(sample)) return sample;
  const pyramid = [sample.pcm];
  let previous = sample.pcm;
  while (previous.length > 32) {
    const next = new Float32Array(Math.ceil(previous.length / 2));
    for (let j = 0; j < next.length; j++) {
      const i = j * 2;
      let value = previous[i] * 0.5;
      for (let k = 1; k <= halfRadius; k += 2)
        value += half[k] * ((previous[i - k] || 0) + (previous[i + k] || 0));
      next[j] = value / gain;
    }
    pyramid.push(next);
    previous = next;
  }
  levels.set(sample, pyramid);
  return sample;
}

export function pcmReader(sample, step, from, to, reader = {}) {
  const ratio = Math.abs(step);
  let octave = 0,
    stride = 1;
  const pyramid = levels.get(sample);
  while (ratio / stride > 2 && pyramid && octave + 1 < pyramid.length) {
    octave++;
    stride *= 2;
  }
  const fullCut = ratio > 1 ? 0.95 / ratio : 1;
  const reduced = ratio / stride;
  const cut = reduced > 1 ? 0.95 / reduced : 1;
  reader.source = sample.pcm;
  reader.pcm = pyramid?.[octave] || sample.pcm;
  reader.stride = stride;
  reader.cut = cut;
  reader.fullCut = fullCut;
  reader.from = from;
  reader.to = to;
  reader.guard = halfRadius * (stride - 1) + (radius / cut + 1) * stride;
  reader.direct = ratio === 1;
  return reader;
}

function filtered(pcm, position, cut, from, to) {
  const width = radius / cut;
  const first = Math.max(from, Math.ceil(position - width)),
    last = Math.min(to - 1, Math.floor(position + width));
  let sum = 0;
  for (let i = first; i <= last; i++) {
    const x = Math.abs((position - i) * cut) * resolution;
    const at = Math.floor(x);
    if (at < kernel.length - 1) sum += pcm[i] * (kernel[at] + (kernel[at + 1] - kernel[at]) * (x - at));
  }
  return sum * cut;
}

export function readPCM(reader, position) {
  if (reader.direct && Number.isInteger(position)) return reader.source[position];
  if (reader.stride === 1 || position - reader.from < reader.guard || reader.to - position < reader.guard)
    return filtered(reader.source, position, reader.fullCut, reader.from, reader.to);
  return filtered(reader.pcm, position / reader.stride, reader.cut, 0, reader.pcm.length);
}
