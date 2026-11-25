import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject, projectFile, readProject, totalBars, validateProject } from '../model.js';
import { EXTRA_DEMOS } from '../library.js';
import { arrangementAt, planStep } from '../sequencer.js';
import { renderMidi } from '../formats.js';

function playScore(project) {
  const sections = project.arrangement.map(() => ({players: new Set(), events: []}));
  let section = -1;
  for (let step = 0; step < totalBars(project) * 16; step++) {
    const {clip, local, scene} = arrangementAt(project, step);
    if (local === 0) section++;
    const current = sections[section];
    planStep(project, step, scene, local, (channel, event, offset, gate) => {
      current.players.add(project.tracks[channel].instrument);
      current.events.push([local, channel, event.note, offset, gate]);
    }, clip);
  }
  return sections;
}

test('the 12 factory scores have distinct orders, lengths, orchestrations and played endings', async () => {
  const orders = new Set(), durations = new Set(), voices = new Set(), codas = new Set();
  for (const {id} of EXTRA_DEMOS) {
    const project = validateProject(createProject(id));
    const sections = playScore(project);
    const order = project.arrangement.map(clip => clip.scene);
    assert.ok(sections.every(section => section.events.length), id + ': empty section');
    assert.ok(new Set(order).size < order.length, id + ': no returning section');
    assert.ok(project.arrangement.some(clip => clip.trackScenes?.includes(-1)), id + ': no instrumental cut');
    assert.ok(sections.some(section => section.players.size >= 8), id + ': missing full ensemble');
    assert.ok(sections.some(section => section.players.size <= 3), id + ': missing contrast');
    orders.add(order.join('/'));
    durations.add(project.arrangement.map(clip => clip.bars).join('/'));
    voices.add(sections.map(section => [...section.players].sort().join(',')).join('/'));
    const final = sections.at(-1), clip = project.arrangement.at(-1);
    codas.add(JSON.stringify(final.events.map(([on, ch, pitch]) => [on,ch,pitch])));
    assert.ok(final.events.length >= 5 && final.players.size >= 2, id + ': incomplete cadence');
    assert.ok(final.events.every(([on,, , offset, gate]) => on + offset + gate < clip.bars * 16), id + ': truncated ending');
    const midi = Buffer.from(await renderMidi(project).arrayBuffer());
    assert.equal(midi.toString('ascii',0,4),'MThd');
    for (const part of project.arrangement) assert.ok(midi.includes(Buffer.from(part.marker)), id + ': missing MIDI marker');
    assert.deepEqual(await readProject(projectFile(project)), project);
  }
  assert.deepEqual([orders.size, durations.size, voices.size, codas.size], [12,12,12,12]);
});

test('restoring an older 8-scene .vfreq retains its saved arrangement and its edited ending', async () => {
  const legacy = createProject('oblique');
  legacy.scenes = legacy.scenes.slice(0,8);
  legacy.arrangement = [8,8,16,16,8,8,16,8].map((bars,scene) => ({scene,bars}));
  legacy.scenes[7].name = 'Custom ending';
  legacy.scenes[7].patterns[0].steps[0].note = 49;
  const disk = new Blob([JSON.stringify(legacy)],{type:'application/json'});
  const imported = await readProject(disk);
  assert.deepEqual(imported, legacy);
  assert.deepEqual(await readProject(projectFile(imported)), legacy);
});
