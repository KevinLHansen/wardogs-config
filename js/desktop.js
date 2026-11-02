// Desktop app (Neutralino): reads and writes GameUserSettings.ini directly, which a browser page can't do under AppData.
// The same page runs on the hosted site, where none of this is used.
import { decodeBytes, encode } from './store.js';

// Neutralino injects NL_* globals into the page it serves.
export const isDesktop = typeof window.NL_PORT !== 'undefined';
let N = null;

export async function initDesktop(onClose) {
  N = await import('./vendor/neutralino.mjs');
  N.init();
  await N.events.on('windowClose', onClose);
}

const argValue = name => {
  const arg = [].concat(window.NL_ARGS || []).map(String).find(a => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : null;
};

// --config=<path> on the command line overrides the default location (used for testing on a copy).
export async function defaultPath() {
  return argValue('config') || (await N.os.getEnv('LOCALAPPDATA')) + '\\Wardogs\\Saved\\Config\\WindowsClient\\GameUserSettings.ini';
}

/* Layers, backups and remembered keybind actions live in a JSON file. The web view's own storage is tied to the
   local server's port, which changes on every launch. --data=<path> overrides the file (for testing). */
let dataFile = null;
async function dataPath() {
  if (dataFile) return dataFile;
  const override = argValue('data');
  if (override) return (dataFile = override);
  const dir = (await N.os.getEnv('APPDATA')) + '\\wardogs-config';
  if ((await stamp(dir)) == null) await N.filesystem.createDirectory(dir);
  return (dataFile = dir + '\\data.json');
}
export const dataLocation = () => dataFile;

// {} when the file doesn't exist yet; throws if it exists but can't be read or parsed.
export async function loadData() {
  const p = await dataPath();
  if ((await stamp(p)) == null) return {};
  return JSON.parse(await N.filesystem.readFile(p));
}

// Writes go one at a time, through a temporary file, so a crash mid-write can't leave a half-written data.json.
let writing = Promise.resolve();
export function saveData(data) {
  const text = JSON.stringify(data);
  const run = writing.catch(() => {}).then(async () => {
    const p = await dataPath();
    await N.filesystem.writeFile(p + '.tmp', text);
    await N.filesystem.move(p + '.tmp', p);
  });
  writing = run;
  return run;
}

// Last-modified time in ms, or null if the file doesn't exist.
export async function stamp(path) {
  try { return (await N.filesystem.getStats(path)).modifiedAt; }
  catch { return null; }
}

export async function readPath(path) {
  const buf = new Uint8Array(await N.filesystem.readBinaryFile(path));
  return { ...decodeBytes(buf), lastModified: await stamp(path) };
}

// Writes in the given encoding and returns the new last-modified time.
export async function writePath(path, text, enc) {
  const bytes = encode(text, enc);
  await N.filesystem.writeBinaryFile(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return stamp(path);
}

export async function choosePath(near) {
  const picked = await N.os.showOpenDialog('Choose GameUserSettings.ini', { defaultPath: near, filters: [{ name: 'Config files', extensions: ['ini'] }] });
  return picked?.[0] || null;
}

export const exitApp = () => N.app.exit();
