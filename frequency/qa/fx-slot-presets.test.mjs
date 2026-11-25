import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAINS } from '../audio/library.js';
import { EFFECTS } from '../audio/model.js';
import { factorySlotPresets, renderEffectSlot } from '../fx-rack.js';
import { masterPanel } from '../views.js';

test('every effect recalls exact factory settings, including zero, in either insert rack', () => {
  for (const effect of EFFECTS) {
    const presets = factorySlotPresets(effect.id);
    assert.ok(presets.length > 0, effect.id);
    assert.equal(new Set(presets.map(preset => preset.key)).size, presets.length);
    for (const preset of presets) {
      const [chainId, position] = preset.key.split('/');
      const source = CHAINS.find(chain => chain.id === chainId).fx[Number(position)];
      assert.equal(source.id, effect.id);
      assert.equal(source.amount, preset.amount);
    }
  }
  const mono = factorySlotPresets('stereo').find(entry => entry.name === 'Mono check');
  assert.equal(mono.amount, 0);
  for (const section of ['masterfx', 'trackfx']) {
    const slot = { id: 'stereo', bypass: true, amount: 0 };
    const markup = renderEffectSlot(slot, 0, [slot], section, id => id);
    assert.ok(markup.includes('value="' + mono.key + '" selected'));
    assert.ok(markup.includes('data-field="fx-slot-preset:0"'));
    assert.ok(markup.includes('data-field="' + section + ':0"'));
    assert.match(markup, /data-action="fx-bypass"[^>]+aria-pressed="true"/);
  }
});

test('the master insert dialog cannot reopen itself and the performance panel still links to it', () => {
  const state = { p: { master: { volume: 0.8, ceiling: 0.95 } } };
  const t = id => id;
  assert.match(masterPanel(state, t), /data-action="master-fx"/);
  assert.doesNotMatch(masterPanel(state, t, false), /data-action="master-fx"/);
});
