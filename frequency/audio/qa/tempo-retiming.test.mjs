import assert from 'node:assert/strict';
import test from 'node:test';
import { DSP } from '../dsp.js';
import { createProject } from '../model.js';

const rate = 16000;
function setup(notes, arrangement = false) {
  const p = createProject();
  p.bpm = 120;
  p.swing = 0.06;
  for (const [track, step, note] of notes) p.scenes[0].patterns[track].steps[step] = note;
  const dsp = new DSP(p, rate);
  const played = [];
  dsp.trigger = (track, pitch, velocity, gate) => played.push([dsp.frame, pitch, Math.round(gate * rate)]);
  dsp.start({ arrangement });
  return { dsp, p, played };
}
function render(dsp, frames) {
  dsp.render(new Float32Array(frames), new Float32Array(frames));
}
function changeTempo(dsp, tempo, route) {
  if (route === 'control') dsp.control('tempo', tempo);
  else {
    const project = route === 'snapshot' ? structuredClone(dsp.p) : dsp.p;
    project.bpm = tempo;
    dsp.update(project);
  }
}
const notes = [
  [0, 0, { note: 48, velocity: 1, gate: 0.8, ratchet: 4 }],
  [1, 1, { note: 70, velocity: 1, gate: 0.6, offset: -0.41, flam: true }],
];

test('pending ratchets, anticipations, flams and gates follow MIDI and project tempo edits mid-step', () => {
  for (const route of ['control', 'shared project', 'snapshot']) {
    for (const [tempo, expected] of [
      [240, [[0,48,400], [400,48,200], [650,48,200], [800,70,600], [900,48,200], [910,70,280]]],
      [80, [[0,48,400], [600,48,600], [1350,48,600], [1800,70,1800], [2100,48,600], [2130,70,840]]],
    ]) {
      const { dsp, played } = setup(notes);
      render(dsp, 300);
      changeTempo(dsp, tempo, route);
      render(dsp, 2450);
      assert.deepEqual(played, expected, route + ' / ' + tempo);
    }
  }
});

test('retiming rebuilds same-frame newest-first order and never reuses rounded sample deadlines', () => {
  const closeNotes = [
    [0, 0, { note: 50, velocity: 1, gate: 1, offset: 0.341 }],
    [1, 0, { note: 51, velocity: 1, gate: 1, offset: 0.3414 }],
  ];
  for (const returnToOriginal of [false, true]) {
    const { dsp, played } = setup(closeNotes);
    render(dsp, 300);
    for (let i = 0; i < 24; i++) {
      changeTempo(dsp, 300, 'control');
      changeTempo(dsp, 120, 'shared project');
    }
    if (!returnToOriginal) changeTempo(dsp, 300, 'snapshot');
    render(dsp, 500);
    assert.deepEqual(played, returnToOriginal
      ? [[682,50,2000],[683,51,2000]] : [[453,51,800],[453,50,800]]);
  }
});

test('tempo changes retime the part boundary while the active audio region keeps its original sample clock', () => {
  const p = createProject();
  p.bpm = 120;
  const track = p.tracks.find(t => t.instrument === 'sampler');
  const source = Buffer.alloc(8000);
  for (let i = 0; i < 4000; i++) source.writeInt16LE(Math.round(15000 * Math.sin(0.031 * i)), 2 * i);
  track.sample = { name: 'Test tone', rate, pcm: source.toString('base64') };
  p.arrangement = [{ scene: 0, bars: 1, audioRegions: [{ track: track.id, step: 14, from: 0, to: 4000 }] }];
  let reference;
  for (const route of ['control', 'snapshot', 'shared project']) {
    const dsp = new DSP(structuredClone(p), rate);
    dsp.start({ arrangement: true, absoluteStep: 14 });
    render(dsp, 300);
    changeTempo(dsp, 240, route);
    assert.equal(dsp.regionEndFrame, 2150);
    const output = new Float32Array(901);
    dsp.render(output, new Float32Array(output.length));
    const region = dsp.regionChannels.get(track.id).regions[0];
    assert.equal(region.cursor, 1201, route);
    if (reference) assert.deepEqual(output, reference);
    reference = output;
    render(dsp, 950);
    assert.equal(dsp.running, false);
  }
});
