const encoder = new TextEncoder();

export function musicTags(project) {
  const clean = (text) => text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240);
  return {
    title: clean(project.exportInfo?.title ?? project.name ?? ''),
    artist: clean(project.exportInfo?.artist ?? ''),
  };
}
export function exportBasename(project) {
  let name = (project.exportInfo?.filename?.trim() || project.name || 'Frequency')
    .normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/\.(wav|mp3|aiff?|flac|mid|midi|json|zip|vfreq)$/i, '').slice(0, 100)
    .replace(/^[. ]+|[. ]+$/g, '');
  if (!name) name = 'Frequency';
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) name = '_' + name;
  return name;
}

const synchsafe = n => [n >>> 21 & 127, n >>> 14 & 127, n >>> 7 & 127, n & 127];

// ID3v2.4 uses UTF-8 text frames and synchsafe sizes in both headers.
export function id3Tag({title, artist}) {
  const frames = [];
  for (const [id, text] of [['TIT2', title], ['TPE1', artist]]) {
    if (!text) continue;
    const value = encoder.encode(text), frame = new Uint8Array(11 + value.length);
    frame.set(encoder.encode(id));
    frame.set(synchsafe(value.length + 1), 4);
    frame[10] = 3;
    frame.set(value, 11);
    frames.push(frame);
  }
  if (!frames.length) return new Uint8Array(0);
  const length = frames.reduce((sum, frame) => sum + frame.length, 0);
  const out = new Uint8Array(10 + length);
  out.set([0x49, 0x44, 0x33, 4, 0, 0, ...synchsafe(length)]);
  let pos = 10;
  for (const frame of frames) {out.set(frame, pos);pos += frame.length;}
  return out;
}
