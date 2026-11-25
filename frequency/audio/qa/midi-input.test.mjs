import assert from 'node:assert/strict';
import test from 'node:test';
import { createMidiNotes, bindMidiInputs } from '../../midi-notes.js';
import { createProject } from '../model.js';

test('two inputs and MIDI channels own distinct voices even on the same pitch', async () => {
  const starts = [],
    stops = [];
  const router = createMidiNotes({
    ready: async () => {},
    noteOn: (...v) => starts.push(v),
    noteOff: (...v) => stops.push(v),
    onError: assert.fail,
  });
  await router.press('keys', 0, 60, 11, 0.9);
  await router.press('keys', 1, 60, 11, 0.8);
  await router.press('pads', 0, 60, 14, 0.7);
  assert.equal(new Set(starts.map((v) => v[3])).size, 3);
  router.release('pads', 0, 60);
  router.release('keys', 0, 60);
  assert.deepEqual(stops, [
    [14, 60, starts[2][3]],
    [11, 60, starts[0][3]],
  ]);
  router.reset();
  assert.deepEqual(stops[2], [11, 60, starts[1][3]]);
});

test('release, disconnection and panic cancel pending notes before audio resume', async () => {
  let resume;
  const wait = new Promise((r) => {
    resume = r;
  });
  const calls = [];
  const router = createMidiNotes({
    ready: () => wait,
    noteOn: (...v) => calls.push(v),
    noteOff: (...v) => calls.push(v),
    onError: assert.fail,
  });
  const pending = router.press('keys', 0, 61, 1, 1);
  router.release('keys', 0, 61);
  const pendingDetach = router.press('pads', 0, 72, 3, 1);
  router.reset('pads');
  const pendingPanic = router.press('keys', 3, 60, 11, 1);
  router.reset();
  resume();
  await Promise.all([pending, pendingDetach, pendingPanic]);
  assert.deepEqual(calls, []);
});

test('hot unplug releases only that port and rebinds a replacement sharing its ID', () => {
  const first = { id: '1', state: 'connected' },
    second = { id: '2', state: 'connected' },
    detached = [],
    received = [];
  const access = {
    inputs: new Map([
      ['1', first],
      ['2', second],
    ]),
  };
  const ports = bindMidiInputs(
    access,
    (_, id) => received.push(id),
    (id) => detached.push(id),
  );
  first.onmidimessage({});
  assert.deepEqual(received, ['1']);
  first.state = 'disconnected';
  ports.refresh();
  assert.equal(first.onmidimessage, null);
  assert.deepEqual(detached, ['1']);
  assert.equal(typeof second.onmidimessage, 'function');
  const replacement = { id: '1', state: 'connected' };
  access.inputs.set('1', replacement);
  ports.refresh();
  replacement.onmidimessage({});
  assert.deepEqual(received, ['1', '1']);
  ports.close();
  assert.equal(replacement.onmidimessage, null);
  assert.equal(second.onmidimessage, null);
});

test('retrigger ignores an earlier pending press and releases a previous sounding voice', async () => {
  const starts = [],
    stops = [];
  const router = createMidiNotes({
    ready: async () => {},
    noteOn: (...v) => starts.push(v),
    noteOff: (...v) => stops.push(v),
    onError: assert.fail,
  });
  const first = router.press('input', 1, 60, 11, 0.8),
    second = router.press('input', 1, 60, 14, 0.9);
  await Promise.all([first, second]);
  assert.equal(starts.length, 1);
  assert.equal(starts[0][0], 14);
  await router.press('input', 1, 60, 10, 1);
  assert.deepEqual(stops, [[14, 60, starts[0][3]]]);
  router.release('input', 1, 60);
  assert.deepEqual(stops[1], [10, 60, starts[1][3]]);
});

test('worklet keeps held notes sounding past the idle timeout and releases each voice by token', async () => {
  let Processor;
  const rate = 16000;
  globalThis.sampleRate = rate;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { postMessage() {} };
    }
  };
  globalThis.registerProcessor = (_, constructor) => {
    Processor = constructor;
  };
  try {
    await import('../processor.js');
    const renderer = new Processor();
    const send = (type, props = {}) => renderer.port.onmessage({ data: { type, ...props } });
    send('project', { project: createProject() });
    const audio = [new Float32Array(128), new Float32Array(128)];
    const render = (seconds) => {
      for (let i = 0; i < Math.ceil((seconds * rate) / 128); i++) {
        audio[0].fill(0);
        audio[1].fill(0);
        renderer.process([], [audio]);
      }
    };
    const rms = () => Math.sqrt(audio[0].reduce((s, n) => s + n * n, 0) / 128);
    send('held-note', { track: 11, note: 61, velocity: 0.8, token: 1 });
    send('held-note', { track: 11, note: 61, velocity: 0.6, token: 2 });
    render(10.2);
    assert(rms() > 0.01, 'held note unexpectedly timed out');
    send('off', { track: 11, note: 61, token: 1 });
    render(3);
    assert(rms() > 0.01, 'unrelated voice released');
    assert.equal(renderer.dsp.held.size, 1);
    send('off', { track: 11, note: 61, token: 2 });
    render(5);
    assert(rms() < 0.0001);
    assert.equal(renderer.dsp.held.size, 0);
    send('held-note', { track: 11, note: 61, velocity: 1, token: 3 });
    render(0.1);
    assert(rms() > 0.01);
    send('stop');
    render(0.1);
    assert.equal(rms(), 0);
    assert.equal(renderer.dsp.held.size, 0);
  } finally {
    delete globalThis.sampleRate;
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.registerProcessor;
  }
});
