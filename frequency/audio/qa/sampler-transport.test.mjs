import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DSP } from '../dsp.js';
import { LiveRack } from '../live-rack.js';
import { createProject } from '../model.js';

const rate = 48000, channel = 15;
function fixture() {
  const project = createProject('blank');
  const track = project.tracks[channel];
  const bytes = Buffer.alloc(rate * 2);
  for (let i = 0; i < rate; i++)
    bytes.writeInt16LE(Math.round(14000 * Math.sin(i * 2 * Math.PI * 240 / rate)), i * 2);
  track.sample = {name:'Synthetic 240 Hz test tone', rate, pcm:bytes.toString('base64')};
  Object.assign(track.params, {loop:1, start:0.1, end:0.9, pitch:0.5, reverse:0});
  return project;
}
function capture(rack, frames) {
  const left = new Float32Array(frames), right = new Float32Array(frames);
  rack.render(left, right);
  return left;
}
function positiveCrossings(signal) {
  let n = 0;
  for (let i=1; i<signal.length; i++) if (signal[i-1]<=0 && signal[i]>0) n++;
  return n;
}

test('held sampler transposes and reverses via MIDI and editor updates without restarting', () => {
  const project = fixture();
  const rack = new LiveRack(project, rate);
  rack.noteOn(channel, 60, 0.8, 1);
  const voice = rack.active.channels[channel].voices[0];
  capture(rack, 1024);
  assert.ok(Math.abs(positiveCrossings(capture(rack, 4800)) - 24) <= 1);
  const before = voice.idx;
  const reader = voice.reader;
  rack.control('p:15:pitch', 1);
  assert.equal(voice.idx, before);
  assert.equal(voice.reader, reader);
  assert.equal(voice.reader.direct, false);
  assert.ok(Math.abs(positiveCrossings(capture(rack, 4800)) - 48) <= 1);
  assert.equal(voice.idx, before + 9600);

  const edited = structuredClone(project);
  edited.tracks[channel].params.reverse = 1;
  rack.update(edited);
  assert.equal(voice.idx, before + 9600);
  const age = voice.age;
  capture(rack, 480);
  assert.equal(voice.age, age + 480);
  assert.equal(voice.idx, before + 9600 - 960);
  assert.equal(voice.token, 1);
  assert.equal(voice.gate, Infinity);

  edited.tracks[channel].params.pitch = 0.5;
  rack.update(edited);
  assert.equal(voice.step, -1);
  assert.equal(voice.reader.direct, true);
  assert.ok(Math.abs(positiveCrossings(capture(rack,4800)) - 24) <= 1);
});

test('unrelated project edits preserve time and per-step locks; reversing at a trim boundary keeps the one-shot alive', () => {
  const project = fixture();
  Object.assign(project.tracks[channel].params, {loop:0, start:0.5, end:0.51});
  const dsp = new DSP(project,rate);
  dsp.trigger(channel, 60,1,0.5,{locks:{pitch:1}});
  const voice = dsp.channels[channel].voices[0];
  const framesToEnd = (voice.hi - voice.lo) / 2;
  capture(dsp, framesToEnd);
  assert.equal(voice.idx,voice.hi);
  project.name = 'Unrelated edit';
  dsp.update(project);
  assert.equal(voice.step,2);
  dsp.control('p:15:reverse',1);
  assert.equal(voice.idx, voice.hi-1);
  capture(dsp, framesToEnd);
  assert.equal(voice.active,true);
  assert.equal(voice.idx,voice.lo-1);
  dsp.control('p:15:reverse',0);
  assert.equal(voice.idx,voice.lo);
  assert.equal(voice.step,2);
  capture(dsp, framesToEnd+1);
  assert.equal(voice.active,false);
});

test('untouched sampler keeps stereo PCM from bf6256d at four fixed pitch and reverse settings', () => {
  const cases = [
    [0,0.5,'d61873f56d3564161248fff23b6bc015af1671d47effb8792a1eb506f35fb10a'],
    [0,0.87,'1f75e03baa46329fd973037f6fa55b348bae9b0ad3fd017a95153dd8e6477d9c'],
    [1,0.5,'bc814b5ab253786902ec3f0f11d08362458b8cfef0f9814c7703b8daaa73536e'],
    [1,0.19,'88eafdc19ab33c9be4fbbc6e14a79cd13eedc08fd0e1d2b42a2340134dccceb2'],
  ];
  for (const [reverse,pitch,baseline] of cases) {
    const project = createProject('forge');
    Object.assign(project.tracks[channel].params,{reverse,pitch});
    const dsp = new DSP(project,rate);
    const left = new Float32Array(4096), right = new Float32Array(4096);
    dsp.trigger(channel,60,0.8,0.2);
    dsp.render(left,right);
    assert.equal(createHash('sha256').update(Buffer.from(left.buffer)).update(Buffer.from(right.buffer)).digest('hex'),baseline);
  }
});
