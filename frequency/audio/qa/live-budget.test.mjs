import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveBudget } from '../live-budget.js';
import { LiveRack } from '../live-rack.js';
import { createProject } from '../model.js';

const rate = 48000,
  quantum = 128,
  blockMs = (1000 * quantum) / rate;
function simulate(budget, ratio, windows) {
  for (let i = 0; i < Math.ceil(rate / 2 / quantum) * windows; i++)
    budget.observe(blockMs * ratio, quantum);
}
test('guard rejects a spike, requires 3 heavy windows, recovers after 12 low windows, ignores missing/coarsened timing', () => {
  const b = new LiveBudget(rate, false);
  simulate(b, 0.25, 4);
  b.observe(190, quantum);
  simulate(b, 0.25, 2);
  assert.equal(b.protected, false);
  simulate(b, 0.9, 2);
  assert.equal(b.protected, false);
  simulate(b, 0.9, 1);
  assert.equal(b.protected, true);
  simulate(b, 0.2, 11);
  assert.equal(b.protected, true);
  simulate(b, 0.2, 1);
  assert.equal(b.protected, false);
  const coarse = new LiveBudget(rate, true);
  for (let i = 0; i < 1500; i++) coarse.observe(i % 25 === 0 ? 100 : 0, quantum);
  assert.equal(coarse.load, undefined);
  assert.equal(coarse.protected, false);
  coarse.observe(1, quantum);
  simulate(coarse, 0.85, 4);
  assert.equal(coarse.protected, true);
  coarse.observe(-1000, quantum);
  simulate(coarse, 0.4, 1);
  assert.equal(coarse.protected, true);
  coarse.reset();
  assert.equal(coarse.load, undefined);
  assert.equal(coarse.protected, false);
});
function block(rack, n) {
  const l = new Float32Array(n),
    r = new Float32Array(n);
  rack.render(l, r);
  return [l, r];
}
test('pressure reduces channel meter work, preserves sample output, exact master and the project through queue/recovery', () => {
  const p = createProject('forge'),
    snapshot = JSON.stringify(p),
    sr = 16000;
  const a = new LiveRack(p, sr),
    b = new LiveRack(p, sr);
  a.start({ scene: 3 });
  b.start({ scene: 3 });
  for (let i = 0; i < 200; i++) b.observeBudget(7.2, 128);
  assert.equal(b.status().meterStride, 4);
  assert.equal(a.status().meterStride, 1);
  assert.deepEqual(block(a, 4096), block(b, 4096));
  const x = a.status(),
    y = b.status();
  for (const key of ['clipped', 'masterPeak', 'masterRms', 'correlation']) assert.deepEqual(x[key], y[key]);
  for (const r of [a, b]) r.queueScene(6);
  assert.equal(b.spare.meterStride, 4);
  assert.deepEqual(
    block(a, Math.ceil(((4 * 60) / p.bpm) * sr)),
    block(b, Math.ceil(((4 * 60) / p.bpm) * sr)),
  );
  for (let i = 0; i < 900; i++) b.observeBudget(1, 128);
  assert.equal(b.status().meterStride, 1);
  assert.equal(JSON.stringify(p), snapshot);
  assert.deepEqual(block(a, 2048), block(b, 2048));
  b.stop();
  assert.equal(b.status().dspLoad, undefined);
});
