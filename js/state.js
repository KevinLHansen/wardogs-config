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
  snapshots: [],        // { id, name, auto, created, files: { gus } }
  known: {},            // keybind actions seen in loaded files: { tag: { firstSeen, lastSeen, defaults: { PrimaryKey?, SecondaryKey? } } }
  tab: 'snapshots',
  hooks: {},            // render callbacks set by app.js
};

export const docOf = file => S.files[file].doc;
export const anyDirty = () => S.loaded && Object.values(S.files).some(f => f.doc.dirty());
