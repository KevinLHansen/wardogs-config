import { diffTexts } from './ini.js';
import { db, fileKey, readFile, encode } from './store.js';
import { S, SEC, docOf, anyDirty } from './state.js';
import { h, modal, closeModal, toast, confirmModal, changeRow, card, labelBlock, download } from './ui.js';
import { tabGraphics, tabControls, tabKeybinds, stopCapture, isCapturing, parseBinds } from './editors.js';

// Chrome won't give pages access to folders under AppData, so files are loaded with a picker
// and saved as downloads the user copies back.
const CONFIG_PATH = '%LOCALAPPDATA%\\Wardogs\\Saved\\Config\\WindowsClient';
const LABEL = { gus: 'GameUserSettings.ini' };
const MAX_AUTO = 20;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtDate = t => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ui = { rawFile: 'gus', rawMode: 'keys', search: '', rawPending: null };

/* ================= persistence ================= */
const saveKnown = () => db.put('kv', S.known, 'knownBinds').catch(e => toast('Could not save keybind list: ' + e.message, 'err'));
S.hooks.saveKnown = saveKnown;

// Remember every keybind action the game wrote to the loaded file, and any default key it reveals
// (a key saved without bIsCustom). Returns how many actions were new.
function learnBinds() {
  const now = Date.now();
  let added = 0;
  for (const b of parseBinds(docOf('gus').origGet(SEC.BINDS, 'CustomKeybindings'))) {
    if (!b.tag) continue;
    const k = S.known[b.tag] ||= (added++, { firstSeen: now, defaults: {} });
    k.lastSeen = now;
    for (const slot of ['PrimaryKey', 'SecondaryKey']) {
      const s = b.slots[slot];
      if (s?.Key && s.bIsCustom !== 'True') k.defaults[slot] = s.Key;
    }
  }
  saveKnown();
  return added;
}

/* ================= files ================= */
// Load picked or dropped files. A load replaces everything: a file not included counts as not loaded.
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
      for (const [key, f] of Object.entries(S.files)) {
        const r = picked[key] ? await readFile(picked[key]) : { text: '', enc: 'utf8', lastModified: null };
        Object.assign(f, { exists: !!picked[key], enc: r.enc, lastModified: r.lastModified });
        f.doc.load(r.text);
      }
      S.loaded = true;
      ui.rawPending = null;
      const added = learnBinds();
      render();
      toast(`Loaded ${Object.keys(picked).map(k => LABEL[k]).join(' and ')}.` + (added ? ` Remembered ${added} new keybind action${added === 1 ? '' : 's'}.` : ''));
    } catch (e) { toast('Loading failed: ' + e.message, 'err'); }
  };
  if (anyDirty() || ui.rawPending) confirmModal('Discard unsaved edits?', 'Loading files replaces what is open now, including edits you haven\'t downloaded.', 'Load and discard', go, true);
  else await go();
}

function pickFiles() {
  const inp = h('input', { type: 'file', accept: '.ini' });
  inp.onchange = () => loadFiles([...inp.files]);
  inp.click();
}

/* ================= snapshots ================= */
// The files as loaded (or as last downloaded); null for a file that isn't loaded.
function loadedTexts() {
  const out = {};
  for (const [key, f] of Object.entries(S.files)) out[key] = f.exists ? f.doc.original : null;
  return out;
}
async function addSnapshot(name, auto) {
  const snap = { id: uid(), name, auto, created: Date.now(), files: loadedTexts() };
  await db.put('snapshots', snap);
  S.snapshots.push(snap);
  if (auto) {
    const autos = S.snapshots.filter(s => s.auto).sort((a, b) => b.created - a.created);
    for (const old of autos.slice(MAX_AUTO)) { await db.del('snapshots', old.id); S.snapshots = S.snapshots.filter(s => s !== old); }
  }
  return snap;
}

