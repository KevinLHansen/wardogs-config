import { diffTexts, IniDoc } from './ini.js';
import { db, fileKey, readFile, encode } from './store.js';
import { S, SEC, docOf } from './state.js';
import { h, modal, closeModal, toast, confirmModal, changeRow, changeVals, card, labelBlock, ownMark, download } from './ui.js';
import { tabGraphics, tabControls, tabKeybinds, stopCapture, isCapturing } from './editors.js';
import { parseBinds, learnBinds as learnFrom } from './binds.js';
import { keyId, idLabel, readId, writeIds, winners, plan, stackText, replan, editsBetween } from './layers.js';
import { isDesktop, initDesktop, defaultPath, stamp, readPath, writePath, choosePath, exitApp, loadData, saveData, dataLocation } from './desktop.js';

// Two modes, one page. Hosted: Chrome won't give pages access to folders under AppData, so the file is
// loaded with a picker and saved as a download the user copies back. Desktop app: read and written in place.
const CONFIG_PATH = '%LOCALAPPDATA%\\Wardogs\\Saved\\Config\\WindowsClient';
const RELEASES = 'https://github.com/KevinLHansen/wardogs-config/releases/latest';
const SAVE = isDesktop ? 'Save' : 'Download';
const LABEL = { gus: 'GameUserSettings.ini' };
const MAX_BACKUPS = 5;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtDate = t => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const clone = x => structuredClone(x);
const fileDoc = () => S.files.gus.doc;
const ui = { rawFile: 'gus', rawMode: 'keys', search: '', rawPending: null };

/* ================= persistence ================= */
// Layers, backups and remembered keybind actions. Website: IndexedDB. Desktop app: one JSON file (see desktop.js).
// If the desktop data file exists but couldn't be read, nothing is written, so it isn't overwritten with empty lists.
let dataBroken = false;
function saveDesktopData() {
  if (dataBroken) return Promise.reject(new Error('the data file could not be read when the app started, so it is left untouched'));
  return saveData({ app: 'wardogs-config-editor', version: 2, layers: S.saved.layers, appliedKeys: S.saved.applied, backups: S.backups, knownBinds: S.known });
}
const persist = {
  layers: () => isDesktop ? saveDesktopData() : db.put('kv', { layers: S.saved.layers, applied: S.saved.applied }, 'layers'),
  backups: () => isDesktop ? saveDesktopData() : db.put('kv', S.backups, 'backups'),
  known: () => isDesktop ? saveDesktopData() : db.put('kv', S.known, 'knownBinds'),
};
// Layers from the earlier version held a list of entries; those are ignored.
const validLayers = list => (Array.isArray(list) ? list : [])
  .filter(l => l && typeof l.id === 'string' && l.entries && typeof l.entries === 'object' && !Array.isArray(l.entries))
  .map(l => ({ id: l.id, name: String(l.name || 'Layer'), active: !!l.active, entries: l.entries }));
// Snapshots from the earlier version: the newest few become backups.
const backupsFrom = snaps => (Array.isArray(snaps) ? snaps : []).filter(s => typeof s?.files?.gus === 'string')
  .sort((a, b) => b.created - a.created).slice(0, MAX_BACKUPS).map(s => ({ created: s.created, text: s.files.gus }));

async function loadPersisted() {
  let data;
  if (isDesktop) {
    try { data = await loadData(); }
    catch (e) {
      dataBroken = true;
      toast(`Could not read ${dataLocation() || 'the data file'} (${e.message}). Layers and backups won't be saved until it's fixed or removed.`, 'err');
      return;
    }
  } else {
    const lay = await db.get('kv', 'layers');
    data = { layers: lay?.layers, appliedKeys: lay?.applied, backups: await db.get('kv', 'backups'), knownBinds: await db.get('kv', 'knownBinds') };
    if (!data.backups) data.snapshots = await db.all('snapshots');
  }
  S.saved = { layers: validLayers(data.layers), applied: Array.isArray(data.appliedKeys) ? data.appliedKeys : [] };
  S.layers = clone(S.saved.layers);
  S.backups = Array.isArray(data.backups) ? data.backups : backupsFrom(data.snapshots);
  S.known = data.knownBinds || {};
}
const saveKnown = () => persist.known().catch(e => toast('Could not save keybind list: ' + e.message, 'err'));
S.hooks.saveKnown = saveKnown;

// Remember every keybind action the game wrote to the loaded file. Returns how many actions were new.
function learnBinds() {
  const added = learnFrom(S.known, parseBinds(fileDoc().origGet(SEC.BINDS, 'CustomKeybindings')));
  saveKnown();
  return added;
}

// Keep the version a save replaces (newest first).
async function addBackup(text) {
  if (text == null) return;
  const prev = S.backups;
  S.backups = [{ created: Date.now(), text }, ...prev].slice(0, MAX_BACKUPS);
  try { await persist.backups(); }
  catch (e) { S.backups = prev; throw e; }
}

