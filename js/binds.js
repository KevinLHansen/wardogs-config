// Keybind data: the CustomKeybindings list in GameUserSettings.ini. No DOM, so it can be tested in Node.
// Format: (((TagName="Input.NamedActions.X"), (PrimaryKey=(Key=F,bIsCustom=True),SecondaryKey=(...))),...)
import { splitTop, unwrap } from './ini.js';

export const SLOTS = [['PrimaryKey', 'Primary'], ['SecondaryKey', 'Secondary']];

export function parseBinds(value) {
  if (!value || !value.trim()) return [];
  return splitTop(unwrap(value)).filter(s => s.trim()).map(raw => {
    const [tagPart, slotPart] = splitTop(unwrap(raw));
    const tag = (/TagName="([^"]*)"/.exec(tagPart || '') || [])[1] || '';
    const slots = {};
    for (const s of splitTop(unwrap(slotPart || ''))) {
      const i = s.indexOf('='); if (i < 0) continue;
      const fields = {};
      for (const f of splitTop(unwrap(s.slice(i + 1)))) { const j = f.indexOf('='); if (j > 0) fields[f.slice(0, j).trim()] = f.slice(j + 1); }
      slots[s.slice(0, i).trim()] = fields;
    }
    return { raw, tag, slots, dirty: false };
  });
}

// Entries that weren't changed are written back exactly as read.
export function bindStr(b) {
  if (!b.dirty) return b.raw;
  const order = ['PrimaryKey', 'SecondaryKey', ...Object.keys(b.slots).filter(n => !/^(Primary|Secondary)Key$/.test(n))];
  const slots = order.filter(n => b.slots[n] && Object.keys(b.slots[n]).length)
    .map(n => n + '=(' + Object.entries(b.slots[n]).map(([k, v]) => k + '=' + v).join(',') + ')');
  return `((TagName="${b.tag}"), (${slots.join(',')}))`;
}
export const bindsStr = list => '(' + list.map(bindStr).join(',') + ')';

// Set (or with an empty key, clear) a slot's key; either way the slot becomes a custom override.
export function setKey(b, slot, key) {
  const { Key, ...rest } = b.slots[slot] || {};
  b.slots[slot] = key ? { Key: key, ...rest, bIsCustom: 'True' } : { ...rest, bIsCustom: 'True' };
  b.dirty = true;
}

// A slot the game saved as custom but with no key: the game unbound it, and its menu may not let you rebind it.
export const unboundSlots = b => SLOTS.filter(([s]) => b.slots[s]?.bIsCustom === 'True' && !b.slots[s].Key);

// Drop one slot from an override; with no custom slot left, drop the whole entry so the game uses its defaults.
// Returns the new list.
export function withoutSlot(list, b, slot) {
  delete b.slots[slot];
  b.dirty = true;
  return Object.values(b.slots).some(s => s.bIsCustom === 'True') ? list : list.filter(x => x !== b);
}

// Remember every action in the list, and any default key it reveals (a key saved without bIsCustom).
// Mutates `known`; returns how many actions were new.
export function learnBinds(known, list, now = Date.now()) {
  let added = 0;
  for (const b of list) {
    if (!b.tag) continue;
    const k = known[b.tag] ||= (added++, { firstSeen: now, defaults: {} });
    k.lastSeen = now;
    for (const [slot] of SLOTS) {
      const s = b.slots[slot];
      if (s?.Key && s.bIsCustom !== 'True') k.defaults[slot] = s.Key;
    }
  }
  return added;
}
