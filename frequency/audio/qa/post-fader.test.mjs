import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { BUSSES, DEMOS, createProject, projectFile, readProject, validateProject } from '../model.js';
import { EXTRA_DEMOS } from '../library.js';
import { DSP } from '../dsp.js';

const rate = 12000, frames = 8192, sampleFrames = 3600;
const pcm = Buffer.alloc(sampleFrames * 2);
for (let i = 0; i < sampleFrames; i++) pcm.writeInt16LE(((i * 887) % 56000) - 28000, i * 2);
const hardclip = { id: 'hardclip', amount: 0.85, bypass: false };
const delay = { id: 'delay', amount: 0.8, bypass: false };
function session(overrides = {}) {
  const p = createProject(), track = p.tracks.find(t => t.instrument === 'sampler');
  Object.assign(track, {
    volume: 0.625, gain: 1.5, pan: 0, sendDelay: 0, sendReverb: 0, fx: [hardclip], bus: 'fx',
    sample: { name: 'Ramp', rate, pcm: pcm.toString('base64') },
  }, overrides);
  p.tracks = [track];
  for (const scene of p.scenes) scene.patterns.length = 1;
  p.arrangement = [{ scene: 0, bars: 1, audioRegions: [{ track: track.id, step: 0, from: 0, to: sampleFrames }] }];
  return p;
}
function start(p, options) {
  const dsp = new DSP(validateProject(p), rate, { mastering: false, ...options });
  dsp.start({ arrangement: true });
  return dsp;
}
function capture(dsp, n = frames) {
  const left = new Float32Array(n);
  dsp.render(left, new Float32Array(n));
  return left;
}
function peak(x) {
  return x.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
}
test('old project PCM is sample-exact, named demos retain their path, and native files preserve the mode', async () => {
  assert.equal(createProject('blank').master.postFader, true);
  for (const { id } of [...DEMOS, ...EXTRA_DEMOS]) assert.equal(createProject(id).master.postFader, undefined, id);
  const project = session();
  for (const mode of [undefined, false, true]) {
    if (mode === undefined) delete project.master.postFader;
    else project.master.postFader = mode;
    const reopened = await readProject(projectFile(project));
    assert.equal(reopened.master.postFader, mode);
    if (!mode) {
      const hash = createHash('sha256').update(Buffer.from(capture(start(reopened)).buffer)).digest('hex');
      // Interleaving-independent left-channel float PCM captured from 7dd7087.
      assert.equal(hash, '678101d78d2183e0037b2439ffc735a2179305e4c6015b3e0046c6bc5f5b8439');
    }
  }
  project.master.postFader = 1;
  assert.throws(() => validateProject(project), /project.master/);
});
test('gain drives the insert, while manual and automated faders scale inserts, bus, meters and sends', () => {
  const render = (volume, automated, bus) => {
    const project = session({ gain: 2, volume: automated ? 1 : volume, sendDelay: 0.6, fx: [hardclip, delay] });
    if (automated) project.arrangement[0].automation = [{
      target: 'volume', track: project.tracks[0].id, points: [{step: 0, value: volume}],
    }];
    const dsp = start(project, { bus });
    const pcm = capture(dsp);
    return { pcm, meter: dsp.status() };
  };
  for (const bus of ['fx', 'returns']) {
    const full = render(1, false, bus);
    assert.ok(peak(full.pcm) > 0.01);
    assert.ok(peak(full.pcm.subarray(sampleFrames + 240)) > 0.001);
    for (const automated of [false, true]) {
      const half = render(0.5, automated, bus);
      assert.ok(peak(half.pcm.map((x, i) => x - 0.5 * full.pcm[i])) < 1e-7);
      const b = BUSSES.indexOf(bus);
      assert.ok(full.meter.buses[b] > 0.001);
      assert.equal(half.meter.buses[b], 0.5 * full.meter.buses[b]);
      assert.equal(half.meter.peaks[0], 0.5 * full.meter.peaks[0]);
      assert.equal(half.meter.levels[0], 0.5 * full.meter.levels[0]);
    }
  }
  const a = capture(start(session({ gain: 1, volume: 1 })));
  const b = capture(start(session({ gain: 2, volume: 0.5 })));
  assert.ok(peak(b.map((x, i) => x - a[i])) > 0.1);
});
test('live fader, mute and solo control an already sounding insert tail', () => {
  function tail(action) {
    const project = session({ volume: 1, fx: [delay] });
    delete project.tracks[0].solo; // Optional in older projects that enable post-insert faders.
    const second = {...structuredClone(project.tracks[0]), id: 'other', sample: undefined};
    project.tracks.push(second);
    for (const scene of project.scenes) scene.patterns.push(structuredClone(scene.patterns[0]));
    const dsp = start(project);
    capture(dsp, sampleFrames);
    if (action === 'fader') dsp.control('v:0', 0);
    if (action === 'mute') project.tracks[0].mute = true;
    if (action === 'solo') second.solo = true;
    if (action === 'mute' || action === 'solo') dsp.update(project);
    return capture(dsp, 2300).subarray(1600);
  }
  assert.ok(peak(tail()) > 0.01);
  for (const action of ['fader', 'mute', 'solo']) assert.ok(peak(tail(action)) < 0.000001, action);
});
