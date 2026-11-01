import { diffTexts } from './ini.js';
import { db, findConfigDir, readFile, writeFile, fileStamp } from './store.js';
import { S, docOf, anyDirty, effectiveOverrides, entryId } from './state.js';
import { h, modal, closeModal, toast, confirmModal, changeRow, card, labelBlock, layerBadge, download } from './ui.js';
import { tabGraphics, tabControls, tabKeybinds, stopCapture, isCapturing } from './editors.js';
import { TWEAKS, CATEGORIES, ENGINE_SECTION, RISK_TEXT } from './tweaks.js';

const CONFIG_PATH = '%LOCALAPPDATA%\\Wardogs\\Saved\\Config\\WindowsClient';
const LABEL = { gus: 'GameUserSettings.ini', engine: 'Engine.ini' };
const MAX_AUTO = 20;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtDate = t => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ui = { expanded: new Set(), rawFile: 'gus', rawMode: 'keys', search: '', rawPending: null };

/* ================= persistence ================= */
const saveSettings = () => db.put('kv', S.settings, 'settings').catch(e => toast('Could not save settings: ' + e.message, 'err'));
async function putLayer(layer) { layer.updated = Date.now(); await db.put('layers', layer); }

/* ================= files ================= */
async function loadFiles(keys = Object.keys(S.files)) {
  for (const key of keys) {
    const f = S.files[key];
    const r = await readFile(S.dir, f.name);
    Object.assign(f, { exists: r.exists, enc: r.enc, lastModified: r.lastModified });
    f.doc.load(r.text);
  }
  S.loaded = true;
  S.stale = false;
}

async function guarded(fn, what) {
  try { return await fn(); }
  catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { S.perm = 'prompt'; render(); toast('Folder access was lost. Click Reconnect.', 'err'); }
    else if (e.name === 'NoModificationAllowedError' || e.name === 'InvalidModificationError') toast(`${what} failed: the file is read-only or in use. Clear the read-only flag or close the game.`, 'err');
    else toast(`${what} failed: ${e.message}`, 'err');
    return undefined;
  }
}

async function chooseFolder() {
  let picked;
  try { picked = await window.showDirectoryPicker({ id: 'wardogs-config', mode: 'readwrite' }); }
  catch (e) { if (e.name !== 'AbortError') toast('Could not open that folder: ' + e.message, 'err'); return; }
  const dir = await findConfigDir(picked);
  if (!dir) { toast(`No GameUserSettings.ini there. Pick the WindowsClient folder: ${CONFIG_PATH}`, 'err'); return; }
  if (dir !== picked && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') { toast('Access not granted.', 'err'); return; }
  S.dir = dir; S.perm = 'granted';
  await db.put('kv', dir, 'dir').catch(() => {});
  await guarded(loadFiles, 'Loading');
  render();
}

async function reconnect() {
  const p = await S.dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
  if (p !== 'granted') { toast('Access not granted.', 'err'); return; }
  S.perm = 'granted';
  await guarded(loadFiles, 'Loading');
  render();
}

/* ================= snapshots ================= */
async function diskTexts() {
  const out = {};
  for (const [key, f] of Object.entries(S.files)) { const r = await readFile(S.dir, f.name); out[key] = r.exists ? r.text : null; }
  return out;
}
async function addSnapshot(name, auto) {
  const snap = { id: uid(), name, auto, created: Date.now(), files: await diskTexts() };
  await db.put('snapshots', snap);
  S.snapshots.push(snap);
  if (auto) {
    const autos = S.snapshots.filter(s => s.auto).sort((a, b) => b.created - a.created);
    for (const old of autos.slice(MAX_AUTO)) { await db.del('snapshots', old.id); S.snapshots = S.snapshots.filter(s => s !== old); }
  }
  return snap;
}

/* ================= save ================= */
// Writes every changed file, after an automatic snapshot of what is on disk now.
async function save(reason = 'Before save', force = false) {
  applyRawText();
  const dirty = Object.values(S.files).filter(f => f.doc.dirty());
  if (!dirty.length) return true;
  S.busy = true;
  try {
    return await guarded(async () => {
      if (!force) for (const f of dirty) {
        if ((await fileStamp(S.dir, f.name)) !== f.lastModified) { conflictModal(reason); return false; }
      }
      await addSnapshot(reason, true);
      for (const f of dirty) {
        const text = f.doc.serialize();
        f.lastModified = await writeFile(S.dir, f.name, text, f.enc);
        f.exists = true;
        f.doc.load(text);
      }
      S.stale = false;
      closeModal(); render();
      toast(`Saved ${dirty.map(f => f.name).join(' and ')}. A snapshot of the previous version was kept.`);
      return true;
    }, 'Saving');
  } finally { S.busy = false; }
}

function conflictModal(reason) {
  modal('The config changed on disk', h('p', {}, 'Something (usually the game) wrote the config after it was loaded here. Overwriting replaces that newer version, but a snapshot of it is kept first.'),
    [h('button', { class: 'btn', onclick: async () => { closeModal(); await guarded(loadFiles, 'Reloading'); render(); } }, 'Discard mine and reload'),
     h('button', { class: 'btn primary', onclick: () => save(reason, true) }, 'Overwrite with my version')]);
}

function allChanges() {
  return Object.entries(S.files).flatMap(([key, f]) => f.doc.changes().map(c => ({ ...c, file: key })));
}

function reviewSave() {
  applyRawText();
  if (!anyDirty()) return;
  const list = allChanges();
  modal(`Save ${list.length} change${list.length === 1 ? '' : 's'}?`, h('div', {},
    list.length ? list.map(c => changeRow(LABEL[c.file], c)) : h('p', { class: 'muted' }, 'Only formatting or comment lines changed.'),
    !S.files.engine.exists && S.files.engine.doc.dirty() && h('p', { class: 'muted' }, 'Engine.ini will be created.'),
    h('p', { class: 'muted', style: 'font-size:12.5px' }, 'Apply changes with the game closed: it rewrites GameUserSettings.ini when it exits.')),
    [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => save() }, 'Save')]);
}

