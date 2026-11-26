import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPortrait } from '../portrait.js';
import { makeFlakes } from '../finish.js';

// Use the public GLBs and the production pose normalization. Only fetching the
// local files and decoding their texture images require browser substitutes.
for (const [lod, budget] of [['mobile', 1100], ['desktop', 3500]]) {
  test(`${lod} flakes preserve source triangles, normals and UVs under the collar`, async t => {
    const url = 'https://portrait.test/creator-' + lod + '.glb';
    const bytes = await readFile(new URL('../../../public/creator/creator-' + lod + '.glb', import.meta.url));
    const nativeFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', (input, options) => input === url
      ? Promise.resolve(new Response(bytes)) : nativeFetch(input, options));
    Object.assign(globalThis, { self: globalThis, location: new URL(url), createImageBitmap: async () => ({}) });
    t.after(() => {
      delete globalThis.self;
      delete globalThis.location;
      delete globalThis.createImageBitmap;
    });
    const asset = await loadPortrait(url);
    const flakes = makeFlakes(asset, {}, lod === 'mobile');
    t.after(() => { flakes.geometry.dispose(); flakes.material.dispose(); asset.geometry.dispose(); asset.dispose(); });
    assert.equal(flakes.material.uniforms.uSkin.value, asset.natural.map);

    const attrs = flakes.geometry.attributes;
    const vertices = attrs.position.count;
    assert.ok(vertices > 300 && vertices <= 3 * budget);
    assert.equal(vertices, attrs.normal.count);
    assert.equal(vertices, attrs.uv.count);
    const patches = new Set();
    for (let i = 0; i < vertices; i += 3) {
      const pivot = attrs.flakeOrigin.getW(i);
      patches.add(pivot);
      for (let v = i; v < i + 3; v++) {
        assert.ok(attrs.position.getY(v) < .39);
        assert.equal(attrs.flakeOrigin.getW(v), pivot);
      }
    }
    assert.ok(patches.size >= 16, 'Separate pieces must cover the sleeve');

    // Match sampled complete triangles against source faces including UV seams.
    function signature(attributes, ids) {
      return ids.flatMap(i => [attributes.position, attributes.normal, attributes.uv].flatMap(attr =>
        Array.from(attr.array.subarray(i * attr.itemSize, (i + 1) * attr.itemSize)))).join(',');
    }
    const candidates = new Set(), pending = new Set();
    for (let i = 0; i < vertices; i += 3 * 97) {
      candidates.add(attrs.position.getX(i));
      pending.add(signature(attrs, [i, i + 1, i + 2]));
    }
    const { index, attributes } = asset.geometry;
    for (let i = 0; i < index.count && pending.size; i += 3) {
      const a = index.getX(i);
      if (candidates.has(attributes.position.getX(a))) {
        pending.delete(signature(attributes, [a, index.getX(i + 1), index.getX(i + 2)]));
      }
    }
    assert.equal(pending.size, 0, 'Every sampled triangle must retain source vertex order, normals and UVs');
    t.diagnostic(`${vertices / 3} triangles across ${patches.size} patches`);
  });
}
