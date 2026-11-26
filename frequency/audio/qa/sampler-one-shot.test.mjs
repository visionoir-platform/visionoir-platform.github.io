import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveRack } from '../live-rack.js';
import { createProject } from '../model.js';

const rate = 8000;
function session(seconds, options = {}) {
  const p = createProject();
  const i = p.tracks.findIndex(track => track.instrument === 'sampler');
  const track = p.tracks[i];
  p.tracks = [track];
  for (const scene of p.scenes) scene.patterns = [scene.patterns[i]];
  const bytes = Buffer.alloc(seconds * rate * 2);
  for (let i = 0; i < bytes.length / 2; i++)
    bytes.writeInt16LE(Math.round(16000 * Math.sin(2 * Math.PI * 250 * i / rate)), i * 2);
  track.sample = { name: 'Test tone', rate, pcm: bytes.toString('base64') };
  track.sendDelay = track.sendReverb = 0;
  Object.assign(track.params, { decay: 0, start: 0.125, end: 0.625, ...options });
  return p;
}
function render(rack, frames) {
  const left = new Float32Array(frames);
  rack.render(left, new Float32Array(frames));
  return left;
}
const peak = pcm => pcm.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);

test('a short MIDI or pointer tap prints the complete trimmed one-shot in either direction', () => {
  for (const reverse of [0, 1]) {
    const project = session(2, { reverse });
    const held = new LiveRack(project, rate);
    const midi = new LiveRack(project, rate);
    const pad = new LiveRack(project, rate);
    held.noteOn(0,60,1,1);
    midi.noteOn(0,60,1,2);
    pad.trigger(0,60,1,0.02);
    for (const rack of [held, midi, pad]) render(rack, 128);
    midi.release(0,60,2);
    pad.release(0,60);
    const expected = render(held,rate);
    assert.ok(peak(expected.subarray(rate * 0.75,rate * 0.90)) > 0.05);
    for (const tapped of [midi, pad]) {
      const actual = render(tapped,rate);
      assert.equal(actual.findIndex((value,index) => value !== expected[index]), -1, 'first differing PCM frame');
      assert.equal(tapped.active.channels[0].voices[0].active,false);
    }
  }
});

test('a slow transposition plays to its PCM boundary beyond the former 95-second gate', () => {
  const rack = new LiveRack(session(1.625,{start:0,end:1,pitch:0}), rate);
  rack.trigger(0,0,1,0.01); // -72 semitones gives 104 seconds from a 1.625 s take.
  const left = new Float32Array(1000), right = new Float32Array(1000);
  for (let i = 0; i < 800; i++) rack.render(left,right);
  assert.ok(peak(left) > 0.01, 'one-shot must still be audible at 100 s');
  for (let i = 0; i < 33; i++) rack.render(left,right);
  assert.equal(rack.active.channels[0].voices[0].active,false);
});

test('gated and looped samplers still release, including a per-note one-shot override', () => {
  for (const [params, locks] of [[{oneShot:0}, {}], [{oneShot:1,loop:1}, {}], [{oneShot:1}, {oneShot:0}]]) {
    const rack = new LiveRack(session(4,params), rate);
    rack.trigger(0,60,1,null,{locks});
    assert.ok(peak(render(rack,256)) > 0.05);
    rack.release(0,60);
    const tail = render(rack,rate);
    assert.ok(peak(tail.subarray(0,128)) > 0.02);
    assert.ok(peak(tail.subarray(-256)) < 0.0001);
  }
});

test('a released sample keeps the stopped worklet rendering beyond its nine-second idle window', async () => {
  let Processor;
  globalThis.sampleRate = rate;
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = {postMessage() {}}; } };
  globalThis.registerProcessor = (_, Class) => { Processor = Class; };
  try {
    await import('../processor.js');
    const processor = new Processor();
    const send = (type, props = {}) => processor.port.onmessage({data:{type, ...props}});
    send('project', {project:session(11,{start:0,end:1})});
    send('held-note', {track:0,note:60,velocity:1,token:1});
    const left = new Float32Array(128), right = new Float32Array(128);
    function block() {
      left.fill(0); right.fill(0);
      processor.process([], [[left, right]]);
    }
    block();
    send('off', {track:0,note:60,token:1});
    for (let i = 1; i < 625; i++) block();
    assert.ok(peak(left) > 0.05, 'PCM must be audible ten seconds after the tap');
    assert.equal(processor.dsp.hasHeldNotes,false);
    for (let i = 625; i < 688; i++) block();
    assert.equal(processor.dsp.active.channels[0].voices[0].active,false);
    send('stop');
    block();
    assert.equal(peak(left),0);
  } finally {
    delete globalThis.sampleRate;
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.registerProcessor;
  }
});
