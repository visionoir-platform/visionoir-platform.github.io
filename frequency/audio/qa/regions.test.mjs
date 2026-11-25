import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, projectFile, readProject, validateProject } from '../model.js';
import { DSP } from '../dsp.js';
import { sampleFrameCount } from '../regions.js';
import { renderOffline } from '../offline.js';

const sourceRate = 16000;
function take() {
  const p = createProject('blank');
  p.bpm = 120;
  const bytes = Buffer.alloc(sourceRate * 2);
  for (let i = 8000; i < sourceRate; i++)
    bytes.writeInt16LE(Math.round(18000 * Math.sin((2 * Math.PI * 330 * i) / sourceRate)), 2 * i);
  const tr = p.tracks.find((t) => t.instrument === 'sampler');
  Object.assign(tr, {
    sample: { name: 'Take.wav', rate: sourceRate, pcm: bytes.toString('base64') },
    sendDelay: 0,
    sendReverb: 0,
    volume: 1,
    fx: [],
  });
  const region = { track: tr.id, step: 2, from: 8000, to: 12000 };
  p.arrangement = [{ scene: 0, bars: 1, audioRegions: [region] }];
  p.master.fx = [];
  return { p, tr, region };
}
function print(p, options = {}, start = { arrangement: true }, frames = sourceRate * 2) {
  const dsp = new DSP(p, sourceRate, { mastering: false, ...options });
  dsp.start(start);
  const left = new Float32Array(frames);
  dsp.render(left, new Float32Array(frames));
  return left;
}
function rms(a) {
  let sum = 0;
  for (const x of a) sum += x * x;
  return Math.sqrt(sum / a.length);
}
test('v1 saves placement and exact source trims; no destructive edit or duplicated PCM', async () => {
  const { p, tr, region } = take();
  assert.equal(sampleFrameCount(tr.sample), 16000);
  p.arrangement[0].audioRegions.push({ ...region, step: 9 });
  const file = projectFile(p),
    round = await readProject(file);
  assert.equal(round.arrangement[0].audioRegions.length, 2);
  assert.equal(round.tracks.find((t) => t.id === tr.id).sample.pcm, tr.sample.pcm);
  assert.equal((await file.text()).split(tr.sample.pcm).length, 2);
  for (const changes of [{ from: 13000 }, { to: 16001 }, { step: 16 }, { track: 'missing' }]) {
    p.arrangement[0].audioRegions = [{ ...region, ...changes }];
    assert.throws(() => validateProject(p), /project.region/);
  }
});
test('source trim, timeline placement, lazy launching, channel stems and genuine WAV exports', async () => {
  const { p, tr, region } = take();
  const live = print(p),
    offline = print(p, { offline: true });
  assert.deepEqual(live, offline);
  assert.equal(rms(live.subarray(0, 4000)), 0);
  assert.ok(rms(live.subarray(4200, 7850)) > 0.15);
  assert.ok(rms(live.subarray(10000, 14000)) < 0.00002);
  assert.equal(rms(print(p, { track: 0 })), 0);
  assert.equal(rms(print(p, {}, { scene: 0 })), 0);
  assert.ok(rms(print(p, {}, { arrangement: true, absoluteStep: 3 }, 1600)) > 0.15);
  assert.ok(rms(print(p, { track: p.tracks.indexOf(tr) })) > 0.02);
  const master = await renderOffline(p, {
    format: 'wav',
    sampleRate: 44100,
    bits: 16,
    channels: 1,
    bars: 1,
    tail: 0,
    mastering: false,
  });
  const bytes = Buffer.from(await master.arrayBuffer());
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  const samples = new Float32Array(44100);
  const offset = bytes.indexOf('data', 36) + 8;
  for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(offset + i * 2) / 32768;
  assert.ok(rms(samples.subarray(0, 10000)) < 0.0001);
  assert.ok(rms(samples.subarray(12000, 21000)) > 0.15);
  assert.ok(rms(samples.subarray(26000, 38000)) < 0.0001);
  region.from = 0;
  region.to = 4000;
  assert.equal(rms(print(p)), 0);
});
