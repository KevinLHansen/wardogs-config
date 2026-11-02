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
  layers: [],           // working copy, priority order (first wins): { id, name, active, entries: { id: value } } (see layers.js)
  saved: { layers: [], applied: [] }, // as last saved; applied: ids the layers set in the file at that save
  plan: new Map(),      // what the layers currently do to the file doc (see layers.js plan())
  edit: null,           // id of the layer being edited, or null for the total config
  view: null,           // while editing a layer: the doc the tabs work on
  drift: [],            // ids the layers own that differed in the file when it was loaded (usually the game changed them)
  backups: [],          // { created, text }, newest first
  known: {},            // keybind actions seen in loaded files: { tag: { firstSeen, lastSeen, defaults: { PrimaryKey?, SecondaryKey? } } }
  tab: 'file',
  path: null,           // desktop app: full path of the file being edited
  stale: false,         // desktop app: the file changed on disk while there are unsaved edits
  busy: false,          // desktop app: a save or undo is writing the file
  hooks: {},            // render callbacks set by app.js
};

// The doc the editors work on: the layer view while a layer is being edited.
export const docOf = file => (S.view && file === 'gus' ? S.view : S.files[file].doc);