/* ================= layers ================= */
// The file doc holds the loaded file with the active layers applied (S.plan) plus edits made in the total config.
const layersDirty = () => JSON.stringify(S.layers) !== JSON.stringify(S.saved.layers);
const editing = () => S.layers.find(l => l.id === S.edit) || null;

// The file as Save writes it: the doc with everything the layers decide put in place.
function outputText() {
  const d = new IniDoc(fileDoc().serialize());
  writeIds(d, S.plan);
  return d.serialize();
}
// Edits made to the file directly (not through layers): what reloading the file throws away.
const fileEdits = () => !!ui.rawPending || (S.loaded && editsBetween(stackText(fileDoc().original, S.layers, S.saved.applied), fileDoc().serialize()).length > 0);
// Anything Save would do.
const pending = () => !!ui.rawPending || layersDirty() || (S.loaded && outputText() !== fileDoc().original);

// Bring the file doc in line with the working layers. Edits to settings whose outcome didn't change are kept.
function restack(rebuildView = true) {
  const next = plan(S.layers, S.saved.applied);
  replan(fileDoc(), S.plan, next);
  S.plan = next;
  if (S.edit && rebuildView) buildView();
}

// After the file is (re)loaded: apply the layers on top, and note settings they own that the file has other values for.
function fileLoaded() {
  S.plan = new Map();
  const saved = winners(S.saved.layers);
  S.drift = S.saved.applied.filter(id => saved.has(id) && readId(fileDoc(), id, true) !== saved.get(id).value);
  ui.rawPending = null;
  restack();
}

// Store the working layers as saved. fileMatches: the file now holds what the layers decide.
async function storeLayers(fileMatches) {
  S.saved = { layers: clone(S.layers), applied: fileMatches ? [...winners(S.layers).keys()] : S.saved.applied };
  S.plan = plan(S.layers, S.saved.applied);
  S.drift = [];
  if (S.edit) buildView();
  try { await persist.layers(); }
  catch (e) { toast('Could not store the layers: ' + e.message, 'err'); }
}

// Who sets an id, for the marks on editor rows (ui.js ownMark).
function owner(id) {
  if (!S.loaded) return null;
  const L = editing();
  if (!L) {
    const w = winners(S.layers).get(id);
    return w && { badge: w.layer.name, title: `Set by layer "${w.layer.name}". Edits here are overwritten when you save; edit the layer to change it.` };
  }
  if (!(id in L.entries)) return { state: 'dim' };
  const over = S.layers.slice(0, S.layers.indexOf(L)).find(l => l.active && id in l.entries);
  return { state: 'owned', remove: () => removeFromLayer(id),
    ...(over && L.active && { badge: `shadowed by ${over.name}`, warn: true, title: `Layer "${over.name}" is higher in the list and also sets this, so this layer's value isn't used.` }) };
}
S.hooks.owner = owner;

/* ----- editing a layer ----- */
// While a layer is edited, the tabs work on a separate doc: the total config with the layer's values on top.
// Its "as loaded" side is the file with the layer's saved values, so changed marks show unsaved layer edits.
let viewText = '';
function buildView() {
  const L = editing();
  if (!L || !S.loaded) { S.edit = null; S.view = null; return; }
  const over = (text, entries) => { const d = new IniDoc(text); writeIds(d, new Map(Object.entries(entries || {}))); return d.serialize(); };
  const v = S.view || new IniDoc('');
  v.onChange = null;
  v.load(over(fileDoc().original, S.saved.layers.find(l => l.id === L.id)?.entries));
  v.setText(over(fileDoc().serialize(), L.entries));
  v.onChange = viewChanged;
  S.view = v;
  viewText = v.serialize();
}

// Every setting changed in the view joins the layer. Layers hold values only: removing a setting the layer owns
// drops it from the layer; removing anything else is undone.
function viewChanged() {
  const L = editing();
  const text = S.view.serialize();
  const edits = editsBetween(viewText, text);
  viewText = text;
  if (!L || !edits.length) { renderHeader(); return; }
  let rebuild = false;
  const repeated = [], notOwned = [];
  for (const e of edits) {
    if (e.repeated) { repeated.push(idLabel(e.id)); rebuild = true; }
    else if (e.value !== undefined) L.entries[e.id] = e.value;
    else if (e.id in L.entries) { delete L.entries[e.id]; rebuild = true; }
    else { notOwned.push(idLabel(e.id)); rebuild = true; }
  }
  restack(rebuild);
  if (repeated.length) toast(`Not added to the layer: ${[...new Set(repeated)].join(', ')} appears more than once in the file, which a layer can't hold.`, 'err');
  if (notOwned.length) toast(`Layers only hold values, so removing ${notOwned.join(', ')} does nothing here. Edit the total config to remove it from the file.`, 'err');
  if (rebuild) renderView();
  renderHeader(); renderLayers();
}

function removeFromLayer(id) {
  const L = editing();
  if (!L) return;
  applyRawText();
  delete L.entries[id];
  restack();
  render();
}

