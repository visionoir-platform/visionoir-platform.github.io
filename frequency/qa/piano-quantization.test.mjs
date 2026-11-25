import test from 'node:test';
import assert from 'node:assert/strict';
import { pianoView, planQuantization, scales } from '../piano.js';
import { planStep } from '../audio/sequencer.js';

function pattern() {
  return { length: 4, steps: [
    { note: 61, velocity: .8, offset: .31, gate: .73, chord: [4, 7] },
    { note: 66, velocity: .6, offset: -.23, gate: 1.2 },
    { note: 65, velocity: .7, offset: .17, ratchet: 2 },
    null,
    { note: 60, offset: -.3 }, // Preserved behind a shortened pattern.
  ] };
}

test('quantizing selected onsets snaps their audio to the displayed sixteenths, keeping swing and chord voicing', () => {
  const pat = pattern(), before = structuredClone(pat);
  const selected = new Set([0, 1, 3, 4]);
  const edit = planQuantization(pat, selected);
  assert.deepEqual(pat, before);
  edit();
  assert.deepEqual(pat.steps, [{ ...before.steps[0], offset: 0 }, { ...before.steps[1], offset: 0 }, ...before.steps.slice(2)]);
  const project = { scenes: [{ patterns: [pat] }], swing: .21, seed: 1 };
  const times = [0, 1, 2].map(i => {
    const events = [];
    planStep(project, i, 0, i, (_track, _note, time) => events.push(time));
    return events;
  });
  assert.deepEqual(times, [[0,0,0],[.21],[.17,.67]]);
  assert.equal(planQuantization(pat, selected), null);
  assert.equal(planQuantization(pat, []), null);
});

test('scale tuning affects selected roots only, preserves microtiming and finds bounded MIDI scale tones', () => {
  const pat = pattern(), before = structuredClone(pat);
  planQuantization(pat, [0], scales[2], 60)();
  assert.deepEqual(pat.steps, [{ ...before.steps[0], note: 60 }, ...before.steps.slice(1)]);
  const bounds = {length: 2, steps:[{note:0},{note:127}]};
  planQuantization(bounds, [0,1], scales[3], 1)();
  assert.equal(bounds.steps[0].note, 1);
  assert.ok(bounds.steps.every(({note}) => note >= 0 && note <= 127 && scales[3].includes((note-1+132)%12)));
});

test('piano quantization stays disabled after the last note is deselected, including when the inspector still targets it', () => {
  const pat = pattern(), selected = new Set();
  const state = {p:{tracks:[{name:'A'}],scenes:[{patterns:[pat]}]},channel:0,scene:0,page:0,step:0,octave:5,selected};
  for (const action of ['piano-quantize','piano-quantize-scale']) {
    const button = () => pianoView(state, k=>k, '', '').match(new RegExp('<button[^>]*data-action="'+action+'"[^>]*>'))[0];
    assert.match(button(),/disabled/);
    selected.add(0);assert.doesNotMatch(button(),/disabled/);selected.clear();
  }
});
