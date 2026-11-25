import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DSP } from '../dsp.js';
import { createProject, projectFile, readProject } from '../model.js';
import { Voice } from '../voice.js';

const fundamental = 440 * 2 ** ((29 - 69) / 12);

function capture(rate, value) {
  const voice = new Voice(rate);
  voice.start(1, 29, 0.7, 1, value === undefined ? {} : {bassEq:value}, {}, 9876);
  return Float32Array.from({length:rate / 2}, () => voice.next());
}

function magnitude(samples, rate, hz) {
  let real = 0, imaginary = 0;
  for (let i = 0; i < samples.length; i++) {
    const angle = 2 * Math.PI * hz * i / rate;
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (samples.length - 1));
    real += samples[i] * window * Math.cos(angle);
    imaginary += samples[i] * window * Math.sin(angle);
  }
  return Math.hypot(real, imaginary);
}

test('Rumble bass EQ shapes the fundamental independently of the upper harmonics', () => {
  for (const rate of [44100, 48000, 96000]) {
    const neutral = capture(rate, 0.5);
    assert.deepEqual(capture(rate), neutral);
    for (const amount of [0,1]) {
      const filtered = capture(rate, amount);
      const change = hz => 20 * Math.log10(magnitude(filtered,rate,hz) / magnitude(neutral,rate,hz));
      assert.ok((amount === 0 ? -1 : 1) * change(fundamental) > 7);
      assert.ok(Math.abs(change(fundamental * 21)) < 0.2);
    }
  }
});

test('Rumble bass EQ follows the live knob and note locks while preserving V1 projects', async () => {
  const p = createProject('blank'), i = p.tracks.findIndex(t => t.instrument === 'rumble');
  delete p.tracks[i].params.bassEq;
  const restored = await readProject(projectFile(p));
  const dsp = new DSP(restored,48000,{mastering:false});
  dsp.trigger(i,29,.7,1,{locks:{bassEq:0}});
  const ch = dsp.channels[i], voice = ch.voices.find(v => v.active);
  assert.equal(voice.p.bassEq,0);
  assert.ok(voice.rumbleBassGain < 0);
  const initial = voice.rumbleBassGain;
  dsp.control('p:'+i+':bassEq',1);
  assert.equal(voice.rumbleBassGain,initial);
  dsp.render(new Float32Array(2400),new Float32Array(2400));
  assert.ok(Math.abs(voice.rumbleBassGain - (10 ** (9 / 20) - 1)) < 0.001);
  dsp.trigger(i,36,.7,1,{locks:{bassEq:0.5}});
  const next = ch.voices.find(v => v.active && v.note === 36);
  assert.equal(next.rumbleBassGain,0);
  assert.equal((await readProject(projectFile(restored))).tracks[i].params.bassEq,1);
});
