import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MIDI_FILE_BYTES, parseMidi } from '../midi-import.js';
import { renderMidi } from '../formats.js';
import { createProject } from '../model.js';
import { projectFromMidi } from '../midi-project.js';

const eot = [255,47,0];
const chunk = (id, data) => {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  return Buffer.concat([Buffer.from(id,'ascii'),size,Buffer.from(data)]);
};
function smf(tracks, format = tracks.length > 1 ? 1 : 0, division = 480) {
  return Buffer.concat([chunk('MThd',[0,format,0,tracks.length,division >>> 8,division & 255]),
    ...tracks.map(bytes => chunk('MTrk',bytes))]);
}
const metaText = (id, value) => {
  const data = Buffer.from(value);
  return [255,id,data.length,...data];
};

test('type 0 uses the shared PPQN clock, running status, velocity-zero release and overlapping voices', () => {
  const file = smf([[
    0,...metaText(3,'Étage'), 0,255,81,3,7,161,32,
    0,0xc0,29, 0,45, 0,0xd0,60, 0,0xb0,7,100,
    0,0x92,60,127, 0,64,99, 2,60,110, 8,60,0, 0,60,0,
    0,0x99,36,101, 5,0x89,36,66,
    0x81,0x01,0x82,64,0, 0,0xf0,2,0x7d,0xf7, 0,0xf7,1,0xf8,
    6,...eot,
  ]]);
  const offsetView = Buffer.concat([Buffer.from([13]),file]).subarray(1);
  assert.deepEqual(parseMidi(offsetView),{
    ppqn:480, endTick:150, tempos:[{tick:0,microsPerQuarter:500000}], markers:[],
    groups:[
      {track:0,channel:2,name:'Étage',notes:[{tick:0,endTick:10,note:60,velocity:127},
        {tick:0,endTick:144,note:64,velocity:99},{tick:2,endTick:10,note:60,velocity:110}]},
      {track:0,channel:9,name:'Étage',notes:[{tick:10,endTick:15,note:36,velocity:101}]},
    ],
  });
});

test('type 1 merges tempo and marker order across tracks and bounds an open note by its own end', () => {
  const file = smf([
    [0,255,81,3,7,161,32, 20,...metaText(6,'outro'), 20,255,81,3,6,26,128, 30,...eot],
    [0,0x98,77,46, 8,...metaText(6,'intro'), 0,...metaText(3,'Bass'), 4,...eot],
    [0,0x81,44,99, 10,0x91,50,76, 4,0x81,50,1, 9,...eot],
  ]);
  const midi = parseMidi(Buffer.concat([file,chunk('Xtra',[1,2,3])]));
  assert.equal(midi.endTick,70);
  assert.deepEqual(midi.tempos,[{tick:0,microsPerQuarter:500000},{tick:40,microsPerQuarter:400000}]);
  assert.deepEqual(midi.markers,[{tick:8,name:'intro'},{tick:20,name:'outro'}]);
  assert.deepEqual(midi.groups,[
    {track:1,channel:8,name:'Bass',notes:[{tick:0,endTick:12,note:77,velocity:46}]},
    {track:2,channel:1,name:'',notes:[{tick:10,endTick:14,note:50,velocity:76}]},
  ]);
});

test('the native MIDI export reopens with flat tempo, notes, marker and the initial mixer settings', async () => {
  const p = createProject();
  p.bpm = 120;
  p.arrangement = [{scene:0,bars:1,marker:'Opening'}];
  p.tracks[2].name = 'Pulse';
  p.tracks[2].volume = 0.33;
  p.tracks[2].pan = 0.6;
  p.scenes[0].patterns[2].steps[1] = {note:58,velocity:0.5,gate:1.5,chord:[7]};
  p.arrangement[0].automation = [{track:p.tracks[2].id,target:'pan',points:[{step:2,value:-1}]}];
  const data = parseMidi(new Uint8Array(await renderMidi(p).arrayBuffer()));
  assert.equal(data.ppqn,480);
  assert.equal(data.endTick,1920);
  assert.deepEqual(data.tempos,[{tick:0,microsPerQuarter:500000}]);
  assert.deepEqual(data.markers,[{tick:0,name:'Opening'}]);
  assert.equal(data.groups.length,1);
  assert.equal(data.groups[0].name,'Pulse');
  assert.deepEqual(data.groups[0].mix,{volume:42,pan:102});
  assert.deepEqual(data.groups[0].notes,[{tick:120,endTick:300,note:58,velocity:64},
    {tick:120,endTick:300,note:65,velocity:46}]);
  const restored = projectFromMidi(data, 'mix.mid');
  assert.equal(restored.tracks.length, 2);
  for (const track of restored.tracks) {
    assert.equal(track.volume, 42/127);
    assert.equal(track.pan, 38/63);
  }
});

test('the last matching controller at tick zero wins and a different MIDI channel keeps its own mix', () => {
  const midi = parseMidi(smf([[
    0,0xb0,7,90, 0,7,0, 0,10,64,
    0,0xb1,10,127, 0,0x90,60,96, 0,0x91,63,96,
    120,0x80,60,0, 0,0x81,63,0, 0,...eot,
  ]]));
  const [left, right] = projectFromMidi(midi, 'controls.mid').tracks;
  assert.equal(left.volume, 0);
  assert.equal(left.pan, 0);
  assert.equal(right.pan, 1);
});

test('unsupported formats, malformed chunks, invalid running status and truncated messages fail distinctly', () => {
  const bad = [
    smf([[0,60,5,0,...eot]]), smf([[0,0x90,64,0xb1,0,...eot]]),
    smf([[0,0x90,64,1,0,255,1,0,0,64,0,0,...eot]]),
    smf([[0,0x90,64,1,0,0xf7,0,0,64,0,0,...eot]]),
    smf([[0x80,0x80,0x80,0x80,0,...eot]]), smf([[0,255,1,5,1,2]]),
    smf([[0,255,81,3,0,0,0,0,...eot]]), smf([[0,255,81,2,1,2,0,...eot]]),
    smf([[0,0xf8,0,...eot]]), smf([[0,0x91,62,10]]), smf([[0,...eot,0,0x90,64,127]]),
    smf([[0,...eot],[0,...eot]],0), smf([[0,...eot]],0,0),
    smf([[0,0x91,64],[0,...eot]]), smf([[0,...eot]]).subarray(0,-1),
    chunk('MThd',[0,1,0]), Buffer.from('!'),
  ];
  for (const input of bad) assert.throws(() => parseMidi(input),{message:'midiImportInvalid'});
  for (const input of [smf([[0,...eot]],2),smf([[0,...eot]],0,0xe728)])
    assert.throws(() => parseMidi(input),{message:'midiImportUnsupported'});
  assert.throws(() => parseMidi(new Uint8Array(MAX_MIDI_FILE_BYTES+1)),{message:'midiImportTooLarge'});
  const dense = Buffer.alloc(4 + 3*100000 + 4);
  dense.set([0,0x90,60,127]);
  for (let i = 4; i < dense.length - 4; i += 3) dense.set([0,60,1],i);
  dense.set([0,...eot],dense.length-4);
  assert.throws(() => parseMidi(smf([dense])),{message:'midiImportTooLarge'});
});
