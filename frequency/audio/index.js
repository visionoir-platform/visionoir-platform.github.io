export { PATCHES, CHAINS, EXTRA_DEMOS } from './library.js';
export * from './model.js';
export { createEngine, importSample } from './engine.js';
export { renderMidi, zipFiles } from './formats.js';
export { estimateExport, exportLoop, SAMPLE_RATES, BIT_DEPTHS } from './offline.js';
import { estimateExport } from './offline.js';
import { projectFile } from './model.js';
import { midiBundleFiles, zipFiles } from './formats.js';
export const isMidiFile = (file) =>
  /\.midi?$/i.test(file.name ?? '') || /^audio\/(?:x-)?midi$/i.test(file.type ?? '');

export async function readProject(file) {
  if (isMidiFile(file)) {
    const { MAX_MIDI_FILE_BYTES, parseMidi } = await import('./midi-import.js');
    if (file.size > MAX_MIDI_FILE_BYTES) throw Error('midiImportTooLarge');
    const midi = parseMidi(new Uint8Array(await file.arrayBuffer()));
    const { projectFromMidi } = await import('./midi-project.js');
    return projectFromMidi(midi, file.name);
  }
  const { readProjectFile } = await import('./project-archive.js');
  return readProjectFile(file);
}
function render(project, options) {
  const { signal, onProgress, ...settings } = options;
  if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' });
    function close() {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    }
    function abort() {
      close();
      reject(new DOMException('Cancelled', 'AbortError'));
    }
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if ('progress' in data) {
        onProgress?.(data.progress);
        return;
      }
      close();
      if (data.error) reject(Error(data.error));
      else resolve(data.file);
    };
    worker.onerror = (e) => {
      close();
      reject(Error(e.message || 'export.worker'));
    };
    try {
      worker.postMessage({ project, options: settings });
    } catch (error) {
      close();
      reject(error);
    }
  });
}
export const renderWav = (project, options = {}) => render(project, { ...options, format: 'wav' });
export const renderFlac = (project, options = {}) => render(project, { ...options, format: 'flac' });
export const renderAiff = (project, options = {}) => render(project, { ...options, format: 'aiff' });
export const renderMp3 = (project, options = {}) => render(project, { ...options, format: 'mp3' });
export async function renderZip(project, files = []) {
  return zipFiles([
    { name: 'project.vfreq', blob: projectFile(project) },
    ...midiBundleFiles(project),
    ...files,
  ]);
}
export async function renderStems(project, options = {}) {
  const spec = estimateExport(project, { ...options, format: 'wav' });
  const bytes = spec.bytes * project.tracks.length;
  if (bytes >= 0xffffffff) throw Error('export.zipLimit');
  if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const snapshot = structuredClone(project);
  let handle = options.handle, directory, name;
  try {
    if (!handle && bytes <= 64 * 1024 * 1024) {
      try {
        return await render(snapshot, { ...options, format: 'stems' });
      } catch (error) {
        // Embedded samples or the MIDI files can push a small PCM print over the memory budget.
        if (error.message !== 'export.storageRequired') throw error;
      }
    }
    if (!handle) {
      const storage = globalThis.navigator?.storage;
      if (!storage?.getDirectory) throw Error('export.storageRequired');
      const root = await storage.getDirectory();
      directory = await root.getDirectoryHandle('frequency-exports', { create: true });
      for await (const [key] of directory) {
        const created = /^stems-(\d+)-/.exec(key);
        if (created && Number(created[1]) < Date.now() - 86400000)
          await directory.removeEntry(key).catch(() => {});
      }
      const budget = await storage.estimate?.().catch(() => null);
      if (budget && budget.quota - budget.usage < bytes) throw Error('export.storageRequired');
      name = 'stems-' + Date.now() + '-' + crypto.randomUUID() + '.zip';
      handle = await directory.getFileHandle(name, { create: true });
    }
    return await render(snapshot, { ...options, format: 'stems', handle, privateSink: !!name });
  } catch (error) {
    if (name) await directory.removeEntry(name).catch(() => {});
    throw error;
  }
}
