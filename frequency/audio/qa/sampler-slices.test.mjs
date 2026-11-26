import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DSP } from '../dsp.js';
import { createProject, projectFile, projectForStorage, readProject } from '../model.js';
import { renderOffline } from '../offline.js';
import { samplerBounds } from '../sampler-slices.js';
import { samplerPanel, samplerLockMenu } from '../../sampler-panel.js';

const rate = 16000, length = 8231, start = 257, end = 7962;
const point = frame => (frame + 0.25) / length;
const edge = i => start + Math.floor((end - start) * i / 16);
function fixture() {
  const project = createProject();
  project.bpm = 120;
  const track = project.tracks[15];
  const pcm = Buffer.alloc(2 * length);
  for (let i = 0; i < length; i++)
    pcm.writeInt16LE(Math.round(15000 * Math.sin(2 * Math.PI * (0.013 * i + 0.000011 * i * i))), 2 * i);
  track.sample = {name:'Local sweep', rate, pcm:pcm.toString('base64')};
  Object.assign(track.params, {start:point(start), end:point(end), slice:0.63});
  return project;
}

function play(project, locks) {
  const dsp = new DSP(project, rate);
  dsp.trigger(15,60,1,0.1,{locks});
  const left = new Float32Array(1700);
  dsp.render(left, new Float32Array(left.length));
  return left;
}

test('all sixteen pads play their own PCM between adjacent boundaries of a non-divisible trim', () => {
  const p = fixture(), signatures = new Set();
  for (let i = 0; i < 16; i++) {
    const slicePad = (i + 1) / 16;
    for (const params of [{}, {reverse:1}, {pitch:0.78,loop:1}, {pitch:0.15,loop:1,reverse:1}]) {
      const sliced = play(p,{...params,slicePad});
      const manual = play(p,{...params,start:point(edge(i)), end:point(edge(i + 1)), slice:0});
      assert.equal(sliced.findIndex((x,j) => x !== manual[j]),-1,'pad ' + (i+1));
      if (!params.loop && !params.reverse) signatures.add(createHash('sha256').update(Buffer.from(sliced.buffer)).digest('hex'));
    }
  }
  assert.equal(signatures.size,16);
});

test('old offsets and sub-sixteen-frame trims preserve valid source bounds and usable controls', () => {
  const p = fixture(), track = p.tracks[15];
  delete track.params.slicePad; // A project saved before the pad selector.
  const legacy = samplerBounds(length,track.params);
  assert.equal(legacy.lo, Math.floor(length * (track.params.start + 0.35 * 0.63)));
  assert.equal(legacy.hi,end);
  const current = play(p,{slicePad:0});
  assert.equal(play(p,{}).findIndex((x,i) => x !== current[i]),-1);

  Object.assign(track.params,{start:point(100),end:point(103),slicePad:1});
  const tiny = samplerBounds(length,track.params);
  assert.deepEqual(tiny,{count:3,pad:3,lo:102,hi:103});
  const markup = samplerPanel(track,key=>key);
  assert.equal(markup.match(/data-action="sample-slice"/g).length,3);
  assert.match(markup,/data-index="3"[^>]+aria-pressed="true"/);
  assert.doesNotMatch(markup,/data-field="param:slice"/);
  assert.match(samplerLockMenu(track,track.params,key=>key),/data-field="lock:slicePad"/);
});

test('unselected slice pads stay out of legacy projects, local saves and both export versions', async () => {
  const p = fixture(), track = p.tracks[15];
  assert.equal(Object.hasOwn(track.params,'slicePad'),false);
  // A saved preset or controller can explicitly return a track to continuous offset mode.
  track.params.slicePad = 0;
  for (const version of [1,2]) {
    const saved = await readProject(projectFile(p,version));
    assert.equal(Object.hasOwn(saved.tracks[15].params,'slicePad'),false);
    assert.equal(saved.tracks[15].params.slice,0.63);
  }
  assert.equal(Object.hasOwn(projectForStorage(p).tracks[15].params,'slicePad'),false);
  assert.equal(track.params.slicePad,0);
  track.params.slicePad = 0.5;
  p.scenes[0].patterns[15].steps[0] = {note:60,velocity:1,locks:{slicePad:0}};
  for (const version of [1,2]) assert.deepEqual(await readProject(projectFile(p,version)),p);
  assert.deepEqual(projectForStorage(p),p);
});

test('saved step locks select different slices in the arrangement WAV and preserve the imported take', async () => {
  const p = fixture();
  const steps = p.scenes[0].patterns[15].steps;
  steps[0] = {note:60,velocity:0.9,locks:{slicePad:1/16}};
  steps[1] = {note:60,velocity:0.9,locks:{slicePad:1,reverse:1}};
  const reopened = await readProject(projectFile(p));
  assert.deepEqual(reopened,p);
  const manual = structuredClone(p);
  const ref = manual.scenes[0].patterns[15].steps;
  for (const [step, i] of [[0,0],[1,15]])
    ref[step].locks = {...ref[step].locks,slicePad:0,slice:0,start:point(edge(i)),end:point(edge(i+1))};
  const opts = {sampleRate:48000,bits:32,channels:2,bars:0.125,tail:0};
  const print = async project => Buffer.from(await (await renderOffline(project,opts)).arrayBuffer());
  const wav = await print(reopened), expected = await print(manual);
  assert.equal(Buffer.compare(wav,expected),0);
  const data = wav.indexOf('data') + 8;
  for (const onset of [0,6000]) {
    let energy = 0;
    for (let i = onset; i < onset+1200; i++) energy += wav.readFloatLE(data + i * 8) ** 2;
    assert.ok(energy > 0.01);
  }
});
