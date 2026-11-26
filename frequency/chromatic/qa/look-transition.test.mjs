import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultVisual } from '../model.js';
import { editLook, LookTransition, recallLook } from '../look-transition.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);
const dark = Object.freeze({ ...defaultVisual(), warp:.1, light:.2, rebuild:0, color:'#000000' });
const bright = Object.freeze({ ...dark, warp:.9, light:.8, color:'#ffffff' });

test('an interrupted same-mode recall begins at the displayed look and leaves the authored looks intact', () => {
  const view = new LookTransition();
  view.sample(dark, null, 100, false);
  const cue = recallLook(1, bright, 100);
  const half = view.sample(bright, cue, 750, false);
  close(half.warp,.5);
  close(half.light,.5);
  const next = recallLook(2, dark, 755);
  const first = view.sample(dark, next, 755, false);
  close(first.warp,.5);
  close(first.light,.5);
  const back = view.sample(dark, next, 1405, false);
  close(back.warp,.3);
  close(back.light,.35);
  assert.equal(view.sample(dark, next, 2055, false), dark);
});

test('a manual edit applies immediately, including when its value equals the pending target', () => {
  const view = new LookTransition(), cue = recallLook(1, bright, 0);
  view.sample(dark, null, 0, false);
  view.sample(bright, cue, 100, false);
  editLook(cue, { warp:.9, color:'#ffffff' }, 300);
  const changed = view.sample({ ...bright, warp:.9, color:'#ffffff' }, cue, 650, false);
  close(changed.warp,.9);
  close(changed.light,.5);
  assert.deepEqual(cue.direct, ['warp', 'color']);
});

test('freeze pauses the recall clock across windows, and reduced motion commits the target immediately', () => {
  const view = new LookTransition(), cue = recallLook(1, bright, 0);
  view.sample(dark, null, 0, false);
  const frozen = { ...bright, freeze:true };
  editLook(cue, { freeze:true }, 325);
  close(view.sample(frozen, structuredClone(cue), 1300, false).warp, .3);
  close(view.sample(frozen, structuredClone(cue), 2300, false).warp, .3);
  editLook(cue, { freeze:false }, 2325);
  close(view.sample(bright, structuredClone(cue), 2650, false).warp, .5);
  assert.equal(view.sample(bright, cue, 2750, true), bright);
  assert.equal(view.sample(bright, cue, 2800, false), bright);
});

test('a hidden surface catches up and replacing a project cancels the pending recall', () => {
  const view = new LookTransition(), cue = recallLook(1, bright, 0);
  view.sample(dark, null, 0, false);
  assert.equal(view.sample(bright, cue, 2000, false), bright);
  view.sample(dark, recallLook(2, dark, 2100), 2200, false);
  assert.equal(view.sample(bright, null, 2210, false), bright);
});
