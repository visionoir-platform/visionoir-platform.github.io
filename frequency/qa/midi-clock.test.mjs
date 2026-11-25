import test from 'node:test';
import assert from 'node:assert/strict';
import { createMidiClock } from '../midi-clock.js';
import { bindMidiInputs } from '../midi-notes.js';

function hardware() {
  const tempos = [],
    transport = [];
  let delivered = 0;
  const clock = createMidiClock({
    tempo: (v) => tempos.push(v),
    start: () => transport.push('start'),
    stop: () => transport.push('stop'),
    now: () => delivered,
  });
  const A = { id: 'A', state: 'connected' },
    B = { id: 'B', state: 'connected' };
  const inputs = new Map([
    [A.id, A],
    [B.id, B],
  ]);
  const ports = bindMidiInputs(
    { inputs },
    (event, id) => clock.receive(id, event),
    (id) => clock.detach(id),
  );
  const send = (p, byte, t, extra = {}) =>
    p.onmidimessage({ data: Uint8Array.of(byte), timeStamp: t, ...extra });
  function ticks(p, bpm, start, n = 25, shape = (t) => t) {
    for (let i = 0; i < n; i++) send(p, 0xf8, shape(start + (i * 60000) / bpm / 24));
  }
  return {
    A,
    B,
    inputs,
    ports,
    clock,
    tempos,
    transport,
    send,
    ticks,
    setNow: (v) => {
      delivered = v;
    },
  };
}
test('two simultaneous clocks do not double tempo, even when all callbacks dispatch in one batch', () => {
  const h = hardware();
  h.setNow(9999);
  for (let n = 0; n < 74; n++)
    for (const [port, skew] of [
      [h.A, 0],
      [h.B, 0.17],
    ])
      h.send(port, 0xf8, (n * 60000) / (24 * 125.5) + skew);
  assert.equal(h.clock.master, 'A');
  assert.deepEqual(h.tempos, [125.5, 125.5, 125.5]);
  h.send(h.B, 0xfa, 1600);
  h.send(h.B, 0xfc, 1610);
  assert.deepEqual(h.transport, []);
});
test('explicit Start owns transport through Stop, stopped clock pulses are ignored, and hot unplug releases ownership', () => {
  const h = hardware();
  h.send(h.A, 0xfa, 0);
  h.ticks(h.A, 140, 1);
  h.send(h.B, 0xfc, 440);
  h.send(h.B, 0xfa, 441);
  h.send(h.B, 0xf8, 442);
  assert.deepEqual(h.transport, ['start']);
  assert.equal(h.clock.master, 'A');
  h.send(h.A, 0xfc, 450);
  h.ticks(h.A, 140, 451, 48);
  assert.equal(h.clock.master, null);
  assert.deepEqual(h.transport, ['start', 'stop']);
  h.send(h.B, 0xfa, 1400);
  h.ticks(h.B, 100, 1400);
  assert.equal(h.clock.master, 'B');
  assert.equal(h.tempos.at(-1), 100);
  h.B.state = 'disconnected';
  h.ports.refresh();
  assert.equal(h.clock.master, null);
  assert.deepEqual(h.transport, ['start', 'stop', 'start', 'stop']);
  assert.equal(h.B.onmidimessage, null);
  h.ticks(h.A, 110, 2100);
  assert.equal(h.clock.master, null, 'stopped A should not reclaim from clock alone');
  h.send(h.A, 0xfa, 2700);
  h.ticks(h.A, 110, 2700);
  assert.equal(h.clock.master, 'A');
  assert.equal(h.tempos.at(-1), 110);
});
test('a silent or invalid master becomes replaceable, ranges are bounded, and a late foreign stop is ignored', () => {
  const h = hardware();
  h.ticks(h.A, 120, 0);
  assert.equal(h.clock.master, 'A');
  h.ticks(h.B, 96, 1050);
  assert.equal(h.clock.master, 'B');
  assert.equal(h.tempos.at(-1), 96);
  h.send(h.A, 0xfc, 1500);
  assert.deepEqual(h.transport, []);
  h.ticks(h.B, 450, 1690, 62);
  assert.equal(h.clock.master, null);
  h.ticks(h.B, 35, 3000, 30);
  assert.equal(h.clock.master, null);
  h.ticks(h.B, 300, 6000);
  assert.equal(h.clock.master, 'B');
  assert.equal(h.tempos.at(-1), 300);
  h.clock.reset();
  h.ticks(h.A, 40, 7000);
  assert.equal(h.tempos.at(-1), 40);
  assert.ok(h.tempos.every((v) => v >= 40 && v <= 300));
});
test('prefer MIDI reception timestamps, discard duplicate or reversed ticks, and use a monotonic fallback when timestamps are missing', () => {
  const h = hardware();
  h.setNow(20000);
  for (let n = 0; n <= 24; n++) {
    const receivedTime = 200 + n * 25;
    h.send(h.A, 0xf8, 9000, { receivedTime });
    h.send(h.A, 0xf8, 9000, { receivedTime });
    h.send(h.A, 0xf8, 9000, { receivedTime: receivedTime - 1 });
  }
  assert.deepEqual(h.tempos, [100]);
  h.clock.reset();
  for (let n = 0; n <= 24; n++) {
    h.setNow(1000 + n * 12.5);
    h.send(h.B, 0xf8, undefined);
  }
  assert.equal(h.tempos.at(-1), 200);
  h.clock.reset();
  h.ticks(h.A, 128, 3000, 60, () => 3000);
  assert.equal(h.clock.master, null);
});
