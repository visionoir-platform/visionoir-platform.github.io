import test from 'node:test';
import assert from 'node:assert/strict';
import { Voice } from '../voice.js';
import * as model from '../model.js';
import { renderEditor } from '../../views.js';

const rate = 48000;

function note(filterDecay, lock) {
  const voice = new Voice(rate);
  const params = { cutoff: 0.16, resonance: 0.7, env: 0.9, wave: 0, drive: 0.1, decay: 0.4 };
  if (filterDecay !== undefined) params.filterDecay = filterDecay;
  voice.start(2, 45, 0.8, 0.15, params, lock, 17);
  return voice;
}

function capture(voice) {
  const samples = new Float32Array(0.4 * rate);
  const amp = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = voice.next();
    amp[i] = voice.env;
  }
  return { samples, amp };
}

// Harmonics of A2, measured through a Hann window in the middle of the held note.
function upperHarmonicPower(pcm) {
  const length = 2048;
  const start = 4096;
  let power = 0;
  for (let harmonic = 15; harmonic <= 36; harmonic++) {
    let real = 0;
    let imaginary = 0;
    for (let i = 0; i < length; i++) {
      const sample = pcm[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)));
      const phase = 2 * Math.PI * harmonic * 110 * i / rate;
      real += sample * Math.cos(phase);
      imaginary += sample * Math.sin(phase);
    }
    power += real * real + imaginary * imaginary;
  }
  return power;
}

test('Acid filter decay changes the audible sweep and leaves every amplifier envelope sample unchanged', () => {
  const fast = capture(note(0));
  const slow = capture(note(1));
  assert.deepEqual(fast.amp, slow.amp);
  assert.equal(fast.amp[1000], 1);
  assert.ok(fast.amp.at(-1) < 0.3);
  assert.ok(upperHarmonicPower(slow.samples) > 10 * upperHarmonicPower(fast.samples));
});

test('old notes keep the 42 ms filter sweep, and locks and live controls change its rate without restarting it', () => {
  const legacy = note();
  const midpoint = note(model.PARAMETER_BANK.acid.filterDecay);
  assert.equal(legacy.slowRate, Math.exp(-1 / (0.042 * rate)));
  assert.deepEqual(capture(legacy).samples, capture(midpoint).samples);

  const voice = note(0, { filterDecay: 1 });
  assert.equal(voice.slowRate, note(1).slowRate);
  for (let i = 0; i < 1500; i++) voice.next();

  const { slow, env, release } = voice;
  voice.control('filterDecay', 0);
  assert.equal(voice.slow, slow);
  assert.equal(voice.env, env);
  assert.equal(voice.release, release);
  assert.equal(voice.slowRate, note(0).slowRate);
  voice.next();
  assert.equal(voice.slow, slow * voice.slowRate);
});

test('an imported pre-control project exposes both independently editable envelopes in the rack', () => {
  const p = model.createProject('blank');
  const channel = p.tracks.findIndex(track => track.instrument === 'acid');
  delete p.tracks[channel].params.filterDecay;
  model.validateProject(p);
  const t = id => ({ param_acid_filterDecay: 'Filter decay', param_acid_decay: 'Amp release' })[id] ?? id;
  const state = {
    p, view: 'sequencer', channel, scene: 0, step: 0, page: 0, bank: 0, bankSize: 8, selected: new Set(),
  };
  const html = renderEditor(state, t, model);
  assert.match(html, /Filter decay<\/span>[^]*?data-field="param:filterDecay"[^>]+value="0\.5"/);
  assert.match(html, /Amp release<\/span>[^]*?data-field="param:decay"/);
  p.tracks[channel].params.filterDecay = 0.15;
  model.validateProject(p);
});