/* ================= save (download) ================= */
// Downloads files in their original encoding, then treats the downloaded text as the new loaded version.
function downloadFiles(texts) {
  const names = [];
  for (const [key, text] of Object.entries(texts)) {
    const f = S.files[key];
    download(f.name, encode(text, f.enc), 'text/plain');
    f.exists = true;
    f.doc.load(text);
    names.push(f.name);
  }
  closeModal(); render();
  copyBackModal(names);
}

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

// Downloads every changed file, after an automatic snapshot of the version it replaces.
async function save(reason = 'Before download') {
  applyRawText();
  const dirty = Object.entries(S.files).filter(([, f]) => f.doc.dirty());
  if (!dirty.length) return;
  try { await addSnapshot(reason, true); }
  catch (e) { toast('Could not store a snapshot, so nothing was downloaded: ' + e.message, 'err'); return; }
  downloadFiles(Object.fromEntries(dirty.map(([key, f]) => [key, f.doc.serialize()])));
}

function allChanges() {
  return Object.entries(S.files).flatMap(([key, f]) => f.doc.changes().map(c => ({ ...c, file: key })));
}

function reviewSave(reason) {
  applyRawText();
  if (!anyDirty()) return;
  const list = allChanges();
  modal(`Download ${list.length} change${list.length === 1 ? '' : 's'}?`, h('div', {},
    list.length ? list.map(c => changeRow(LABEL[c.file], c)) : h('p', { class: 'muted' }, 'Only formatting or comment lines changed.')),
    [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => save(reason) }, 'Download')]);
}

function discard() {
  confirmModal('Discard unsaved changes?', 'All edits since the last download are thrown away.', 'Discard', () => {
    for (const f of Object.values(S.files)) f.doc.load(f.doc.original);
    ui.rawPending = null;
    render();
  }, true);
}

function nameModal(title, initial, onOk) {
  const inp = h('input', { type: 'text', value: initial || '' });
  const ok = () => { const v = inp.value.trim(); if (!v) return; closeModal(); onOk(v); };
  inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
  modal(title, h('label', { class: 'field' }, 'Name', inp), [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: ok }, 'OK')]);
}

/* ================= snapshots UI ================= */
// Restoring downloads the snapshot's files; when files are loaded, the preview diffs against them.
function snapshotPreview(snap) {
  // Only files this editor handles (older snapshots may also hold Engine.ini).
  const texts = Object.fromEntries(Object.keys(S.files).filter(k => snap.files[k] != null).map(k => [k, snap.files[k]]));
  const rows = [];
  if (S.loaded) for (const [key, text] of Object.entries(texts))
    for (const c of diffTexts(S.files[key].doc.original, text)) rows.push(changeRow(LABEL[key], c));
  modal(`Restore "${snap.name}"?`, h('div', {},
    h('p', { class: 'muted', style: 'margin-top:0' }, `Taken ${fmtDate(snap.created)}. Restoring downloads its ${Object.keys(texts).map(k => LABEL[k]).join(' and ')} for you to copy into the config folder.`),
    S.loaded && h('p', { class: 'muted' }, 'Changes compared with the loaded file:'),
    S.loaded && (rows.length ? rows : h('p', {}, 'Identical to the loaded file.')),
    anyDirty() && h('div', { class: 'callout warn' }, 'Your unsaved edits will be discarded.')),
    [h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => restoreSnapshot(snap, texts) }, 'Download')]);
}
async function restoreSnapshot(snap, texts) {
  if (S.loaded) {
    try { await addSnapshot(`Before restoring "${snap.name}"`, true); }
    catch (e) { toast('Could not store a snapshot, so nothing was downloaded: ' + e.message, 'err'); return; }
  } else {
    // Nothing loaded: treat the snapshot as the loaded version from here on.
    for (const f of Object.values(S.files)) f.doc.load('');
    S.loaded = true;
  }
  ui.rawPending = null;
  downloadFiles(texts);
}
function takeSnapshotModal() {
  nameModal('Take a snapshot', `Snapshot ${new Date().toLocaleDateString()}`, async name => {
    try { await addSnapshot(name, false); render(); toast('Snapshot saved. It holds the files as loaded, without unsaved edits.'); }
    catch (e) { toast('Snapshot failed: ' + e.message, 'err'); }
  });
}

