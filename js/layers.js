// Layers: named sets of settings applied on top of the loaded file. No DOM, so it can be tested in Node.
// A layer owns ids: a plain INI key, or one keybind action inside CustomKeybindings (its value is that action's
// whole entry, both slots). Layers only hold values, never "absent". A layer is { id, name, active, entries: { id: value } };
// lists of layers are in priority order, the first wins.
import { IniDoc, diffTexts } from './ini.js';
import { parseBinds, bindsStr } from './binds.js';
import { SEC } from './state.js';

const SEP = '\u0001';
const BINDS_KEY = 'CustomKeybindings';
const isBinds = (sec, key) => sec === SEC.BINDS && key === BINDS_KEY;

export const keyId = (section, key) => 'k' + SEP + section + SEP + key;
export const bindId = tag => 'b' + SEP + tag;
export function parseId(id) {
  const [kind, a, b] = id.split(SEP);
  return kind === 'b' ? { kind, tag: a } : { kind, section: a, key: b };
}
export function idLabel(id) {
  const p = parseId(id);
  return p.kind === 'b' ? p.tag.replace(/^Input\.NamedActions\./, '') : p.key;
}

// The value of an id in a doc (orig: as loaded); undefined when absent.
export function readId(doc, id, orig = false) {
  const p = parseId(id);
  if (p.kind === 'k') return orig ? doc.origGet(p.section, p.key) : doc.get(p.section, p.key);
  const list = parseBinds(orig ? doc.origGet(SEC.BINDS, BINDS_KEY) : doc.get(SEC.BINDS, BINDS_KEY));
  return list.find(b => b.tag === p.tag)?.raw;
}

// Set ids to values (Map id → value), removing those whose value is undefined. Lines that don't change are left alone.
export function writeIds(doc, values) {
  let binds = null;
  for (const [id, v] of values) {
    const p = parseId(id);
    if (p.kind === 'k') {
      if (v === undefined) doc.remove(p.section, p.key);
      else if (doc.get(p.section, p.key) !== v) doc.set(p.section, p.key, v);
      continue;
    }
    binds ||= parseBinds(doc.get(SEC.BINDS, BINDS_KEY));
    const i = binds.findIndex(b => b.tag === p.tag);
    if (v === undefined) { if (i >= 0) binds.splice(i, 1); }
    else if (i < 0) binds.push({ tag: p.tag, raw: v, dirty: false });
    else binds[i] = { ...binds[i], raw: v, dirty: false };
  }
  if (!binds) return;
  const cur = doc.get(SEC.BINDS, BINDS_KEY), next = bindsStr(binds);
  if (cur !== next && (cur !== undefined || binds.length)) doc.set(SEC.BINDS, BINDS_KEY, next);
}

// The winning value of every id the active layers own: Map id → { value, layer }.
export function winners(layers) {
  const out = new Map();
  for (const l of layers) if (l.active) for (const [id, value] of Object.entries(l.entries)) if (!out.has(id)) out.set(id, { value, layer: l });
  return out;
}

// What the layers do to the file: Map id → value, or undefined to remove it. `applied` lists the ids the layers set
// in the file at the last save; those no active layer owns any more are removed, so the game uses its default.
export function plan(layers, applied = []) {
  const out = new Map([...winners(layers)].map(([id, w]) => [id, w.value]));
  for (const id of applied) if (!out.has(id)) out.set(id, undefined);
  return out;
}

// A file's text with the layers applied.
export function stackText(text, layers, applied) {
  const d = new IniDoc(text);
  writeIds(d, plan(layers, applied));
  return d.serialize();
}

// Move a doc from one plan to another. Ids whose outcome is the same in both keep whatever they hold now (so edits
// made to them survive); an id neither plan covers goes back to its value as loaded.
export function replan(doc, from, to) {
  const target = (p, id) => p.has(id) ? p.get(id) : readId(doc, id, true);
  const changes = new Map();
  for (const id of new Set([...from.keys(), ...to.keys()])) {
    const t = target(to, id);
    if (t !== target(from, id)) changes.set(id, t);
  }
  writeIds(doc, changes);
}

// Setting-level differences from text a to text b: [{ id, value, repeated? }], value undefined when removed.
// Keybinds are compared per action, ignoring order. Keys that appear more than once are flagged `repeated`: a layer can't hold them.
export function editsBetween(a, b) {
  const da = new IniDoc(a), db = new IniDoc(b), out = [];
  for (const c of diffTexts(a, b)) {
    if (isBinds(c.section, c.key)) continue;
    const id = keyId(c.section, c.key);
    if (out.some(e => e.id === id)) continue;
    const repeated = da.getAll(c.section, c.key).length > 1 || db.getAll(c.section, c.key).length > 1;
    out.push(repeated ? { id, value: c.value, repeated } : { id, value: c.value });
  }
  const tags = d => new Map(parseBinds(d.get(SEC.BINDS, BINDS_KEY)).filter(x => x.tag).map(x => [x.tag, x.raw]));
  const A = tags(da), B = tags(db);
  for (const [tag, raw] of B) if (A.get(tag) !== raw) out.push({ id: bindId(tag), value: raw });
  for (const tag of A.keys()) if (!B.has(tag)) out.push({ id: bindId(tag), value: undefined });
  return out;
}
