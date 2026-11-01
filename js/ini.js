// Line-preserving INI model: untouched lines are written back byte-for-byte.

export function parseIni(text) {
  const eol = /\r\n/.test(text) ? '\r\n' : text.includes('\n') ? '\n' : '\r\n';
  let section = null;
  const lines = text.split(/\r?\n/).map(raw => {
    const t = raw.trim();
    if (t.startsWith('[') && t.endsWith(']')) { section = t.slice(1, -1); return { kind: 'section', raw, section }; }
    const i = raw.indexOf('=');
    if (!t || t[0] === ';' || t[0] === '#' || i < 0) return { kind: 'other', raw, section };
    const keyRaw = raw.slice(0, i);
    return { kind: 'kv', raw, section, keyRaw, key: keyRaw.trim().replace(/^[+\-.!]/, ''), value: raw.slice(i + 1) };
  });
  return { lines, eol };
}

const isKv = (l, sec, key) => l.kind === 'kv' && l.section === sec && l.key === key;

export class IniDoc {
  constructor(text = '') { this.onChange = null; this.load(text); }

  load(text) {
    const p = parseIni(text);
    this.lines = p.lines;
    this.eol = p.eol;
    this.original = text;
    this.orig = parseIni(text).lines;
    this.annotate();
  }

  // Replace the working lines (raw text edit) but keep the on-disk original for diffs.
  setText(text) {
    const p = parseIni(text);
    this.lines = p.lines;
    this.eol = p.eol;
    this.annotate();
    this.changed();
  }

  annotate() {
    const m = new Map(), seen = {};
    const id = l => { const b = l.section + '\u0001' + l.key; seen[b] = (seen[b] || 0) + 1; return b + '\u0001' + seen[b]; };
    for (const l of this.orig) if (l.kind === 'kv') m.set(id(l), l.value);
    for (const k in seen) delete seen[k];
    for (const l of this.lines) if (l.kind === 'kv') l.orig = m.get(id(l));
  }

  changed() { this.onChange?.(); }
  serialize() { return this.lines.map(l => l.kind === 'kv' ? l.keyRaw + '=' + l.value : l.raw).join(this.eol); }
  dirty() { return this.serialize() !== this.original; }

  find(sec, key) { return this.lines.find(l => isKv(l, sec, key)); }
  get(sec, key) { const l = this.find(sec, key); return l ? l.value : undefined; }
  origGet(sec, key) { const l = this.orig.find(l => isKv(l, sec, key)); return l ? l.value : undefined; }
  getAll(sec, key) { return this.lines.filter(l => isKv(l, sec, key)).map(l => l.value); }
  origGetAll(sec, key) { return this.orig.filter(l => isKv(l, sec, key)).map(l => l.value); }
  keysIn(sec) { return [...new Set(this.lines.filter(l => l.kind === 'kv' && l.section === sec).map(l => l.key))]; }
  sections() { return [...new Set(this.lines.filter(l => l.kind === 'section' || l.kind === 'kv').map(l => l.section).filter(s => s != null))]; }

  set(sec, key, val) {
    val = String(val);
    const l = this.find(sec, key);
    if (l) l.value = val; else this.insertLine(sec, { kind: 'kv', section: sec, key, keyRaw: key, value: val });
    this.changed();
  }

  remove(sec, key) {
    const before = this.lines.length;
    this.lines = this.lines.filter(l => !isKv(l, sec, key));
    if (this.lines.length !== before) this.changed();
  }

  removeLine(line) { this.lines = this.lines.filter(l => l !== line); this.changed(); }

  setAll(sec, key, vals) {
    const mk = v => ({ kind: 'kv', section: sec, key, keyRaw: key, value: v });
    const idx = this.lines.map((l, i) => isKv(l, sec, key) ? i : -1).filter(i => i >= 0);
    if (!idx.length) vals.forEach(v => this.insertLine(sec, mk(v)));
    else { for (let j = idx.length - 1; j >= 0; j--) this.lines.splice(idx[j], 1); this.lines.splice(idx[0], 0, ...vals.map(mk)); }
    this.changed();
  }