function discard() {
  confirmModal('Discard unsaved changes?', 'All edits since the last save are thrown away.', 'Discard', () => {
    for (const f of Object.values(S.files)) f.doc.load(f.doc.original);
    ui.rawPending = null;
    render();
  }, true);
}

/* ================= layers ================= */
function drift() {
  if (!S.loaded) return [];
  const out = [];
  for (const e of effectiveOverrides().values()) {
    const cur = docOf(e.file).origGet(e.section, e.key);
    if (e.value === null ? cur !== undefined : cur !== e.value) out.push({ ...e, cur });
  }
  return out;
}
async function reapply() {
  for (const e of drift()) {
    const d = docOf(e.file);
    if (e.value === null) d.remove(e.section, e.key); else d.set(e.section, e.key, e.value);
  }
  await save('Before re-applying layers');
}

function layerNameModal(title, initial, onOk) {
  const inp = h('input', { type: 'text', value: initial || '', placeholder: 'e.g. Base, Clarity, Recording' });
  const ok = () => { const v = inp.value.trim(); if (!v) return; closeModal(); onOk(v); };
  inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
  modal(title, h('label', { class: 'field' }, 'Name', inp), [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: ok }, 'OK')]);
}

async function createLayer(name, entries = [], activate = true) {
  const layer = { id: uid(), name, entries, created: Date.now() };
  await putLayer(layer);
  S.layers.push(layer);
  if (activate) { S.settings.activeLayers.push(layer.id); await saveSettings(); }
  ui.expanded.add(layer.id);
  return layer;
}

function editsAsEntries() {
  const entries = new Map(), skipped = [];
  for (const [file, f] of Object.entries(S.files)) for (const c of f.doc.changes()) {
    if (f.doc.getAll(c.section, c.key).length > 1 || f.doc.origGetAll(c.section, c.key).length > 1) { skipped.push(c.key); continue; }
    const e = { file, section: c.section, key: c.key, value: c.value ?? null };
    entries.set(entryId(e), e);
  }
  return { entries: [...entries.values()], skipped: [...new Set(skipped)] };
}

function saveAsLayerModal() {
  applyRawText();
  const { entries, skipped } = editsAsEntries();
  if (!entries.length) { toast(skipped.length ? `Only repeated keys changed (${skipped.join(', ')}), which layers can't hold.` : 'No unsaved edits to turn into a layer.', 'err'); return; }
  const target = h('select', {}, h('option', { value: '' }, 'New layer'), S.layers.map(l => h('option', { value: l.id }, `Add to "${l.name}"`)));
  const name = h('input', { type: 'text', placeholder: 'e.g. Base, Clarity, Recording' });
  target.onchange = () => { name.disabled = !!target.value; };
  const activate = h('input', { type: 'checkbox', checked: true });
  const saveNow = h('input', { type: 'checkbox', checked: true });
  const go = async () => {
    let layer;
    if (target.value) {
      layer = S.layers.find(l => l.id === target.value);
      const m = new Map(layer.entries.map(e => [entryId(e), e]));
      entries.forEach(e => m.set(entryId(e), e));
      layer.entries = [...m.values()];
      await putLayer(layer);
      if (activate.checked && !S.settings.activeLayers.includes(layer.id)) { S.settings.activeLayers.push(layer.id); await saveSettings(); }
    } else {
      if (!name.value.trim()) { name.focus(); return; }
      layer = await createLayer(name.value.trim(), entries, activate.checked);
    }
    closeModal();
    toast(`Layer "${layer.name}" now holds ${layer.entries.length} setting${layer.entries.length === 1 ? '' : 's'}.`);
    if (saveNow.checked) await save(); else render();
  };
  modal(`Save ${entries.length} edit${entries.length === 1 ? '' : 's'} as a layer`, h('div', {},
    h('label', { class: 'field' }, 'Layer', target),
    h('label', { class: 'field' }, 'Name', name),
    h('div', {}, entries.map(e => changeRow(LABEL[e.file], e, docOf(e.file).origGet(e.section, e.key), e.value))),
    skipped.length > 0 && h('p', { class: 'muted' }, `Not included (repeated keys): ${skipped.join(', ')}`)),
    [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: go }, 'Create')],
    [h('label', { class: 'check' }, activate, 'Activate'), h('label', { class: 'check' }, saveNow, 'Also save the files now')]);
}

