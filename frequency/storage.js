const DATABASE = 'visionoir-frequency-v1';
const CURRENT = 'active';
let opening;
function database() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DATABASE, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('projects');
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
      req.onerror = req.onblocked = () => reject(req.error || new Error('Storage unavailable'));
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
    previous.onsuccess = () => {
      if (previous.result) store.put(previous.result, 'previous');
      store.put(project, CURRENT);
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
export async function removeSaved() {
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').clear();
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
