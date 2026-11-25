import assert from 'node:assert/strict';
import test from 'node:test';
import { modes } from '../model.js';
import { advanceBlend, phraseMode, unseenMode } from '../visual-score.js';

test('The Unseen visits every look in 16 eight-beat phrases across arrangement scenes', () => {
  for (const scene of [0, 1, 4, 9]) {
    const cycle = [];
    for (let beat = 0; beat < 128; beat += 8) {
      const target = phraseMode(beat, scene);
      cycle.push(target);
      assert.equal(phraseMode(beat + 4, scene), target);
      assert.equal(phraseMode(beat + 7.75, scene), target);
    }
    assert.equal(new Set(cycle).size, modes.length);
    assert.equal(phraseMode(128, scene), cycle[0]);
  }
  assert.equal(phraseMode(0, 1), phraseMode(8, 0));
  assert.equal(phraseMode(120, 0), unseenMode);
});

function weights(blend) {
  const result = Array(modes.length).fill(0);
  result[blend.from] += 1 - blend.mix;
  result[blend.to] += blend.mix;
  return result;
}

test('interrupting a fade to reverse it or request a third look preserves both visible weights', () => {
  for (const mix of [0.125, 0.5, 0.875]) {
    for (const target of [2, 8, 12]) {
      const blend = { from: 2, to: 8, mix };
      const before = weights(blend);
      advanceBlend(blend, target, 0);
      assert.deepEqual(weights(blend), before);
      for (let frame = 0; frame < 40; frame++) {
        const previous = weights(blend);
        advanceBlend(blend, target, 0.05);
        assert.ok(weights(blend).every((w, i) => Math.abs(w - previous[i]) <= 0.050001));
      }
      assert.equal(weights(blend)[target], 1);
    }
  }
});

test('a running phrase crosses at different frame rates, with a stable static pose in reduced motion', () => {
  for (const fps of [20, 30, 60, 120]) {
    const blend = { from: 0, to: 0, mix: 1 };
    for (let frame = 0; frame < fps * 6; frame++) {
      const beat = 2 * frame / fps;
      advanceBlend(blend, phraseMode(beat, 1), 1 / fps);
      if (beat >= 2.25 && beat < 8) assert.equal(weights(blend)[phraseMode(0, 1)], 1);
      if (beat > 8 && beat < 8.5) assert.ok(blend.mix > 0 && blend.mix < 1);
      if (beat >= 10.25) assert.equal(weights(blend)[phraseMode(8, 1)], 1);
    }
    advanceBlend(blend, unseenMode, 1);
    assert.deepEqual(blend, { from: unseenMode, to: unseenMode, mix: 1 });
  }
});
