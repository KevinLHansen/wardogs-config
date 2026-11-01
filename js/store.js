// IndexedDB storage (layers, snapshots, settings, folder handle) and file access.

const DB_NAME = 'wardogs-config-editor';
let dbPromise;
function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
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
export const FILES = { gus: 'GameUserSettings.ini', engine: 'Engine.ini' };

// Accept the WindowsClient folder itself or any parent up to the Wardogs folder.
export async function findConfigDir(handle) {
  const paths = [[], ['WindowsClient'], ['Config', 'WindowsClient'], ['Saved', 'Config', 'WindowsClient'], ['Wardogs', 'Saved', 'Config', 'WindowsClient']];
  for (const path of paths) {
    try {
      let d = handle;
      for (const p of path) d = await d.getDirectoryHandle(p);
      await d.getFileHandle(FILES.gus);
      return d;
    } catch { /* try next */ }
  }
  return null;
}

export async function readFile(dir, name) {
  let fh;
  try { fh = await dir.getFileHandle(name); }
  catch (e) { if (e.name === 'NotFoundError') return { exists: false, text: '', enc: 'utf8', lastModified: null }; throw e; }
  const f = await fh.getFile();
  const buf = new Uint8Array(await f.arrayBuffer());
  let enc = 'utf8', off = 0;
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) { enc = 'utf8bom'; off = 3; }
  else if (buf[0] === 0xFF && buf[1] === 0xFE) { enc = 'utf16le'; off = 2; }
  const text = new TextDecoder(enc === 'utf16le' ? 'utf-16le' : 'utf-8').decode(buf.subarray(off));
  return { exists: true, text, enc, lastModified: f.lastModified };
}

export async function fileStamp(dir, name) {
  try { return (await (await dir.getFileHandle(name)).getFile()).lastModified; }
  catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
}

function encode(text, enc) {
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

export async function writeFile(dir, name, text, enc) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try { await w.write(encode(text, enc)); await w.close(); }
  catch (e) { try { await w.abort(); } catch { } throw e; }
  return (await fh.getFile()).lastModified;
}
