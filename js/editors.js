import { humanize, tagList, tagListStr } from './ini.js';
import { SLOTS, parseBinds, bindStr, bindsStr, setKey, unboundSlots, withoutSlot } from './binds.js';
import { S, SEC, docOf } from './state.js';
import { h, toast, card, labelBlock, ownMark, B, N, R, T, SEL, auto } from './ui.js';
import { keyId, bindId } from './layers.js';

const { U, SG, JOY, BINDS } = SEC;
const gus = () => docOf('gus');
const rerender = () => S.hooks.renderView();
const prettyTag = (tag, prefix) => (prefix && tag.startsWith(prefix) ? tag.slice(prefix.length) : tag).split('.').map(p => humanize(p, true)).join(' › ');

/* ---------- Graphics ---------- */
function resolutionRow() {
  const d = gus();
  const row = h('div', { class: 'row' });
  const keys = ['ResolutionSizeX', 'ResolutionSizeY', 'LastUserConfirmedResolutionSizeX', 'LastUserConfirmedResolutionSizeY'];
  const nx = h('input', { type: 'number', step: 1, min: 320, value: d.get(U, keys[0]) ?? '' });
  const ny = h('input', { type: 'number', step: 1, min: 200, value: d.get(U, keys[1]) ?? '' });
  const presets = ['1280x720', '1600x900', '1920x1080', '2560x1080', '2560x1440', '3440x1440', '3840x1600', '3840x2160', '5120x1440'];
  const sel = h('select', {}, h('option', { value: '' }, 'Presets…'), presets.map(p => h('option', { value: p }, p.replace('x', ' × '))));
  const om = ownMark(row, keyId(U, keys[0]));
  const mark = () => { row.classList.toggle('changed', keys.slice(0, 2).some(k => d.get(U, k) !== d.origGet(U, k))); om.paint(); };
  const apply = () => {
    if (!nx.value || !ny.value) return;
    const v = [nx.value, ny.value, nx.value, ny.value].map(x => String(parseInt(x, 10)));
    keys.forEach((k, i) => { if (i < 2 || d.get(U, k) !== undefined) d.set(U, k, v[i]); });
    mark();
  };
  nx.onchange = ny.onchange = apply;
  sel.onchange = () => { if (!sel.value) return; [nx.value, ny.value] = sel.value.split('x'); sel.value = ''; apply(); };
  row.append(labelBlock('Resolution', 'Also updates the "last confirmed" resolution so the game keeps it', 'ResolutionSizeX / ResolutionSizeY', om.el),
    h('div', { class: 'ctl' }, nx, h('span', { class: 'unit' }, '×'), ny, sel));
  mark();
  return row;
}

