import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../model.js';
import { estimateExport, exportLoop, renderOffline } from '../offline.js';

test('the bounce cuts the exact arrangement loop at both frame boundaries', async () => {
  const project = createProject();
  project.bpm = 137;
  project.arrangement = [0, 1, 2, 3].map(scene => ({scene, bars:1}));
  project.scenes[1].patterns[0].steps[0] = {note:40, velocity:1, gate:1};
  project.scenes[2].patterns[1].steps[6] = {note:52, velocity:0.8, gate:1};
  project.loop = {start:1, end:3, on:false};
  const opts = {format:'wav', bits:32, channels:1, sampleRate:44100};
  const range = { ...opts, region:'loop', bars:1, startBar:0, scene:0 };
  const spec = estimateExport(project,range);
  const boundary = n => Math.round(n * 240 / project.bpm * opts.sampleRate);
  assert.equal(spec.start,boundary(1));
  assert.equal(spec.scene,null);
  assert.equal(spec.frames,boundary(3)-boundary(1));
  assert.equal(estimateExport(project,{...range,tail:0.1}).frames,spec.frames+4410);

  const whole = Buffer.from(await (await renderOffline(project,{...opts,tail:0})).arrayBuffer());
  const cut = Buffer.from(await (await renderOffline(project,range)).arrayBuffer());
  const pcm = b => b.subarray(b.indexOf('data')+8);
  const segment = pcm(cut);
  assert.equal(segment.length, spec.frames*4);
  assert.ok(segment.some(value => value !== 0));
  assert.deepEqual(segment,pcm(whole).subarray(boundary(1)*4,boundary(3)*4));

  project.loop.on = true;
  assert.equal(estimateExport(project,range).start,spec.start);
  assert.equal(estimateExport(project,{...opts,scene:1,bars:1,tail:0}).frames,boundary(1));
});

test('missing and stale loop markers cannot accidentally export the full song', () => {
  const project = createProject();
  for (const loop of [undefined,{start:2,end:2,on:false},{start:0,end:90,on:true}]) {
    project.loop = loop;
    assert.equal(exportLoop(project),null);
    assert.throws(() => estimateExport(project,{region:'loop'}),/export.loop/);
  }
});

test('MP3 estimates follow CBR frame padding and metadata at each offered bitrate', async () => {
  const project = createProject();
  project.exportInfo = {title:'Prova 音', artist:'Studio'};
  for (const sampleRate of [44100,48000]) {
    let previous = 0;
    for (const bitrate of [128,192,256,320]) {
      const opts = {format:'mp3',bitrate,sampleRate,scene:0,bars:0.125,tail:0};
      const spec = estimateExport(project,opts);
      const file = await renderOffline(project,opts);
      assert.ok(spec.bytes > previous);
      assert.ok(Math.abs(file.size-spec.bytes)<=1, JSON.stringify({sampleRate,bitrate,actual:file.size,estimate:spec.bytes}));
      previous = spec.bytes;
    }
  }
});
