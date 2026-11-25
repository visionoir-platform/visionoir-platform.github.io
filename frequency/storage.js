const DATABASE = 'visionoir-frequency-v1';
const CURRENT = 'active';
export const controlsKey = 'visionoir-frequency-controls-v1';
export const chromaticPresetKey = 'visionoir.frequency.chromatic.user-preset.v1';
export const eraseEvent = 'frequency-storage-erased';
let opening, sessionVersion;
let invalidated = false;

function invalidate() {
  if (invalidated) return;
  invalidated = true;
  window.dispatchEvent(new Event(eraseEvent));
}
function database() {
  if (invalidated) return Promise.reject(new Error('Studio was erased'));
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DATABASE);
      req.onupgradeneeded = () => req.result.createObjectStore('projects');
      req.onsuccess = () => {
        const db = req.result;
        if (sessionVersion !== undefined && sessionVersion !== db.version) {
          db.close();
          invalidate();
          reject(new Error('Studio was erased'));
          return;
        }
        sessionVersion = db.version;
        db.onversionchange = (event) => {
          db.close();
          opening = undefined;
          if (event.newVersion === null) { invalidate(); return; }
          // This open is queued behind the upgrade. Only a committed erasure invalidates the tab.
          void database().catch(() => {});
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('Storage unavailable'));
    }).catch((e) => {
      opening = undefined;
      throw e;
    });
  }
  return opening;
}
async function read(key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db.transaction('projects').objectStore('projects').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function restore(validate) {
  for (const key of [CURRENT, 'previous']) {
    const value = await read(key);
    if (value) {
      try {
        validate(value);
        return value;
      } catch {
        /* Try the last valid snapshot. */
      }
    }
  }
}
export function previousProject() {
  return read('previous');
}
export function library() {
  return read('library').then((list) => list || []);
}
export function loadNamed(id) {
  return read('save:' + id);
}
export async function save(project, { named = false } = {}) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    const previous = store.get(CURRENT);
    // Queue the edited snapshot immediately after the read. Deferring this write
    // until the read callback could lose an edit when the page was reloaded.
    store.put(project, CURRENT);
    previous.onsuccess = () => {
      if (previous.result) store.put(previous.result, 'previous');
    };
    if (named) {
      const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
      store.put(project, 'save:' + id);
      const list = store.get('library');
      list.onsuccess = () =>
        store.put([{ id, name: project.name, date: Date.now() }, ...(list.result || [])], 'library');
    }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Save failed'));
  });
}
async function clearTemporaryExports() {
  if (!navigator.storage?.getDirectory) return;
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry('frequency-exports', { recursive: true });
  } catch (error) {
    if (error.name === 'NotFoundError') return;
    if (error.name === 'NoModificationAllowedError' || error.name === 'InvalidStateError') {
      throw Error('storage.exportInUse', { cause: error });
    }
    throw error;
  }
}
// Bumping the schema version on deliberate erasure fences old tabs, including previous v1 releases.
export async function removeSaved(onBlocked) {
  const db = await database();
  // An active file writer can lock this directory. Preserve the project if cleanup cannot begin.
  await clearTemporaryExports();
  const nextVersion = db.version + 1;
  db.close();
  opening = undefined;
  await new Promise((resolve, reject) => {
    const req = indexedDB.open(DATABASE, nextVersion);
    req.onblocked = () => onBlocked?.();
    req.onupgradeneeded = () => {
      req.transaction.objectStore('projects').clear();
      try {
        localStorage.removeItem(controlsKey);
        localStorage.removeItem(chromaticPresetKey);
      } catch (error) {
        // When access is denied, the current page cannot tell whether an earlier preference exists.
        req.transaction.abort();
        reject(error);
      }
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error || new Error('Erasure failed'));
  });
  invalidate();
}
