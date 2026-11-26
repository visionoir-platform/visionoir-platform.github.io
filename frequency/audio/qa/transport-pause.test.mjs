import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveRack } from '../live-rack.js';
import { createProject } from '../model.js';

test('pausing halfway through a live crossfade preserves both decks down to the next stereo sample', () => {
  const project = createProject('forge');
  const rate = 8000;
  project.bpm = 150;
  project.crossfadeBeats = 2;
  const rack = new LiveRack(project, rate);
  const uninterrupted = new LiveRack(structuredClone(project), rate);
  const before = 4000;
  const step = rate * 15 / project.bpm;
  for (const instrument of [rack, uninterrupted]) {
    instrument.start({scene:1, absoluteStep:15});
    instrument.render(new Float32Array(121), new Float32Array(121));
    instrument.queueScene(3);
    instrument.render(new Float32Array(before), new Float32Array(before));
    assert.ok(instrument.outgoing && instrument.fade > 0 && instrument.fade < instrument.fadeLength);
  }
  const at = [rack.active.frame, rack.outgoing.frame, rack.fade];
  rack.pause();
  const left = new Float32Array(step * 5).fill(1), right = new Float32Array(left.length).fill(-1);
  rack.render(left, right);
  assert.ok(left.every(value => value === 0) && right.every(value => value === 0));
  assert.equal(rack.status().playing, false);
  assert.deepEqual([rack.active.frame, rack.outgoing.frame, rack.fade], at);
  rack.resume();
  rack.render(left, right);
  const l = new Float32Array(left.length), r = new Float32Array(left.length);
  uninterrupted.render(l, r);
  assert.ok(l.some(sample => Math.abs(sample) > .001));
  assert.deepEqual(left, l);
  assert.deepEqual(right, r);
  rack.pause();
  rack.stop();
  rack.resume();
  assert.equal(rack.running, false);
});

test('paused pads and held MIDI notes sound immediately without entering the resumed mix', () => {
  const project = createProject('blank');
  const rack = new LiveRack(project, 8000);
  const reference = new LiveRack(structuredClone(project), 8000);
  const l = new Float32Array(512), r = l.slice(), expectedL = l.slice(), expectedR = r.slice();
  for (const deck of [rack, reference]) {
    deck.start();
    deck.render(l, r);
  }
  const frame = rack.active.frame;
  rack.pause();
  assert.ok(rack.status().levels.every(value => value === 0));
  rack.control('master-analysis', 1);
  rack.trigger(0, 36, .9, .2);
  rack.render(l, r);
  assert.ok(l.some(x => Math.abs(x) > .01));
  const preview = rack.status();
  assert.equal(preview.masterPeak[0], Math.max(...l.map(Math.abs)));
  assert.ok(preview.levels[0] > 0 && preview.visualNotes.attacks[0] > 0);
  assert.ok(preview.buses.some(value => value > 0));
  assert.ok(Number.isFinite(preview.truePeakMax));
  assert.equal(preview.absoluteStep, reference.active.step);
  rack.noteOn(11, 61, .8, 1);
  rack.noteOn(11, 64, .8, 2);
  rack.release(11, 61, 1);
  assert.ok(rack.hasHeldNotes);
  rack.render(l, r);
  assert.equal(rack.active.frame, frame);
  rack.resume();
  assert.equal(rack.hasHeldNotes, false);
  assert.equal(rack.status().truePeakMax, null);
  rack.release(11, 64, 2);
  rack.render(l, r);
  reference.render(expectedL, expectedR);
  assert.deepEqual(l, expectedL);
  assert.deepEqual(r, expectedR);
});
