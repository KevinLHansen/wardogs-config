// Shared test helpers. The fixture is a real GameUserSettings.ini (UTF-8, CRLF) with device IDs and timestamps zeroed.
import { readFileSync } from 'node:fs';
import { decodeBytes } from '../js/store.js';
import { IniDoc } from '../js/ini.js';

export const FIXTURE_BYTES = new Uint8Array(readFileSync(new URL('./fixtures/GameUserSettings.ini', import.meta.url)));
export const FIXTURE = decodeBytes(FIXTURE_BYTES).text;
export const loadFixture = () => new IniDoc(FIXTURE);

export const U = '/Script/WDGame.WDUserSettings';
export const BINDS = '/Script/BHEnhancedInput.BHEnhancedInputPlayerBinds';
export const JOY = '/Script/WDJoystick.WDJoystickSettings';

// Line-by-line differences between two texts, as [lineNumber, before, after].
export function changedLines(a, b) {
  const x = a.split('\r\n'), y = b.split('\r\n');
  const out = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push([i + 1, x[i], y[i]]);
  return out;
}
