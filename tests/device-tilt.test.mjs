import test from 'node:test';
import assert from 'node:assert/strict';
import {createPoseTracker} from '../src/device-tilt.js';

const near = (actual, expected) => assert.ok(Math.abs(actual-expected) < .00001, actual+' vs '+expected);
test('each reading is relative to the initial screen pose; landscape axes follow the display', () => {
  const tracker = createPoseTracker();
  const read = (beta,gamma,angle=0) => tracker.read({alpha:0,beta,gamma},angle);
  const first = read(30,0);
  near(first.x,0); near(first.y,0);
  const vertical = read(45,0);
  near(vertical.x,0); assert.ok(vertical.y > .49);
  const reset = read(30,0,90);
  near(reset.x,0); near(reset.y,0);
  const horizontal = read(45,0,90);
  assert.ok(horizontal.x > .49); near(horizontal.y,0);
  tracker.reset();
  near(read(60,20,90).x,0);
});
test('heading unwraps a full turn in both directions including across north', () => {
  for (const startPitch of [0,85,135]) {
    for (const sign of [1,-1]) {
      const tracker = createPoseTracker();
      let value;
      for (let step=0; step<=24; step++) {
        const alpha = (350 + sign * step * 15 + 360) % 360;
        value = tracker.read({alpha,beta:startPitch,gamma:0},0);
      }
      near(value.yaw, sign*Math.PI*2);
    }
  }
});
test('unavailable axes cannot create motion; relative tilt still works without a compass', () => {
  const tracker = createPoseTracker();
  assert.equal(tracker.read({alpha:20,beta:null,gamma:0},0),null);
  tracker.read({alpha:null,beta:0,gamma:0},0);
  const side = tracker.read({alpha:null,beta:0,gamma:45},0);
  near(side.x,1); near(side.yaw,0);
  const recalibrated = tracker.read({alpha:287,beta:0,gamma:45},0);
  near(recalibrated.x,0); near(recalibrated.yaw,0);
});

test('the portrait makes one complete automatic turn in visible time and keeps its angle on pause', async () => {
  const {createPortraitSpin, turn, turnDuration} = await import('../src/creator/spin.js');
  let now = 0;
  const spin = createPortraitSpin(() => now);
  spin.setRunning(true);
  now = turnDuration / 2;
  assert.ok(Math.abs(spin.value() - Math.PI) < 1e-8);
  spin.setRunning(false);
  now += 300_000;
  assert.ok(Math.abs(spin.value() - Math.PI) < 1e-8);
  spin.setRunning(true);
  now += turnDuration / 2;
  assert.ok(spin.value() < 1e-8);
  spin.set(5 * turn / 4);
  assert.ok(Math.abs(spin.value() - Math.PI / 2) < 1e-8);
});
