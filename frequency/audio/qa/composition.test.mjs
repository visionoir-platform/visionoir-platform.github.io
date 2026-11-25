import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateSession, genres, writeGeneratedPattern } from '../../composer.js';
import { createProject, validateProject } from '../model.js';
import { renderOffline } from '../offline.js';

test('nine editable genre scores are seeded, harmonically bounded and audibly distinct at the same tempo', async () => {
  const scores = new Set(),
    audio = new Set();
  for (let genre = 0; genre < genres.length; genre++) {
    const opt = { genre, bpm: 155, seed: 223, root: 38, intensity: 0.92, complexity: 0.79, scale: 1 };
    const project = validateProject(generateSession(createProject, opt));
    const fingerprint = (p) => JSON.stringify(p.scenes.map((scene) => scene.patterns));
    const score = fingerprint(project);
    assert.equal(fingerprint(generateSession(createProject, opt)), score);
    assert.notEqual(fingerprint(generateSession(createProject, { ...opt, seed: 224 })), score);
    assert.ok(!scores.has(score));
    scores.add(score);
    const combined = project.scenes[3].patterns;
    if (genres[genre] === 'Dark electro') {
      assert.deepEqual(combined[0].steps.flatMap((e, i) => e ? [i] : []), [0, 7, 10, 14]);
      assert(combined[3].steps[5]?.gate > 1);
      assert(combined[14].steps[6]?.note >= opt.root + 12);
    }
    if (genre === 4) assert.equal(combined[5].length, 15);
    if (genre === 5) assert.ok(combined[5].steps.some((x) => x?.offset < 0));
    if (genre === 6) assert.equal(combined[5].length, 14);
    if (genre === 7) assert.ok(combined[10].steps.some((x) => x?.chord?.length === 2));
    const blob = await renderOffline(project, {
      scene: 3,
      bars: 0.25,
      tail: 0,
      bits: 32,
      channels: 1,
      sampleRate: 44100,
    });
    const wav = Buffer.from(await blob.arrayBuffer());
    const pcm = wav.subarray(wav.indexOf('data', 36) + 8);
    let power = 0;
    for (let i = 0; i < pcm.length; i += 4) power += pcm.readFloatLE(i) ** 2;
    assert.ok(Math.sqrt(power / (pcm.length / 4)) > 0.04);
    const hash = createHash('sha256').update(pcm).digest('hex');
    assert.ok(!audio.has(hash));
    audio.add(hash);
  }
});


test('direct composition preserves project data outside the active loop and respects instrument identity', () => {
  const options = {genre:8, seed:223, bpm:131, root:38, scale:1, intensity:0.7, complexity:0.8};
  const material = generateSession(createProject, options);
  const partial = createProject('forge').scenes[0].patterns[0];
  partial.length = 7;
  const hidden = structuredClone(partial.steps.slice(7));
  writeGeneratedPattern(material, 3, 'industrial', partial, options, true);
  assert.deepEqual(partial.steps.slice(0, 7), material.scenes[3].patterns[3].steps.slice(0, 7));
  assert.deepEqual(partial.steps.slice(7), hidden);
  assert.notEqual(partial.steps[5], material.scenes[3].patterns[3].steps[5]);
  for (const track of material.tracks) {
    const short = {length:1, steps:[null]};
    writeGeneratedPattern(material, 0, track.instrument, short, options, true);
    assert.ok(short.steps[0], track.name);
  }
  const empty = {length:16, steps:Array(16).fill(null)};
  writeGeneratedPattern(material, 4, 'kick', empty, options, false);
  assert.ok(empty.steps.every(n => n === null), 'a scene retains its arranged rests');
});
