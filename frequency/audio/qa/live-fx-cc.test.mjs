import assert from 'node:assert/strict';
import test from 'node:test';
import {LiveRack} from '../live-rack.js';
import {createProject, projectFile, readProject} from '../model.js';
import {liveEffectCC, liveEffectIds, liveEffectRest} from '../live-effects.js';

test('CCs author only enabled effects and keep the same processors through bypass and recall', async () => {
  const project = createProject('blank');
  const rack = new LiveRack(project, 8000);
  rack.start();
  rack.queueScene(1); // the queued deck has its own processors and shares this project
  for (const [index, id] of liveEffectIds.entries()) {
    const target = 'livefx:' + id;
    project.midiMappings['0:' + (74 + index)] = target;
    const send = cc => rack.control(target, liveEffectCC(id, cc));
    const neutral = id === 'dj' ? 64 : 0;
    send(neutral);
    assert.equal(project.master.fx.length, index);
    send(127);
    const processor = rack.active.masterFx[index];
    assert.deepEqual(project.master.fx[index], {id, amount:1, bypass:false});
    assert.equal(rack.spare.masterFx[index].amount,1);
    send(neutral);
    assert.equal(processor.target,0);
    assert.equal(processor.amount,liveEffectRest(id));
    assert.equal(rack.spare.masterFx[index].target,0);
    send(95);
    assert.equal(rack.active.masterFx[index],processor);
    assert.equal(processor.target,1);
  }
  for (const version of [1,2]) {
    const restored = await readProject(projectFile(project,version));
    assert.deepEqual(restored.midiMappings,project.midiMappings);
    assert.deepEqual(restored.master.fx,project.master.fx);
  }
});

test('a full rack preserves its slots and a live DJ sweep modifies audible samples', () => {
  const p = createProject();
  p.master.fx = Array.from({length:12}, () => ({id:'eq',amount:.4,bypass:true}));
  const full = new LiveRack(p,8000);
  const before = structuredClone(p.master.fx);
  full.control('livefx:repeat',0);
  assert.throws(() => full.control('livefx:repeat',1),RangeError);
  assert.deepEqual(p.master.fx,before);

  function energy(cc) {
    const project = createProject();
    const sub = project.tracks.findIndex(track => track.instrument === 'sub');
    project.scenes[0].patterns[sub].steps[0] = {note:42,velocity:.85,gate:4};
    const rack = new LiveRack(project,48000);
    rack.start();
    rack.control('livefx:dj',liveEffectCC('dj',cc));
    const left = new Float32Array(4800);
    rack.render(left,new Float32Array(left.length));
    return left.reduce((sum,value) => sum + value*value,0);
  }
  const dry = energy(64);
  assert.ok(dry > .1);
  assert.ok(energy(127) < dry*.01);
});
