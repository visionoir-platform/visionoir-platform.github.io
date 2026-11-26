import assert from 'node:assert/strict';
import test from 'node:test';
import {DSP} from '../dsp.js';
import {LiveRack} from '../live-rack.js';
import {createProject, validateProject} from '../model.js';

function render(engine, length) {
  const channels = [new Float32Array(length), new Float32Array(length)];
  engine.render(...channels);
  return channels;
}

test('master mute fades the full mix, follows rapid reversals and preserves the playing decks', () => {
  const rate = 48000;
  const song = createProject('relay');
  song.metronome = true;
  song.crossfadeBeats = 1;
  const master = new LiveRack(song, rate);
  const reference = new LiveRack(structuredClone(song), rate);
  for (const rack of [master, reference]) {
    rack.start({scene:3});
    rack.queueScene(4);
  }
  const bar = Math.ceil(240 * rate / song.bpm);
  function compare(length, envelope) {
    const actual = render(master, length);
    const dry = render(reference, length);
    let peak = 0;
    for (const [side, channel] of actual.entries()) {
      for (let i = 0; i < length; i++) {
        const expected = dry[side][i] * envelope(i);
        assert.ok(Math.abs(channel[i] - expected) < 2e-6);
        peak = Math.max(peak, Math.abs(dry[side][i]));
      }
    }
    return peak;
  }
  compare(bar + 21, () => 1);
  assert.ok(master.outgoing, 'cue entered its crossfade');
  master.control('master-mute', 1);
  assert.ok(compare(80, i => 1 - (i + 1) / 240) > 0.02);
  master.control('master-mute', 0);
  compare(40, i => 1 - (80 - i - 1) / 240);
  master.control('master-mute', 1);
  compare(201, i => Math.max(0, 1 - (40 + i + 1) / 240));
  for (const rack of [master, reference]) rack.control('m', 0.42);
  assert.equal(master.project.master.mute, true);
  assert.equal(master.project.master.volume, 0.42);
  assert.ok(compare(16000, () => 0) > 0.1);
  master.control('master-mute', 0);
  compare(300, i => Math.min(1, (i + 1) / 240));
  assert.deepEqual(render(master, 256), render(reference, 256));
});

test('a saved mute holds at startup and during export, including the live click', () => {
  const song = createProject('relay');
  song.metronome = true;
  delete song.master.mute;
  validateProject(song);
  song.master.mute = true;
  const restored = JSON.parse(JSON.stringify(song));
  validateProject(restored);
  for (const options of [{}, {offline:true}, {offline:true, mastering:false}]) {
    const engine = new DSP(restored, 44100, options);
    engine.start({scene:3});
    const channels = render(engine, 4096);
    for (const channel of channels) assert.ok(channel.every(sample => sample === 0));
  }
  restored.master.mute = 'false';
  assert.throws(() => validateProject(restored), /project.master/);
});
