import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Effect } from '../fx.js';
import { LiveRack } from '../live-rack.js';
import { createProject, macroEq, projectFile, readProject, validateProject } from '../model.js';
import { renderOffline } from '../offline.js';

const rate = 48000;
const preset = { id: 'eq', amount: 0.34 };
function response(settings, hz, bypass = false) {
  const effect = new Effect({ ...preset, eq: settings, bypass }, rate, 120);
  // Whole cycles after settling the filter, its bypass ramp and the input.
  let output = 0, input = 0;
  for (let i = 0; i < 24000; i++) {
    const x = 0.1 * Math.sin(2 * Math.PI * hz * i / rate);
    effect.step(x, -x);
    if (i >= 12000) {
      output += effect.L ** 2;
      input += x ** 2;
    }
  }
  return 10 * Math.log10(output / input);
}

test('independent centre, gain and bandwidth and dry bypass at 48 kHz', () => {
  const wide = { frequency: 1000, gain: 9, q: 0.5 };
  const narrow = { ...wide, q: 5 };
  const cut = { ...narrow, gain: -9 };
  const moved = { ...narrow, frequency: 3000 };
  for (const settings of [wide, narrow, cut, moved]) {
    assert.ok(Math.abs(response(settings, settings.frequency) - settings.gain) < 0.001);
  }
  for (const frequency of [500, 2000]) {
    assert.ok(response(wide, frequency) - response(narrow, frequency) > 4);
    assert.ok(Math.abs(response(narrow, frequency) + response(cut, frequency)) < 0.001);
  }
  assert.ok(response(moved, 1000) < 0.1);
  assert.equal(response(narrow, 1000, true), 0);
});

test('a drastic live gain change blends the response and a reset applies the final settings', () => {
  const settings = gain => ({ ...preset, eq: { frequency: 1000, gain, q: 1 } });
  const eq = new Effect(settings(-18), rate, 120);
  const tick = (effect, frame) => {
    const input = 0.06 * Math.sin((frame + 12) * Math.PI / 24);
    effect.step(input, -input);
    return effect.L;
  };
  let before;
  for (let i = 0; i < rate; i++) before = tick(eq, i);
  eq.configure(settings(18), 120);
  assert.ok(Math.abs(tick(eq, rate) - before) < 0.001, 'the live adjustment must not snap');
  let onsetPeak = 0;
  for (let i = rate + 1; i < rate + 128; i++) onsetPeak = Math.max(onsetPeak, Math.abs(tick(eq, i)));
  assert.ok(onsetPeak < 0.05, 'the old instant change creates a transient peak above 0.44');

  const newSettings = { ...preset, eq: { frequency: 3600, gain: 6, q: 3.2 } };
  const oldB0 = eq.b0;
  eq.configure(newSettings, 120);
  assert.equal(eq.b0, oldB0, 'interrupt a ramp without jumping away from its current coefficients');
  tick(eq, rate + 128);
  eq.reset();
  const initial = new Effect(newSettings, rate, 120);
  for (let i = 0; i < 480; i++) assert.equal(tick(eq, i), tick(initial, i));
});

test('the legacy macro and manual takeover reproduce the pre-upgrade PCM', () => {
  // Golden PCM from the preceding engine at two real factory chain settings.
  const fixture = [
    [0.34, 'e27531fec5bf0d965fbdd8520d07c62e6f1e4409e034d77e84d5f58461648f13'],
    [0.76, '6d2991d92c21118c6da40b4fefb04e58120356b916a15ceeafca9eec094f16f2'],
  ];
  for (const [amount, expected] of fixture) {
    for (const eq of [undefined, macroEq(amount)]) {
      const effect = new Effect({ id: 'eq', amount, eq }, rate, 120);
      const pcm = new Float32Array(8192);
      for (let i = 0; i < pcm.length; i++) {
        const x = (i % 257 === 0 ? 0.3 : 0) + 0.23 * Math.sin(i * 0.1703);
        effect.step(x, -x);
        pcm[i] = effect.L;
      }
      assert.equal(createHash('sha256').update(Buffer.from(pcm.buffer)).digest('hex'), expected);
    }
  }
});

test('project storage round-trips independent channel and master settings and rejects invalid values', async () => {
  const project = createProject();
  project.tracks[0].fx = [{ ...preset, eq: { frequency: 3800, gain: 4.5, q: 2.3 } }];
  project.master.fx = [{ ...preset, bypass: true, eq: { frequency: 120, gain: -3, q: 1 } }, { ...preset }];
  assert.deepEqual(await readProject(projectFile(project)), project);
  const slot = project.tracks[0].fx[0];
  for (const [key, value] of [['gain', 19], ['frequency', 0], ['q', NaN], ['q', null]]) {
    const original = slot.eq[key];
    slot.eq[key] = value;
    assert.throws(() => validateProject(project));
    slot.eq[key] = original;
  }
  slot.id = 'delay';
  assert.throws(() => validateProject(project));
});

test('the live deck and offline stereo WAV print the same samples through channel and master EQ', async () => {
  const project = createProject();
  project.bpm = 120;
  project.scenes[0].patterns[0].steps[0] = { note: 48, velocity: 0.8, gate: 1 };
  project.tracks[0].fx = [{ ...preset, eq: { frequency: 220, gain: 12, q: 0.8 } }];
  project.master.fx = [{ ...preset, eq: { frequency: 1050, gain: -6, q: 2 } }];
  const options = { sampleRate: rate, bits: 32, channels: 2, bars: 0.125, tail: 0 };
  const file = await renderOffline(project, options);
  const wav = Buffer.from(await file.arrayBuffer());
  const pcm = wav.subarray(wav.indexOf('data') + 8);
  const live = new LiveRack(project, rate);
  live.start({ arrangement: true });
  const left = new Float32Array(128), right = new Float32Array(128);
  let peak = 0;
  for (let pos = 0; pos < pcm.length / 8; pos += 128) {
    const count = Math.min(128, pcm.length / 8 - pos);
    live.render(left, right, count);
    for (let i = 0; i < count; i++) {
      assert.equal(left[i], pcm.readFloatLE((pos + i) * 8));
      assert.equal(right[i], pcm.readFloatLE((pos + i) * 8 + 4));
      peak = Math.max(peak, Math.abs(left[i]));
    }
  }
  assert.ok(peak > 0.05);
});
