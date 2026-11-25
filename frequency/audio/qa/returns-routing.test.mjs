import test from 'node:test';
import assert from 'node:assert/strict';
import { DSP } from '../dsp.js';
import { BUSSES, createProject } from '../model.js';

const rate = 48000;
const frames = 49152;
const ret = BUSSES.indexOf('returns');
const peak = array => array.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);

function equalPCM(first, second) {
  for (let i=0; i<first.length; i++) {
    if (first[i] !== second[i]) assert.fail('PCM differs at sample ' + i + ': ' + first[i] + ' vs ' + second[i]);
  }
}

function bounce({route = 'fx', bus, send = 0, mute = false, stride = 1} = {}) {
  const project = createProject('forge');
  // Isolate one source; demo insert effects on other tracks can generate signal at rest.
  for (const channel of project.tracks) channel.fx = [];
  const track = project.tracks.find(t => t.instrument === 'sampler');
  const pcm = Buffer.alloc(960);
  for (let n = 0; n < pcm.length / 2; n++) pcm.writeInt16LE(Math.round(15000 * Math.sin(n * Math.PI / 8)), 2*n);
  Object.assign(track, {
    bus:route, pan:0.35, sendDelay:send, sendReverb:send, fx:[],
    sample:{name:'Original 10 ms tone', rate, pcm:pcm.toString('base64')}
  });
  project.buses.returns.mute = mute;
  const dsp = new DSP(project, rate, {bus, mastering:false});
  dsp.meterStride = stride;
  dsp.trigger(project.tracks.indexOf(track),60,1,1);
  const left = new Float32Array(frames), right = new Float32Array(frames), meters = [];
  for (let i = 0; i < frames; i += 256) {
    dsp.render(left.subarray(i,i+256),right.subarray(i,i+256));
    meters.push(dsp.status().buses[ret]);
  }
  return {left,right,meters};
}

test('a channel assigned directly to Returns reaches the bus print exactly once, including its own sends', () => {
  for (const send of [0,0.8]) {
    const mix = bounce({route:'returns',send});
    const output = bounce({route:'returns',bus:'returns',send});
    assert.ok(peak(output.left) > 0.01);
    equalPCM(output.left, mix.left);
    equalPCM(output.right, mix.right);
    assert.ok(peak(output.meters) > 0.01);
  }
});

test('wet-only Returns meter follows the tail after the source stops, and follows its bus mute', () => {
  const dry = bounce();
  for (const stride of [1,4]) {
    const wet = bounce({bus:'returns',send:1,stride});
    const silent = bounce({bus:'returns',send:1,stride,mute:true});
    assert.ok(peak(dry.left.subarray(12000)) < 0.00001);
    assert.ok(peak(wet.left.subarray(12000)) > 0.0001);
    assert.ok(peak(wet.meters.slice(48)) > 0.0001);
    assert.equal(peak(silent.left),0);
    assert.equal(peak(silent.right),0);
    assert.equal(peak(silent.meters),0);
  }
});

test('source bus retains its wet mix, while the Returns-only print excludes its dry signal', () => {
  const dry = bounce(), wet = bounce({bus:'returns',send:1});
  const mixed = bounce({send:1}), source = bounce({bus:'fx',send:1}), unrelated = bounce({bus:'bass',send:1});
  for (const side of ['left','right']) {
    equalPCM(source[side],mixed[side]);
    assert.equal(peak(unrelated[side]),0);
    let residual = 0;
    for (let i = 0; i < frames; i++) residual = Math.max(residual, Math.abs(dry[side][i] + wet[side][i] - mixed[side][i]));
    assert.ok(residual < 1e-6, String(residual));
  }
});
