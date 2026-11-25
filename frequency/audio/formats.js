import { totalBars, clamp, validateProject } from './model.js';
import { midiAutomation } from './automation.js';
import { arrangementAt, planStep } from './sequencer.js';
const ascii = (view, off, text) => {
  for (let i = 0; i < text.length; i++) view.setUint8(off + i, text.charCodeAt(i));
};
export function wavHeader({ frames, sampleRate, bits, channels, title = '', rf64 = false }) {
  const data = frames * channels * (bits / 8);
  if (!Number.isSafeInteger(frames) || frames < 0 || !Number.isSafeInteger(data))
    throw Error('export.riffLimit');
  const name = new TextEncoder().encode(title.slice(0, 240) + '\0');
  const titleLen = name.length + (name.length % 2), info = title ? 20 + titleLen : 0;
  const classicRiffSize = 36 + info + data + data % 2;
  const extended = rf64 || classicRiffSize >= 0xffffffff;
  const ds64 = extended ? 36 : 0, fact = extended && bits === 32 ? 12 : 0;
  const bytes = new Uint8Array(44 + ds64 + fact + info), v = new DataView(bytes.buffer);
  ascii(v, 0, extended ? 'RF64' : 'RIFF');
  v.setUint32(4, extended ? 0xffffffff : classicRiffSize, true);
  ascii(v, 8, 'WAVE');
  if (extended) {
    // EBU Tech 3306: riffSize excludes the first eight bytes and includes the final alignment byte.
    ascii(v, 12, 'ds64');
    v.setUint32(16, 28, true);
    v.setBigUint64(20, BigInt(classicRiffSize + ds64 + fact), true);
    v.setBigUint64(28, BigInt(data), true);
    v.setBigUint64(36, BigInt(frames), true);
    v.setUint32(44, 0, true);
  }
  let at = 12 + ds64;
  ascii(v, at, 'fmt ');
  v.setUint32(at + 4, 16, true);
  v.setUint16(at + 8, bits === 32 ? 3 : 1, true);
  v.setUint16(at + 10, channels, true);
  v.setUint32(at + 12, sampleRate, true);
  v.setUint32(at + 16, sampleRate * channels * (bits / 8), true);
  v.setUint16(at + 20, channels * (bits / 8), true);
  v.setUint16(at + 22, bits, true);
  at += 24;
  if (fact) {
    ascii(v, at, 'fact');
    v.setUint32(at + 4, 4, true);
    v.setUint32(at + 8, Math.min(frames, 0xffffffff), true);
    at += fact;
  }
  if (info) {
    ascii(v, at, 'LIST');
    v.setUint32(at + 4, 12 + titleLen, true);
    ascii(v, at + 8, 'INFOINAM');
    v.setUint32(at + 16, name.length, true);
    bytes.set(name, at + 20);
    at += info;
  }
  ascii(v, at, 'data');
  v.setUint32(at + 4, extended ? 0xffffffff : data, true);
  return bytes;
}
export function wavPCM(l, r, n, bits, channels, scale, random) {
  const b = new Uint8Array((n * channels * bits) / 8),
    v = new DataView(b.buffer);
  let off = 0;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels; c++) {
      const raw = scale * (channels === 1 ? (l[i] + r[i]) * 0.5 : c ? r[i] : l[i]);
      if (!Number.isFinite(raw)) throw Error('export.nonfinite');
      if (bits === 32) {
        v.setFloat32(off, raw, true);
        off += 4;
        continue;
      }
      const max = 2 ** (bits - 1),
        d = random.next() - random.next(),
        sample = clamp(Math.round(raw * max + d), -max, max - 1);
      if (bits === 16) {
        v.setInt16(off, sample, true);
        off += 2;
      } else {
        b[off++] = sample;
        b[off++] = sample >> 8;
        b[off++] = sample >> 16;
      }
    }
  return b;
}
export class Dither {
  constructor() {
    this.state = 19735124;
  }
  next() {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}
const u16be = (n) => [(n >> 8) & 255, n & 255],
  u32be = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function vlq(n) {
  let r = [n & 127];
  while ((n >>>= 7)) r.unshift((n & 127) | 128);
  return r;
}
const encoder = new TextEncoder();
function midiTrackChunks(p) {
  validateProject(p);
  const ppqn = 480,
    stepTicks = ppqn / 4,
    tempo = Math.round(60e6 / p.bpm);
  const tracks = p.tracks.map(() => []),
    meta = [];
  const text = (str, type) => {
    const b = encoder.encode(str);
    return [255, type, ...vlq(b.length), ...b];
  };
  meta.push(
    { tick: 0, bytes: [255, 81, 3, tempo >>> 16, (tempo >>> 8) & 255, tempo & 255] },
    { tick: 0, bytes: [255, 88, 4, 4, 2, 24, 8] },
  );
  const channel = (i) => i % 16;
  p.tracks.forEach((t, i) => {
    const events = tracks[i];
    events.push({ tick: 0, bytes: text(t.name, 3) });
    if (p.tracks.length > 16) {
      const port = Math.floor(i / 16);
      events.push({ tick: 0, bytes: text(`FREQUENCY ${port + 1}`, 9) });
      events.push({ tick: 0, bytes: [255, 33, 1, port] });
    }
    events.push(
      { tick: 0, bytes: [176 | channel(i), 7, Math.round(t.volume * 127)] },
      { tick: 0, bytes: [176 | channel(i), 10, Math.round((t.pan + 1) * 63.5)] },
    );
  });
  const end = totalBars(p) * 16;
  if (end > 300000) throw Error('export.midiSize');
  midiAutomation(p, stepTicks, (i,tick,cc,value) => {
    tracks[i].push({tick, bytes: [176 | channel(i), cc, value]});
  });
  let endTick = end * stepTicks;
  for (let step = 0; step < end; step++) {
    const { scene, local, clip } = arrangementAt(p, step);
    if (local === 0)
      meta.push({ tick: step * stepTicks, bytes: text(clip.marker || p.scenes[scene].name, 6) });
    planStep(
      p,
      step,
      scene,
      local,
      (i, s, offset, gate, velocity) => {
        const at = Math.max(0, Math.round((step + offset) * stepTicks)),
          note = clamp(Math.round(s.note), 0, 127),
          on = clamp(Math.round(velocity * (s.accent ? 1.17 : 1) * 127), 1, 127);
        const off = at + Math.max(1, Math.round(gate * stepTicks));
        endTick = Math.max(endTick, off);
        tracks[i].push(
          { tick: at, bytes: [144 | channel(i), note, on] },
          { tick: off, bytes: [128 | channel(i), note, 0] },
        );
      },
      clip,
    );
  }
  const chunks = [];
  for (const events of [meta, ...tracks]) {
    events.sort((a, b) => a.tick - b.tick);
    let prev = 0;
    const bytes = [];
    for (const e of events) {
      bytes.push(...vlq(e.tick - prev), ...e.bytes);
      prev = e.tick;
    }
    bytes.push(...vlq(endTick - prev), 255, 47, 0);
    chunks.push(new Blob([
      Uint8Array.from([...encoder.encode('MTrk'), ...u32be(bytes.length)]),
      Uint8Array.from(bytes),
    ]));
  }
  return { chunks, ppqn };
}
function midiFile(chunks, ppqn) {
  const header = Uint8Array.from([...encoder.encode('MThd'), 0, 0, 0, 6, 0, 1, ...u16be(chunks.length), ...u16be(ppqn)]);
  return new Blob([header, ...chunks], { type: 'audio/midi' });
}
export function renderMidi(project) {
  const { chunks, ppqn } = midiTrackChunks(project);
  return midiFile(chunks, ppqn);
}
export function midiBundleFiles(project) {
  const { chunks, ppqn } = midiTrackChunks(project);
  const files = [{ name: 'sequence.mid', blob: midiFile(chunks, ppqn) }];
  if (project.tracks.length > 16) {
    for (let first = 1, port = 1; first < chunks.length; first += 16, port++) {
      files.push({ name: `midi/port-${port}.mid`, blob: midiFile([chunks[0], ...chunks.slice(first, first + 16)], ppqn) });
    }
  }
  return files;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
async function crc(blob) {
  let c = 0xffffffff;
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const b of value) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    }
  } finally {
    reader.releaseLock();
  }
  return (c ^ 0xffffffff) >>> 0;
}
export async function zipFiles(files) {
  if (files.length > 65535) throw Error('export.zipLimit');
  const out = [],
    central = [],
    names = new Set();
  let head = 0,
    dirSize = 0;
  for (const { name, blob } of files) {
    if (!name || name.includes('..') || name.startsWith('/') || name.includes('\\') || names.has(name))
      throw Error('export.zipName');
    names.add(name);
    const file = encoder.encode(name);
    const projected = head + 30 + file.length + blob.size + dirSize + 46 + file.length + 22;
    if (file.length > 65535 || projected >= 0xffffffff) throw Error('export.zipLimit');
    const sum = await crc(blob);
    const loc = new Uint8Array(30 + file.length),
      v = new DataView(loc.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 2048, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, sum, true);
    v.setUint32(18, blob.size, true);
    v.setUint32(22, blob.size, true);
    v.setUint16(26, file.length, true);
    loc.set(file, 30);
    const cen = new Uint8Array(46 + file.length),
      w = new DataView(cen.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    cen.set(loc.subarray(4, 30), 6);
    w.setUint32(42, head, true);
    cen.set(file, 46);
    out.push(loc, blob);
    central.push(cen);
    head += loc.length + blob.size;
    dirSize += cen.length;
  }
  const end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true);
  v.setUint16(10, files.length, true);
  v.setUint32(12, dirSize, true);
  v.setUint32(16, head, true);
  return new Blob([...out, ...central, end], { type: 'application/zip' });
}