function enterLayer(id) {
  if (!S.loaded) { toast('Load GameUserSettings.ini first.', 'err'); return; }
  applyRawText(); stopCapture();
  S.edit = id;
  buildView();
  if (S.tab === 'file') S.tab = 'controls';
  render();
}
function exitLayer() {
  if (!S.edit) return;
  applyRawText(); stopCapture();
  S.edit = null; S.view = null;
  render();
}

/* ----- the layer list ----- */
function nameModal(title, initial, onOk) {
  const inp = h('input', { type: 'text', value: initial || '', placeholder: 'e.g. Advanced heli, Infantry, Recording' });
  const ok = () => { const v = inp.value.trim(); if (!v) return; closeModal(); onOk(v); };
  inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
  modal(title, h('label', { class: 'field' }, 'Name', inp), [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: ok }, 'OK')]);
}
// New layers go on top, switched on, and open for editing.
function newLayer() {
  nameModal('New layer', '', name => {
    const l = { id: uid(), name, active: true, entries: {} };
    S.layers.unshift(l);
    if (S.loaded) enterLayer(l.id); else render();
  });
}
function changeLayers(fn) { applyRawText(); fn(); restack(); render(); }
const toggleLayer = l => changeLayers(() => { l.active = !l.active; });
const moveLayer = (from, to) => changeLayers(() => { const [l] = S.layers.splice(from, 1); S.layers.splice(to, 0, l); });
const renameLayer = l => nameModal('Rename layer', l.name, v => { l.name = v; render(); });
function duplicateLayer(l) {
  S.layers.splice(S.layers.indexOf(l) + 1, 0, { ...clone(l), id: uid(), name: l.name + ' copy', active: false });
  render();
}
function deleteLayer(l) {
  confirmModal(`Delete layer "${l.name}"?`, (l.active ? 'Its settings stop applying: each falls back to a lower layer, or to the game default. ' : '') + 'Nothing changes until you save.', 'Delete',
    () => changeLayers(() => { S.layers = S.layers.filter(x => x !== l); if (S.edit === l.id) { S.edit = null; S.view = null; } }), true);
}

function renderLayers() {
  let dragFrom = null;
  const item = (l, i) => {
    const savedL = S.saved.layers.find(x => x.id === l.id);
    const unsaved = !savedL || JSON.stringify(savedL) !== JSON.stringify(l);
    const n = Object.keys(l.entries).length;
    const row = h('div', { class: 'layer' + (l.active ? '' : ' off') + (S.edit === l.id ? ' on' : ''), draggable: true,
      ondragstart: e => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); },
      ondragover: e => { if (dragFrom == null) return; e.preventDefault(); row.classList.add('over'); },
      ondragleave: () => row.classList.remove('over'),
      ondrop: e => { e.preventDefault(); row.classList.remove('over'); if (dragFrom != null && dragFrom !== i) moveLayer(dragFrom, i); dragFrom = null; },
      ondragend: () => { dragFrom = null; } },
      h('span', { class: 'grip', title: 'Drag to change priority (higher wins)' }, '⠿'),
      h('label', { class: 'switch', title: l.active ? 'Turn off' : 'Turn on' }, h('input', { type: 'checkbox', checked: l.active, onchange: () => toggleLayer(l) }), h('span')),
      h('button', { class: 'name', title: 'Edit this layer', onclick: () => enterLayer(l.id) },
        h('span', {}, l.name, unsaved && h('i', { class: 'unsaved', title: 'Unsaved changes' }, ' •')), h('small', {}, plural(n, 'setting'))),
      h('span', { class: 'acts' },
        h('button', { class: 'iconbtn', title: 'Rename', onclick: () => renameLayer(l) }, '✎'),
        h('button', { class: 'iconbtn', title: 'Duplicate', onclick: () => duplicateLayer(l) }, '⧉'),
        h('button', { class: 'iconbtn', title: 'Delete', onclick: () => deleteLayer(l) }, '🗑')));
    return row;
  };
  document.getElementById('layers').replaceChildren(
    h('button', { class: 'layer total' + (S.edit ? '' : ' on'), onclick: exitLayer },
      h('span', { class: 'name' }, h('span', {}, 'Total config'), h('small', {}, 'What gets written to the file'))),
    h('div', { class: 'lhead' }, 'Layers', h('small', {}, 'top wins')),
    ...S.layers.length ? S.layers.map(item) : [h('p', { class: 'muted hint' },'No layers yet. A layer holds the settings for one playstyle, such as advanced helicopter controls, and applies on top of the file.')],
    h('button', { class: 'btn small', onclick: newLayer }, '+ New layer'),
    h('p', { class: 'muted hint' }, 'Under all layers: GameUserSettings.ini as loaded.'));
}

function renderModebar() {
  const el = document.getElementById('modebar');
  const L = S.loaded && editing();
  el.hidden = !S.loaded;
  if (!L) {
    el.className = 'modebar';
    el.replaceChildren(h('b', {}, 'Editing total config'), h('span', {}, 'The file with every active layer applied. Edits to settings a layer sets are overwritten when you save.'));
    return;
  }
  const on = S.layers.filter(l => l.active);
  el.className = 'modebar layer';
  el.replaceChildren(h('b', {}, `Editing layer: ${L.name}`),
    h('span', {}, L.active ? `On, priority ${on.indexOf(L) + 1} of ${on.length}. Settings you change join this layer.` : 'Off. Settings you change join this layer; turn it on to apply it.'),
    h('button', { class: 'btn small', onclick: exitLayer }, 'Back to total config'));
}

