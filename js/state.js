import { IniDoc } from './ini.js';
import { FILES } from './store.js';

export const SEC = {
  U: '/Script/WDGame.WDUserSettings',
  SG: 'ScalabilityGroups',
  JOY: '/Script/WDJoystick.WDJoystickSettings',
  BINDS: '/Script/BHEnhancedInput.BHEnhancedInputPlayerBinds',
};

const blankFile = key => ({ key, name: FILES[key], doc: new IniDoc(''), exists: false, enc: 'utf8', lastModified: null });

export const S = {
  dir: null,            // FileSystemDirectoryHandle of the WindowsClient folder
  perm: 'none',         // none | prompt | granted
  sandbox: false,
  loaded: false,
  files: { gus: blankFile('gus'), engine: blankFile('engine') },
  layers: [],           // { id, name, entries: [{ file, section, key, value|null }], created, updated }
  snapshots: [],        // { id, name, auto, created, files: { gus, engine } }
  settings: { activeLayers: [], verified: {}, riskAccepted: false },
  tab: 'profiles',
  stale: false,
  hooks: {},            // render callbacks set by app.js
};

export const docOf = file => S.files[file].doc;
export const anyDirty = () => S.loaded && Object.values(S.files).some(f => f.doc.dirty());
export const entryId = e => `${e.file}\u0001${e.section}\u0001${e.key}`;

// Merge active layers in order; later layers win.
export function effectiveOverrides() {
  const m = new Map();
  for (const id of S.settings.activeLayers) {
    const layer = S.layers.find(l => l.id === id);
    if (!layer) continue;
    for (const e of layer.entries) m.set(entryId(e), { ...e, layer: layer.name });
  }
  return m;
}
export function layerFor(file, section, key) {
  return effectiveOverrides().get(entryId({ file, section, key }))?.layer;
}
