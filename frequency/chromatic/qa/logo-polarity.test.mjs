import test from 'node:test';
import assert from 'node:assert/strict';
import { logoPolarity } from '../../../src/logo-polarity.js';

test('a second shake reverses the developing image from its current position', () => {
  let negative = false;
  const model = logoPolarity({classList:{contains:() => negative}});
  assert.equal(model.uniform.value,0);
  negative = true;
  model.refresh();
  model.update(0.26,true);
  assert.equal(model.uniform.value,0.5);
  negative = false;
  model.refresh();
  model.update(0.13,true);
  assert.equal(model.uniform.value,0.25);
  model.update(0.52,true);
  assert.equal(model.uniform.value,0);
  negative = true;
  model.refresh();
  model.update(0,false);
  assert.equal(model.uniform.value,1);
  model.update(10,true);
  assert.equal(model.uniform.value,1);
});
