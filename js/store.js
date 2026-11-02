// IndexedDB storage (layers, backups, remembered keybind actions) and file encoding.

const DB_NAME = 'wardogs-config-editor';
let dbPromise;
function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      // Both unused now (layers live in kv; snapshots are read once to become backups); kept so the schema stays the same.
      if (!db.objectStoreNames.contains('layers')) db.createObjectStore('layers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
export const db = {
  get: (store, key) => run(store, 'readonly', s => s.get(key)),
  all: store => run(store, 'readonly', s => s.getAll()),
  put: (store, value, key) => run(store, 'readwrite', s => key === undefined ? s.put(value) : s.put(value, key)),
  del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
};

/* ---------- files ---------- */
export const FILES = { gus: 'GameUserSettings.ini' };

// Which config file a picked or dropped file is, by name; null if none.
export function fileKey(name) {
  if (/^gameusersettings\b.*\.ini$/i.test(name)) return 'gus';
  return null;
}

// Decode file bytes, detecting the encoding so the file can be written back the same way.
export function decodeBytes(buf) {
  let enc = 'utf8', off = 0;
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) { enc = 'utf8bom'; off = 3; }
  else if (buf[0] === 0xFF && buf[1] === 0xFE) { enc = 'utf16le'; off = 2; }
  return { text: new TextDecoder(enc === 'utf16le' ? 'utf-16le' : 'utf-8').decode(buf.subarray(off)), enc };
}

// Read a File (from a picker or drop).
export async function readFile(file) {
  return { ...decodeBytes(new Uint8Array(await file.arrayBuffer())), lastModified: file.lastModified };
}

export function encode(text, enc) {
  if (enc === 'utf16le') {
    const out = new Uint8Array(2 + text.length * 2);
    out[0] = 0xFF; out[1] = 0xFE;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); out[2 + i * 2] = c & 255; out[3 + i * 2] = c >> 8; }
    return out;
  }
  const bytes = new TextEncoder().encode(text);
  if (enc !== 'utf8bom') return bytes;
  const out = new Uint8Array(bytes.length + 3);
  out.set([0xEF, 0xBB, 0xBF]); out.set(bytes, 3);
  return out;
}