/* ================= files ================= */
function loadText(r) {
  const f = S.files.gus;
  Object.assign(f, { exists: true, enc: r.enc, lastModified: r.lastModified });
  f.doc.load(r.text);
  S.loaded = true;
  S.stale = false;
  fileLoaded();
  return learnBinds();
}
const remembered = added => added ? ` Remembered ${plural(added, 'new keybind action')}.` : '';

// Load a picked or dropped file.
async function loadFiles(fileList) {
  const picked = {}, ignored = [];
  for (const file of fileList) {
    const key = fileKey(file.name);
    if (key) picked[key] = file; else ignored.push(file.name);
  }
  if (ignored.length) toast(`Ignored ${ignored.join(', ')}: only GameUserSettings.ini can be loaded.`, 'err');
  if (!picked.gus) return;
  const go = async () => {
    try {
      const added = loadText(await readFile(picked.gus));
      render();
      toast('Loaded GameUserSettings.ini.' + remembered(added));
    } catch (e) { toast('Loading failed: ' + e.message, 'err'); }
  };
  if (fileEdits()) confirmModal('Discard unsaved edits?', 'Loading the file replaces what is open now, including edits you haven\'t downloaded. Layer changes are kept.', 'Load and discard', go, true);
  else await go();
}

function pickFiles() {
  if (isDesktop) return chooseDesktopFile();
  const inp = h('input', { type: 'file', accept: '.ini' });
  inp.onchange = () => loadFiles([...inp.files]);
  inp.click();
}

/* ================= desktop: direct file access ================= */
// Read the file at S.path into the editor. Throws if it can't be read.
const loadFromDisk = async () => loadText(await readPath(S.path));

async function reloadFromDisk(message) {
  try { const added = await loadFromDisk(); render(); toast(message + remembered(added)); }
  catch (e) { toast('Could not read the file: ' + e.message, 'err'); }
}

function reloadClicked() {
  if (fileEdits()) confirmModal('Discard unsaved edits?', 'Reloading reads the file again and throws away edits you haven\'t saved. Layer changes are kept.', 'Reload and discard', () => reloadFromDisk('Reloaded.'), true);
  else reloadFromDisk('Reloaded.');
}

async function chooseDesktopFile() {
  const p = await choosePath(S.path).catch(() => null);
  if (!p) return;
  const go = () => { S.path = p; reloadFromDisk('Loaded ' + p); };
  if (fileEdits()) confirmModal('Discard unsaved edits?', 'Opening another file throws away edits you haven\'t saved.', 'Open and discard', go, true);
  else go();
}

// The file as it is on disk now (null if it doesn't exist).
const diskText = async () => (await stamp(S.path)) == null ? null : (await readPath(S.path)).text;

// Watch for the game rewriting the file: reload when there are no direct edits, otherwise flag it.
async function poll() {
  if (!S.loaded || S.busy) return;
  const t = await stamp(S.path);
  if (t === S.files.gus.lastModified || S.busy) return;
  if (!fileEdits()) await reloadFromDisk('Reloaded: the file changed on disk.');
  else if (!S.stale) { S.stale = true; renderHeader(); }
}

function windowClosing() {
  if (pending()) confirmModal('Quit without saving?', 'You have changes that aren\'t saved: edits, layer changes, or layers not yet applied to the file.', 'Quit', exitApp, true);
  else exitApp();
}

/* ================= save ================= */
function copyBackModal(names) {
  const copy = () => navigator.clipboard.writeText(CONFIG_PATH).then(() => toast('Path copied.'));
  modal('Copy the download into the config folder', h('div', {},
    h('p', { style: 'margin-top:0' }, 'Downloaded ', names.map((n, i) => [i ? ' and ' : '', h('b', {}, n)]), '. Move ', names.length > 1 ? 'them' : 'it', ' from your Downloads folder into:'),
    h('div', { class: 'pathbox' }, h('code', {}, CONFIG_PATH), h('button', { class: 'btn small', onclick: copy }, 'Copy path')),
    h('ul', { class: 'muted' },
      h('li', {}, 'Replace the existing file when Windows asks.'),
      h('li', {}, 'If the download got a suffix like "GameUserSettings (1).ini", rename it: the game only reads the exact name.'),
      h('li', {}, 'Close the game first. It rewrites GameUserSettings.ini when it exits.'))),
    [h('button', { class: 'btn primary', onclick: closeModal }, 'Done')]);
}

