import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, projectFile, readProject } from '../model.js';
import { renderMidi, zipFiles } from '../formats.js';
import { readProjectFile as openFile } from '../project-archive.js';

const asFile = value => new Blob([JSON.stringify(value)]);

test('a V1 project migrates to packed V2 and back with editable off-pattern notes and samples intact', async () => {
  const original = createProject('forge');
  const note = { note: 43, velocity: 0.6, chord: [3, 7], offset: -0.18, ratchet: 3, locks: {} };
  const pattern = original.scenes[0].patterns[0];
  pattern.length = 8;
  pattern.steps = [null, null, note, null, null, null, note, null, null, note];
  original.tracks[15].sample = { name: 'Take', rate: 48000, pcm: 'AAABAA==' };
  original.visual = { user: 'example' };
  const legacy = projectFile(original, 1);
  const loaded = await readProject(legacy);
  const native = projectFile(loaded);
  const packed = JSON.parse(await native.text());
  assert.equal(packed.version, 2);
  assert.deepEqual(packed.scenes[0].patterns[0].steps, [2, note, 3, note, 2, note]);
  assert.ok(native.size < legacy.size);
  assert.deepEqual(await readProject(native), original);
  const reopened = await openFile(await zipFiles([{ name: 'project.vfreq', blob: native }]));
  assert.deepEqual(reopened, original);
  assert.deepEqual(await projectFile(reopened, 1).text(), await legacy.text());
  assert.deepEqual(await (renderMidi(reopened)).arrayBuffer(), await (renderMidi(original)).arrayBuffer());
  assert.equal(loaded.version, 1);
  assert.equal(loaded.scenes[0].patterns[0].steps.length, 10);
});

test('invalid packed lengths, malformed notes and future formats cannot replace a project', async () => {
  const packed = JSON.parse(await projectFile(createProject()).text());
  const pat = packed.scenes[0].patterns[0];
  for (const invalid of [[0], [-1], [2.5], [128, 1], [8], [16, { note: 200, velocity: 1 }]]) {
    pat.steps = invalid;
    await assert.rejects(readProject(asFile(packed)), /project\.(pattern|note)/);
  }
  await assert.rejects(readProject(asFile({ ...packed, version: 3 })), /project.version/);
  assert.throws(() => projectFile(createProject(), 3), /project.version/);
});

test('limits apply to the expanded session, including hidden steps', async () => {
  const packed = JSON.parse(await projectFile(createProject()).text());
  const channel = packed.scenes[0].patterns[0];
  channel.steps = [128];
  const scene = { ...packed.scenes[0], patterns: Array(32).fill(channel) };
  const tracks = Array.from({length:32}, (_, i) => ({...packed.tracks[0], id: 'track-' + i}));
  await assert.rejects(readProject(asFile({ ...packed, tracks, scenes: Array(86).fill(scene) })), /project.size/);
});
