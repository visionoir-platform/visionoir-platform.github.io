import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProject } from '../model.js';
import { renderOffline } from '../offline.js';
import { writeZip } from '../formats.js';
import { renderStemArchive } from '../stem-archive.js';

test('streamed ZIP32 checks layout before doing audio work and rejects an incomplete member', async () => {
  const emit = () => assert.fail('oversized archive started rendering');
  await assert.rejects(writeZip([{name: 'too-large', size: 0xffffffff, emit}], emit), /zipLimit/);
  await assert.rejects(writeZip([{name: 'short', size: 4, emit: w => w(Uint8Array.of(1))}], () => {}), /zipSize/);
});

test('ZIP stems preserve project, MIDI and each WAV in disk and bounded in-memory modes', async () => {
  const project = createProject('forge');
  const options = { bits: 24, channels: 1, scene: 0, bars: 0.03125, tail: 0, sampleRate: 44100 };
  const dir = await mkdtemp(join(tmpdir(), 'frequency-stem-archive-'));
  try {
    const reference = await renderOffline(project, { ...options, track: 0 });
    for (const disk of [false, true]) {
      const written = [];
      let closed = false;
      const handle = {
        async createWritable() {
          return { write: bytes => written.push(bytes), close() {closed = true;}, abort() {} };
        },
        async getFile() {assert.ok(closed);return new Blob(written);}
      };
      const output = await renderStemArchive(project, { ...options, handle: disk ? handle : null });
      const file = join(dir, (disk ? 'disk' : 'memory') + '.zip');
      await writeFile(file, new Uint8Array(await output.arrayBuffer()));
      execFileSync('unzip', ['-tq', file]);
      const names = execFileSync('unzip', ['-Z1', file], {encoding:'utf8'}).trim().split('\n');
      assert.equal(names.length, project.tracks.length + 2);
      assert.deepEqual(names.slice(0, 2), ['project.vfreq', 'sequence.mid']);
      assert.deepEqual(execFileSync('unzip', ['-p', file, names[2]]), Buffer.from(await reference.arrayBuffer()));
      if (disk) assert.ok(written.length > names.length * 3);
    }
    await assert.rejects(renderStemArchive(project, {}), /storageRequired/);
    let aborted = false;
    const failed = {createWritable:async()=>({write(){throw Error('disk-full');},abort(){aborted=true;}})};
    await assert.rejects(renderStemArchive(project, {...options, handle:failed}), /disk-full/);
    assert.ok(aborted);
  } finally {
    await rm(dir, {recursive: true, force:true});
  }
});
