import { CHAINS } from './audio/library.js';
import { EFFECTS, EQ_LIMITS } from './audio/model.js';
import { act, number, option, select, slider } from './ui-kit.js';

// The same processor runs in channel and master inserts. A slot can recall its
// setting from either kind of factory chain without replacing the surrounding rack.
const presetsByEffect = new Map();
for (const chain of CHAINS) {
  chain.fx.forEach((effect, index) => {
    if (!presetsByEffect.has(effect.id)) presetsByEffect.set(effect.id, []);
    presetsByEffect.get(effect.id).push({
      key: chain.id + '/' + index,
      name: chain.name,
      amount: effect.amount,
    });
  });
}

export function factorySlotPresets(effectId) {
  return presetsByEffect.get(effectId) || [];
}

export const liveEffectRest = id => id === 'dj' ? 0.5 : 0;

export function setLiveEffectAmount(rack, id, amount) {
  const bypass = amount === liveEffectRest(id);
  const slot = rack.find(effect => effect.id === id);
  if (slot) {
    slot.amount = amount;
    slot.bypass = bypass;
  } else if (!bypass) {
    if (rack.length >= 12) throw new RangeError('FX');
    rack.push({ id, amount, bypass });
  }
}

export function renderEffectSlot(effect, index, slots, section, t) {
  const name = EFFECTS.find(item => item.id === effect.id)?.name || effect.id;
  const presets = factorySlotPresets(effect.id);
  const choices = option('', t('select')) +
    presets.map(preset => option(preset.key, preset.name, !effect.eq && effect.amount === preset.amount)).join('');
  const data = 'data-index="' + index + '"';
  const actions = [
    act('fx-bypass', t('bypass'), { pressed: effect.bypass, data }),
    act('fx-up', '↑', { title: t('previous'), data, disabled: index === 0 }),
    act('fx-down', '↓', { title: t('next'), data, disabled: index === slots.length - 1 }),
    act('fx-remove', '×', { title: t('remove'), data }),
  ].join('');
  let controls = slider(name, section + ':' + index, effect.amount);
  if (effect.id === 'eq') {
    const mode = select(name, 'eq-mode:' + index,
      option('macro', t('eqMacro'), !effect.eq) + option('parametric', t('eqParametric'), !!effect.eq));
    if (effect.eq) {
      const labels = { frequency: t('eqFrequency') + ' (Hz)', gain: t('gain') + ' (dB)', q: 'Q' };
      controls = '<div class="fx-eq-settings">' + Object.entries(EQ_LIMITS).map(([key, bounds]) =>
        number(labels[key], 'eq-param:' + index + ':' + key, Number(effect.eq[key].toFixed(5)), ...bounds, 'any', true)
      ).join('') + '</div>';
    }
    controls = mode + controls;
  }
  return '<div>' + controls +
    select(t('presets') + ' · ' + name, 'fx-slot-preset:' + index, choices) +
    '<div class="fx-slot-actions">' + actions + '</div></div>';
}
