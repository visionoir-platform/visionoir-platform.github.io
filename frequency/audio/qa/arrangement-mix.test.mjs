import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, projectFile, readProject } from '../model.js';
import { DSP } from '../dsp.js';
import { midiAutomation } from '../automation.js';
import { renderOffline } from '../offline.js';

const rate = 48000,
  framesPerStep = 6000;
function make() {
  const p = createProject();
  p.bpm = 120;
  const t = p.tracks[15];
  const pcm = Buffer.alloc(rate * 4);
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(Math.round(16384 * Math.sin((i * 2 * Math.PI * 200) / rate)), 2 * i);
  Object.assign(t, {
    sample: { name: 'original QA tone', rate, pcm: pcm.toString('base64') },
    volume: 0.75,
    pan: 0,
    sendReverb: 0,
    sendDelay: 0,
    fx: [],
  });
  const clip = () => ({
    scene: 0,
    bars: 1,
    audioRegions: [{ track: t.id, step: 0, from: 0, to: pcm.length / 2 }],
  });
  p.arrangement = [clip(), clip()];
  p.arrangement[0].automation = [
    {
      track: t.id,
      target: 'pan',
      points: [
        { step: 0, value: -1 },
        { step: 8, value: 1 },
      ],
    },
    {
      track: t.id,
      target: 'volume',
      points: [
        { step: 3, value: 1 },
        { step: 10, value: 0 },
      ],
    },
  ];
  return p;
}
const rms = (a, i, n = 1200) => Math.sqrt(a.subarray(i, i + n).reduce((s, v) => s + v * v, 0) / n);
test('editable arrangement ownership, held value, independent track lanes, live/export and restored manual mix', async () => {
  const p = make();
  assert.deepEqual(await readProject(projectFile(p)), p);
  const print = (options) => {
    const d = new DSP(p, rate, { mastering: false, ...options });
    d.start({ arrangement: true });
    const l = new Float32Array(framesPerStep * 27),
      r = new Float32Array(l.length);
    d.render(l, r);
    return [l, r];
  };
  const [l, r] = print({}),
    [ol, or] = print({ offline: true });
  assert.deepEqual(ol, l);
  assert.deepEqual(or, r);
  assert.ok(rms(l, 1300) > 12 * rms(r, 1300));
  assert.ok(rms(l, 4 * framesPerStep - 600) > 0.13);
  assert.ok(Math.abs(rms(l, 4 * framesPerStep - 600) - rms(r, 4 * framesPerStep - 600)) < 0.007);
  assert.ok(rms(r, 8 * framesPerStep + 1000) > 50 * rms(l, 8 * framesPerStep + 1000));
  assert.ok(rms(l, 12 * framesPerStep) < 1e-6 && rms(r, 12 * framesPerStep) < 1e-6);
  assert.ok(rms(l, 18 * framesPerStep) > 0.13);
  assert.ok(Math.abs(rms(l, 18 * framesPerStep) - rms(r, 18 * framesPerStep)) < 1e-6);
  const wav = Buffer.from(
    await (
      await renderOffline(p, { bits: 32, sampleRate: rate, bars: 1, tail: 0, mastering: false })
    ).arrayBuffer(),
  );
  const data = wav.indexOf('data', 36) + 8;
  for (const frame of [800, 24000, 57000, 77000]) {
    assert.equal(wav.readFloatLE(data + frame * 8), l[frame]);
    assert.equal(wav.readFloatLE(data + frame * 8 + 4), r[frame]);
  }
  assert.equal(p.tracks[15].volume, 0.75);
  assert.equal(p.tracks[15].pan, 0);
});
test('MIDI CC ramps quantize at half steps and reset; duplicate, unsorted or unknown lanes cannot enter the engine', () => {
  const p = make(),
    events = [];
  midiAutomation(p, 120, (...event) => events.push(event));
  const pan = events.filter((e) => e[2] === 10);
  assert.deepEqual(pan[0], [15, 0, 10, 0]);
  assert.equal(pan.length, 129);
  assert.deepEqual(pan.at(-1), [15, 1920, 10, 64]);
  assert.deepEqual(pan[64], [15, 480, 10, 64]);
  const lanes = p.arrangement[0].automation;
  for (const lane of [
    { ...lanes[0] },
    { track: 'missing', target: 'pan', points: [{ step: 0, value: 0 }] },
    { track: p.tracks[1].id, target: 'volume', points: [{ step: 16, value: 0 }] },
    {
      track: p.tracks[1].id,
      target: 'volume',
      points: [
        { step: 1, value: 0.3 },
        { step: 1, value: 0.8 },
      ],
    },
    { track: p.tracks[1].id, target: 'volume', points: [{ step: 1, value: Infinity }] },
  ]) {
    lanes.push(lane);
    assert.throws(() => validateProject(p), /automation/);
    lanes.pop();
  }
});