async function setActive(layer, on) {
  const list = S.settings.activeLayers.filter(id => id !== layer.id);
  if (on) list.push(layer.id);
  S.settings.activeLayers = list;
  await saveSettings();
  render();
}
async function moveLayer(layer, dir) {
  const list = S.settings.activeLayers, i = list.indexOf(layer.id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await saveSettings();
  render();
}
function deleteLayer(layer) {
  confirmModal(`Delete layer "${layer.name}"?`, 'Its settings stay in your files as they are; they just stop being enforced.', 'Delete', async () => {
    await db.del('layers', layer.id);
    S.layers = S.layers.filter(l => l !== layer);
    S.settings.activeLayers = S.settings.activeLayers.filter(id => id !== layer.id);
    await saveSettings();
    render();
  }, true);
}

function entryRow(layer, e) {
  const doc = docOf(e.file);
  const cur = S.loaded ? doc.origGet(e.section, e.key) : undefined;
  const matches = e.value === null ? cur === undefined : cur === e.value;
  const commit = async () => { await putLayer(layer); render(); };
  const valueCtl = e.value === null
    ? h('span', { class: 'removed', title: 'This layer makes sure the key is absent' }, 'removed (game default)')
    : h('input', { type: 'text', value: e.value, spellcheck: false, onchange: ev => { e.value = ev.target.value; commit(); } });
  return h('div', { class: 'entry' },
    h('span', { class: 'file' }, LABEL[e.file].replace('.ini', '')),
    h('div', {}, h('code', {}, e.key), h('div', { class: 'file' }, e.section)),
    valueCtl,
    h('div', {},
      S.loaded && !matches && h('span', { class: 'badge', title: `File has: ${cur ?? '(not set)'}` }, 'differs'),
      h('button', { class: 'iconbtn', title: 'Remove from layer', onclick: () => { layer.entries = layer.entries.filter(x => x !== e); commit(); } }, '✕')));
}

function addEntryForm(layer) {
  const fileSel = h('select', {}, h('option', { value: 'gus' }, 'GameUserSettings'), h('option', { value: 'engine' }, 'Engine.ini'));
  const sec = h('input', { type: 'text', placeholder: 'Section', list: 'dl-sec-' + layer.id, spellcheck: false });
  const key = h('input', { type: 'text', placeholder: 'Key', list: 'dl-key-' + layer.id, spellcheck: false });
  const val = h('input', { type: 'text', placeholder: 'Value (current if empty)', spellcheck: false });
  const secList = h('datalist', { id: 'dl-sec-' + layer.id }), keyList = h('datalist', { id: 'dl-key-' + layer.id });
  const fill = () => {
    const d = docOf(fileSel.value);
    secList.replaceChildren(...d.sections().map(s => h('option', { value: s })));
    keyList.replaceChildren(...d.keysIn(sec.value || (fileSel.value === 'engine' ? ENGINE_SECTION : '')).map(k => h('option', { value: k })));
  };
  fileSel.onchange = () => { sec.value = fileSel.value === 'engine' ? ENGINE_SECTION : ''; fill(); };
  sec.oninput = fill;
  key.onchange = () => { if (!val.value) val.value = docOf(fileSel.value).get(sec.value, key.value) ?? ''; };
  fill();
  const add = async () => {
    if (!sec.value.trim() || !key.value.trim()) { toast('Section and key are required.', 'err'); return; }
    const e = { file: fileSel.value, section: sec.value.trim(), key: key.value.trim(), value: val.value };
    layer.entries = layer.entries.filter(x => entryId(x) !== entryId(e)).concat(e);
    await putLayer(layer); render();
  };
  return h('div', { class: 'addentry' }, fileSel, sec, secList, key, keyList, val, h('button', { class: 'btn small', onclick: add }, 'Add setting'));
}

function layerBlock(layer, index) {
  const active = index >= 0;
  const open = ui.expanded.has(layer.id);
  const toggleOpen = () => { open ? ui.expanded.delete(layer.id) : ui.expanded.add(layer.id); render(); };
  const n = S.settings.activeLayers.length;
  return h('div', { class: 'layer' + (active ? '' : ' inactive') },
    h('div', { class: 'layer-head' },
      h('span', { class: 'order' }, active ? index + 1 : ''),
      h('label', { class: 'switch', title: active ? 'Deactivate' : 'Activate' }, h('input', { type: 'checkbox', checked: active, onchange: e => setActive(layer, e.target.checked) }), h('span')),
      h('div', { class: 'name', onclick: toggleOpen }, (open ? '▾ ' : '▸ ') + layer.name, h('small', {}, `${layer.entries.length} setting${layer.entries.length === 1 ? '' : 's'}`)),
      active && h('button', { class: 'iconbtn', title: 'Move up (applied earlier)', disabled: index === 0, onclick: () => moveLayer(layer, -1) }, '↑'),
      active && h('button', { class: 'iconbtn', title: 'Move down (applied later, wins)', disabled: index === n - 1, onclick: () => moveLayer(layer, 1) }, '↓'),
      h('button', { class: 'iconbtn', title: 'Rename', onclick: () => layerNameModal('Rename layer', layer.name, async v => { layer.name = v; await putLayer(layer); render(); }) }, '✎'),
      h('button', { class: 'iconbtn', title: 'Duplicate', onclick: async () => { await createLayer(layer.name + ' copy', structuredClone(layer.entries), false); render(); } }, '⧉'),
      h('button', { class: 'iconbtn', title: 'Delete', onclick: () => deleteLayer(layer) }, '🗑')),
    open && h('div', { class: 'layer-body' },
      layer.entries.length ? layer.entries.map(e => entryRow(layer, e)) : h('div', { class: 'muted' }, 'Empty. Add settings below, or make edits in the other tabs and use "Save as layer".'),
      addEntryForm(layer)));
}

/* ================= snapshots UI ================= */
function snapshotPreview(snap) {
  const rows = [];
  for (const [key, f] of Object.entries(S.files)) {
    const target = snap.files[key];
    if (target == null && !f.exists) continue;
    for (const c of diffTexts(f.doc.original, target ?? '')) rows.push(changeRow(LABEL[key], c));
  }
  modal(`Restore "${snap.name}"?`, h('div', {},
    h('p', { class: 'muted', style: 'margin-top:0' }, `Taken ${fmtDate(snap.created)}. Changes compared with the files on disk now:`),
    rows.length ? rows : h('p', {}, 'Identical to the current files.'),
    anyDirty() && h('div', { class: 'callout warn' }, 'Your unsaved edits will be discarded.')),
    [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', disabled: !rows.length, onclick: () => restoreSnapshot(snap) }, 'Restore')]);
}
async function restoreSnapshot(snap) {
  S.busy = true;
  try {
    await guarded(async () => {
      await addSnapshot(`Before restoring "${snap.name}"`, true);
      for (const [key, f] of Object.entries(S.files)) {
        const text = snap.files[key];
        if (text == null && !f.exists) continue;
        if ((text ?? '') === f.doc.original && f.exists) continue;
        f.lastModified = await writeFile(S.dir, f.name, text ?? '', f.enc);
      }
      await loadFiles();
      closeModal(); render();
      toast(`Restored "${snap.name}".`);
    }, 'Restoring');
  } finally { S.busy = false; }
}
function takeSnapshotModal() {
  layerNameModal('Take a snapshot', `Snapshot ${new Date().toLocaleDateString()}`, async name => {
    await guarded(async () => { await addSnapshot(name, false); render(); toast('Snapshot saved. It captures the files as they are on disk.'); }, 'Snapshot');
  });
}

/* ================= export / import ================= */
function exportAll() {
  const data = { app: 'wardogs-config-editor', version: 1, exported: new Date().toISOString(), layers: S.layers, snapshots: S.snapshots,
    settings: { activeLayers: S.settings.activeLayers, verified: S.settings.verified } };
  download(`wardogs-profiles-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
}
function importAll() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    try {
      const data = JSON.parse(await inp.files[0].text());
      if (data.app !== 'wardogs-config-editor') throw new Error('not an export from this editor');
      for (const l of data.layers || []) { await db.put('layers', l); S.layers = S.layers.filter(x => x.id !== l.id).concat(l); }
      for (const s of data.snapshots || []) { await db.put('snapshots', s); S.snapshots = S.snapshots.filter(x => x.id !== s.id).concat(s); }
      if (!S.settings.activeLayers.length) S.settings.activeLayers = (data.settings?.activeLayers || []).filter(id => S.layers.some(l => l.id === id));
      S.settings.verified = { ...(data.settings?.verified || {}), ...S.settings.verified };
      await saveSettings();
      render();
      toast(`Imported ${data.layers?.length || 0} layers and ${data.snapshots?.length || 0} snapshots.`);
    } catch (e) { toast('Import failed: ' + e.message, 'err'); }
  };
  inp.click();
}

/* ================= tabs ================= */
function connectScreen() {
  if (S.unsupported) return h('div', { class: 'connect' }, h('h1', {}, 'Open this page in Chrome or Edge'),
    h('p', {}, 'Editing your config files directly needs the File System Access feature, which only Chromium browsers have.'));
  if (S.perm === 'prompt') return h('div', { class: 'connect' }, h('h1', {}, 'Reconnect to your config folder'),
    h('p', {}, `The browser needs your OK again for "${S.dir?.name}" this session.`),
    h('div', { class: 'pathbox' }, h('button', { class: 'btn primary', onclick: reconnect }, 'Reconnect'), h('button', { class: 'btn', onclick: chooseFolder }, 'Choose a different folder')));
  const copy = () => navigator.clipboard.writeText(CONFIG_PATH).then(() => toast('Path copied.'));
  return h('div', { class: 'connect' }, h('h1', {}, 'Connect your Wardogs config folder'),
    h('p', {}, 'This page edits the config files on your PC directly. Nothing is uploaded; settings, layers and snapshots stay in this browser.'),
    h('div', { class: 'pathbox' }, h('code', {}, CONFIG_PATH), h('button', { class: 'btn small', onclick: copy }, 'Copy')),
    h('ol', {}, h('li', {}, 'Click Choose folder.'), h('li', {}, 'Paste the path above into the dialog\'s address bar and press Enter.'),
      h('li', {}, 'Select the WindowsClient folder, then allow the page to view and edit files.')),
    h('button', { class: 'btn primary', onclick: chooseFolder }, 'Choose folder'));
}

function sandboxCard() {
  const inp = h('input', { type: 'file', accept: '.ini', multiple: true });
  inp.onchange = async () => {
    for (const file of inp.files) {
      const name = /engine/i.test(file.name) ? 'Engine.ini' : 'GameUserSettings.ini';
      await writeFile(S.dir, name, await file.text(), 'utf8');
    }
    await loadFiles(); render(); toast('Loaded into the sandbox.');
  };
  return card('Sandbox mode', [h('div', { class: 'row' }, labelBlock('Load files', 'Files live in this browser\'s private storage, not your game folder. Use this to try things safely.'), h('div', { class: 'ctl' }, inp,
    h('button', { class: 'btn small', onclick: () => download('GameUserSettings.ini', S.files.gus.doc.original, 'text/plain') }, 'Download GUS'),
    h('button', { class: 'btn small', onclick: () => download('Engine.ini', S.files.engine.doc.original, 'text/plain') }, 'Download Engine.ini')))], { wide: true });
}

function tabProfiles() {
  const d = drift();
  const ordered = S.settings.activeLayers.map(id => S.layers.find(l => l.id === id)).filter(Boolean);
  const inactive = S.layers.filter(l => !S.settings.activeLayers.includes(l.id)).sort((a, b) => a.name.localeCompare(b.name));
  const snaps = [...S.snapshots].sort((a, b) => b.created - a.created);
  return h('div', { class: 'stack' },
    S.sandbox && sandboxCard(),
    !S.loaded && connectScreen(),
    d.length > 0 && card(`${d.length} setting${d.length === 1 ? '' : 's'} differ from your active layers`,
      d.map(e => changeRow(`${LABEL[e.file]} › ◆ ${e.layer}`, e, e.cur, e.value)),
      { cls: 'alert', note: [h('p', {}, 'The files on disk don\'t match what your layers force. Usually the game reset something when it exited, or you just activated a layer.'),
        anyDirty() && h('p', {}, 'Re-applying also saves your other unsaved edits.')],
        actions: h('button', { class: 'btn primary small', onclick: reapply }, 'Re-apply & save') }),
    card('Override layers', [
      ordered.map((l, i) => layerBlock(l, i)),
      inactive.length > 0 && h('div', { class: 'row sub' }, h('small', { class: 'muted' }, 'Inactive')),
      inactive.map(l => layerBlock(l, -1)),
    ], { note: 'A layer is a list of settings to force. Active layers apply top to bottom, so lower layers win when they set the same key. Applying only touches those keys; anything else you change in-game is left alone.',
      empty: 'No layers yet. Make edits in the other tabs and click "Save as layer", or create an empty one.',
      actions: [h('button', { class: 'btn small', onclick: () => layerNameModal('New layer', '', async n => { await createLayer(n); render(); }) }, 'New layer'),
        h('button', { class: 'btn small', disabled: !anyDirty(), onclick: saveAsLayerModal }, 'Save edits as layer')] }),
    card('Snapshots', snaps.map(s => h('div', { class: 'snap' },
      h('div', { class: 'info' }, s.name, s.auto && h('span', { class: 'badges' }, h('span', { class: 'badge' }, 'auto')),
        h('small', {}, `${fmtDate(s.created)} · ${s.files.engine == null ? 'no Engine.ini' : 'with Engine.ini'}`)),
      S.loaded && h('button', { class: 'btn small', onclick: () => snapshotPreview(s) }, 'Restore…'),
      h('button', { class: 'iconbtn', title: 'Download GameUserSettings.ini from this snapshot', onclick: () => download(`GameUserSettings-${s.id}.ini`, s.files.gus ?? '', 'text/plain') }, '⬇'),
      h('button', { class: 'iconbtn', title: 'Delete', onclick: () => confirmModal('Delete snapshot?', `"${s.name}" from ${fmtDate(s.created)} is removed from this browser.`, 'Delete', async () => { await db.del('snapshots', s.id); S.snapshots = S.snapshots.filter(x => x !== s); render(); }, true) }, '🗑'))),
      { note: `Full copies of both files as they were on disk. One is taken automatically before every save, re-apply and restore (newest ${MAX_AUTO} automatic ones kept); manual ones are kept until you delete them.`,
        empty: 'No snapshots yet.', actions: S.loaded && h('button', { class: 'btn small', onclick: takeSnapshotModal }, 'Take snapshot') }),
    card('Backup', [h('div', { class: 'row' }, labelBlock('Export / import', 'Layers and snapshots live in this browser only. Export them to a file to keep a backup or move to another browser.'),
      h('div', { class: 'ctl' }, h('button', { class: 'btn', onclick: exportAll }, 'Export'), h('button', { class: 'btn', onclick: importAll }, 'Import')))]),
  );
}

function tweakRow(t) {
  const d = docOf('engine');
  const cur = d.get(ENGINE_SECTION, t.key);
  const verified = S.settings.verified[t.id];
  const row = h('div', { class: 'row' + (cur !== d.origGet(ENGINE_SECTION, t.key) ? ' changed' : '') });
  const set = v => { if (v === null) d.remove(ENGINE_SECTION, t.key); else d.set(ENGINE_SECTION, t.key, v); render(); };
  let ctl;
  if (t.values.length > 1) {
    const opts = [...t.values]; if (cur !== undefined && !opts.includes(cur)) opts.push(cur);
    ctl = h('select', { onchange: e => set(e.target.value || null) }, h('option', { value: '' }, 'Off (game default)'), opts.map(v => h('option', { value: v }, v + (t.unit ? ' ' + t.unit : ''))));
    ctl.value = cur ?? '';
  } else {
    ctl = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: cur !== undefined, onchange: e => set(e.target.checked ? t.values[0] : null) }), h('span'));
  }
  const tri = h('div', { class: 'seg tri', title: 'Does this tweak work in Wardogs? Mark it after testing in-game.' },
    [['', '?', 'Not tested'], ['yes', '✓', 'Works in-game'], ['no', '✗', 'No effect in-game']].map(([v, l, tip]) => h('button', { type: 'button', title: tip, class: ((verified || '') === v ? 'on ' : '') + v,
      onclick: async () => { if (v) S.settings.verified[t.id] = v; else delete S.settings.verified[t.id]; await saveSettings(); render(); } }, l)));
  const badges = [verified === 'yes' && h('span', { class: 'badge yes' }, 'works'), verified === 'no' && h('span', { class: 'badge no' }, 'no effect'),
    cur !== undefined && !t.values.includes(cur) && h('span', { class: 'badge' }, 'custom value')].filter(Boolean);
  row.append(labelBlock(t.name, t.desc, `${t.key}=${cur ?? t.values[0]}`, [layerBadge('engine', ENGINE_SECTION, t.key), badges.length ? h('span', { class: 'badges' }, badges) : null]),
    h('div', { class: 'ctl' }, tri, ctl));
  return row;
}

function tabTweaks() {
  const engine = S.files.engine;
  const vis = TWEAKS.filter(t => t.cat === 'vis');
  const visOn = vis.filter(t => docOf('engine').get(ENGINE_SECTION, t.key) !== undefined);
  const accept = async on => { S.settings.riskAccepted = on; await saveSettings(); render(); };
  const visCard = S.settings.riskAccepted
    ? card(CATEGORIES.vis.title, vis.map(tweakRow), { cls: 'risk', wide: true, note: RISK_TEXT.map(p => h('p', {}, p)),
        actions: h('button', { class: 'btn small', onclick: () => accept(false) }, 'Hide these') })
    : card(CATEGORIES.vis.title + ' (hidden)', [
        h('div', { class: 'row' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: e => accept(e.target.checked) }),
          'I understand these can count as cheating and could get my account banned.')),
        visOn.length > 0 && h('div', { class: 'row sub' }, h('small', {}, 'Currently on in Engine.ini:')),
        visOn.map(tweakRow),
      ], { cls: 'risk', wide: true, note: RISK_TEXT.map(p => h('p', {}, p)) });
  return h('div', { class: 'grid' },
    card('How engine tweaks work', [], { wide: true, empty: false, note: [
      h('p', {}, `These write engine variables to Engine.ini under [${ENGINE_SECTION}], which overrides the game's own quality settings when it starts. Restart the game after saving.`),
      h('p', {}, 'Wardogs or its anti-cheat may ignore some variables. After testing one in-game, mark it Works or No effect so you remember.'),
      h('p', {}, engine.exists ? 'Engine.ini exists in your config folder.' : 'Engine.ini doesn\'t exist yet; it is created when you first save a tweak.')] }),
    ...['perf', 'clarity'].map(cat => card(CATEGORIES[cat].title, TWEAKS.filter(t => t.cat === cat).map(tweakRow), { note: CATEGORIES[cat].note })),
    visCard);
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
    seg([['gus', 'GameUserSettings.ini'], ['engine', 'Engine.ini']], ui.rawFile, v => { ui.rawFile = v; }),
    seg([['keys', 'Keys'], ['text', 'Text']], ui.rawMode, v => { ui.rawMode = v; }));
  if (ui.rawMode === 'text') {
    const ta = h('textarea', { class: 'raw', spellcheck: false, value: doc.serialize(),
      oninput: () => { ui.rawPending = { file: ui.rawFile, text: ta.value }; renderHeader(); } });
    toolbar.append(h('span', { class: 'muted' }, 'Edits apply when you switch view or save.'));
    return h('div', {}, toolbar, ta);
  }
  const list = h('div', { class: 'stack' });
  const search = h('input', { type: 'search', placeholder: 'Filter keys, values or sections…', value: ui.search, oninput: e => { ui.search = e.target.value; fill(); } });
  toolbar.append(search);
  const sec = h('input', { type: 'text', placeholder: 'Section', value: ui.rawFile === 'engine' ? ENGINE_SECTION : '', list: 'dl-raw-sec', spellcheck: false });
  const key = h('input', { type: 'text', placeholder: 'Key, e.g. r.FilmGrain', spellcheck: false });
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
      const on = e => { l.value = e.target.value; row.classList.toggle('changed', l.value !== l.orig); doc.changed(); };
      const inp = l.value.length > 90 ? h('textarea', { value: l.value, spellcheck: false, rows: Math.min(10, Math.ceil(l.value.length / 110)), oninput: on })
                                      : h('input', { type: 'text', value: l.value, spellcheck: false, oninput: on });
      row.append(h('code', {}, l.keyRaw.trim(), layerBadge(ui.rawFile, l.section, l.key)), inp,
        h('button', { class: 'iconbtn', title: 'Delete this line', onclick: () => { doc.removeLine(l); fill(); } }, '✕'));
      return row;
    }))));
    if (!bySec.size) list.append(h('div', { class: 'empty-state' }, doc.lines.some(l => l.kind === 'kv') ? 'No matching keys.' : 'This file is empty.'));
  }
  fill();
  return h('div', {}, toolbar, h('div', { class: 'stack' }, addCard, list));
}

