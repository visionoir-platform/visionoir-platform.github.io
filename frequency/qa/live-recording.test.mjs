import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveRecording } from '../live-recording.js';

const original = { MediaRecorder: globalThis.MediaRecorder, MediaStream: globalThis.MediaStream };
const instances = [];
class Recorder {
  static isTypeSupported(type) { return !type.includes('webm'); }
  constructor(stream, options) {
    this.mimeType = options?.mimeType ?? '';
    this.stream = stream;
    instances.push(this);
  }
  start(interval) {
    assert.equal(interval, 1000);
    this.state = 'recording';
  }
  stop() { this.state = 'inactive'; }
  data(data = 'chunk') { this.ondataavailable?.({ data: new Blob([data], {type: this.mimeType}) }); }
  end() { this.state = 'inactive'; this.onstop?.(); }
}
class Stream {
  constructor(tracks) { this.tracks = tracks; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
}
beforeEach(() => {
  instances.length = 0;
  Object.assign(globalThis, { MediaRecorder: Recorder, MediaStream: Stream });
});
after(() => Object.assign(globalThis, original));

function fixture() {
  let open, released = 0;
  const initialized = new Promise(resolve => { open = resolve; });
  const audio = {kind: 'audio', stop() { assert.fail('shared audio must stay available'); }};
  const video = {kind: 'video'};
  const audioStream = new Stream([audio]);
  const phases = [], saved = [], errors = [];
  const take = createLiveRecording({
    prepare: () => initialized,
    captureVideo: () => ({ stream: { getVideoTracks: () => [video] }, stop: () => { released++; } }),
    changed: () => phases.push(take.phase),
    saved: (...args) => saved.push(args),
    failed: error => errors.push(error),
  });
  return { take, open: () => open(audioStream), audio, video, phases, saved, errors, releases: () => released };
}

test('rapid commands share one native recorder and wait for the final chunk before another take', async () => {
  const f = fixture();
  const first = f.take.toggle(false);
  await f.take.toggle(false);
  assert.equal(f.take.phase, 'starting');
  f.open();
  await first;
  assert.equal(instances.length, 1);
  const [recorder] = instances;
  recorder.data('first-');
  await f.take.toggle(false);
  await f.take.toggle(false);
  assert.equal(instances.length, 1);
  assert.equal(f.take.phase, 'finishing');
  assert.equal(f.saved.length, 0);
  recorder.data('last');
  recorder.end();
  assert.deepEqual(f.phases, ['starting', 'recording', 'finishing', 'idle']);
  assert.equal(await f.saved[0][0].text(), 'first-last');
  assert.deepEqual(f.saved[0].slice(1), ['Frequency-live.m4a', false]);
});

test('panic cancels a pending start and the next take owns its video tracks', async () => {
  const f = fixture();
  const abandoned = f.take.toggle(true);
  f.take.stop();
  assert.equal(f.take.phase, 'idle');
  const renewed = f.take.toggle(true);
  f.open();
  await Promise.all([abandoned, renewed]);
  assert.equal(instances.length, 1);
  const [recorder] = instances;
  assert.deepEqual(recorder.stream.tracks, [f.audio, f.video]);
  f.take.cancel();
  recorder.data();
  recorder.end();
  assert.equal(f.releases(), 1);
  assert.equal(f.saved.length, 0);
});

test('a native error releases video once and preserves recoverable chunks as a partial file', async () => {
  const f = fixture();
  const started = f.take.toggle(true);
  f.open();
  await started;
  const [recorder] = instances;
  const problem = Error('Encoder failed');
  recorder.onerror({error: problem});
  assert.equal(f.take.phase, 'finishing');
  recorder.data('last');
  recorder.end();
  recorder.end();
  assert.deepEqual(f.errors, [problem]);
  assert.equal(f.releases(), 1);
  assert.deepEqual(f.saved[0].slice(1), ['Frequency-live.mp4', true]);
  assert.equal(f.take.phase, 'idle');
});
