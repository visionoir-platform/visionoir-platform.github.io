export const liveEffectIds = ['dj', 'repeat', 'glitch', 'freeze'];
export const liveEffectRest = id => id === 'dj' ? 0.5 : 0;

// MIDI's centre detent is 64. Both halves reach their respective endpoints.
export function liveEffectCC(id, cc) {
  if (id !== 'dj') return cc / 127;
  return cc <= 64 ? cc / 128 : 0.5 + (cc - 64) / 126;
}

export function setLiveEffectAmount(rack, id, amount) {
  const bypass = amount === liveEffectRest(id);
  const index = rack.findIndex(effect => effect.id === id);
  if (index >= 0) {
    rack[index].amount = amount;
    rack[index].bypass = bypass;
    return index;
  }
  if (bypass) return -1;
  if (rack.length >= 12) throw new RangeError('FX');
  rack.push({id, amount, bypass});
  return rack.length - 1;
}
