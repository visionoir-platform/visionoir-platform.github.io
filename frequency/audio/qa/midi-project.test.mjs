import assert from 'node:assert/strict';
import test from 'node:test';
import { projectFromMidi } from '../midi-project.js';
import { totalBars } from '../model.js';
import { arrangementAt, planStep } from '../sequencer.js';

const ticksPerStep = 120;
const event = (tick, endTick, note = 60, velocity = 96) => ({tick, endTick, note, velocity});
const group = (notes, channel = 0, name = '') => ({track: 0, channel, name, notes});
const midi = (groups, extra = {}) => ({ppqn: 480, endTick: 1920, markers: [], tempos: [], groups, ...extra});
const sortNotes = notes => notes.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);

// Read from the actual arrangement scheduler, including chord gain, cell
// offsets and repeated patterns. Count duplicates rather than flattening pitches.
function scheduled(project) {
  const notes = [];
  for (let step = 0; step < totalBars(project) * 16; step++) {
    const { scene, local, clip } = arrangementAt(project, step);
    planStep(project, step, scene, local, (_track, note, offset, gate, velocity) => {
      const start = Math.round((step + offset) * ticksPerStep);
      notes.push([start, start + Math.round(gate * ticksPerStep), note.note, Math.round(velocity * 127)]);
    }, clip);
  }
  return sortNotes(notes);
}

test('actual scheduler preserves simultaneous notes, exact compatible chord velocities, rest, marker and drum pitches', () => {
  const events = [event(30, 390, 60, 100), event(30, 390, 66, 73), event(30, 390, 72, 73),
    event(30, 300, 43, 94), event(30, 390, 60, 100), event(24 * 1920 + 5, 24 * 1920 + 155, 76)];
  const drum = event(1200, 1320, 38);
  const p = projectFromMidi(midi([group(events, 0, 'Le\u0007ad'), group([drum], 9)], {
    endTick: 40 * 1920, tempos: [{tick:0, microsPerQuarter:480000}],
    markers: [{tick:0,name:'Entrata'}, {tick:22 * 1920,name:'Rientro'}, {tick:121,name:'Frazione'}],
  }), '/private/sessione.midi');
  assert.equal(p.name, 'sessione');
  assert.equal(p.bpm, 125);
  assert.equal(totalBars(p), 40);
  assert.equal(p.tracks[0].name, 'Le ad');
  assert.equal(p.tracks.at(-1).instrument, 'schranz');
  assert.deepEqual(p.scenes[0].patterns[0].steps[0].chord, [6, 12]);
  assert.deepEqual(p.arrangement.filter(part => part.marker).map(part => part.marker), ['Entrata','Rientro']);
  assert.equal(arrangementAt(p, 22 * 16).clip.marker, 'Rientro');
  assert.deepEqual(scheduled(p), sortNotes([...events, drum].map(e => [e.tick, e.endTick, e.note, e.velocity])));
});

test('a fifth sustained voice is moved to another lane and the final partial bar is padded', () => {
  const events = Array.from({length:5}, (_, i) => event(i * 120, 700 + i * 10, 48 + i));
  const p = projectFromMidi(midi([group(events)], {endTick:1000}), 'rientro.mid');
  assert.equal(p.name, 'rientro');
  assert.equal(p.bpm, 120);
  assert.equal(p.tracks.length, 2);
  assert.equal(totalBars(p), 1);
  assert.deepEqual(scheduled(p), events.map(e => [e.tick, e.endTick, e.note, e.velocity]));
});

test('midpoint timing stays within one percent of a sixteenth and thousands of silent bars reuse a scene', () => {
  const p = projectFromMidi(midi([group([event(60, 180)])], {endTick: 5100 * 1920}), 'pause.mid');
  const midpoint = p.scenes[0].patterns[0].steps[1];
  assert.ok(Math.abs(1 + midpoint.offset - .5) < .01001);
  assert.equal(midpoint.gate, 1);
  assert.equal(totalBars(p), 5100);
  assert.equal(p.scenes.length, 2);
  assert.equal(p.arrangement.length, 3);
});

test('rejects unrepresentable tempi, gates, polyphony and invalid event data with import-specific errors', () => {
  const one = [group([event(0, 120)])];
  assert.throws(() => projectFromMidi(midi([], {})), /midiImportNoNotes/);
  assert.throws(() => projectFromMidi(midi(one, {tempos: [{tick:100, microsPerQuarter:400000}]})), /midiImportUnsupported/);
  assert.throws(() => projectFromMidi(midi(one, {tempos: [{tick:0, microsPerQuarter:150000}]})), /midiImportUnsupported/);
  assert.throws(() => projectFromMidi(midi([group([event(0, 1)])])), /midiImportUnsupported/);
  assert.throws(() => projectFromMidi(midi([group([event(0, 129 * 120)])], {endTick:129 * 120})), /midiImportUnsupported/);
  assert.throws(() => projectFromMidi(midi([group([event(0, 120, 140)])])), /midiImportInvalid/);
  assert.throws(() => projectFromMidi(midi([group(Array.from({length:33}, (_, i) => event(0, 120, 40 + i)))])), /midiImportTooLarge/);
  assert.throws(() => projectFromMidi(midi(one, {endTick:1920 * 20000})), /midiImportTooLarge/);
});
