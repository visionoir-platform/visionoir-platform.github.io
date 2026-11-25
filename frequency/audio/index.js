export { PATCHES, CHAINS, EXTRA_DEMOS } from './library.js';
export * from './model.js';
export { createEngine, importSample } from './engine.js';
export { renderMidi, zipFiles } from './formats.js';
export { estimateExport, SAMPLE_RATES, BIT_DEPTHS } from './offline.js';
import { estimateExport } from './offline.js';
import { projectFile } from './model.js';
import { midiBundleFiles, zipFiles } from './formats.js';
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
    worker.postMessage({ project, options: settings });
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
  const spec = estimateExport(project, {...options,format:'wav'});
  if (spec.bytes * project.tracks.length >= 0xffffffff) throw Error('export.zipLimit');
  const files = [];
  for (let i = 0; i < project.tracks.length; i++) {
    const stem = await renderWav(project, {
      ...options,
      track: i,
      onProgress: (step) => options.onProgress?.((i + step) / project.tracks.length),
    });
    const slug = project.tracks[i].name.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 70);
    files.push({ name: 'stems/' + String(i + 1).padStart(2, '0') + '-' + slug + '.wav', blob: stem });
  }
  return renderZip(project, files);
}
