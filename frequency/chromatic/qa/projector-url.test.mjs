import test from 'node:test';
import assert from 'node:assert/strict';
import { projectorUrl } from '../projector-url.js';

test('the VJ navigation carries only the active language, view and new output ID', () => {
  const studio = new URL('https://example.invalid/sub/frequency/?client=private-fixture&utm_medium=x&lang=it&output=old#secret');
  const output = new URL(projectorUrl(studio, 'fr-CH', 'new-id'));
  assert.equal(output.origin, studio.origin);
  assert.equal(output.pathname, '/sub/frequency/');
  assert.equal(output.hash, '');
  assert.deepEqual([...output.searchParams], [['lang', 'fr-CH'], ['view', 'vj'], ['output', 'new-id']]);
});
