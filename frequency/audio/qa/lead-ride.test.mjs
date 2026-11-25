import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, INSTRUMENTS, readProject, projectFile } from '../model.js';
import { LiveRack } from '../live-rack.js';
import { Voice } from '../voice.js';

const lead = INSTRUMENTS.findIndex(i => i.id === 'lead');
const ride = INSTRUMENTS.findIndex(i => i.id === 'ride');
function live(mono) {
  const p = createProject('blank');
  p.tracks[lead].params.mono = mono;
  return new LiveRack(p,48000);
}
function sustained(rack) {
  return rack.active.channels[lead].voices.filter(v => v.active && v.held && v.gate === Infinity)
    .map(v => [v.note,v.token]);
}

test('mono lead retriggers and restores the last still-held note, including independent same-pitch keys', () => {
  const rack = live(1);
  rack.noteOn(lead,48,.7,1);
  rack.noteOn(lead,55,.8,2);
  assert.deepEqual(sustained(rack),[[55,2]]);
  rack.noteOn(lead,55,.9,3);
  assert.deepEqual(sustained(rack),[[55,3]]);
  rack.release(lead,55,3);
  assert.deepEqual(sustained(rack),[[55,2]]);
  rack.release(lead,48,1);
  assert.deepEqual(sustained(rack),[[55,2]]);
  rack.release(lead,55,2);
  assert.deepEqual(sustained(rack),[]);
  rack.noteOn(lead,48,.7,4);
  rack.noteOn(lead,55,.8,5);
  rack.release(lead,55,5);
  assert.deepEqual(sustained(rack),[[48,4]]);
  rack.release(lead,48,4);
  assert.deepEqual(sustained(rack),[]);
  const l = new Float32Array(256), r = new Float32Array(256);
  for (let i=0; i<1400; i++) rack.render(l,r);
  assert.ok(rack.active.channels[lead].voices.every(v => !v.active));
});

test('lead stays polyphonic on old projects and accepts mono while notes are held', async () => {
  const p = createProject('blank');
  delete p.tracks[lead].params.mono;
  const restored = await readProject(projectFile(p));
  const rack = new LiveRack(restored,48000);
  rack.noteOn(lead,48,.7,1);
  rack.noteOn(lead,55,.8,2);
  assert.deepEqual(sustained(rack),[[48,1],[55,2]]);
  rack.control('p:'+lead+':mono',1);
  assert.deepEqual(sustained(rack),[[55,2]]);
  rack.release(lead,55,2);
  assert.deepEqual(sustained(rack),[[48,1]]);
  rack.release(lead,48,1);
  assert.deepEqual(sustained(rack),[]);
  rack.control('p:'+lead+':mono',0);
  rack.noteOn(lead,52,.7,3);
  rack.noteOn(lead,59,.8,4);
  assert.deepEqual(sustained(rack).sort(),[[52,3],[59,4]]);
  rack.stop();
  assert.deepEqual(sustained(rack),[]);
});

function voice(rate, params) {
  const v = new Voice(rate);
  v.start(ride,60,1,2,params,{},45117);
  return v;
}
function capture(rate,params) {
  const v = voice(rate,params);
  return Float64Array.from({length:16384}, () => v.next());
}
function bandPower(samples, rate, freqs) {
  let energy = 0;
  for (const hz of freqs) {
    let re = 0, im = 0;
    for (let n=0; n<samples.length; n++) {
      const angle = 2*Math.PI*n*hz/rate;
      const value = samples[n]*(0.5-0.5*Math.cos(2*Math.PI*n/(samples.length-1)));
      re += value*Math.cos(angle);
      im += value*Math.sin(angle);
    }
    energy += re*re + im*im;
  }
  return energy;
}
test('ride high-pass attenuates the hiss bass, preserves its treble and leaves metallic partials alone', () => {
  const hiss = {bell:0, shimmer:0, decay:.85};
  for (const rate of [48000,96000]) {
    const raw = capture(rate,hiss);
    const bypass = capture(rate,{...hiss,noiseFilter:0});
    const filtered = capture(rate,{...hiss,noiseFilter:1});
    const ordinary = capture(rate,{...hiss,bell:.7,shimmer:.8});
    const bright = capture(rate,{...hiss,bell:.7,shimmer:.8,noiseFilter:1});
    let difference = 0;
    for (let n=0; n<raw.length; n++) {
      assert.equal(raw[n],bypass[n]);
      difference = Math.max(difference,Math.abs((ordinary[n]-raw[n])-(bright[n]-filtered[n])));
    }
    assert.ok(difference < 1e-12);
    const level = freqs => 10*Math.log10(bandPower(filtered,rate,freqs)/bandPower(raw,rate,freqs));
    const bass = level([200,232,271,319,365]);
    const treble = level([12000,12513,13000,14300,15500]);
    assert.ok(bass < -20);
    assert.ok(treble > -1 && treble < 0);
    console.log('ride', rate, 'Hz: bass', bass.toFixed(2), 'dB, treble', treble.toFixed(2), 'dB, metallic delta', difference.toExponential(1));
  }
});

test('ride filter responds on an already sounding note and returns to exact bypass', () => {
  const original = voice(48000,{}), changed = voice(48000,{});
  for (let i=0; i<512; i++) assert.equal(changed.next(),original.next());
  changed.control('noiseFilter',1);
  let delta = 0;
  for (let i=0; i<512; i++) delta = Math.max(delta,Math.abs(changed.next()-original.next()));
  assert.ok(delta > .01);
  changed.control('noiseFilter',0);
  for (let i=0; i<512; i++) assert.equal(changed.next(),original.next());
});