const SG_NAMES = {
  'sg.ViewDistanceQuality': 'View distance', 'sg.AntiAliasingQuality': 'Anti-aliasing', 'sg.ShadowQuality': 'Shadows',
  'sg.GlobalIlluminationQuality': 'Global illumination', 'sg.ReflectionQuality': 'Reflections', 'sg.PostProcessQuality': 'Post-processing',
  'sg.TextureQuality': 'Textures', 'sg.EffectsQuality': 'Effects', 'sg.FoliageQuality': 'Foliage', 'sg.ShadingQuality': 'Shading',
  'sg.LandscapeQuality': 'Landscape', 'sg.MeshQuality': 'Meshes', 'sg.WorldTextureQuality': 'World textures',
  'sg.CharacterTextureQuality': 'Character textures', 'sg.EffectsTextureQuality': 'Effects textures',
  'sg.TextureFilteringQuality': 'Texture filtering', 'sg.ParticleSpawnRateQuality': 'Particle spawn rate',
  'sg.BloomQuality': 'Bloom', 'sg.DepthOfFieldQuality': 'Depth of field', 'sg.LensFlareQuality': 'Lens flare', 'sg.MotionBlurQuality': 'Motion blur',
};
const LEVELS = [[0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Epic'], [4, 'Cinematic']];

function scalabilityCard() {
  const present = gus().keysIn(SG);
  const order = Object.keys(SG_NAMES);
  const levelKeys = [...new Set([...order.filter(k => present.includes(k) || order.indexOf(k) < 10), ...present])].filter(k => !/ResolutionQuality$/.test(k));
  const preset = n => { levelKeys.forEach(k => gus().set(SG, k, String(n))); rerender(); toast(`All quality groups set to ${LEVELS[n][1]}.`); };
  return card('Quality levels', [
    R('sg.ResolutionQuality', 'Resolution scale', 25, 100, 0.5, { s: SG, unit: '%', help: '3D render resolution. Upscalers may override this.' }),
    present.includes('sg.SecondaryResolutionQuality') && R('sg.SecondaryResolutionQuality', 'Secondary resolution scale', 25, 100, 0.5, { s: SG, unit: '%' }),
    levelKeys.map(k => SEL(k, SG_NAMES[k] || humanize(k), LEVELS, { s: SG })),
  ], { wide: true, actions: [h('span', { class: 'muted' }, 'Set all:'), LEVELS.map(([n, l]) => h('button', { class: 'btn small', onclick: () => preset(n) }, l))] });
}

export function tabGraphics() {
  return h('div', { class: 'grid' },
    card('Display', [
      resolutionRow(),
      SEL('FullscreenMode', 'Window mode', [[0, 'Fullscreen'], [1, 'Windowed fullscreen'], [2, 'Windowed']], { link: ['LastConfirmedFullscreenMode', 'PreferredFullscreenMode'] }),
      B('bUseVSync', 'V-Sync'),
      N('FrameRateLimit', 'Frame rate limit', { float: true, unit: 'fps', help: '0 = unlimited' }),
      N('BackgroundFrameRateLimit', 'Background frame rate limit', { float: true, unit: 'fps', help: 'While the game window is not focused' }),
      R('Brightness', 'Brightness', 0, 5, 0.05),
      B('bUseHDRDisplayOutput', 'HDR output'),
      N('HDRDisplayOutputNits', 'HDR peak brightness', { unit: 'nits' }),
    ]),
    card('Field of view', [
      R('FieldOfView', 'Infantry FOV', 60, 120, 1, { unit: '°', help: 'Values outside the in-game slider range may be clamped by the game' }),
      R('FirstPersonVehicleFieldOfView', 'Vehicle FOV, first person', 60, 120, 1, { unit: '°' }),
      R('ThirdPersonVehicleFieldOfView', 'Vehicle FOV, third person', 60, 120, 1, { unit: '°' }),
      N('FirstPersonMeshFieldOfViewScale', 'First-person weapon FOV scale', { float: true }),
      T('AimingFovMode', 'Aiming FOV mode', { suggest: ['Affected'] }),
    ]),
    card('Upscaling & latency', [
      T('UpscalingMethod', 'Upscaling method', { suggest: ['DLSS', 'FSR3', 'XeSS', 'TSR'], help: 'Must match the name the game uses' }),
      N('NvidiaDLSSMode', 'DLSS mode', { help: 'Game-specific number; change it in-game once to see which is which' }),
      N('NvidiaDLSSGMode', 'DLSS frame generation mode'),
      N('NvidiaReflexMode', 'NVIDIA Reflex mode'),
      N('FSR3QualityMode', 'FSR 3 quality mode'),
      N('XeSSQualityMode', 'XeSS quality mode'),
      R('Sharpness', 'Sharpness', 0, 1, 0.01),
      B('bUseDynamicResolution', 'Dynamic resolution'),
    ]),
    card('Effects', [
      B('bUseMotionBlur', 'Motion blur'), B('bUseDepthOfField', 'Depth of field'), B('bUseLensFlare', 'Lens flare'), B('bUseBloom', 'Bloom'),
      auto('bNaniteMaterialVisibilityEnabled', 'Nanite material visibility'),
      auto('bAllowOverkillPreset', 'Allow "Overkill" preset'),
    ]),
    scalabilityCard(),
  );
}

/* ---------- Controls ---------- */
function tagSegCard(title, key, prefix, opts) {
  const d = gus();
  const items = tagList(d.get(U, key));
  const orig = tagList(d.origGet(U, key));
  const rows = items.map((it, i) => {
    const row = h('div', { class: 'row' });
    const seg = h('div', { class: 'seg' });
    const o = orig.find(x => x.tag === it.tag);
    const om = ownMark(row, keyId(U, key));
    const paint = () => { [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.v === items[i].v)); row.classList.toggle('changed', !o || o.v !== items[i].v); om.paint(); };
    for (const v of [...new Set([...opts, it.v])]) seg.append(h('button', { type: 'button', 'data-v': v, onclick: () => { items[i].v = v; d.set(U, key, tagListStr(items)); paint(); } }, v));
    row.append(labelBlock(prettyTag(it.tag, prefix), null, null, om.el), h('div', { class: 'ctl' }, seg));
    paint();
    return row;
  });
  return card(title, rows, { empty: `No ${key} in the file.` });
}

function joystickCard() {
  const AXIS = '_aaaajdmbkojdnhnkhhfhe';
  const items = gus().keysIn(JOY).map(k => [
    h('div', { class: 'row sub' }, h('div', { class: 'lbl' }, h('span', { class: 't' }, h('b', {}, humanize(k))))),
    N(k, 'Axis index', { s: JOY, f: AXIS, step: 1, help: 'Appears to be the device axis number; −1 = unbound' }),
    B(k, 'Invert', { s: JOY, f: 'bInvert' }),
    R(k, 'Sensitivity', 0, 5, 0.05, { s: JOY, f: 'Sensitivity' }),
    R(k, 'Dead zone', 0, 0.5, 0.005, { s: JOY, f: 'DeadZone' }),
  ]);
  return card('Joystick / HOTAS axes', items, { empty: 'No joystick settings in the file.' });
}

export function tabControls() {
  const pad = gus().keysIn(U).filter(k => /Gamepad|Stick|Trigger|LookAccel/.test(k) && !/Config(Infantry|GroundVehicle|Helicopter)$/.test(k));
  return h('div', { class: 'grid' },
    card('Mouse', [
      R('MouseSensitivity', 'Mouse sensitivity', 0.01, 1, 0.001),
      R('MouseVerticalAxisSensitivityMultiplier', 'Vertical sensitivity multiplier', 0.1, 3, 0.01),
      R('MouseADSSensitivityMultiplier', 'Aim-down-sights multiplier', 0.1, 3, 0.01),
      R('MouseAcceleration', 'Mouse acceleration', 0, 1, 0.01),
      T('AimingFovSensitivityMode', 'Aiming FOV sensitivity mode', { suggest: ['Relative'] }),
      T('AimingFovSensitivityTransitionType', 'Aiming sensitivity transition', { suggest: ['AimingAlpha'] }),
      N('AimingSensitivityRelativeCoefficient', 'Aiming relative coefficient', { float: true }),
      B('bInvertYAxisInfantry', 'Invert Y axis (infantry)'),
      B('EnableFreeCursorState', 'Free cursor'),
      R('FreeCursorSensitivity', 'Free cursor sensitivity', 0.1, 3, 0.01),
    ]),
    card('Vehicles', [
      R('LandVehicleSensitivityMultiplier', 'Land vehicle sensitivity', 0.1, 3, 0.01),
      R('AirVehicleSensitivityMultiplier', 'Air vehicle sensitivity', 0.1, 5, 0.01),
      R('VehicleWeaponMouseSensitivityMultiplier', 'Vehicle weapon sensitivity', 0.1, 3, 0.01),
      R('VehicleFirstPersonCameraSensitivity', 'First-person camera sensitivity', 0.1, 3, 0.01),
      R('VehicleThirdPersonCameraSensitivity', 'Third-person camera sensitivity', 0.1, 3, 0.01),
      B('VehicleFreelookOnByDefault', 'Free look on by default'),
      T('VehicleTransmissionType', 'Transmission', { suggest: ['AUTO'] }),
      B('bInvertYAxisLandVehicles', 'Invert Y axis (land vehicles)'),
      B('bInvertYAxisHelicopters', 'Invert Y axis (helicopters)'),
      B('bInvertYAxisMissile', 'Invert Y axis (guided missiles)'),
      B('bLandMouseInputEnabled', 'Mouse steering for land vehicles'),
      B('bMissileMouseInputEnabled', 'Mouse input for missiles'),
      B('bInvertC4Input', 'Invert C4 input'),
    ]),
    card('Helicopters', [
      B('bFlightAssistsEnabled', 'Flight assists'),
      B('bHeliAssistStabilityEnabled', 'Stability assist'),
      B('bHeliAssistAutoHoverEnabled', 'Auto-hover assist'),
      B('bHeliAssistEnvelopeLimitsEnabled', 'Envelope limits assist'),
      B('bHeliAssistTurnCoordinationEnabled', 'Turn coordination assist'),
      B('bUseHOTASHelicopters', 'Use HOTAS'),
      B('bCollectiveSelfCentering', 'Self-centering collective'),
      B('bJoystickFreeLookAbsolute', 'Absolute joystick free look'),
      B('bRotaryMouseInputEnabled', 'Mouse flight control'),
      T('RotaryMouseXFunction', 'Mouse X controls', { suggest: ['Yaw', 'Roll'] }),
      T('RotaryMouseYFunction', 'Mouse Y controls', { suggest: ['Pitch'] }),
      R('RotaryMouseAxisIsolation', 'Mouse axis isolation', 0, 1, 0.01),
      R('RotaryMousePitchSensitivity', 'Mouse pitch sensitivity', 0, 50, 0.5),
      R('RotaryMouseRollSensitivity', 'Mouse roll sensitivity', 0, 50, 0.5),
      R('RotaryMouseYawSensitivity', 'Mouse yaw sensitivity', 0, 50, 0.5),
    ]),
    tagSegCard('Hold or toggle', 'ActionBehaviors', 'UserSettings.Controls.ActionBehavior.', ['Hold', 'Toggle']),
    joystickCard(),
    card('Gamepad', pad.map(k => auto(k))),
  );
}

/* ---------- Keybinds ---------- */
const MOUSE = ['LeftMouseButton', 'MiddleMouseButton', 'RightMouseButton', 'ThumbMouseButton', 'ThumbMouseButton2'];
const CODE_KEYS = {
  Space: 'SpaceBar', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Backspace: 'BackSpace', CapsLock: 'CapsLock',
  ShiftLeft: 'LeftShift', ShiftRight: 'RightShift', ControlLeft: 'LeftControl', ControlRight: 'RightControl',
  AltLeft: 'LeftAlt', AltRight: 'RightAlt', MetaLeft: 'LeftCommand', MetaRight: 'RightCommand',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Insert: 'Insert', Delete: 'Delete',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Pause: 'Pause', ScrollLock: 'ScrollLock', NumLock: 'NumLock',
  NumpadMultiply: 'Multiply', NumpadAdd: 'Add', NumpadSubtract: 'Subtract', NumpadDecimal: 'Decimal', NumpadDivide: 'Divide',
};
const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const CHAR_KEYS = { ';': 'Semicolon', '=': 'Equals', ',': 'Comma', '-': 'Hyphen', '.': 'Period', '/': 'Slash', '`': 'Tilde', '\\': 'Backslash', '[': 'LeftBracket', ']': 'RightBracket', "'": 'Apostrophe' };
const OEM_CODES = { Backquote: 'Tilde', Minus: 'Hyphen', Equal: 'Equals', BracketLeft: 'LeftBracket', BracketRight: 'RightBracket', Backslash: 'Backslash', Semicolon: 'Semicolon', Quote: 'Apostrophe', Comma: 'Comma', Period: 'Period', Slash: 'Slash' };
// Browser key event → Unreal key name. Layout-specific keys (like ½ on Nordic boards) use the character, as Unreal does.
function keyName(e) {
  const c = e.code; let m;
  if (CODE_KEYS[c]) return CODE_KEYS[c];
  if ((m = /^Digit(\d)$/.exec(c))) return DIGITS[m[1]];
  if ((m = /^Numpad(\d)$/.exec(c))) return 'NumPad' + DIGITS[m[1]];
  if (/^F\d{1,2}$/.test(c)) return c;
  if (e.key && e.key.length === 1 && e.key !== ' ') return CHAR_KEYS[e.key] || e.key.toUpperCase();
  if ((m = /^Key([A-Z])$/.exec(c))) return m[1];
  return OEM_CODES[c] || c;
}

let binds = [];
const saveBinds = () => gus().set(BINDS, 'CustomKeybindings', bindsStr(binds));
function setBindKey(b, slot, key) { setKey(b, slot, key); saveBinds(); }

let capture = null;
export const isCapturing = () => !!capture;
export function stopCapture() { if (capture) { capture.cleanup(); capture = null; } }
function startCapture(btn, onKey) {
  stopCapture();
  btn.classList.add('capturing');
  btn.textContent = 'Press any input…';
  btn.title = 'Press a key, click a mouse button or scroll. Esc cancels.';
  const swallow = e => { e.preventDefault(); e.stopPropagation(); };
  let byMouse = false;
  const done = k => { stopCapture(); if (k) onKey(k); else rerender(); };
  const kd = e => { swallow(e); done(e.code === 'Escape' ? null : keyName(e)); };
  const md = e => { swallow(e); byMouse = true; done(MOUSE[e.button] || null); };
  const wh = e => { swallow(e); done(e.deltaY < 0 ? 'MouseScrollUp' : 'MouseScrollDown'); };
  const blockers = ['contextmenu', 'auxclick', 'mouseup', 'click'];
  // Added during the button's own click, so that click's mousedown has already passed.
  window.addEventListener('keydown', kd, true);
  window.addEventListener('mousedown', md, true);
  window.addEventListener('wheel', wh, { capture: true, passive: false });
  blockers.forEach(ev => window.addEventListener(ev, swallow, true));
  capture = { cleanup: () => {
    window.removeEventListener('keydown', kd, true);
    window.removeEventListener('mousedown', md, true);
    window.removeEventListener('wheel', wh, { capture: true });
    // after a mouse-button capture, keep blocking its trailing mouseup/click/contextmenu for a moment
    const unblock = () => blockers.forEach(ev => window.removeEventListener(ev, swallow, true));
    if (byMouse) setTimeout(unblock, 300); else unblock();
  } };
}

function keySlot(b, slot, label) {
  const k = b.slots[slot]?.Key;
  const btn = h('button', { class: 'key' + (k ? '' : ' empty'), title: 'Click, then press the new key' }, k || 'unbound');
  btn.onclick = () => startCapture(btn, key => { setBindKey(b, slot, key); rerender(); });
  return h('div', { class: 'slot' }, h('span', {}, label), h('div', {}, btn,
    h('button', { class: 'iconbtn', title: 'Type a key name', onclick: () => { const v = prompt('Unreal key name (e.g. F, LeftShift, MouseScrollUp, Escape):', k || ''); if (v != null) { setBindKey(b, slot, v.trim()); rerender(); } } }, '✎'),
    k && h('button', { class: 'iconbtn', title: 'Unbind', onclick: () => { setBindKey(b, slot, ''); rerender(); } }, '✕')));
}

function resetSlot(b, slot) { binds = withoutSlot(binds, b, slot); saveBinds(); }
const defaultHint = tag => {
  const def = S.known[tag]?.defaults || {};
  const parts = SLOTS.filter(([s]) => def[s]).map(([s, l]) => `${l.toLowerCase()} ${def[s]}`);
  return parts.length ? `Game default seen: ${parts.join(', ')}` : null;
};
const groupOf = tag => tag.replace(/^Input\.NamedActions\./, '').split('.')[0];
const actionLabel = tag => prettyTag(tag, 'Input.NamedActions.' + groupOf(tag) + '.') || groupOf(tag);

function addOverride(tag) {
  if (binds.some(b => b.tag === tag)) { toast('That action already has an override.', 'err'); return; }
  binds.push({ tag, slots: { PrimaryKey: { bIsCustom: 'True' } }, dirty: true, raw: '' });
  saveBinds(); rerender();
}

function unboundCard() {
  const rows = binds.flatMap(b => unboundSlots(b).map(([slot, label]) => {
    const row = h('div', { class: 'row changed' });
    const om = ownMark(row, bindId(b.tag));
    row.append(labelBlock(`${humanize(groupOf(b.tag), true)} › ${actionLabel(b.tag)}`, `${label} key cleared by the game. ${defaultHint(b.tag) || ''}`.trim(), b.tag, om.el),
      h('div', { class: 'ctl' }, keySlot(b, slot, label),
        h('button', { class: 'btn small', title: 'Remove the empty slot from the file so the game uses its own default', onclick: () => { resetSlot(b, slot); rerender(); } }, 'Reset to default')));
    return row;
  }));
  return rows.length > 0 && card(`${rows.length} binding${rows.length === 1 ? '' : 's'} cleared by the game`, rows, { wide: true, cls: 'alert',
    note: 'These are saved with no key, usually because another binding took the key. Bind a key here, or reset to let the game use its default. Reset removes the empty entry; if another action still holds the default key, the game may clear it again.' });
}

export function tabKeybinds() {
  const d = gus();
  binds = parseBinds(d.get(BINDS, 'CustomKeybindings'));
  const origBinds = parseBinds(d.origGet(BINDS, 'CustomKeybindings'));
  const inFile = new Set(binds.map(b => b.tag));
  // Actions remembered from earlier loads that the file doesn't override now: the game uses its default for them.
  const remembered = Object.keys(S.known).filter(t => !inFile.has(t));
  const groups = {};
  binds.forEach(b => (groups[groupOf(b.tag)] ||= []).push(b));
  remembered.forEach(t => (groups[groupOf(t)] ||= []).push(t));
  const tagInput = h('input', { type: 'text', placeholder: 'Input.NamedActions.Player.Jump', list: 'known-tags', spellcheck: false, style: 'width:340px' });
  const overrideRow = b => {
    const ob = origBinds.find(o => o.tag === b.tag);
    const row = h('div', { class: 'row' + (!ob || bindStr(b) !== ob.raw ? ' changed' : '') });
    const om = ownMark(row, bindId(b.tag));
    row.append(labelBlock(actionLabel(b.tag), defaultHint(b.tag), b.tag, om.el),
      h('div', { class: 'ctl' }, keySlot(b, 'PrimaryKey', 'Primary'), keySlot(b, 'SecondaryKey', 'Secondary'),
        h('button', { class: 'iconbtn', title: 'Remove this override (the game falls back to its default key)', onclick: () => { binds = binds.filter(x => x !== b); saveBinds(); rerender(); } }, '🗑')));
    return row;
  };
  const rememberedRow = tag => {
    const row = h('div', { class: 'row' });
    const om = ownMark(row, bindId(tag));
    row.append(labelBlock(actionLabel(tag), defaultHint(tag) || 'Default key not seen yet', tag, om.el),
      h('div', { class: 'ctl' }, h('span', { class: 'muted' }, 'Game default'),
        h('button', { class: 'btn small', onclick: () => addOverride(tag) }, 'Override'),
        h('button', { class: 'iconbtn', title: 'Forget this action (remove it from the remembered list)', onclick: () => { delete S.known[tag]; S.hooks.saveKnown(); rerender(); } }, '✕')));
    return row;
  };
  const cards = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([g, list]) => card(humanize(g, true),
    list.sort((a, b) => (a.tag || a).localeCompare(b.tag || b)).map(x => typeof x === 'string' ? rememberedRow(x) : overrideRow(x))));
  const known = [...new Set([...origBinds.map(b => b.tag), ...binds.map(b => b.tag), ...Object.keys(S.known)])];
  return h('div', { class: 'grid' },
    unboundCard(),
    card('Custom keybindings', [
      h('div', { class: 'row' }, labelBlock('Add an override', 'Action tags come from the game (Input.NamedActions.…). Rebind once in-game to discover a tag.'),
        h('div', { class: 'ctl' }, tagInput, h('datalist', { id: 'known-tags' }, known.map(t => h('option', { value: t }))), h('button', { class: 'btn', onclick: () => { const t = tagInput.value.trim(); if (t) addOverride(t); } }, 'Add'))),
    ], { wide: true, note: [
      h('p', {}, 'The game only writes actions you have changed. This page remembers every action it has seen in a loaded file (in this browser), so those stay listed after the game drops them. Default keys are learned when the file shows one.'),
      h('p', {}, 'Click a key to rebind it, ✎ to type a key name, ✕ to unbind, 🗑 to go back to the game default.')] }),
    ...cards);
}
