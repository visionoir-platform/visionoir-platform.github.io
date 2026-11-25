import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject, createTrack } from '../model.js';
import { renderMidi, midiBundleFiles } from '../formats.js';

function fourBars() {
  const project = createProject();
  project.arrangement = [{ scene: 0, bars: 4 }];
  const pat = project.scenes[0].patterns[0];
  pat.length = 64;
  pat.steps = Array(64).fill(null);
  return project;
}

// Read the emitted SMF delta times and message lengths independently of the writer.
async function readTracks(project, file = renderMidi(project), expectedTracks = project.tracks.length + 1) {
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(bytes.readUInt16BE(12), 480);
  const tracks = [];
  let pos = 14;
  function delta() {
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const byte = bytes.readUInt8(pos++);
      total = total * 128 + (byte & 127);
      if (!(byte & 128)) return total;
    }
    throw Error('Invalid MIDI variable-length quantity');
  }
  while (pos < bytes.length) {
    assert.equal(bytes.toString('ascii', pos, pos + 4), 'MTrk');
    const end = pos + 8 + bytes.readUInt32BE(pos + 4);
    pos += 8;
    let tick = 0;
    const track = { end: null, notesOff: [], port: null, device: null, channels: new Set() };
    while (pos < end) {
      tick += delta();
      const status = bytes.readUInt8(pos++);
      if (status === 0xff) {
        const meta = bytes.readUInt8(pos++);
        const size = delta();
        if (meta === 0x21) track.port = bytes.readUInt8(pos);
        if (meta === 9) track.device = bytes.toString('utf8', pos, pos + size);
        pos += size;
        if (meta === 0x2f) {
          assert.equal(size, 0);
          assert.equal(pos, end);
          track.end = tick;
        }
      } else {
        assert([0x80, 0x90, 0xb0].includes(status & 0xf0));
        track.channels.add(status & 15);
        if ((status & 0xf0) === 0x80) track.notesOff.push(tick);
        pos += 2;
      }
    }
    assert.notEqual(track.end, null);
    tracks.push(track);
  }
  assert.equal(tracks.length, expectedTracks);
  assert.equal(bytes.readUInt16BE(10), expectedTracks);
  return tracks;
}

test('four empty bars occupy 7680 ticks in every SMF track, including the conductor', async () => {
  const project = fourBars();
  const tracks = await readTracks(project);
  assert(tracks.every((track) => track.end === 7680));
});

test('a short note preserves all trailing silent bars', async () => {
  const project = fourBars();
  project.scenes[0].patterns[0].steps[0] = { note: 60, velocity: 1, gate: 1 };
  const tracks = await readTracks(project);
  assert.deepEqual(tracks[1].notesOff, [120]);
  assert(tracks.every((track) => track.end === 7680));
});

test('a sustained final note extends the common song end beyond the arrangement', async () => {
  const project = fourBars();
  project.scenes[0].patterns[0].steps[63] = { note: 60, velocity: 1, gate: 4 };
  const tracks = await readTracks(project);
  assert.deepEqual(tracks[1].notesOff, [8040]);
  assert(tracks.every((track) => track.end === 8040));
});

test('a 32-channel project has independent MIDI routes and two aligned per-port files in the ZIP', async () => {
  const project = fourBars();
  const files16 = midiBundleFiles(project);
  assert.deepEqual(files16.map(file => file.name), ['sequence.mid']);
  for (let i = 16; i < 32; i++) {
    project.tracks.push(createTrack('acid', i));
    for (const scene of project.scenes) scene.patterns.push(structuredClone(scene.patterns[0]));
  }
  const files = midiBundleFiles(project);
  assert.deepEqual(files.map(file => file.name), ['sequence.mid', 'midi/port-1.mid', 'midi/port-2.mid']);
  const full = await readTracks(project, files[0].blob);
  for (let i = 0; i < 32; i++) {
    const track = full[i + 1], port = Math.floor(i / 16);
    assert.equal(track.port, port);
    assert.equal(track.device, `FREQUENCY ${port + 1}`);
    assert.deepEqual([...track.channels], [i % 16]);
  }
  for (const port of [0, 1]) {
    const split = await readTracks(project, files[port + 1].blob, 17);
    assert.deepEqual(split[0], full[0]);
    assert.deepEqual(split.slice(1), full.slice(port * 16 + 1, port * 16 + 17));
  }
});