/* ================= shell ================= */
const TABS = [['profiles', 'Profiles', tabProfiles], ['graphics', 'Graphics', tabGraphics], ['controls', 'Controls', tabControls],
  ['keybinds', 'Keybinds', tabKeybinds], ['tweaks', 'Engine tweaks', tabTweaks], ['raw', 'Raw', tabRaw]];

function renderHeader() {
  const conn = document.getElementById('conn');
  conn.className = 'conn';
  if (S.sandbox) { conn.classList.add('wait'); conn.replaceChildren(h('span', { class: 'dot' }), 'Sandbox (browser storage)'); }
  else if (S.unsupported) conn.replaceChildren(h('span', { class: 'dot' }), 'Needs Chrome or Edge');
  else if (S.perm === 'granted') { conn.classList.add('ok'); conn.replaceChildren(h('span', { class: 'dot' }), h('span', { title: CONFIG_PATH }, S.dir.name)); }
  else if (S.perm === 'prompt') { conn.classList.add('wait'); conn.replaceChildren(h('span', { class: 'dot' }), h('button', { class: 'btn small', onclick: reconnect }, 'Reconnect')); }
  else conn.replaceChildren(h('span', { class: 'dot' }), h('button', { class: 'btn small', onclick: chooseFolder }, 'Choose folder'));

  const dirty = anyDirty() || !!ui.rawPending;
  const n = S.loaded ? allChanges().length : 0;
  const d = drift().length;
  const visOn = TWEAKS.some(t => t.cat === 'vis' && S.loaded && docOf('engine').get(ENGINE_SECTION, t.key) !== undefined);
  document.getElementById('pills').replaceChildren(...[
    d && h('span', { class: 'pill warn', style: 'cursor:pointer', onclick: () => { S.tab = 'profiles'; render(); } }, `${d} differ from layers`),
    visOn && h('span', { class: 'pill risk', title: 'Visibility tweaks are set in Engine.ini' }, 'Visibility tweaks on'),
    dirty && h('span', { class: 'pill dirty' }, n ? `${n} unsaved change${n === 1 ? '' : 's'}` : 'Unsaved edits'),
  ].filter(Boolean));
  const can = S.loaded && S.perm === 'granted';
  document.getElementById('saveBtn').disabled = !dirty || !can;
  document.getElementById('discardBtn').disabled = !dirty;
  document.getElementById('layerBtn').disabled = !dirty;
  const banner = document.getElementById('banner');
  banner.replaceChildren();
  if (S.stale) banner.append(h('div', { class: 'banner warn' }, 'The config changed on disk (probably the game) while you have unsaved edits.',
    h('button', { class: 'btn small', onclick: async () => { for (const f of Object.values(S.files)) f.doc.load(f.doc.original); await guarded(loadFiles, 'Reloading'); render(); } }, 'Discard my edits and reload')));
}