/* ================= export / import ================= */
function exportAll() {
  const data = { app: 'wardogs-config-editor', version: 1, exported: new Date().toISOString(), snapshots: S.snapshots, knownBinds: S.known };
  download(`wardogs-profiles-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
}
function importAll() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    try {
      const data = JSON.parse(await inp.files[0].text());
      if (data.app !== 'wardogs-config-editor') throw new Error('not an export from this editor');
      // Layers in older exports are ignored.
      for (const s of data.snapshots || []) { await db.put('snapshots', s); S.snapshots = S.snapshots.filter(x => x.id !== s.id).concat(s); }
      // Merge remembered keybind actions; defaults seen in either copy are kept.
      const imported = data.knownBinds || {};
      for (const [tag, k] of Object.entries(imported)) {
        const cur = S.known[tag];
        S.known[tag] = cur ? { firstSeen: Math.min(cur.firstSeen, k.firstSeen), lastSeen: Math.max(cur.lastSeen, k.lastSeen), defaults: { ...k.defaults, ...cur.defaults } } : k;
      }
      await saveKnown();
      render();
      toast(`Imported ${data.snapshots?.length || 0} snapshots and ${Object.keys(imported).length} keybind actions.`);
    } catch (e) { toast('Import failed: ' + e.message, 'err'); }
  };
  inp.click();
}

/* ================= tabs ================= */
function connectScreen() {
  const copy = () => navigator.clipboard.writeText(CONFIG_PATH).then(() => toast('Path copied.'));
  return h('div', { class: 'connect' }, h('h1', {}, 'Load your Wardogs config'),
    h('p', {}, 'The file is read in this browser and never uploaded. Saving downloads the changed file for you to copy back into the config folder.'),
    h('div', { class: 'pathbox' }, h('code', {}, CONFIG_PATH), h('button', { class: 'btn small', onclick: copy }, 'Copy')),
    h('ol', {},
      h('li', {}, 'Click Load file.'),
      h('li', {}, 'Paste the path above into the dialog\'s address bar and press Enter.'),
      h('li', {}, 'Select GameUserSettings.ini.')),
    h('button', { class: 'btn primary', onclick: pickFiles }, 'Load file'),
    h('p', { class: 'muted', style: 'font-size:12.5px' }, 'You can also drag the file onto this page.'));
}

function tabSnapshots() {
  const snaps = [...S.snapshots].sort((a, b) => b.created - a.created);
  return h('div', { class: 'stack' },
    !S.loaded && connectScreen(),
    card('Snapshots', snaps.map(s => h('div', { class: 'snap' },
      h('div', { class: 'info' }, s.name, s.auto && h('span', { class: 'badges' }, h('span', { class: 'badge' }, 'auto')),
        h('small', {}, fmtDate(s.created))),
      h('button', { class: 'btn small', onclick: () => snapshotPreview(s) }, 'Restore…'),
      h('button', { class: 'iconbtn', title: 'Delete', onclick: () => confirmModal('Delete snapshot?', `"${s.name}" from ${fmtDate(s.created)} is removed from this browser.`, 'Delete', async () => { await db.del('snapshots', s.id); S.snapshots = S.snapshots.filter(x => x !== s); render(); }, true) }, '🗑'))),
      { note: `Full copies of GameUserSettings.ini as loaded. One is taken automatically before every download and restore (newest ${MAX_AUTO} automatic ones kept); manual ones are kept until you delete them. Restoring downloads the snapshot's file.`,
        empty: 'No snapshots yet.', actions: S.loaded && h('button', { class: 'btn small', onclick: takeSnapshotModal }, 'Take snapshot') }),
    card('Backup', [h('div', { class: 'row' }, labelBlock('Export / import', 'Snapshots and remembered keybind actions live in this browser only. Export them to a file to keep a backup or move to another browser.'),
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
    toolbar.append(h('span', { class: 'muted' }, 'Edits apply when you switch view or download.'));
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
      const on = e => { l.value = e.target.value; row.classList.toggle('changed', l.value !== l.orig); doc.changed(); };
      const inp = l.value.length > 90 ? h('textarea', { value: l.value, spellcheck: false, rows: Math.min(10, Math.ceil(l.value.length / 110)), oninput: on })
                                      : h('input', { type: 'text', value: l.value, spellcheck: false, oninput: on });
      row.append(h('code', {}, l.keyRaw.trim()), inp,
        h('button', { class: 'iconbtn', title: 'Delete this line', onclick: () => { doc.removeLine(l); fill(); } }, '✕'));
      return row;
    }))));
    if (!bySec.size) list.append(h('div', { class: 'empty-state' }, doc.lines.some(l => l.kind === 'kv') ? 'No matching keys.' : 'This file is empty.'));
  }
  fill();
  return h('div', {}, toolbar, h('div', { class: 'stack' }, addCard, list));
}

