import assert from 'node:assert/strict';
import { createProject, validateProject } from '../model.js';
import { DSP } from '../dsp.js';
import { LiveRack } from '../live-rack.js';
const sr = 44100,
  project = createProject('relay');
project.crossfadeBeats = 0.5;
const live = new LiveRack(project, sr),
  reference = new DSP(project, sr);
live.start({ scene: 3 });
reference.start({ scene: 3 });
const bar = Math.ceil((16 * 15 * sr) / project.bpm);
const print = (d, n) => {
  const l = new Float32Array(n),
    r = new Float32Array(n);
  d.render(l, r);
  return [l, r];
};
const near = (a, b, msg) => assert(Math.abs(a - b) < 3e-6, msg + ' ' + a + ' ' + b);
for (let i = 0; i < 2; i++) {
  const a = print(live, 512),
    b = print(reference, 512);
  assert.deepEqual(a, b);
}
live.queueScene(4);
live.queueScene(6);
const before = bar - 1024;
assert.deepEqual(print(live, before), print(reference, before));
assert.equal(live.status().queuedScene, 6);
const target = new DSP(project, sr);
target.start({ scene: 6, absoluteStep: 16 });
const fadeLength = Math.round((0.5 * 60 * sr) / project.bpm),
  transition = print(live, fadeLength);
const outgoing = print(reference, fadeLength),
  incoming = print(target, fadeLength);
for (let i = 0; i < fadeLength; i++) {
  const theta = ((i / (fadeLength - 1)) * Math.PI) / 2,
    a = Math.cos(theta),
    b = Math.sin(theta);
  const left = a * outgoing[0][i] + b * incoming[0][i],
    right = a * outgoing[1][i] + b * incoming[1][i];
  const limiter = Math.min(1, target.ceil / Math.max(0.000001, Math.abs(left), Math.abs(right)));
  near(transition[0][i], left * limiter, 'crossfade L');
  near(transition[1][i], right * limiter, 'crossfade R');
}
assert.equal(live.status().scene, 6);
assert.deepEqual(print(live, 3072), print(target, 3072));
live.queueScene(1);
print(live, bar - fadeLength - 3072 + 100);
live.queueScene(2);
print(live, bar + 2000);
assert.equal(live.status().scene, 2);
live.stop();
for (const x of print(live, 2048)[0]) assert.equal(x, 0);
const compare = createProject('forge');
compare.tracks[1].params.sidechain = 1;
const s1 = new DSP(compare, sr, { track: 1 });
s1.start({ scene: 6 });
const signal1 = print(s1, sr)[0];
compare.tracks[1].sidechainBus = 'returns';
const s2 = new DSP(compare, sr, { track: 1 });
s2.start({ scene: 6 });
const signal2 = print(s2, sr)[0];
assert.notDeepEqual(signal1, signal2);
compare.tracks[1].sidechainBus = 'bad';
assert.throws(() => validateProject(compare));
const broken = createProject('forge');
broken.tracks[1].params = {};
const minimal = new DSP(validateProject(broken), 44100);
minimal.start({ scene: 6 });
assert(print(minimal, 8192)[0].every(Number.isFinite));
const fixture = createProject('forge'),
  head = new LiveRack(fixture, sr);
head.start({ scene: 6 });
const [left, right] = print(head, 4096);
const meters = head.status();
const direct = (v) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0) / v.length);
near(meters.masterRms[0], direct(left), 'delivered L RMS');
near(meters.masterRms[1], direct(right), 'delivered R RMS');
head.control('m', 0.42);
assert.equal(head.active.volume, 0.42);
head.control('v:0', 0.21);
assert.equal(head.active.channels[0].to, 0.21);
head.trigger(2, 48, 0.9, 1);
head.control('p:2:cutoff', 0.91);
assert(head.active.channels[2].voices.some((v) => v.active && v.p.cutoff === 0.91));
const old = head.active.stepSamples;
head.control('tempo', 230);
near(head.active.stepSamples, (old * 155) / 230, 'tempo');
head.control('p:2:constructor', 1);
assert.equal(typeof fixture.tracks[2].params.constructor, 'function');
console.log(
  'Sample-exact stereo equal-power bar switch, replacement, follow-up queue, stop, detector routing and default restoration passed.',
);