function renderTabs() {
  const d = drift().length;
  document.getElementById('tabs').replaceChildren(...TABS.map(([id, label]) =>
    h('button', { class: S.tab === id ? 'on' : '', onclick: () => { applyRawText(); stopCapture(); S.tab = id; render(); } }, label,
      id === 'profiles' && d ? h('span', { class: 'count' }, d) : null)));
}

function renderView() {
  const tab = TABS.find(t => t[0] === S.tab) || TABS[0];
  const y = window.scrollY;
  document.getElementById('view').replaceChildren(tab[0] === 'profiles' || S.loaded ? tab[2]() : connectScreen());
  window.scrollTo(0, y);
}
function render() { renderTabs(); renderView(); renderHeader(); }
S.hooks.renderView = renderView;

async function poll() {
  if (S.perm !== 'granted' || !S.loaded || S.busy) return;
  try {
    const changed = [];
    for (const [key, f] of Object.entries(S.files)) if ((await fileStamp(S.dir, f.name)) !== f.lastModified) changed.push(key);
    if (!changed.length || S.busy) return;
    if (!anyDirty() && !ui.rawPending) { await loadFiles(changed); render(); toast('Reloaded: the config changed on disk.'); }
    else if (!S.stale) { S.stale = true; renderHeader(); }
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { S.perm = 'prompt'; render(); }
  }
}

