import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePCM, pcmReader, readPCM } from '../resample.js';
import { regionPlayer, mixRegion } from '../regions.js';
import { Voice } from '../voice.js';
import { createProject } from '../model.js';
import { Effect } from '../fx.js';

const gainDb = (a, b) => 20 * Math.log10(a / b);
function amplitude(x, frequency, rate, start = 128) {
  const n = x.length - start * 2;
  let s = 0,
    c = 0;
  for (let i = start; i < start + n; i++) {
    s += x[i] * Math.sin((2 * Math.PI * i * frequency) / rate);
    c += x[i] * Math.cos((2 * Math.PI * i * frequency) / rate);
  }
  return (2 * Math.hypot(s, c)) / n;
}
function make(rate, frequency) {
  return preparePCM({
    rate,
    pcm: Float32Array.from(
      { length: rate / 2 },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * i * frequency) / rate),
    ),
  });
}
test('96 → 48 kHz region rejects a 30 kHz input alias while passing the 3 kHz band', () => {
  const convert = (f) => {
    const s = make(96000, f),
      p = regionPlayer({ from: 0, to: s.pcm.length }, s, 0, 48000);
    return Float32Array.from({ length: 24000 }, () => mixRegion(p, 24000));
  };
  const band = amplitude(convert(3000), 3000, 48000, 480);
  const fold = amplitude(convert(30000), 18000, 48000, 480);
  assert.ok(Math.abs(gainDb(band, 0.5)) < 0.1);
  assert.ok(gainDb(fold, 0.5) < -60);
  console.log('region pass/alias dB', gainDb(band, 0.5).toFixed(3), gainDb(fold, 0.5).toFixed(2));
});
test('sampler pitch-up rejects foldback; reverse and trimmed multioctave reads stay within the source region', () => {
  const level = (f) => {
    const v = new Voice(48000),
      sample = make(48000, f);
    const params = { ...createProject().tracks[15].params, cutoff: 1, oneShot: 1, loop: 0 };
    v.start(15, 72, 1, 0.7, params, null, 7, 0, false, false, sample);
    const a = Float32Array.from({ length: 12000 }, () => v.next());
    return amplitude(a, 8000, 48000, 240);
  };
  const passed = level(4000),
    alias = level(20000);
  assert.ok(passed > 0.2);
  assert.ok(gainDb(alias, passed) < -60);
  const s = make(96000, 1200);
  s.pcm.fill(0, 10000, 14000);
  const fresh = preparePCM({ rate: 96000, pcm: s.pcm });
  const reader = pcmReader(fresh, -8.5, 10000, 14000);
  for (let pos = 13999; pos >= 10000; pos -= 8.5) assert.equal(readPCM(reader, pos), 0);
  console.log('sampler alias against pass dB', gainDb(alias, passed).toFixed(2));
});
test('Freeze captures the first audible beat after silence, can rearm, and transport reset reproduces a fresh rack', () => {
  const e = new Effect({ id: 'freeze', amount: 1 }, 16000, 120);
  function hit(f) {
    for (let i = 0; i < 16000; i++) e.step(0, 0);
    for (let i = 0; i < 4000; i++) {
      const x = 0.5 * Math.sin((2 * Math.PI * f * i) / 16000);
      e.step(x, x);
    }
    return Float32Array.from({ length: 4000 }, () => {
      e.step(0, 0);
      return e.L;
    });
  }
  const a = hit(240);
  assert.ok(amplitude(a, 240, 16000, 400) > 0.38);
  e.configure({ bypass: true, amount: 1 }, 120);
  for (let j = 0; j < 1600; j++) e.step(0, 0);
  e.configure({ amount: 1 }, 120);
  const b = hit(480);
  assert.ok(amplitude(b, 480, 16000, 400) > 0.38);
  assert.ok(amplitude(b, 240, 16000, 400) < 0.03);
  e.reset();
  assert.deepEqual(hit(240), a);
});
