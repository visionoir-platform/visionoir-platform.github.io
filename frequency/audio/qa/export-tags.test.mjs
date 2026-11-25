import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject, projectFile, readProject } from '../model.js';
import { renderOffline, estimateExport } from '../offline.js';
import { renderMidi } from '../formats.js';
import { exportBasename, musicTags } from '../metadata.js';

test('named exports preserve explicit Unicode credits, sample format and duration in decoded output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frequency-tags-'));
  const project = createProject('forge');
  const title = 'Luce 月 · جزء', artist = 'Artista É / 鈴';
  project.exportInfo = { title, artist, filename:'Sessione 東京.wav' };
  try {
    assert.deepEqual((await readProject(projectFile(project))).exportInfo, project.exportInfo);
    assert.equal(exportBasename(project), 'Sessione 東京');
    for (const format of ['wav', 'flac', 'aiff', 'mp3']) {
      const opts = {format, bits:24, scene:0, bars:0.125, sampleRate:48000, tail:0};
      const output = await renderOffline(project, opts);
      const path = join(dir, exportBasename(project) + '.' + format);
      await writeFile(path, Buffer.from(await output.arrayBuffer()));
      const info = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','format_tags:stream=channels,sample_rate','-of','json',path]));
      const tags = Object.fromEntries(Object.entries(info.format.tags).map(([k,v])=>[k.toLowerCase(),v]));
      assert.equal(tags.title,title,format);
      assert.equal(tags.artist,artist,format);
      assert.equal(Number(info.streams[0].sample_rate),48000);
      assert.equal(info.streams[0].channels,2);
      const pcm=execFileSync('ffmpeg',['-v','error','-xerror','-i',path,'-f','s16le','-']);
      if(format==='mp3') assert.ok(pcm.length>0);
      else assert.equal(pcm.length,estimateExport(project,opts).frames*4);
    }
    const midi = Buffer.from(await renderMidi(project).arrayBuffer());
    assert.ok(midi.includes(Buffer.from(title)));
    assert.ok(midi.includes(Buffer.from('Artist: '+artist)));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('export names safely handle old projects, empty fields and reserved filenames', () => {
  assert.deepEqual(musicTags({name:'Legacy'}),{title:'Legacy',artist:''});
  assert.equal(exportBasename({name:'Factory'}),'Factory');
  assert.equal(exportBasename({name:'Factory',exportInfo:{filename:'CON.WAV'}}),'_CON');
  assert.equal(exportBasename({name:'. .',exportInfo:{filename:' '}}),'Frequency');
  assert.equal(exportBasename({name:'foo/bar'}),'foo-bar');
});
