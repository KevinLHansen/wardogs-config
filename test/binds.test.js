import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBinds, bindStr, bindsStr, setKey, unboundSlots, withoutSlot, learnBinds } from '../js/binds.js';
import { FIXTURE, loadFixture, changedLines, BINDS } from './helpers.js';

const P = 'Input.NamedActions.';
const fixtureBinds = () => parseBinds(loadFixture().get(BINDS, 'CustomKeybindings'));
const find = (list, tag) => list.find(b => b.tag === P + tag);

test('parses every entry in the fixture', () => {
  const list = fixtureBinds();
  assert.equal(list.length, 17);
  assert.deepEqual(find(list, 'Player.Prone').slots, { PrimaryKey: { Key: 'X', bIsCustom: 'True' } });
  assert.deepEqual(find(list, 'Player.Jump').slots, { PrimaryKey: { Key: 'SpaceBar' } });
  assert.deepEqual(find(list, 'Inventory.ToggleHands').slots.PrimaryKey.Key, '½');
});

test('an unchanged list is written back exactly', () => {
  const d = loadFixture();
  const value = d.get(BINDS, 'CustomKeybindings');
  assert.equal(bindsStr(parseBinds(value)), value);
});

test('finds the bindings the game cleared', () => {
  const cleared = fixtureBinds().flatMap(b => unboundSlots(b).map(([slot]) => `${b.tag.slice(P.length)} ${slot}`));
  assert.deepEqual(cleared.sort(), [
    'Inventory.ChangeNext PrimaryKey',
    'Inventory.ChangePrev PrimaryKey',
    'Player.DeployParachute PrimaryKey',
    'Vehicle.Cyclic.X.Negative PrimaryKey',
    'Vehicle.Handbrake PrimaryKey',
    'Vehicle.MountedWeapon.Fire SecondaryKey',
  ]);
});

test('binding a key marks the slot custom and writes the entry in game order', () => {
  const b = find(fixtureBinds(), 'Player.DeployParachute');
  setKey(b, 'PrimaryKey', 'P');
  assert.equal(bindStr(b), `((TagName="${P}Player.DeployParachute"), (PrimaryKey=(Key=P,bIsCustom=True)))`);
  assert.deepEqual(unboundSlots(b), []);
});

test('unbinding a key keeps the slot as a custom empty override', () => {
  const b = find(fixtureBinds(), 'Player.Prone');
  setKey(b, 'PrimaryKey', '');
  assert.deepEqual(b.slots.PrimaryKey, { bIsCustom: 'True' });
  assert.deepEqual(unboundSlots(b).map(([s]) => s), ['PrimaryKey']);
});

test('resetting the only custom slot removes the whole entry', () => {
  let list = fixtureBinds();
  list = withoutSlot(list, find(list, 'Vehicle.Handbrake'), 'PrimaryKey');
  assert.equal(find(list, 'Vehicle.Handbrake'), undefined);
  assert.equal(list.length, 16);
  // Mounted weapon: primary is a game default (not custom), so resetting the cleared secondary removes the entry too.
  list = withoutSlot(list, find(list, 'Vehicle.MountedWeapon.Fire'), 'SecondaryKey');
  assert.equal(find(list, 'Vehicle.MountedWeapon.Fire'), undefined);
});

test('resetting one slot keeps the entry when another slot is still custom', () => {
  let list = parseBinds(`(((TagName="${P}A"), (PrimaryKey=(Key=F,bIsCustom=True),SecondaryKey=(bIsCustom=True))))`);
  list = withoutSlot(list, list[0], 'SecondaryKey');
  assert.equal(list.length, 1);
  assert.equal(bindStr(list[0]), `((TagName="${P}A"), (PrimaryKey=(Key=F,bIsCustom=True)))`);
});

test('repairing bindings changes only the CustomKeybindings line, leaving other entries as they were', () => {
  const d = loadFixture();
  let list = parseBinds(d.get(BINDS, 'CustomKeybindings'));
  list = withoutSlot(list, find(list, 'Vehicle.Handbrake'), 'PrimaryKey');
  setKey(find(list, 'Player.DeployParachute'), 'PrimaryKey', 'P');
  d.set(BINDS, 'CustomKeybindings', bindsStr(list));
  const diff = changedLines(FIXTURE, d.serialize());
  assert.equal(diff.length, 1);
  assert.ok(diff[0][2].startsWith('CustomKeybindings='));
  const before = parseBinds(d.origGet(BINDS, 'CustomKeybindings'));
  const after = parseBinds(d.get(BINDS, 'CustomKeybindings'));
  for (const b of after) if (b.tag !== P + 'Player.DeployParachute') assert.equal(b.raw, before.find(o => o.tag === b.tag).raw, b.tag);
  assert.equal(after.length, 16);
});

test('learns every action, but default keys only from non-custom slots', () => {
  const known = {};
  assert.equal(learnBinds(known, fixtureBinds(), 1000), 17);
  assert.deepEqual(known[P + 'Player.Jump'], { firstSeen: 1000, lastSeen: 1000, defaults: { PrimaryKey: 'SpaceBar' } });
  assert.deepEqual(known[P + 'Vehicle.MountedWeapon.Fire'].defaults, { PrimaryKey: 'LeftMouseButton' });
  assert.deepEqual(known[P + 'Player.Prone'].defaults, {}, 'a custom key is not a default');
});

test('learning again adds nothing new, updates lastSeen and keeps learned defaults', () => {
  const known = {};
  learnBinds(known, fixtureBinds(), 1000);
  // Later the user rebinds Jump: the custom key must not replace the learned default.
  const later = fixtureBinds();
  setKey(find(later, 'Player.Jump'), 'PrimaryKey', 'F');
  assert.equal(learnBinds(known, later, 2000), 0);
  const jump = known[P + 'Player.Jump'];
  assert.equal(jump.firstSeen, 1000);
  assert.equal(jump.lastSeen, 2000);
  assert.deepEqual(jump.defaults, { PrimaryKey: 'SpaceBar' });
});
