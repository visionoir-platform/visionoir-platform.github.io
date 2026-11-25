import { INSTRUMENTS } from '../audio/model.js';

// The visual rack has one route per instrument type; users can freely reorder or duplicate
// instrument channels in a session. Keep the existing .vfreq route order.
const visualSlotByInstrument = new Map(INSTRUMENTS.map((instrument, slot) => [instrument.id, slot]));
export function visualSlotForChannel(tracks, channel) {
  return visualSlotByInstrument.get(tracks[channel]?.instrument);
}
export function collectVisualLevels(tracks, levels, target) {
  target.fill(0);
  for (let ch = 0; ch < tracks.length; ch++) {
    const slot = visualSlotForChannel(tracks, ch);
    const value = levels?.[ch];
    if (slot !== undefined && Number.isFinite(value) && value > target[slot]) target[slot] = value;
  }
  return target;
}
