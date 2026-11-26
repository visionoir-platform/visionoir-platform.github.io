import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { DSP } from '../dsp.js';
import { Effect } from '../fx.js';
import { createProject } from '../model.js';

const rate = 48000, bpm = 120;
const repeatFrames = 3 * rate / 8, windowFrames = 1200;
const frames = 4 * repeatFrames + windowFrames;
const pcm = Buffer.alloc(720 * 2);
for (let i = 0; i < pcm.length / 2; i++) {
  const burst = Math.sin(i * Math.PI / 24) * Math.sin(Math.PI * i / 720) ** 2;
  pcm.writeInt16LE(Math.round(24000 * burst), i * 2);
}

function print(id, {pan = 0, invert = false, bypass = false, returns = false} = {}) {
  const project = createProject();
  project.bpm = bpm;
  const track = project.tracks.find(t => t.instrument === 'sampler');
  Object.assign(track, {sample:{name:'Synthetic burst',rate,pcm:pcm.toString('base64')}, volume:1,pan,invert,
    fx:id === 'send' || !id ? [] : [{id,amount:0.72,bypass}], sendDelay:id === 'send' ? 1 : 0,sendReverb:0});
  const dsp = new DSP(project,rate,returns ? {bus:'returns'} : {});
  dsp.trigger(project.tracks.indexOf(track),60,1,1);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  dsp.render(left,right);
  return [left,right];
}

function echoRms(stereo, repeat) {
  return stereo.map(ch => {
    const window = ch.subarray(repeat * repeatFrames, repeat * repeatFrames + windowFrames);
    return Math.sqrt(window.reduce((sum,x) => sum + x*x,0) / window.length);
  });
}

test('a centred sampler alternates four audible echoes in the channel insert and shared return', () => {
  for (const [id,amount,returns] of [['pingpong',0.72,false], ['send',0.43,true]]) {
    const stereo = print(id,{returns});
    const ordinary = print('delay');
    if (returns) assert.deepEqual(echoRms(stereo,0),[0,0]);
    let previous = 0;
    for (let echo = 1; echo <= 4; echo++) {
      const rms = echoRms(stereo,echo), side = (echo - 1) % 2;
      assert.ok(rms[side] > 0.0001 && rms[1-side] < rms[side]*1e-5, id + ' echo ' + echo + ' RMS ' + rms);
      if (previous) assert.ok(Math.abs(rms[side]/previous - (0.22 + 0.42 * amount)) < 1e-5);
      previous = rms[side];
      if (!returns) {
        const reference = echoRms(ordinary,echo);
        assert.ok(Math.abs(Math.hypot(...rms)/Math.hypot(...reference)-1) < 1e-5);
      }
    }
  }
});

test('dry, bypass and ordinary delay keep their PCM; hard-panned wet repeats mirror each other', () => {
  const dry = print(null), ping = print('pingpong'), bypass = print('pingpong',{bypass:true});
  function digest(stereo) {
    const hash = createHash('sha256');
    for (const ch of stereo) hash.update(Buffer.from(ch.buffer,ch.byteOffset,ch.byteLength));
    return hash.digest('hex');
  }
  assert.equal(digest(dry),digest(bypass));
  for (let side = 0; side < 2; side++)
    assert.equal(dry[side].subarray(0,repeatFrames).findIndex((x,i) => x !== ping[side][i]),-1);
  // Stereo PCM printed by ordinary Delay in the preceding 7dd7087 engine.
  assert.equal(digest(print('delay')), '1bdf5d4d9b2c18e7bb5201adc29900f627a53ef710f038c57248a664ebfae82e');
  const hardL = print('pingpong',{pan:-1}), hardR = print('pingpong',{pan:1});
  const inverted = print('pingpong',{invert:true});
  for (let echo = 1; echo <= 4; echo++) {
    const a = echoRms(hardL,echo), b = echoRms(hardR,echo), side = (echo - 1)%2;
    assert.ok(a[side] > 0.0001 && a[1-side] < a[side]*1e-5);
    assert.ok(Math.abs(a[side] - b[1-side]) < 1e-7 && b[side] < b[1-side]*1e-5);
  }
  for (let side = 0; side < 2; side++)
    assert.equal(inverted[side].findIndex((x,i) => Math.abs(x+ping[side][i]) > 1e-7),-1);
});

test('opposite-polarity stereo input survives the wet path and intermediate pans retain echo power', () => {
  const feedback = 0.22 + 0.42 * 0.72, wet = 0.22 + 0.41 * 0.72;
  for (const [l,r] of [[0.45,-0.45],[-0.42,0.15],[0.42,0.15],[-0.1,-0.48]]) {
    const fx = new Effect({id:'pingpong',amount:0.72},rate,bpm);
    fx.step(l,r);
    assert.equal(fx.L,l); assert.equal(fx.R,r);
    let first;
    for (let frame = 1; frame <= 2*repeatFrames; frame++) {
      fx.step(0,0);
      if (frame === repeatFrames) {
        first = [fx.L,fx.R];
        assert.ok(Math.abs(Math.hypot(...first) - wet*Math.hypot(l,r)) < 1e-6);
        if (l*r < 0) {
          assert.ok(Math.abs(fx.L - l*wet) < 1e-6);
          assert.ok(Math.abs(fx.R - r*wet) < 1e-6);
        }
      }
    }
    assert.ok(Math.abs(fx.R - first[0]*feedback) < 1e-6);
    assert.ok(Math.abs(fx.L - first[1]*feedback) < 1e-6);
  }
});
