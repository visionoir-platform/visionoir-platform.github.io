import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProject, projectFile } from '../model.js';
import { readProjectFile as readProject } from '../project-archive.js';
import { midiBundleFiles, writeZip, zipFiles } from '../formats.js';

const project = createProject('blank');
project.name = 'Cantiere · 工房';
project.tracks.find(track => track.instrument === 'sampler').sample = {
  name: 'Take.wav', rate: 48000, pcm: Buffer.from([0, 0, 1, 0, 3, 0, 5, 0]).toString('base64'),
};
const document = projectFile(project, 1);
const projectBundle = () => zipFiles([{ name: 'project.vfreq', blob: document }, ...midiBundleFiles(project)]);

test('open the exported MIDI and project bundle, as well as plain V1 JSON', async () => {
  assert.deepEqual(await readProject(await projectBundle()), project);
  assert.deepEqual(await readProject(document), project);
});

test('read a stored project written with data descriptors without loading the stem payload', async () => {
  const blocks = [];
  const stemBlock = new Uint8Array(1024 * 1024);
  const entries = [
    { name: 'stems/01-Kick.wav', size: stemBlock.length * 2,
      async emit(write) { await write(stemBlock); await write(stemBlock); } },
    { name: 'project.vfreq', size: document.size,
      async emit(write) { await write(new Uint8Array(await document.arrayBuffer())); } },
  ];
  await writeZip(entries, chunk => blocks.push(chunk));
  const archive = new Blob(blocks);
  const bytesRead = [];
  const sliced = { size: archive.size, slice(start, end) {
    const part = archive.slice(start, end);
    bytesRead.push(part.size);
    return part;
  }};
  assert.deepEqual(await readProject(sliced), project);
  assert.ok(bytesRead.reduce((a, b) => a + b, 0) < 2 * document.size + 70000);
});

test('reject damaged project data and unrelated ZIP files', async () => {
  const archive = new Uint8Array(await (await projectBundle()).arrayBuffer());
  const at = Buffer.from(archive).indexOf(Buffer.from('Cantiere'));
  assert.ok(at > 0);
  archive[at] ^= 1;
  await assert.rejects(readProject(new Blob([archive])), /project.archive/);
  archive[at] ^= 1;
  archive[14] ^= 1; // Keep the payload intact while changing the local header.
  await assert.rejects(readProject(new Blob([archive])), /project.archive/);
  const unrelated = await zipFiles([{ name: 'notes.txt', blob: new Blob(['appunti']) }]);
  await assert.rejects(readProject(unrelated), /project.archive/);
  await assert.rejects(readProject(new Blob([archive.slice(0, -10)])), /project.archive/);
});