// Writes the file with the layers applied (download, or in place in the desktop app) after a backup of the
// version it replaces, then stores the layers. With no file change, only the layers are stored.
async function save(force = false) {
  applyRawText();
  const f = S.files.gus;
  const out = S.loaded ? outputText() : null;
  if (out == null || out === f.doc.original) {
    if (layersDirty()) { await storeLayers(S.loaded); toast('Layers saved.'); }
    closeModal(); render();
    return;
  }
  if (isDesktop) return saveToDisk(out, force);
  try { await addBackup(f.doc.original); }
  catch (e) { toast('Could not store a backup, so nothing was downloaded: ' + e.message, 'err'); return; }
  download(f.name, encode(out, f.enc), 'text/plain');
  f.exists = true;
  f.doc.load(out);
  await storeLayers(true);
  closeModal(); render();
  copyBackModal([f.name]);
}

async function saveToDisk(out, force) {
  const f = S.files.gus;
  S.busy = true;
  try {
    if (!force && (await stamp(S.path)) !== f.lastModified) return conflictModal();
    try { await addBackup(await diskText()); }
    catch (e) { toast('Could not store a backup, so nothing was saved: ' + e.message, 'err'); return; }
    f.lastModified = await writePath(S.path, out, f.enc);
    f.doc.load(out);
    S.stale = false;
    await storeLayers(true);
    closeModal(); render();
    toast('Saved. The previous version was kept as a backup.');
  } catch (e) {
    toast('Saving failed: ' + e.message + '. Is the file read-only or open in another program?', 'err');
  } finally { S.busy = false; }
}

// The file changed on disk since it was loaded (usually the game): show what changed and ask.
async function conflictModal() {
  const f = S.files.gus;
  let rows = [];
  try { rows = diffTexts(f.doc.original, (await readPath(S.path)).text).map(c => changeRow(LABEL.gus, c)); }
  catch { /* deleted or unreadable: no diff to show */ }
  modal('The file changed on disk', h('div', {},
    h('p', { style: 'margin-top:0' }, 'Something (usually the game) wrote GameUserSettings.ini after you loaded it. Changes on disk since then:'),
    rows.length ? rows : h('p', { class: 'muted' }, 'No setting differences (only the timestamp changed, or the file is gone).'),
    h('p', { class: 'muted' }, 'Overwriting replaces the version on disk with yours; a backup of the disk version is kept first.')),
    [h('button', { class: 'btn', onclick: () => { closeModal(); reloadFromDisk('Reloaded. Your edits were discarded; layer changes are kept.'); } }, 'Discard mine and reload'),
     h('button', { class: 'btn primary', onclick: () => save(true) }, 'Overwrite with mine')]);
}

// Edits to settings the layers decide, which saving overwrites. The doc holds the layers' values from the moment
// they apply, so any other value there is an edit made in the total config.
function overwritten() {
  const d = fileDoc(), w = winners(S.layers), out = [];
  for (const [id, v] of S.plan) {
    const mine = readId(d, id);
    if (mine !== v) out.push({ id, mine, v, by: w.get(id)?.layer.name });
  }
  return out;
}

function reviewSave() {
  applyRawText();
  if (!pending()) return;
  const rows = S.loaded ? diffTexts(fileDoc().original, outputText()).map(c => changeRow(LABEL.gus, c)) : [];
  const lost = overwritten();
  modal(rows.length ? `${SAVE} ${plural(rows.length, 'change')}?` : 'Save layers?', h('div', {},
    lost.length > 0 && h('div', { class: 'callout warn' }, `Active layers overwrite ${lost.length === 1 ? 'an edit' : lost.length + ' edits'} you made in the total config:`,
      lost.map(x => h('div', { class: 'change' }, h('div', { class: 'k' }, idLabel(x.id), ' ', h('small', {}, x.by ? `set by layer "${x.by}"` : 'no layer sets it any more')),
        h('div', { class: 'vals' }, changeVals(x.mine, x.v))))),
    rows.length ? rows : h('p', { class: 'muted' }, S.loaded ? 'The file stays as it is.' : 'No file is loaded, so only the layers are stored.'),
    layersDirty() && h('p', { class: 'muted' }, 'Your layer changes are saved too.'),
    isDesktop && rows.length > 0 && h('p', { class: 'muted', style: 'font-size:12.5px' }, 'Save with the game closed: it rewrites GameUserSettings.ini when it exits.')),
    [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => save() }, rows.length ? SAVE : 'Save layers')]);
}

function discard() {
  confirmModal('Discard unsaved changes?', `Edits to the file and to layers since the last ${SAVE.toLowerCase()} are thrown away.`, 'Discard', () => {
    S.layers = clone(S.saved.layers);
    fileDoc().load(fileDoc().original);
    fileLoaded();
    render();
  }, true);
}

