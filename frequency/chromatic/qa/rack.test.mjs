import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, projectFile, readProject } from '../../audio/model.js';
import { labels } from '../labels.js';
import { defaultVisual, mixVisualVoices, normalizeVisual, readPresetBank, routes, sceneLook } from '../model.js';

test('legacy local preset and two independent memories survive .vfreq transport', async () => {
  const old = { ...defaultVisual(), mode: 'inferno', warp: 0.42, color: '#bb3344' };
  const bank = readPresetBank(old);
  assert.equal(bank.slots.length, 8);
  assert.deepEqual(bank.slots[0], old);
  assert.equal(bank.slots[1], null);
  bank.selected = 1;
  bank.slots[1] = { ...old, mode:'spectral-echo', warp:0.73, midi:{ '2:91':'warp' } };
  bank.slots[1].automation = [{ scene: 2, mode: 'inferno', look: sceneLook(old) }];
  const p = createProject('blank');
  p.visual = { ...bank.slots[1], presetBank: bank };
  const loaded = (await readProject(projectFile(p))).visual;
  assert.deepEqual(readPresetBank(loaded.presetBank), bank);
  assert.deepEqual(normalizeVisual(loaded).automation, bank.slots[1].automation);
  const archive = readPresetBank({ selected: 80, slots: [false, ...Array(12).fill({...old, presetBank: bank})] });
  assert.equal(archive.selected, 0);
  assert.equal(archive.slots[0], null);
  assert.equal(archive.slots[7].presetBank, undefined);
  assert.equal(archive.slots.length, 8);
});

test('scene looks transfer every musical parameter and preserve legacy mode-only cues', () => {
  const s = { ...defaultVisual(), freeze:true, auto:true, color:'#17175a', sync:false, intensity:0.8 };
  s.mapping[0] = 'fracture';
  const look = sceneLook(s);
  assert.equal(look.freeze, undefined);
  assert.equal(look.auto, undefined);
  assert.deepEqual([look.color, look.sync, look.intensity, look.mapping[0]], ['#17175a', false, 0.8, 'fracture']);
  assert.deepEqual(normalizeVisual({automation:[{scene:1,mode:'inferno'}]}).automation, [{scene:1,mode:'inferno'}]);
  for (const locale of ['it','en','es','ru','de','zh-Hans','ja','pt-BR','pt-PT','ko','pl','fr','uk','ar','sw','de-CH','fr-CH','it-CH','rm-CH']) {
    assert.ok(labels(locale).presetSlot);
    if (locale !== 'en') assert.notEqual(labels(locale).presetSlot, labels('en').presetSlot);
  }
});

test('kick reactivity follows the instrument through remaps, including shared destinations and manual hits', () => {
  const s = { ...defaultVisual(), kick:0.25, sensitivity:1 };
  [s.mapping[0],s.mapping[1]] = [routes[1],routes[0]];
  const voices = new Float32Array(16), envelope = new Float32Array(16),
    hits = new Float32Array(16), levels = new Float32Array(16);
  hits[0] = 1;
  levels[1] = 0.75;
  mixVisualVoices(voices,envelope,hits,levels,s,1);
  assert.equal(voices[1], 0.25);
  assert.equal(voices[0], 0.75);
  s.mapping[0] = routes[0];
  mixVisualVoices(voices,envelope,hits,levels,s,1);
  assert.equal(voices[0], 0.75);
  assert.equal(voices[1], 0);
});
