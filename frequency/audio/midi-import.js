// Standard MIDI File type 0/1. All positions are in the original PPQN clock.
export const MAX_MIDI_FILE_BYTES = 4 * 1024 * 1024;
const maxTracks = 256, maxChunks = 1024, maxEvents = 250000, maxNotes = 100000, maxMetadata = 4096;
const utf8 = new TextDecoder('utf-8', {fatal:true});
const legacyText = new TextDecoder('windows-1252');
const invalid = () => { throw Error('midiImportInvalid'); };
const tooLarge = () => { throw Error('midiImportTooLarge'); };

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }
  take(size) {
    const start = this.pos;
    if (size > this.bytes.length - start) invalid();
    this.pos += size;
    return start;
  }
  number(size) {
    const start = this.take(size);
    let value = 0;
    for (let i = start; i < this.pos; i++) value = value * 256 + this.bytes[i];
    return value;
  }
  dataByte() {
    const value = this.number(1);
    if (value > 127) invalid();
    return value;
  }
  variable() {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.number(1);
      value = value * 128 + (byte & 127);
      if (byte < 128) return value;
    }
    invalid();
  }
  section(size) {
    const start = this.take(size);
    return new Reader(this.bytes.subarray(start,this.pos));
  }
}

function label(bytes) {
  // Text is descriptive only. Consume the whole event but bound display/storage work.
  const head = bytes.subarray(0,512);
  let name;
  try { name = utf8.decode(head); }
  catch { name = legacyText.decode(head); }
  return name.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim();
}

function readTrack(reader, track, result, budget) {
  const channels = new Map(), pending = new Map();
  let tick = 0, status = 0, name = '', ended = false;
  while (reader.pos < reader.bytes.length) {
    if (++budget.events > maxEvents) tooLarge();
    tick += reader.variable();
    if (reader.bytes[reader.pos] >= 128) status = reader.number(1);
    if (!status) invalid();

    if (status >= 0xf0) {
      if (status === 0xff) {
        const type = reader.dataByte();
        const data = reader.section(reader.variable());
        switch (type) {
          case 0x2f:
            if (data.bytes.length || reader.pos !== reader.bytes.length) invalid();
            ended = true;
            break;
          case 0x51: {
            if (data.bytes.length !== 3) invalid();
            const microsPerQuarter = data.number(3);
            if (!microsPerQuarter) invalid();
            if (result.tempos.length >= maxMetadata) tooLarge();
            result.tempos.push({tick,microsPerQuarter});
            break;
          }
          case 0x03:
            if (!name) name = label(data.bytes);
            break;
          case 0x06:
            if (result.markers.length >= maxMetadata) tooLarge();
            result.markers.push({tick, name:label(data.bytes)});
            break;
          case 0x58:
            if (data.bytes.length !== 4) invalid();
            break;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        reader.take(reader.variable());
      } else invalid();
      status = 0; // Both SysEx and meta-events cancel channel running status.
      continue;
    }

    const kind = status >>> 4, channel = status & 15;
    const pitch = reader.dataByte();
    if (kind === 0xc || kind === 0xd) continue;
    const velocity = reader.dataByte();
    if (kind !== 8 && kind !== 9) continue;
    const key = channel * 128 + pitch;
    let queue = pending.get(key);
    if (kind === 9 && velocity) {
      if (++budget.notes > maxNotes) tooLarge();
      let group = channels.get(channel);
      if (!group) {
        group = {track,channel,name:'',notes:[]};
        channels.set(channel,group);
      }
      const note = {tick, endTick:tick, note:pitch, velocity};
      group.notes.push(note);
      if (!queue) {
        queue = {list:[], head:0};
        pending.set(key,queue);
      }
      queue.list.push(note);
    } else if (queue) {
      // A second attack of the same pitch cannot overwrite the earlier attack.
      queue.list[queue.head++].endTick = tick;
      if (queue.head === queue.list.length) pending.delete(key);
    }
  }
  if (!ended) invalid();
  for (const queue of pending.values()) {
    for (let i = queue.head; i < queue.list.length; i++) queue.list[i].endTick = tick;
  }
  for (const group of channels.values()) {
    group.name = name;
    result.groups.push(group);
  }
  result.endTick = Math.max(result.endTick,tick);
}

export function parseMidi(bytes) {
  if (!(bytes instanceof Uint8Array)) invalid();
  if (bytes.byteLength > MAX_MIDI_FILE_BYTES) tooLarge();
  const reader = new Reader(bytes);
  if (reader.number(4) !== 0x4d546864) invalid(); // MThd
  const header = reader.section(reader.number(4));
  const format = header.number(2), tracks = header.number(2), ppqn = header.number(2);
  if (format > 1 || (ppqn & 0x8000)) throw Error('midiImportUnsupported');
  if (!ppqn || !tracks || (format === 0 && tracks !== 1)) invalid();
  if (tracks > maxTracks) tooLarge();
  const result = {ppqn,endTick:0,tempos:[],groups:[],markers:[]};
  const budget = {events:0,notes:0};
  let count = 0, chunks = 0;
  while (reader.pos < bytes.length) {
    if (++chunks > maxChunks) tooLarge();
    const type = reader.number(4);
    const chunk = reader.section(reader.number(4));
    if (type === 0x4d546864) invalid();
    if (type !== 0x4d54726b) continue; // Skip extension chunks by their declared length.
    if (count >= tracks) invalid();
    readTrack(chunk,count++,result,budget);
  }
  if (count !== tracks) invalid();
  result.groups.sort((a,b) => a.track - b.track || a.channel - b.channel);
  result.tempos.sort((a,b) => a.tick - b.tick);
  result.markers.sort((a,b) => a.tick - b.tick);
  return result;
}