/* ================= backups ================= */
function undoModal() {
  const b = S.backups[0];
  if (!b) return;
  const rows = S.loaded ? diffTexts(fileDoc().original, b.text).map(c => changeRow(LABEL.gus, c)) : [];
  modal('Undo last save?', h('div', {},
    h('p', { class: 'muted', style: 'margin-top:0' }, `Puts back GameUserSettings.ini as it was before the ${SAVE.toLowerCase()} on ${fmtDate(b.created)}`,
      isDesktop ? ', writing it to the file.' : ', as a download to copy into the config folder.', ` Older backups left after this: ${S.backups.length - 1}.`),
    S.loaded && h('p', { class: 'muted' }, 'Changes compared with the loaded file:'),
    S.loaded && (rows.length ? rows : h('p', {}, 'Identical to the loaded file.')),
    S.layers.some(l => l.active) && h('p', { class: 'muted' }, 'Layers stay as they are. Where they differ from the restored file, the next save puts their values back.'),
    fileEdits() && h('div', { class: 'callout warn' }, 'Your unsaved edits to the file will be discarded.')),
    [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => undoSave(b) }, isDesktop ? 'Undo' : 'Download')]);
}
async function undoSave(b) {
  const drop = () => { S.backups = S.backups.filter(x => x !== b); return persist.backups().catch(e => toast('Could not update the backups: ' + e.message, 'err')); };
  if (isDesktop) {
    S.busy = true;
    try {
      await writePath(S.path, b.text, S.files.gus.enc);
      await drop();
      await loadFromDisk();
      closeModal(); render();
      toast('Put back the version from before the last save.');
    } catch (e) { toast('Undo failed: ' + e.message, 'err'); }
    finally { S.busy = false; }
    return;
  }
  await drop();
  const f = S.files.gus;
  download(f.name, encode(b.text, f.enc), 'text/plain');
  loadText({ text: b.text, enc: f.enc, lastModified: null });
  closeModal(); render();
  copyBackModal([f.name]);
}

/* ================= export / import ================= */
function exportAll() {
  const data = { app: 'wardogs-config-editor', version: 2, exported: new Date().toISOString(), layers: S.layers, knownBinds: S.known };
  download(`wardogs-layers-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
}
function importAll() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    try {
      const data = JSON.parse(await inp.files[0].text());
      if (data.app !== 'wardogs-config-editor') throw new Error('not an export from this editor');
      // Layers and snapshots in exports from earlier versions are ignored. An imported layer replaces one with the
      // same id (which keeps its place and on/off state); new ones are added at the bottom, switched off.
      const layers = data.version >= 2 ? validLayers(data.layers) : [];
      const merge = list => {
        for (const l of layers) {
          const cur = list.find(x => x.id === l.id);
          if (cur) Object.assign(cur, { name: l.name, entries: clone(l.entries) });
          else list.push({ ...clone(l), active: false });
        }
      };
      applyRawText();
      merge(S.layers); merge(S.saved.layers);
      await persist.layers();
      // Merge remembered keybind actions; defaults seen in either copy are kept.
      const imported = data.knownBinds || {};
      for (const [tag, k] of Object.entries(imported)) {
        const cur = S.known[tag];
        S.known[tag] = cur ? { firstSeen: Math.min(cur.firstSeen, k.firstSeen), lastSeen: Math.max(cur.lastSeen, k.lastSeen), defaults: { ...k.defaults, ...cur.defaults } } : k;
      }
      await saveKnown();
      restack(); render();
      toast(`Imported ${plural(layers.length, 'layer')} and ${plural(Object.keys(imported).length, 'keybind action')}.`);
    } catch (e) { toast('Import failed: ' + e.message, 'err'); }
  };
  inp.click();
}

/* ================= tabs ================= */
function connectScreen() {
  if (isDesktop) return h('div', { class: 'connect' }, h('h1', {}, 'GameUserSettings.ini not found'),
    h('p', {}, 'Nothing was found at:'),
    h('div', { class: 'pathbox' }, h('code', {}, S.path || CONFIG_PATH)),
    h('p', {}, 'Start Wardogs once so it creates the file, or choose it yourself.'),
    h('div', { class: 'pathbox' }, h('button', { class: 'btn primary', onclick: () => reloadFromDisk('Loaded.') }, 'Try again'), h('button', { class: 'btn', onclick: chooseDesktopFile }, 'Choose file…')));
  const copy = () => navigator.clipboard.writeText(CONFIG_PATH).then(() => toast('Path copied.'));
  return h('div', { class: 'connect' }, h('h1', {}, 'Load your Wardogs config'),
    h('p', {}, 'The file is read in this browser and never uploaded. Saving downloads the changed file for you to copy back into the config folder.'),
    h('div', { class: 'pathbox' }, h('code', {}, CONFIG_PATH), h('button', { class: 'btn small', onclick: copy }, 'Copy')),
    h('ol', {},
      h('li', {}, 'Click Load file.'),
      h('li', {}, 'Paste the path above into the dialog\'s address bar and press Enter.'),
      h('li', {}, 'Select GameUserSettings.ini.')),
    h('button', { class: 'btn primary', onclick: pickFiles }, 'Load file'),
    h('p', { class: 'muted', style: 'font-size:12.5px' }, 'You can also drag the file onto this page.'),
    h('p', { class: 'muted', style: 'font-size:12.5px' }, 'Want to save straight to the file? ', h('a', { href: RELEASES, target: '_blank', rel: 'noopener' }, 'Get the Windows desktop app'), '.'));
}

function tabFile() {
  const b = S.backups[0];
  return h('div', { class: 'stack' },
    !S.loaded && connectScreen(),
    card('Backups', [h('div', { class: 'row' },
      labelBlock('Undo last save', b ? `Newest backup: ${fmtDate(b.created)} (${S.backups.length} kept)` : `No backups yet. One is kept before every ${SAVE.toLowerCase()}.`),
      h('div', { class: 'ctl' }, h('button', { class: 'btn', disabled: !b, onclick: undoModal }, 'Undo last save…')))],
      { note: `Before every ${SAVE.toLowerCase()}, the version of GameUserSettings.ini it replaces is kept${isDesktop ? '' : ' (as loaded)'}; the newest ${MAX_BACKUPS} are kept. Undo puts the newest back; undo again to go further back. Layers aren't part of backups.` }),
    card('Export / import', [h('div', { class: 'row' }, labelBlock('Layers and remembered keybind actions', isDesktop ? `Kept in ${dataLocation() || 'the app data file'}. Export them to keep a copy or move them to the website.` : 'Kept in this browser only. Export them to keep a copy or move them to another browser or the desktop app.'),
      h('div', { class: 'ctl' }, h('button', { class: 'btn', onclick: exportAll }, 'Export'), h('button', { class: 'btn', onclick: importAll }, 'Import')))]),
  );
}

