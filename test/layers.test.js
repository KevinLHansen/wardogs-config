import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IniDoc } from '../js/ini.js';
import { parseBinds } from '../js/binds.js';
import { keyId, bindId, idLabel, readId, writeIds, winners, plan, stackText, replan, editsBetween } from '../js/layers.js';
import { FIXTURE, loadFixture, changedLines, U, BINDS } from './helpers.js';

const P = 'Input.NamedActions.';
const STAB = keyId(U, 'bHeliAssistStabilityEnabled');
const HOVER = keyId(U, 'bHeliAssistAutoHoverEnabled');
const RAISE = bindId(P + 'Vehicle.Collective.Raise');
const raiseOn = key => `((TagName="${P}Vehicle.Collective.Raise"), (PrimaryKey=(Key=${key},bIsCustom=True)))`;
const layer = (name, entries, active = true) => ({ id: name, name, active, entries });
const bindsOf = text => parseBinds(new IniDoc(text).get(BINDS, 'CustomKeybindings'));

test('the first active layer wins; inactive layers are skipped', () => {
  const w = winners([layer('Off', { [STAB]: 'True' }, false), layer('Top', { [STAB]: 'False' }), layer('Low', { [STAB]: 'True', [HOVER]: 'False' })]);
  assert.equal(w.get(STAB).layer.name, 'Top');
  assert.equal(w.get(STAB).value, 'False');
  assert.equal(w.get(HOVER).layer.name, 'Low');
});

test('applying layers changes only the lines they own, and one keybind action without touching the others', () => {
  const out = stackText(FIXTURE, [layer('Heli', { [STAB]: 'False', [RAISE]: raiseOn('PageUp') })], []);
  const diff = changedLines(FIXTURE, out);
  assert.equal(diff.length, 2);
  assert.ok(diff[0][2].startsWith('CustomKeybindings='));
  assert.equal(diff[1][2], 'bHeliAssistStabilityEnabled=False');
  const before = bindsOf(FIXTURE), after = bindsOf(out);
  assert.equal(after.length, before.length);
  for (const b of after) assert.equal(b.raw, b.tag === P + 'Vehicle.Collective.Raise' ? raiseOn('PageUp') : before.find(o => o.tag === b.tag).raw, b.tag);
});

test('an unchanged stack leaves the file byte for byte', () => {
  const d = loadFixture();
  const same = { [STAB]: d.get(U, 'bHeliAssistStabilityEnabled'), [RAISE]: readId(d, RAISE) };
  assert.equal(stackText(FIXTURE, [layer('Same', same)], []), FIXTURE);
});

test('ids the layers set at the last save but no active layer owns now are removed', () => {
  const p = plan([layer('Heli', { [STAB]: 'False' }, false)], [STAB, RAISE]);
  assert.deepEqual([...p], [[STAB, undefined], [RAISE, undefined]]);
  const out = new IniDoc(stackText(FIXTURE, [], [STAB, RAISE]));
  assert.equal(out.get(U, 'bHeliAssistStabilityEnabled'), undefined);
  assert.equal(readId(out, RAISE), undefined);
  assert.equal(bindsOf(out.serialize()).length, bindsOf(FIXTURE).length - 1);
});

test('turning off a layer that was never saved puts back the loaded value; other edits are kept', () => {
  const d = loadFixture();
  const heli = layer('Heli', { [STAB]: 'False', [RAISE]: raiseOn('PageUp') });
  const on = plan([heli]);
  replan(d, new Map(), on);
  assert.equal(d.get(U, 'bHeliAssistStabilityEnabled'), 'False');
  d.set(U, 'MouseSensitivity', '0.5');
  heli.active = false;
  replan(d, on, plan([heli]));
  assert.equal(d.get(U, 'bHeliAssistStabilityEnabled'), 'True');
  assert.equal(readId(d, RAISE), raiseOn('W'));
  assert.equal(d.get(U, 'MouseSensitivity'), '0.5');
});

test('turning off a layer that was saved removes its settings so the game uses its defaults', () => {
  const d = loadFixture();
  const heli = layer('Heli', { [STAB]: 'True' }, false);
  replan(d, plan([{ ...heli, active: true }], [STAB]), plan([heli], [STAB]));
  assert.equal(d.get(U, 'bHeliAssistStabilityEnabled'), undefined);
});

test('changing the stack keeps edits to ids whose outcome did not change', () => {
  const d = loadFixture();
  const a = layer('A', { [STAB]: 'False' }), b = layer('B', { [HOVER]: 'False' }, false);
  const p1 = plan([a, b]);
  replan(d, new Map(), p1);
  d.set(U, 'bHeliAssistStabilityEnabled', 'True'); // a direct edit to a setting layer A owns
  b.active = true;
  replan(d, p1, plan([a, b]));
  assert.equal(d.get(U, 'bHeliAssistAutoHoverEnabled'), 'False');
  assert.equal(d.get(U, 'bHeliAssistStabilityEnabled'), 'True', 'edit kept until the stack changes that id');
});

test('a lower layer takes over when the winner is turned off', () => {
  const d = loadFixture();
  const top = layer('Top', { [STAB]: 'False' }), low = layer('Low', { [STAB]: 'True' });
  const p1 = plan([top, low]);
  replan(d, new Map(), p1);
  assert.equal(d.get(U, 'bHeliAssistStabilityEnabled'), 'False');
  top.active = false;
  replan(d, p1, plan([top, low]));
  assert.equal(d.get(U, 'bHeliAssistStabilityEnabled'), 'True');
});

test('edits are found per setting and per keybind action', () => {
  const d = loadFixture();
  d.set(U, 'bHeliAssistStabilityEnabled', 'False');
  writeIds(d, new Map([[RAISE, raiseOn('PageUp')], [bindId(P + 'Player.Jump'), undefined]]));
  d.setAll(U, 'LastCPUBenchmarkSteps', ['1', '2']);
  const edits = editsBetween(FIXTURE, d.serialize());
  assert.deepEqual(edits.map(e => [idLabel(e.id), e.value, !!e.repeated]).sort(), [
    ['LastCPUBenchmarkSteps', '1', true],
    ['Player.Jump', undefined, false],
    ['Vehicle.Collective.Raise', raiseOn('PageUp'), false],
    ['bHeliAssistStabilityEnabled', 'False', false],
  ]);
});

test('keybind order does not count as an edit', () => {
  const list = bindsOf(FIXTURE);
  const d = loadFixture();
  d.set(BINDS, 'CustomKeybindings', '(' + list.reverse().map(b => b.raw).join(',') + ')');
  assert.deepEqual(editsBetween(FIXTURE, d.serialize()), []);
});

test('a keybind action can be added to a file without CustomKeybindings', () => {
  const d = new IniDoc('[/Script/WDGame.WDUserSettings]\r\nA=1\r\n');
  writeIds(d, new Map([[RAISE, raiseOn('PageUp')]]));
  assert.equal(d.get(BINDS, 'CustomKeybindings'), '(' + raiseOn('PageUp') + ')');
  const empty = new IniDoc('[X]\r\nA=1\r\n');
  writeIds(empty, new Map([[RAISE, undefined]]));
  assert.equal(empty.serialize(), '[X]\r\nA=1\r\n');
});
