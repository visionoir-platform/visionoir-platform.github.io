// FREQUENCY bundles carry the editable document in project.vfreq. Read only
// the ZIP directory and that member, even when the archive contains long stems.
import { updateCrc } from './formats.js';
import { MAX_PROJECT_BYTES, readProject } from './model.js';

const member = 'project.vfreq';
const decoder = new TextDecoder();
const invalid = () => Error('project.archive');

async function directory(file) {
  // A ZIP32 end record is 22 bytes, followed by at most 65,535 comment bytes.
  const start = Math.max(0, file.size - 65557);
  const tail = new DataView(await file.slice(start).arrayBuffer());
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) !== 0x06054b50 || i + 22 + tail.getUint16(i + 20, true) !== tail.byteLength) continue;
    const offset = tail.getUint32(i + 16, true);
    const size = tail.getUint32(i + 12, true);
    const entries = tail.getUint16(i + 10, true);
    if (tail.getUint32(i + 4, true) || entries !== tail.getUint16(i + 8, true) ||
        offset + size !== start + i || size > MAX_PROJECT_BYTES) throw invalid();
    return { offset, entries, view: new DataView(await file.slice(offset, offset + size).arrayBuffer()) };
  }
  throw invalid();
}

function findMember(view, entries) {
  let offset = 0, project;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw invalid();
    const nameSize = view.getUint16(offset + 28, true);
    const end = offset + 46 + nameSize + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (end > view.byteLength) throw invalid();
    if (nameSize === member.length && decoder.decode(new Uint8Array(view.buffer, offset + 46, nameSize)) === member) {
      if (project || view.getUint16(offset + 34, true)) throw invalid();
      project = {
        flags: view.getUint16(offset + 8, true), method: view.getUint16(offset + 10, true),
        crc: view.getUint32(offset + 16, true), compressed: view.getUint32(offset + 20, true),
        size: view.getUint32(offset + 24, true), offset: view.getUint32(offset + 42, true),
      };
    }
    offset = end;
  }
  if (!project || offset !== view.byteLength || project.flags & 1 || ![0, 8].includes(project.method)) throw invalid();
  if (project.size > MAX_PROJECT_BYTES) throw Error('project.size');
  return project;
}

export async function readProjectFile(file) {
  const header = new DataView(await file.slice(0, 4).arrayBuffer());
  if (header.byteLength < 4 || header.getUint32(0, true) !== 0x04034b50) return readProject(file);
  const index = await directory(file);
  const entry = findMember(index.view, index.entries);
  const local = new DataView(await file.slice(entry.offset, entry.offset + 30 + member.length).arrayBuffer());
  if (local.byteLength !== 30 + member.length || local.getUint32(0, true) !== 0x04034b50 ||
      local.getUint16(6, true) !== entry.flags || local.getUint16(8, true) !== entry.method ||
      local.getUint16(26, true) !== member.length || decoder.decode(new Uint8Array(local.buffer, 30)) !== member) throw invalid();
  const start = entry.offset + local.byteLength + local.getUint16(28, true);
  if (start + entry.compressed > index.offset || (entry.method === 0 && entry.size !== entry.compressed)) throw invalid();

  if (entry.flags & 8) {
    const end = start + entry.compressed;
    const descriptor = new DataView(await file.slice(end, Math.min(end + 16, index.offset)).arrayBuffer());
    // ZIP permits the data descriptor both with and without its signature.
    const matches = (offset) => descriptor.byteLength >= offset + 12 &&
      descriptor.getUint32(offset, true) === entry.crc && descriptor.getUint32(offset + 4, true) === entry.compressed &&
      descriptor.getUint32(offset + 8, true) === entry.size;
    if (!matches(0) && !(descriptor.byteLength >= 16 && descriptor.getUint32(0, true) === 0x08074b50 && matches(4))) throw invalid();
  } else if (local.getUint32(14, true) !== entry.crc || local.getUint32(18, true) !== entry.compressed ||
             local.getUint32(22, true) !== entry.size) throw invalid();

  let stream = file.slice(start, start + entry.compressed).stream();
  if (entry.method === 8) {
    if (typeof DecompressionStream !== 'function') throw invalid();
    stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
  }
  const reader = stream.getReader();
  const chunks = [];
  let bytes = 0, crc = 0xffffffff;
  try {
    for (;;) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > entry.size) throw invalid();
      crc = updateCrc(crc, chunk);
      chunks.push(chunk);
    }
  } catch {
    await reader.cancel().catch(() => {});
    throw invalid();
  } finally {
    reader.releaseLock();
  }
  if (bytes !== entry.size || (~crc >>> 0) !== entry.crc) throw invalid();
  return readProject(new Blob(chunks));
}
