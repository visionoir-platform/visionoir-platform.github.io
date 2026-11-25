import test from 'node:test';
import assert from 'node:assert/strict';
import { DSP } from '../dsp.js';
import { LiveRack } from '../live-rack.js';
import { BUSSES, createProject, validateProject } from '../model.js';

function busTone({ second = false, invert = false, volume = 1, mute = false, stride = 1, bus = 'drums' } = {}) {
  const rate = 48000;
  const frames = 4096;
  const project = createProject();
  const pcm = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) pcm.writeInt16LE(Math.round(14000 * Math.sin(i * Math.PI / 24)), 2 * i);
  const sampler = project.tracks.find(track => track.instrument === 'sampler');
  const make = (id, invert) => ({
    ...structuredClone(sampler), id, bus, pan: 0, invert, volume: 1, gain: 1, fx: [], sendDelay: 0, sendReverb: 0,
    sample: { name: 'Original 1 kHz meter calibration tone', rate, pcm: pcm.toString('base64') },
  });
  project.tracks = [make('signal-a', false)];
  if (second) project.tracks.push(make('signal-b', invert));
  for (const scene of project.scenes) scene.patterns.length = project.tracks.length;
  project.arrangement = [{ scene: 0, bars: 1, audioRegions: project.tracks.map(track => ({
    track: track.id, step: 0, from: 0, to: frames
  })) }];
  project.buses[bus] = {volume, mute};
  const dsp = new DSP(validateProject(project), rate, {mastering: false});
  dsp.start({arrangement: true});
  dsp.meterStride = stride;
  const l = new Float32Array(frames), r = new Float32Array(frames);
  dsp.render(l, r);
  const meters = dsp.status();
  return {bus: meters.buses[BUSSES.indexOf(bus)], channel: meters.peaks[0], pcm: l};
}

test('bus meters report the coherent post-fader sum including mute, cancellation, and gain', (t) => {
  for (const stride of [1, 4]) {
    for (const bus of BUSSES) {
      const solo = busTone({stride,bus});
      const inPhase = busTone({stride,bus,second:true});
      const opposite = busTone({stride,bus,second:true,invert:true});
      const muted = busTone({stride,bus,mute:true});
      const half = busTone({stride,bus,volume:0.5});
      assert.ok(solo.bus > 0.1);
      assert.ok(Math.abs(inPhase.bus / solo.bus - 2) < 1e-6, bus + ' sum: ' + inPhase.bus / solo.bus);
      assert.equal(opposite.bus, 0);
      assert.equal(muted.bus, 0);
      assert.equal(muted.channel, solo.channel);
      assert.ok(Math.abs(half.bus / solo.bus - 0.5) < 1e-6);
      assert.ok(opposite.pcm.every(x => x === 0) && muted.pcm.every(x => x === 0));
      if (bus === 'drums' && stride === 1) t.diagnostic(
        JSON.stringify({one:solo.bus, two:inPhase.bus, opposite:opposite.bus, mute:muted.bus, half:half.bus})
      );
    }
  }
});

test('the pre-limiter overload survives the scene handoff until it is read once', () => {
  const rack = new LiveRack(createProject(), 48000);
  const project = createProject();
  const frameCount = 256;
  const left = new Float32Array(frameCount), right = new Float32Array(frameCount);
  function fade(overloadedDeck, output) {
    rack.outgoing = new DSP(project, 48000);
    rack.outgoing.clipped = overloadedDeck;
    rack.fade = 0;
    rack.fadeLength = frameCount;
    rack.outgoing.render = rack.active.render = (l, r, n) => {
      l.fill(output, 0, n);
      r.fill(output, 0, n);
    };
    rack.render(left, right);
    assert.equal(rack.outgoing, null);
  }
  fade(true, 0.2);
  assert.equal(rack.status().clipped, true);
  assert.equal(rack.status().clipped, false);
  // Both decks are individually below full scale, but their equal-power sum overloads.
  fade(false, 0.85);
  assert.equal(rack.status().clipped, true);
  assert.ok(left.every(sample => Math.abs(sample) <= 1));
  fade(false, 0.2);
  assert.equal(rack.status().clipped, false);
});

test('stereo correlation is undefined in silence, for a missing channel and after an empty interval', () => {
  for (const Engine of [DSP, LiveRack]) {
    const rack = new Engine(createProject(), 48000);
    rack.start({scene: 0});
    rack.render(new Float32Array(256), new Float32Array(256));
    assert.equal(rack.status().correlation, null);
    assert.equal(rack.status().correlation, null);
  }
  const live = new LiveRack(createProject(), 48000);
  // Exercise the actual live master meter with known, delivered stereo samples.
  const l = new Float32Array(128), r = new Float32Array(128);
  for (const [k, expected] of [[1, 1], [-1, -1], [0, null]]) {
    live.active.render = (left, right, n) => {
      for (let i = 0; i < n; i++) {
        left[i] = 0.3 * Math.sin(i / 3);
        right[i] = k * left[i];
      }
    };
    live.render(l, r);
    assert.equal(live.status().correlation, expected);
  }
});