/* ----- raw ----- */
function applyRawText() {
  if (!ui.rawPending) return;
  const { file, text } = ui.rawPending;
  ui.rawPending = null;
  if (text !== docOf(file).serialize()) docOf(file).setText(text);
}
function tabRaw() {
  const doc = docOf(ui.rawFile);
  const seg = (opts, val, on) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { type: 'button', class: v === val ? 'on' : '', onclick: () => { applyRawText(); on(v); render(); } }, l)));
  const toolbar = h('div', { class: 'toolbar' },
    seg([['keys', 'Keys'], ['text', 'Text']], ui.rawMode, v => { ui.rawMode = v; }));
  if (ui.rawMode === 'text') {
    const ta = h('textarea', { class: 'raw', spellcheck: false, value: doc.serialize(),
      oninput: () => { ui.rawPending = { file: ui.rawFile, text: ta.value }; renderHeader(); } });
    toolbar.append(h('span', { class: 'muted' }, `Edits apply when you switch view or ${SAVE.toLowerCase()}.`));
    return h('div', {}, toolbar, ta);
  }
  const list = h('div', { class: 'stack' });
  const search = h('input', { type: 'search', placeholder: 'Filter keys, values or sections…', value: ui.search, oninput: e => { ui.search = e.target.value; fill(); } });
  toolbar.append(search);
  const sec = h('input', { type: 'text', placeholder: 'Section', list: 'dl-raw-sec', spellcheck: false });
  const key = h('input', { type: 'text', placeholder: 'Key', spellcheck: false });
  const val = h('input', { type: 'text', placeholder: 'Value', spellcheck: false });
  const addCard = card('Add a key', [h('div', { class: 'row' }, h('div', { class: 'addentry', style: 'margin:0' }, sec, h('datalist', { id: 'dl-raw-sec' }, doc.sections().map(s => h('option', { value: s }))), key, val,
    h('button', { class: 'btn small', onclick: () => { if (!sec.value.trim() || !key.value.trim()) { toast('Section and key are required.', 'err'); return; } doc.set(sec.value.trim(), key.value.trim(), val.value); render(); } }, 'Add')))]);
  function fill() {
    const q = ui.search.trim().toLowerCase();
    const bySec = new Map();
    for (const l of doc.lines) {
      if (l.kind !== 'kv' || (q && !`${l.section} ${l.key} ${l.value}`.toLowerCase().includes(q))) continue;
      if (!bySec.has(l.section)) bySec.set(l.section, []);
      bySec.get(l.section).push(l);
    }
    list.replaceChildren(...[...bySec].map(([s, ls]) => card(s ?? '(no section)', ls.map(l => {
      const row = h('div', { class: 'kv' + (l.value !== l.orig ? ' changed' : '') });
      const om = ownMark(row, keyId(l.section, l.key));
      const on = e => { l.value = e.target.value; row.classList.toggle('changed', l.value !== l.orig); doc.changed(); om.paint(); };
      const inp = l.value.length > 90 ? h('textarea', { value: l.value, spellcheck: false, rows: Math.min(10, Math.ceil(l.value.length / 110)), oninput: on })
                                      : h('input', { type: 'text', value: l.value, spellcheck: false, oninput: on });
      row.append(h('div', {}, h('code', {}, l.keyRaw.trim()), om.el), inp,
        h('button', { class: 'iconbtn', title: 'Delete this line', onclick: () => { doc.removeLine(l); fill(); } }, '✕'));
      return row;
    }))));
    if (!bySec.size) list.append(h('div', { class: 'empty-state' }, doc.lines.some(l => l.kind === 'kv') ? 'No matching keys.' : 'This file is empty.'));
  }
  fill();
  return h('div', {}, toolbar, h('div', { class: 'stack' }, addCard, list));
}

