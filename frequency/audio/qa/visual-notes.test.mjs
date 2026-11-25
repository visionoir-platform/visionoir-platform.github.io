import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../model.js';
import { LiveRack } from '../live-rack.js';
import { DSP } from '../dsp.js';
import { defaultVisual, mixVisualVoices, applyNoteEdges } from '../../chromatic/model.js';

const rate = 12000;
const acid = 2, sampler = 15;
const note = (extra = {}) => ({ note: 45, velocity: .5, gate: .035, ...extra });
function setup() {
  const project = createProject('blank');
  project.bpm = 150;
  return project;
}
function render(rack, frames) {
  const l = new Float32Array(frames), r = new Float32Array(frames);
  rack.render(l, r);
  return l;
}

test('a real short sequencer note carries accent, attack and release across a 24 Hz report without changing PCM', () => {
  const project = setup(), pat = project.scenes[0].patterns[acid];
  pat.steps[0] = note();
  pat.steps[1] = note({accent:true});
  const rack = new LiveRack(project, rate), reference = new DSP(project, rate);
  rack.start();
  reference.start();
  const block = () => {
    const pcm = render(rack, 500);
    assert.deepEqual(pcm, render(reference, 500));
    return rack.status().visualNotes;
  };
  const first = block();
  assert.ok(first.attacks[acid] > 0);
  assert.equal(first.accents, 0);
  assert.equal(first.gates[acid], 0);
  assert.equal(first.releases, 1 << acid);
  const second = block();
  assert.equal(second.attacks[acid], 0);
  assert.equal(second.releases, 0);
  const third = block();
  assert.equal(third.accents, 1 << acid);
  assert.equal(third.releases, 1 << acid);
  assert.ok(Math.abs(third.attacks[acid] / first.attacks[acid] - 1.17) < .001);
});

test('queued, probability-zero, muted, excluded, or pre-seek notes never produce visual attacks', () => {
  const p = setup();
  p.scenes[0].patterns[0].steps[0] = note({probability:0});
  p.scenes[0].patterns[1].steps[0] = note();
  p.tracks[1].mute = true;
  p.scenes[0].patterns[2].steps[0] = note();
  p.tracks[2].bus = 'bass';
  p.buses.bass.mute = true;
  p.scenes[0].patterns[3].steps[0] = note();
  p.arrangement[0].trackScenes = [null, null, null, -1];
  p.scenes[0].patterns[4].steps[1] = note();
  const rack = new LiveRack(p, rate);
  rack.start({arrangement:true});
  render(rack, 500);
  const silent = rack.status().visualNotes;
  assert.ok([...silent.attacks, ...silent.gates, ...silent.levels].every(x=>x===0));
  assert.equal(silent.releases,0);
  rack.start({arrangement:true, absoluteStep:9});
  render(rack, 500);
  assert.ok(rack.status().visualNotes.attacks.every(x=>x===0));
  p.tracks[0].solo = true;
  rack.update(p);
  rack.noteOn(4, 50, .8, 1);
  render(rack, 16);
  assert.ok(rack.status().visualNotes.attacks.every(x=>x===0));
});

test('held sampler notes spring and release on the remapped visual route, including a chord member ending early', () => {
  const p = setup();
  Object.assign(p.tracks[sampler].params,{oneShot:0,loop:1});
  const rack = new LiveRack(p, rate);
  rack.noteOn(sampler, 50, .72, 5);
  rack.noteOn(sampler, 57, .5, 6);
  render(rack, 128);
  const out = rack.status(), events = out.visualNotes;
  const state = defaultVisual();
  state.mapping[sampler] = 'acid';
  const voice = new Float32Array(16), envelope=new Float32Array(16), hits=new Float32Array(16);
  applyNoteEdges(hits,envelope,events.attacks,events.gates,events.releases);
  mixVisualVoices(voice,envelope,hits,events.gates,state,1);
  assert.ok(voice[acid]>0);
  assert.equal(voice[sampler],0);
  const initial = hits[sampler];
  rack.release(sampler,50,5);
  assert.equal(rack.status(out).visualNotes,events);
  assert.ok(events.gates[sampler]>0);
  assert.equal(events.releases,1<<sampler);
  applyNoteEdges(hits,envelope,events.attacks,events.gates,events.releases);
  assert.equal(hits[sampler],initial);
  rack.release(sampler,57,6);
  rack.status(out);
  assert.equal(events.gates[sampler],0);
  assert.equal(events.releases,1<<sampler);
  applyNoteEdges(hits,envelope,events.attacks,events.gates,events.releases);
  assert.ok(hits[sampler] < initial);
  rack.stop();
  rack.status(out);
  assert.ok(events.attacks.every(x => x === 0));
  assert.equal(events.releases,0);
});
