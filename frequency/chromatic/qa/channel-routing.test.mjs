import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrack, INSTRUMENTS } from '../../audio/model.js';
import { visualSlotForChannel, collectVisualLevels } from '../channel-routing.js';
import { instruments, normalizeSignal } from '../model.js';

test('reordered and additional channels drive their instrument routes for metering and live hits', () => {
  assert.deepEqual(
    INSTRUMENTS.map((x) => x.name),
    instruments.map((name) => name.replaceAll('-', ' ')),
  );
  const tracks = INSTRUMENTS.map((x, i) => createTrack(x.id, i));
  [tracks[0], tracks[15]] = [tracks[15], tracks[0]];
  for (let i = 16; i < 32; i++) tracks.push(createTrack('acid', i));
  const levels = new Float32Array(32),
    target = new Float32Array(16);
  levels[0] = 0.25;
  levels[16] = 0.5;
  levels[31] = 0.75;
  assert.equal(visualSlotForChannel(tracks, 31), 2);
  assert.equal(visualSlotForChannel(tracks, 0), 15);
  assert.equal(collectVisualLevels(tracks, levels, target), target);
  const signal = normalizeSignal({ voices: target });
  assert.equal(signal.voices[0], 0);
  assert.equal(signal.voices[2], 0.75);
  assert.equal(signal.voices[15], 0.25);
  collectVisualLevels(tracks, [], target);
  assert.ok(target.every((x) => x === 0));
});