/* ================= shell ================= */
const TABS = [['file', 'File', tabFile], ['controls', 'Controls', tabControls], ['keybinds', 'Keybinds', tabKeybinds],
  ['graphics', 'Graphics', tabGraphics], ['raw', 'Raw', tabRaw]];

function renderHeader() {
  const conn = document.getElementById('conn');
  conn.className = 'conn';
  const loadBtn = isDesktop
    ? h('button', { class: 'btn small', onclick: S.loaded ? reloadClicked : chooseDesktopFile }, S.loaded ? 'Reload' : 'Choose file…')
    : h('button', { class: 'btn small', onclick: pickFiles }, S.loaded ? 'Load again' : 'Load file');
  if (S.loaded) {
    const when = S.files.gus.lastModified && `Last changed ${fmtDate(S.files.gus.lastModified)}`;
    conn.classList.add('ok');
    conn.replaceChildren(h('span', { class: 'dot' }), h('span', { title: [isDesktop && S.path, when].filter(Boolean).join('\n') }, S.files.gus.name), loadBtn);
  } else conn.replaceChildren(h('span', { class: 'dot' }), loadBtn);

  const n = S.loaded ? diffTexts(fileDoc().original, outputText()).length : 0;
  const lay = layersDirty();
  document.getElementById('pills').replaceChildren(...[
    n > 0 && h('span', { class: 'pill dirty' }, `${plural(n, 'unsaved change')}`),
    !n && ui.rawPending && h('span', { class: 'pill dirty' }, 'Unsaved edits'),
    lay && h('span', { class: 'pill dirty' }, 'Layers changed'),
  ].filter(Boolean));
  document.getElementById('saveBtn').disabled = !pending();
  document.getElementById('discardBtn').disabled = !(lay || fileEdits());
  const banner = document.getElementById('banner');
  banner.replaceChildren();
  if (S.stale) banner.append(h('div', { class: 'banner warn' }, 'GameUserSettings.ini changed on disk (probably the game) while you have unsaved edits. Saving will ask before overwriting.',
    h('button', { class: 'btn small', onclick: () => reloadFromDisk('Reloaded. Your edits were discarded; layer changes are kept.') }, 'Discard mine and reload')));
  if (S.loaded && S.drift.length) banner.append(h('div', { class: 'banner info' },
    `The file has other values than your layers for ${plural(S.drift.length, 'setting')} (usually the game changed them): ${S.drift.map(idLabel).join(', ')}. Saving puts the layers' values back.`));
  document.documentElement.style.setProperty('--hdr', document.querySelector('header').offsetHeight + 'px');
}

function renderTabs() {
  document.getElementById('tabs').replaceChildren(...TABS.map(([id, label]) =>
    h('button', { class: S.tab === id ? 'on' : '', onclick: () => { applyRawText(); stopCapture(); S.tab = id; render(); } }, label)));
}

function renderView() {
  const tab = TABS.find(t => t[0] === S.tab) || TABS[0];
  const y = window.scrollY;
  document.getElementById('view').replaceChildren(tab[0] === 'file' || S.loaded ? tab[2]() : connectScreen());
  window.scrollTo(0, y);
}
function render() { renderTabs(); renderLayers(); renderModebar(); renderView(); renderHeader(); }
S.hooks.renderView = renderView;

// Dropping files anywhere on the page loads them.
function setupDrop() {
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragenter', e => { if (!hasFiles(e)) return; depth++; document.body.classList.add('dropping'); });
  document.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; document.body.classList.remove('dropping'); } });
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0; document.body.classList.remove('dropping');
    loadFiles([...e.dataTransfer.files]);
  });
}

async function init() {
  if (!isDesktop) setupDrop();
  fileDoc().onChange = renderHeader;
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.textContent = SAVE;
  saveBtn.title = `${SAVE} the changed file and store layer changes (Ctrl+S)`;
  saveBtn.onclick = () => reviewSave();
  document.getElementById('discardBtn').onclick = discard;
  document.getElementById('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !isCapturing()) closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!document.getElementById('saveBtn').disabled) reviewSave(); }
  });
  window.addEventListener('beforeunload', e => { if (pending()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', () => document.documentElement.style.setProperty('--hdr', document.querySelector('header').offsetHeight + 'px'));

  if (isDesktop) {
    try { await initDesktop(windowClosing); }
    catch (e) { toast('Desktop features failed to start: ' + e.message, 'err'); render(); return; }
  } else db.del('kv', 'dir').catch(() => {}); // folder handle stored by the earlier folder-access version

  try { await loadPersisted(); }
  catch (e) { toast('Browser storage is unavailable: ' + e.message, 'err'); }

  if (isDesktop) {
    try {
      S.path = await defaultPath();
      if ((await stamp(S.path)) != null) await loadFromDisk();
    } catch (e) { toast('Could not read the config: ' + e.message, 'err'); }
    setInterval(() => poll().catch(() => {}), 2000);
  }
  render();
}

init();
