import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fallbackMaterial} from '../fallback-material.js';
import {trackAccents} from '../../palette.js';

test('each track resolves to its own existing poster and turntable for both metal finishes', async () => {
  const root = new URL('../../../public/creator/', import.meta.url);
  for (const look of ['metal','liquid']) {
    const frames = new Set(), posters = new Set();
    for (const track of Object.keys(trackAccents)) {
      const variant = fallbackMaterial(track,look);
      for (const [prefix,suffix,hashes] of [['poster',variant.poster,posters],['turntable',variant.atlas,frames]]) {
        const data = await readFile(new URL(prefix + suffix + '.webp',root));
        assert.equal(data.toString('ascii',8,12),'WEBP');
        hashes.add(createHash('sha256').update(data).digest('hex'));
      }
    }
    assert.equal(posters.size,6);
    assert.equal(frames.size,6);
  }
});
test('Natural uses the same original poster and turntable in every track', async () => {
  for (const track of Object.keys(trackAccents)) {
    assert.deepEqual(fallbackMaterial(track,'natural'),{poster:'-natural',atlas:'-natural'});
  }
  for (const name of ['poster-natural','turntable-natural']) {
    const data = await readFile(new URL('../../../public/creator/' + name + '.webp',import.meta.url));
    assert.equal(data.toString('ascii',8,12),'WEBP');
  }
});
test('unknown IDs use Cromo', () => {
  assert.deepEqual(fallbackMaterial('unknown','liquid'),fallbackMaterial('chrome','liquid'));
});
