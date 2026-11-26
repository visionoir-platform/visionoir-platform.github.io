import { trackAccents } from '../palette.js';

export function fallbackMaterial(track, look) {
  if (look === 'natural') {
    return { poster: '-natural', atlas: '-natural' };
  }
  const light = track !== 'chrome' && Object.hasOwn(trackAccents, track) ? '-' + track : '';
  const finish = light + (look === 'liquid' ? '-liquid' : '');
  return { poster: finish, atlas: finish };
}