/* ================= shell ================= */
const TABS = [['snapshots', 'Snapshots', tabSnapshots], ['graphics', 'Graphics', tabGraphics], ['controls', 'Controls', tabControls],
  ['keybinds', 'Keybinds', tabKeybinds], ['raw', 'Raw', tabRaw]];

function renderHeader() {
  const conn = document.getElementById('conn');
  conn.className = 'conn';
  const loadBtn = h('button', { class: 'btn small', onclick: pickFiles }, S.loaded ? 'Load again' : 'Load file');
  if (S.loaded) {
    const when = S.files.gus.lastModified && `Last changed ${fmtDate(S.files.gus.lastModified)}`;
    conn.classList.add('ok');
    conn.replaceChildren(h('span', { class: 'dot' }), h('span', { title: when || '' }, S.files.gus.name), loadBtn);
  } else conn.replaceChildren(h('span', { class: 'dot' }), loadBtn);

  const dirty = anyDirty() || !!ui.rawPending;
  const n = S.loaded ? allChanges().length : 0;
  document.getElementById('pills').replaceChildren(...[
    dirty && h('span', { class: 'pill dirty' }, n ? `${n} unsaved change${n === 1 ? '' : 's'}` : 'Unsaved edits'),
  ].filter(Boolean));
  document.getElementById('saveBtn').disabled = !dirty || !S.loaded;
  document.getElementById('discardBtn').disabled = !dirty;
}

function renderTabs() {
  document.getElementById('tabs').replaceChildren(...TABS.map(([id, label]) =>
    h('button', { class: S.tab === id ? 'on' : '', onclick: () => { applyRawText(); stopCapture(); S.tab = id; render(); } }, label)));
}

function renderView() {
  const tab = TABS.find(t => t[0] === S.tab) || TABS[0];
  const y = window.scrollY;
  document.getElementById('view').replaceChildren(tab[0] === 'snapshots' || S.loaded ? tab[2]() : connectScreen());
  window.scrollTo(0, y);
}
function render() { renderTabs(); renderView(); renderHeader(); }
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
  setupDrop();
  for (const f of Object.values(S.files)) f.doc.onChange = renderHeader;
  document.getElementById('saveBtn').onclick = () => reviewSave();
  document.getElementById('discardBtn').onclick = discard;
  document.getElementById('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !isCapturing()) closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!document.getElementById('saveBtn').disabled) reviewSave(); }
  });
  window.addEventListener('beforeunload', e => { if (anyDirty() || ui.rawPending) { e.preventDefault(); e.returnValue = ''; } });

  try {
    S.snapshots = await db.all('snapshots');
    S.known = (await db.get('kv', 'knownBinds')) || {};
  } catch (e) { toast('Browser storage is unavailable: ' + e.message, 'err'); }

  db.del('kv', 'dir').catch(() => {}); // folder handle stored by the earlier folder-access version
  render();
}

init();
