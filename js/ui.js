import { humanize, fmtNum, structGet, structSet, splitTop, unwrap } from './ini.js';
import { S, docOf } from './state.js';
import { keyId } from './layers.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'list' || k.startsWith('data-') || k.startsWith('aria-') || !(k in el)) el.setAttribute(k, v === true ? '' : v);
    else el[k] = v;
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

/* ---------- modal & toast ---------- */
export function modal(title, body, buttons, left) {
  const m = document.getElementById('modal');
  m.replaceChildren(h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
    h('h3', {}, title), h('div', { class: 'body' }, body),
    h('div', { class: 'foot' }, left && h('div', { class: 'left' }, left), buttons)));
  m.hidden = false;
  m.querySelector('input[type=text]')?.focus();
}
export function closeModal() { document.getElementById('modal').hidden = true; }
export function toast(msg, kind) {
  const t = h('div', { class: 'toast' + (kind === 'err' ? ' err' : '') }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 8000 : 3500);
}
export function confirmModal(title, text, okLabel, onOk, danger) {
  modal(title, h('p', { style: 'margin:0' }, text), [
    h('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
    h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { closeModal(); onOk(); } }, okLabel)]);
}

/* ---------- diff rendering ---------- */
export function short(v) {
  if (v === undefined || v === null) return h('i', {}, '(not set)');
  return v.length > 160 ? h('span', { title: v }, v.slice(0, 160) + '…') : v;
}
// Long struct lists (keybinds, HUD…): show only the entries that differ.
export function changeVals(oldV, newV) {
  const isList = v => v != null && v.length > 160 && v.trim().startsWith('(');
  if (isList(oldV) && isList(newV)) {
    const a = splitTop(unwrap(oldV)), b = splitTop(unwrap(newV));
    const sa = new Set(a), sb = new Set(b);
    return [...a.filter(x => !sb.has(x)).map(x => h('div', { class: 'old' }, '− ' + x)),
            ...b.filter(x => !sa.has(x)).map(x => h('div', { class: 'new' }, '+ ' + x))];
  }
  return [h('span', { class: 'old' }, short(oldV)), h('span', { class: 'arrow' }, '→'), h('span', { class: 'new' }, short(newV))];
}
export function changeRow(fileLabel, c, oldV = c.old, newV = c.value) {
  return h('div', { class: 'change' },
    h('div', { class: 'k' }, c.key, ' ', h('small', {}, `${fileLabel} › ${c.section ?? ''}`)),
    h('div', { class: 'vals' }, changeVals(oldV, newV)));
}

/* ---------- settings fields ---------- */
const truthy = v => /^true$/i.test(v || '');
export const F = (type, k, label, o = {}) => ({ type, k, label, s: '/Script/WDGame.WDUserSettings', file: 'gus', ...o });
export const B = (k, label, o) => F('bool', k, label, o);
export const N = (k, label, o) => F('num', k, label, o);
export const R = (k, label, min, max, step, o) => F('range', k, label, { min, max, step, ...o });
export const T = (k, label, o) => F('text', k, label, o);
export const SEL = (k, label, opts, o) => F('select', k, label, { opts, ...o });

// Infer a control from the current value; null if the key isn't in the file.
export function auto(k, label, s = '/Script/WDGame.WDUserSettings', file = 'gus') {
  const v = docOf(file).get(s, k);
  if (v === undefined) return null;
  if (/^(true|false)$/i.test(v)) return B(k, label, { s, file });
  if (/^-?\d+(\.\d+)?$/.test(v)) return N(k, label, { s, file, float: v.includes('.') });
  return T(k, label, { s, file });
}

function accessor(def) {
  const doc = docOf(def.file);
  if (def.f) return {
    read: orig => { const v = orig ? doc.origGet(def.s, def.k) : doc.get(def.s, def.k); return v === undefined ? undefined : structGet(v, def.f); },
    write: v => doc.set(def.s, def.k, structSet(doc.get(def.s, def.k) ?? '()', def.f, v)),
  };
  return {
    read: orig => orig ? doc.origGet(def.s, def.k) : doc.get(def.s, def.k),
    write: v => { doc.set(def.s, def.k, v); (def.link || []).forEach(k => { if (doc.get(def.s, k) !== undefined) doc.set(def.s, k, v); }); },
  };
}

// extra goes beside the label, outside the <label> element, so buttons in it don't act as the label's control.
export function labelBlock(label, help, code, extra) {
  return h('div', { class: 'lbl' }, extra ? h('div', { class: 'lh' }, h('label', {}, label), extra) : h('label', {}, label),
    help && h('small', {}, help), code && h('code', {}, code));
}