  insertLine(sec, line) {
    let at = -1;
    this.lines.forEach((l, i) => { if (l.section === sec && (l.kind === 'kv' || l.kind === 'section')) at = i; });
    if (at >= 0) { this.lines.splice(at + 1, 0, line); return; }
    let end = this.lines.length;
    while (end > 0 && this.lines[end - 1].kind === 'other' && !this.lines[end - 1].raw.trim()) end--;
    const head = end > 0 ? [{ kind: 'other', raw: '', section: null }] : [];
    this.lines.splice(end, 0, ...head, { kind: 'section', raw: `[${sec}]`, section: sec }, line);
    // keep a trailing newline
    if (this.lines[this.lines.length - 1].raw !== '' || this.lines[this.lines.length - 1].kind !== 'other') this.lines.push({ kind: 'other', raw: '', section: null });
  }

  // Key-level differences between the on-disk original and the working copy.
  changes() { return diffLines(this.orig, this.lines); }
}

export function diffLines(a, b) {
  const collect = lines => {
    const m = new Map(), seen = {};
    for (const l of lines) if (l.kind === 'kv') {
      const k = l.section + '\u0001' + l.key; const n = seen[k] = (seen[k] || 0) + 1;
      m.set(k + '\u0001' + n, { section: l.section, key: l.key, value: l.value });
    }
    return m;
  };
  const A = collect(a), B = collect(b), out = [];
  for (const [id, o] of A) { const n = B.get(id); if (!n) out.push({ ...o, old: o.value, value: undefined }); else if (n.value !== o.value) out.push({ ...n, old: o.value }); }
  for (const [id, n] of B) if (!A.has(id)) out.push({ ...n, old: undefined });
  return out;
}
export const diffTexts = (a, b) => diffLines(parseIni(a || '').lines, parseIni(b || '').lines);

/* ---------- Unreal struct helpers ---------- */
export function splitTop(s) {
  const out = []; let d = 0, q = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') q = !q;
    else if (!q) { if (c === '(') d++; else if (c === ')') d--; else if (c === ',' && d === 0) { out.push(s.slice(start, i)); start = i + 1; } }
  }
  out.push(s.slice(start));
  return out;
}
export function unwrap(s) {
  s = s.trim();
  if (s[0] !== '(') return s;
  let d = 0, q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') q = !q;
    else if (!q) { if (c === '(') d++; else if (c === ')' && --d === 0) return i === s.length - 1 ? s.slice(1, -1) : s; }
  }
  return s;
}
export function structGet(str, name) {
  for (const p of splitTop(unwrap(str || ''))) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i).trim() === name) return p.slice(i + 1); }
}
export function structSet(str, name, val) {
  let found = false;
  const parts = splitTop(unwrap(str || '')).filter(p => p !== '').map(p => {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === name) { found = true; return p.slice(0, i + 1) + val; }
    return p;
  });
  if (!found) parts.push(name + '=' + val);
  return '(' + parts.join(',') + ')';
}
// ((TagName="X"), Value),((TagName="Y"), Value)
export const tagList = v => [...(v || '').matchAll(/\(\(TagName="([^"]*)"\),\s*([^)]*?)\)/g)].map(m => ({ tag: m[1], v: m[2] }));
export const tagListStr = items => '(' + items.map(i => `((TagName="${i.tag}"), ${i.v})`).join(',') + ')';

/* ---------- formatting ---------- */
export function humanize(k, keepCase) {
  let s = k.replace(/^sg\./, '').replace(/^b(?=[A-Z])/, '').replace(/^Is(?=[A-Z])/, '').replace(/(?<=.)Enabled$/, '');
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  if (keepCase) return s;
  return s.split(' ').map((w, i) => (w.length > 1 && w === w.toUpperCase()) ? w : i ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Keep the number style the game wrote (UE uses 6 decimals for floats).
export function fmtNum(n, like, isFloat) {
  n = Number(n);
  if (!Number.isFinite(n)) return like ?? '0';
  const m = /\.(\d+)$/.exec(String(like ?? '').trim());
  if (m) { const s = n.toFixed(m[1].length); return Math.abs(Number(s) - n) < 1e-9 ? s : String(n); }
  if (Number.isInteger(n) && !(isFloat && like === undefined)) return String(n);
  const s = n.toFixed(6);
  return Math.abs(Number(s) - n) < 1e-9 ? s : String(n);
}
