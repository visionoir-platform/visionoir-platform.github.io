import { estimateExport, openWriter, renderOffline } from './offline.js';
import { readBlob, midiBundleFiles, writeZip } from './formats.js';
import { projectFile } from './model.js';

export async function renderStemArchive(project, options, progress = () => {}) {
  const { handle, privateSink, flatNames, ...settings } = options;
  const wav = { ...settings, format: 'wav', bus: undefined };
  const spec = estimateExport(project, wav);
  const files = [{ name: 'project.vfreq', blob: projectFile(project) }, ...midiBundleFiles(project)];
  const entries = files.map(({ name, blob }) => ({
    name, size: blob.size, emit: (write) => readBlob(blob, write),
  }));
  for (const [i, track] of project.tracks.entries()) {
    const index = String(i + 1).padStart(2, '0');
    const slug = track.name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 70);
    entries.push({
      name: flatNames ? index + '-' + track.instrument + '.wav' : 'stems/' + index + '-' + slug + '.wav',
      size: spec.bytes,
      emit: (write) => renderOffline(project, { ...wav, track: i },
        (fraction) => progress((i + fraction) / project.tracks.length),
        { write, finish() {}, abort() {} }),
    });
  }
  const memoryLimit = 64 * 1024 * 1024;
  const encoder = new TextEncoder();
  const archiveBytes = entries.reduce((sum, e) => sum + e.size + 92 + 2 * encoder.encode(e.name).length, 22);
  if (archiveBytes >= 0xffffffff) throw Error('export.zipLimit');
  if (!handle && archiveBytes > memoryLimit) throw Error('export.storageRequired');
  const writer = handle ? await openWriter(handle, privateSink) : null;
  const parts = [];
  try {
    await writeZip(entries, (bytes) => writer ? writer.write(bytes) : parts.push(bytes));
    if (writer) {
      await writer.close();
      return await handle.getFile();
    }
    return new Blob(parts, {type: 'application/zip'});
  } catch (error) {
    if (writer) {
      try { await writer.abort(); } catch { /* Preserve the export error. */ }
    }
    throw error;
  }
}
