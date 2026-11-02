import { IniDoc } from './ini.js';
import { FILES } from './store.js';

export const SEC = {
  U: '/Script/WDGame.WDUserSettings',
  SG: 'ScalabilityGroups',
  JOY: '/Script/WDJoystick.WDJoystickSettings',
  BINDS: '/Script/BHEnhancedInput.BHEnhancedInputPlayerBinds',
};

// exists: the file was loaded (false means not loaded, so it is treated as absent and created on download).
const blankFile = key => ({ key, name: FILES[key], doc: new IniDoc(''), exists: false, enc: 'utf8', lastModified: null });

export const S = {
  loaded: false,        // GameUserSettings.ini has been loaded
  files: { gus: blankFile('gus') },
  layers: [],           // { id, name, entries: [{ file, section, key, value|null }], created, updated }
  snapshots: [],        // { id, name, auto, created, files: { gus } }
  settings: { activeLayers: [] },
  known: {},            // keybind actions seen in loaded files: { tag: { firstSeen, lastSeen, defaults: { PrimaryKey?, SecondaryKey? } } }
  tab: 'profiles',
  hooks: {},            // render callbacks set by app.js
};

export const docOf = file => S.files[file].doc;
export const anyDirty = () => S.loaded && Object.values(S.files).some(f => f.doc.dirty());
export const entryId = e => `${e.file}\u0001${e.section}\u0001${e.key}`;
// Layer entries for files this editor handles (older versions also stored Engine.ini entries).
export const layerEntries = layer => layer.entries.filter(e => S.files[e.file]);

// Merge active layers in order; later layers win.
export function effectiveOverrides() {
  const m = new Map();
  for (const id of S.settings.activeLayers) {
    const layer = S.layers.find(l => l.id === id);
    if (!layer) continue;
    for (const e of layerEntries(layer)) m.set(entryId(e), { ...e, layer: layer.name });
  }
  return m;
}
export function layerFor(file, section, key) {
  return effectiveOverrides().get(entryId({ file, section, key }))?.layer;
}