// Layer marks for a row, decided by app.js: in the total config, which layer sets this id; while editing a layer,
// whether the layer owns it (with a button to drop it) or not (dimmed). Call paint() again after the value changes.
export function ownMark(row, id) {
  const el = h('span', { class: 'own' });
  const paint = () => {
    const o = S.hooks.owner?.(id) || {};
    row.classList.toggle('dim', o.state === 'dim');
    row.classList.toggle('owned', o.state === 'owned');
    el.replaceChildren(...[
      o.badge && h('span', { class: 'badge layer' + (o.warn ? ' warn' : ''), title: o.title }, o.badge),
      o.remove && h('button', { class: 'iconbtn', title: 'Remove from this layer', onclick: o.remove }, '⊖'),
    ].filter(Boolean));
  };
  paint();
  return { el, paint };
}

export function field(def) {
  const acc = accessor(def);
  const cur = acc.read();
  const row = h('div', { class: 'row' });
  const om = ownMark(row, keyId(def.s, def.k));
  const mark = () => { const v = acc.read(); row.classList.toggle('changed', v !== acc.read(true)); row.classList.toggle('missing', v === undefined); om.paint(); };
  const put = v => { acc.write(v); mark(); };
  const ctl = h('div', { class: 'ctl' });
  const isFloat = def.float ?? (def.type === 'range' && !def.int);

  switch (def.type) {
    case 'bool':
      ctl.append(h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: truthy(cur), onchange: e => put(e.target.checked ? 'True' : 'False') }), h('span')));
      break;
    case 'num': {
      const shown = cur !== undefined && /^-?\d+(\.\d+)?$/.test(cur) ? String(Number(cur)) : cur ?? '';
      ctl.append(h('input', { type: 'number', step: def.step || 'any', value: shown, placeholder: '—',
        onchange: e => { if (e.target.value !== '') put(fmtNum(e.target.value, acc.read(), isFloat)); } }),
        h('span', { class: 'unit' }, def.unit || ''));
      break;
    }
    case 'range': {
      const scale = def.pct ? 100 : 1;
      const sl = h('input', { type: 'range', min: def.min, max: def.max, step: def.step });
      const nb = h('input', { type: 'number', step: 'any', placeholder: '—' });
      if (cur !== undefined && cur !== '') { const d = Number(cur) * scale; nb.value = +d.toFixed(def.pct ? 2 : 6); sl.value = d; } else sl.value = def.min;
      const write = v => put(fmtNum(Number(v) / scale, acc.read(), isFloat));
      sl.oninput = () => { nb.value = sl.value; write(sl.value); };
      nb.onchange = () => { if (nb.value === '') return; sl.value = nb.value; write(nb.value); };
      ctl.append(sl, nb, h('span', { class: 'unit' }, def.pct ? '%' : (def.unit || '')));
      break;
    }
    case 'select': {
      const opts = def.opts.map(([v, l]) => [String(v), l]);
      if (cur !== undefined && !opts.some(o => o[0] === cur)) opts.push([cur, cur + ' (current)']);
      const sel = h('select', { onchange: e => put(e.target.value) },
        cur === undefined && h('option', { value: '', disabled: true }, '— not set —'),
        opts.map(([v, l]) => h('option', { value: v }, l)));
      sel.value = cur ?? '';
      ctl.append(sel);
      break;
    }
    case 'text': {
      const id = 'dl-' + Math.random().toString(36).slice(2);
      const quoted = cur !== undefined && /^".*"$/.test(cur);
      ctl.append(h('input', { type: 'text', value: (quoted ? cur.slice(1, -1) : cur) ?? '', spellcheck: false, list: def.suggest ? id : null,
        oninput: e => put(quoted ? `"${e.target.value}"` : e.target.value) }));
      if (def.suggest) ctl.append(h('datalist', { id }, def.suggest.map(v => h('option', { value: v }))));
      break;
    }
  }
  row.append(labelBlock(def.label || humanize(def.f || def.k), def.help, def.f ? `${def.k} › ${def.f}` : def.k, om.el), ctl);
  mark();
  return row;
}

export function card(title, items, opts = {}) {
  const c = h('section', { class: 'card' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '') },
    h('h2', {}, title, opts.actions && h('span', { class: 'actions' }, opts.actions)));
  if (opts.note) c.append(h('div', { class: 'note' }, opts.note));
  let n = 0;
  for (const it of items.flat()) { if (!it) continue; c.append(it.nodeType ? it : field(it)); n++; }
  if (!n && opts.empty !== false) c.append(h('div', { class: 'empty-state' }, opts.empty || 'Nothing in the config file for this section yet.'));
  return c;
}

// data: a string or bytes.
export function download(name, data, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([data], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
