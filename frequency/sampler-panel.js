import { sampleFrameCount } from './audio/regions.js';
import { FACTORY_SAMPLE_FRAMES, FACTORY_SAMPLE_RATE, SAMPLER_PADS, samplerBounds } from './audio/sampler-slices.js';
import { act, dial, option, pad, select } from './ui-kit.js';

function choices(track, params) {
  const frames = track.sample ? sampleFrameCount(track.sample) : FACTORY_SAMPLE_FRAMES;
  const selected = samplerBounds(frames, params);
  const rate = track.sample?.rate ?? FACTORY_SAMPLE_RATE;
  return Array.from({length:selected.count}, (_, i) => {
    const position = (i + 1) / SAMPLER_PADS;
    const bounds = samplerBounds(frames, {...params, slicePad:position});
    return { id:i + 1, position, selected:selected.pad === i + 1,
      label:pad(i + 1) + ' · ' + Math.round(1000 * bounds.lo / rate) + '–' + Math.round(1000 * bounds.hi / rate) + ' ms' };
  });
}

function menu(rows, field, t) {
  return select(t('param_sampler_slicePad'), field, option(0,t('param_sampler_slice'), !rows.some(row => row.selected)) +
    rows.map(row => option(row.position,row.label,row.selected)).join(''));
}

export function samplerLockMenu(track, params, t) {
  return menu(choices(track,params), 'lock:slicePad', t);
}

export function samplerPanel(track, t) {
  const rows = choices(track,track.params);
  const offset = rows.some(row => row.selected) ? '' : dial(t('param_sampler_slice'), 'param:slice', track.params.slice ?? 0);
  const pads = rows.map(row => act('sample-slice', pad(row.id), {
    data:'data-index="' + row.id + '"', pressed:row.selected, title:t('param_sampler_slicePad') + ' ' + row.label,
  })).join('');
  return menu(rows, 'param:slicePad', t) + offset + '<div class="bar-tools">' + pads + '</div>';
}
