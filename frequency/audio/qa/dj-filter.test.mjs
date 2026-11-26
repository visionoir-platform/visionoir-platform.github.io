import assert from 'node:assert/strict';
import test from 'node:test';
import { Effect } from '../fx.js';
import { LiveRack } from '../live-rack.js';
import * as model from '../model.js';
import { renderOffline } from '../offline.js';
import { setLiveEffectAmount } from '../../fx-rack.js';
import { renderEditor } from '../../views.js';

function toneGains(amount, rate) {
  const fx = new Effect({ id: 'dj', amount }, rate, 155);
  let low = 0, high = 0;
  for (let i = 0; i < rate / 4; i++) {
    const l = Math.sin(2 * Math.PI * 120 * i / rate);
    const r = Math.cos(2 * Math.PI * 6000 * i / rate);
    fx.step(l, r);
    if (amount === 0.5) {
      assert.equal(fx.L, l);
      assert.equal(fx.R, r);
    }
    if (i >= rate / 8) {
      low += fx.L ** 2;
      high += fx.R ** 2;
    }
  }
  return { low: Math.sqrt(16 * low / rate), high: Math.sqrt(16 * high / rate) };
}

test('the stereo DJ insert sweeps from low-pass through exact unity to high-pass', () => {
  for (const rate of [44100, 48000, 96000]) {
    toneGains(0.5, rate);
    const lowPass = toneGains(0.25, rate);
    const highPass = toneGains(0.75, rate);
    assert.ok(lowPass.low > 0.97 && lowPass.high < 0.12);
    assert.ok(highPass.low < 0.18 && highPass.high > 0.98);
    assert.ok(toneGains(0, rate).high < lowPass.high / 10);
    assert.ok(toneGains(1, rate).low < highPass.low / 10);
  }
});

test('recalling the opposite end of the sweep and returning to centre avoids a signal step', () => {
  const fx = new Effect({ id: 'dj', amount: 0 }, 48000, 155);
  const step = () => fx.step(0.65, -0.42);
  for (let i = 0; i < 12000; i++) step();
  for (const [amount, expected] of [[1, 0], [0.5, 0.65], [0, 0.65]]) {
    fx.configure({ id: 'dj', amount }, 155);
    for (let i = 0; i < 2048; i++) {
      const before = fx.L;
      step();
      assert.ok(Math.abs(fx.L - before) < 0.01);
      assert.ok(Math.abs(fx.R + fx.L * 0.42 / 0.65) < 1e-9);
    }
    assert.ok(Math.abs(fx.L - expected) < 1e-9);
  }
});

test('the Live FX slider recalls the saved position and drives the same master insert as the WAV print', async () => {
  const project = model.createProject();
  const channel = project.tracks.findIndex(track => track.instrument === 'sub');
  project.scenes[0].patterns[channel].steps[0] = { note: 42, velocity: 0.85, gate: 4 };
  const state = { p: project, view: 'live', scene: 0, channel, page: 0, bank: 0, bankSize: 8 };
  function sliderValue(id) {
    const markup = renderEditor(state, key => key, model);
    return Number(markup.match(new RegExp('data-field="livefx:' + id + '"[^>]*value="([^"]+)"'))[1]);
  }
  const rack = project.master.fx;
  assert.equal(sliderValue('dj'), 0.5);
  assert.equal(sliderValue('repeat'), 0);
  setLiveEffectAmount(rack, 'dj', 0.5);
  assert.equal(rack.length, 0);
  setLiveEffectAmount(rack, 'dj', 0);
  assert.equal(rack[0].bypass, false);
  assert.equal(sliderValue('dj'), 0);
  setLiveEffectAmount(rack, 'dj', 0.5);
  assert.equal(rack[0].bypass, true);
  assert.equal(sliderValue('dj'), 0.5);

  const rate = 48000;
  const live = new LiveRack(project, rate);
  const options = { sampleRate: rate, bits: 32, channels: 2, bars: 0.0625, tail: 0 };
  const energies = [];
  for (const amount of [0.5, 0.92]) {
    setLiveEffectAmount(rack, 'dj', amount);
    live.update(project);
    live.start({ arrangement: true });
    assert.equal(sliderValue('dj'), amount);
    const wav = Buffer.from(await (await renderOffline(project, options)).arrayBuffer());
    const pcm = wav.subarray(wav.indexOf('data') + 8);
    const left = new Float32Array(pcm.length / 8), right = new Float32Array(left.length);
    live.render(left, right);
    let energy = 0;
    for (let i = 0; i < left.length; i++) {
      assert.equal(left[i], pcm.readFloatLE(8 * i));
      assert.equal(right[i], pcm.readFloatLE(8 * i + 4));
      energy += left[i] ** 2;
    }
    energies.push(energy);
  }
  assert.ok(energies[0] > 0.1 && energies[1] < energies[0] * 0.01);
});