async function init() {
  for (const f of Object.values(S.files)) f.doc.onChange = renderHeader;
  document.getElementById('saveBtn').onclick = reviewSave;
  document.getElementById('discardBtn').onclick = discard;
  document.getElementById('layerBtn').onclick = saveAsLayerModal;
  document.getElementById('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !isCapturing()) closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!document.getElementById('saveBtn').disabled) reviewSave(); }
  });
  window.addEventListener('beforeunload', e => { if (anyDirty() || ui.rawPending) { e.preventDefault(); e.returnValue = ''; } });

  try {
    S.layers = await db.all('layers');
    S.snapshots = await db.all('snapshots');
    S.settings = { ...S.settings, ...((await db.get('kv', 'settings')) || {}) };
  } catch (e) { toast('Browser storage is unavailable: ' + e.message, 'err'); }

  S.sandbox = new URLSearchParams(location.search).has('sandbox');
  if (S.sandbox) {
    const root = await navigator.storage.getDirectory();
    S.dir = await root.getDirectoryHandle('wardogs-sandbox', { create: true });
    S.perm = 'granted';
    await guarded(loadFiles, 'Loading');
  } else if (!('showDirectoryPicker' in window)) {
    S.unsupported = true;
  } else {
    const saved = await db.get('kv', 'dir').catch(() => null);
    if (saved) {
      S.dir = saved;
      if ((await saved.queryPermission({ mode: 'readwrite' })) === 'granted') { S.perm = 'granted'; await guarded(loadFiles, 'Loading'); }
      else S.perm = 'prompt';
    }
  }
  render();
  setInterval(poll, 3000);
}

init();
