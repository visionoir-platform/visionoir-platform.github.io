import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {DSP} from '../dsp.js';
import {createProject, validateProject} from '../model.js';
import {planStep} from '../sequencer.js';

function denseProject() {
  const p = createProject();
  p.bpm = 151;
  p.swing = .49;
  for (const [scene, octave] of [[0, 52], [1, 72]]) {
    const pattern = p.scenes[scene].patterns[13];
    for (let i = 0; i < pattern.length; i++) {
      pattern.steps[i] = { note: octave + i % 5, velocity: .55, ratchet: 8, chord: [-12, 3, 5, 7, 10, 12, 19],
        offset: i % 2 ? .49 : -.49, gate: 1.31, flam: true, accent: i % 3 === 0 };
    }
  }
  return p;
}

test('dense swung ratchets preserve stable same-frame voice stealing, seeds and stereo PCM', () => {
  const p = denseProject(), dsp = new DSP(p, 16000);
  const notes = [], trigger = dsp.trigger.bind(dsp);
  dsp.trigger = (track,pitch,vel,gate,event,seed) => {
    notes.push([dsp.frame,track,pitch,seed]);
    trigger(track,pitch,vel,gate,event,seed);
  };
  const stereo = createHash('sha256'), buffer = Buffer.alloc(128 * 4);
  const l = new Float32Array(128), r = new Float32Array(128);
  dsp.start();
  for (let block = 0; block < 247; block++) {
    if (block === 126) dsp.queueScene(1);
    if (block === 152) dsp.control('tempo', 40);
    if (block === 164) dsp.control('tempo', 300);
    dsp.render(l, r);
    for (let i = 0; i < 128; i++) {
      buffer.writeInt16LE(Math.round(l[i] * 32767), i * 4);
      buffer.writeInt16LE(Math.round(r[i] * 32767), i * 4 + 2);
    }
    stereo.update(buffer);
  }
  const result = [notes.length, createHash('sha256').update(JSON.stringify(notes)).digest('hex'), stereo.digest('hex')];
  // Captured from 028cfbf before introducing the event pool.
  assert.deepEqual(result, [1650, 'eff7d089b9191df468253038827e8815d27a51a8b4b53095e2ba78e6cf1adb8b',
    '0f04310091df15c72c00527f703688f4ba1566407d5b666651f7a1f30889b736']);
});

test('public scheduler callbacks retain independently readable chord pitches', () => {
  const p = denseProject(), notes = [];
  planStep(p,0,0,0,(_track,note)=>notes.push(note));
  assert.equal(notes.length,65);
  assert.deepEqual(notes.slice(0,9).map(n=>n.note),[52,40,55,57,59,62,64,71,52]);
  assert.equal(new Set(notes).size,57);
});

test('a full project can schedule every ratchet and chord without adding or losing any reserved slot', () => {
  const p = denseProject();
  p.tracks.push(...p.tracks.map(track => ({...track, id:track.id+'-2'})));
  for (const scene of p.scenes) scene.patterns.push(...structuredClone(scene.patterns));
  assert.equal(p.tracks.length, 32);
  const step = p.scenes[0].patterns[13].steps[0];
  for (const pattern of p.scenes[0].patterns) pattern.steps.fill(step);
  validateProject(p);
  const dsp = new DSP(p, 16000), queue = dsp.events;
  const original = new Set(queue.slots), samplerReaders = dsp.channels[15].voices.map(v => v.reader);
  dsp.start();
  Object.seal(queue.slots);
  queue.reserve = () => assert.fail('pool expanded during a render callback');
  const l = new Float32Array(128), r = new Float32Array(128);
  for (let i = 0; i < 56; i++) dsp.render(l,r);
  assert.equal(queue.slots.length,original.size);
  assert.equal(new Set(queue.slots).size,original.size);
  for (const slot of queue.slots) assert.ok(original.has(slot));
  for (const [i,v] of dsp.channels[15].voices.entries()) {
    assert.equal(samplerReaders[i],v.reader);
    assert.ok(v.reader.source instanceof Float32Array);
  }
  dsp.stop();
  assert.equal(queue.length,0);
  assert.ok(queue.slots.every(e => e.source === null));
});

test('a queued replacement scene cancels only its preplanned events and recycles their slots', () => {
  const p = denseProject(), dsp = new DSP(p, 16000);
  dsp.start({absoluteStep:15});
  dsp.boundary();
  const old = dsp.events.slots.slice(0,dsp.events.length).filter(e=>e.step===16);
  assert.equal(old.length,65);
  dsp.queueScene(1);
  const active = dsp.events.slots.slice(0,dsp.events.length);
  const next = active.filter(e=>e.step===16);
  assert.equal(next.length,65);
  assert.ok(next.every(e => e.source===p.scenes[1].patterns[13].steps[0]));
  assert.equal(active.filter(e=>e.step===15).length,65);
  const keys=[];
  while(dsp.events.length) {
    const e=dsp.events.pop();
    keys.push([e.at,e.serial]);
  }
  assert.deepEqual(keys,keys.slice().sort((a,b)=>a[0]-b[0] || b[1]-a[1]));
});
