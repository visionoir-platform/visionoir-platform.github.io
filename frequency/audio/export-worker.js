import { renderOffline } from './offline.js';
import { renderStemArchive } from './stem-archive.js';
self.onmessage = async ({ data: { project, options } }) => {
  try {
    const renderer = options.format === 'stems' ? renderStemArchive : renderOffline;
    const file = await renderer(project, options, (value) => self.postMessage({ progress: value }));
    self.postMessage({ file });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
