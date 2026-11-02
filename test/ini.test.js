import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IniDoc, diffTexts, splitTop, unwrap, structGet, structSet, tagList, tagListStr, fmtNum } from '../js/ini.js';
import { FIXTURE, loadFixture, changedLines, U, JOY } from './helpers.js';

test('an unedited file serializes back exactly', () => {
  const d = loadFixture();
  assert.equal(d.serialize(), FIXTURE);
  assert.equal(d.dirty(), false);
  assert.deepEqual(d.changes(), []);
});

test('editing one value changes only that line, keeping CRLF and number style', () => {
  const d = loadFixture();
  assert.equal(d.get(U, 'FieldOfView'), '95.000000');
  d.set(U, 'FieldOfView', fmtNum(101, d.get(U, 'FieldOfView')));
  const out = d.serialize();
  assert.deepEqual(changedLines(FIXTURE, out), [[155, 'FieldOfView=95.000000', 'FieldOfView=101.000000']]);
  assert.equal(out.split('\r\n').length, FIXTURE.split('\r\n').length);
  assert.equal(out.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF introduced');
  assert.deepEqual(d.changes(), [{ section: U, key: 'FieldOfView', value: '101.000000', old: '95.000000' }]);
});

test('setting a value back to the original makes the file clean again', () => {
  const d = loadFixture();
  d.set(U, 'FieldOfView', '90.000000');
  assert.equal(d.dirty(), true);
  d.set(U, 'FieldOfView', '95.000000');
  assert.equal(d.dirty(), false);
  assert.equal(d.serialize(), FIXTURE);
});

test('origGet keeps the loaded value while get returns the edit', () => {
  const d = loadFixture();
  d.set(U, 'FieldOfView', '80.000000');
  assert.equal(d.get(U, 'FieldOfView'), '80.000000');
  assert.equal(d.origGet(U, 'FieldOfView'), '95.000000');
});

test('a new key is added at the end of its section', () => {
  const d = loadFixture();
  d.set('/Script/Engine.GameUserSettings', 'NewKey', 'True');
  const lines = d.serialize().split('\r\n');
  const i = lines.indexOf('[/Script/Engine.GameUserSettings]');
  assert.deepEqual(lines.slice(i, i + 3), ['[/Script/Engine.GameUserSettings]', 'bUseDesiredScreenHeight=False', 'NewKey=True']);
  assert.deepEqual(d.changes(), [{ section: '/Script/Engine.GameUserSettings', key: 'NewKey', value: 'True', old: undefined }]);
});

test('a new section is appended with a blank line before it and a trailing newline', () => {
  const d = new IniDoc('[A]\r\nx=1\r\n');
  d.set('B', 'y', '2');
  assert.equal(d.serialize(), '[A]\r\nx=1\r\n\r\n[B]\r\ny=2\r\n');
});

test('a key added to an empty file gets no leading blank line', () => {
  const d = new IniDoc('');
  d.set('SystemSettings', 'r.Test', '0');
  assert.equal(d.serialize(), '[SystemSettings]\r\nr.Test=0\r\n');
});

test('LF files stay LF', () => {
  const d = new IniDoc('[A]\nx=1\n');
  d.set('A', 'x', '2');
  assert.equal(d.serialize(), '[A]\nx=2\n');
});

test('removing a key drops only its line', () => {
  const d = loadFixture();
  d.remove(U, 'FieldOfView');
  const diff = changedLines(FIXTURE, d.serialize());
  assert.equal(d.serialize().split('\r\n').length, FIXTURE.split('\r\n').length - 1);
  assert.equal(diff[0][1], 'FieldOfView=95.000000');
  assert.deepEqual(d.changes(), [{ section: U, key: 'FieldOfView', value: undefined, old: '95.000000' }]);
});

test('repeated keys are tracked by position', () => {
  const d = new IniDoc('[S]\r\nk=a\r\nk=b\r\n');
  assert.deepEqual(d.getAll('S', 'k'), ['a', 'b']);
  d.setAll('S', 'k', ['a', 'c']);
  assert.equal(d.serialize(), '[S]\r\nk=a\r\nk=c\r\n');
  assert.deepEqual(d.changes(), [{ section: 'S', key: 'k', value: 'c', old: 'b' }]);
});

test('editing the raw text keeps the loaded original for diffs', () => {
  const d = loadFixture();
  d.setText(FIXTURE.replace('FieldOfView=95.000000', 'FieldOfView=70.000000'));
  assert.equal(d.original, FIXTURE);
  assert.deepEqual(d.changes(), [{ section: U, key: 'FieldOfView', value: '70.000000', old: '95.000000' }]);
});

test('comments and blank lines are kept verbatim', () => {
  const text = '; header comment\r\n[S]\r\n# note\r\nk = v \r\n\r\n';
  const d = new IniDoc(text);
  assert.equal(d.get('S', 'k'), ' v ');
  d.set('S', 'k', 'w');
  assert.equal(d.serialize(), '; header comment\r\n[S]\r\n# note\r\nk =w\r\n\r\n');
});

test('diffTexts reports added, removed and changed keys', () => {
  const diff = diffTexts('[S]\r\na=1\r\nb=2\r\n', '[S]\r\na=1\r\nb=3\r\nc=4\r\n');
  assert.deepEqual(diff, [
    { section: 'S', key: 'b', value: '3', old: '2' },
    { section: 'S', key: 'c', value: '4', old: undefined },
  ]);
  assert.deepEqual(diffTexts('[S]\r\na=1\r\n', '[S]\r\n'), [{ section: 'S', key: 'a', value: undefined, old: '1' }]);
});

test('splitTop ignores commas inside parentheses and quotes', () => {
  assert.deepEqual(splitTop('a=1,b=(x,y),c="p,q"'), ['a=1', 'b=(x,y)', 'c="p,q"']);
  assert.equal(unwrap('(a,(b))'), 'a,(b)');
  assert.equal(unwrap('(a),(b)'), '(a),(b)', 'two groups are not unwrapped');
});

test('joystick struct fields can be read and changed without touching the rest', () => {
  const d = loadFixture();
  const roll = d.get(JOY, 'Roll');
  assert.equal(structGet(roll, '_aaaajdmbkojdnhnkhhfhe'), '0');
  assert.equal(structGet(roll, 'bInvert'), 'False');
  const changed = structSet(roll, 'bInvert', 'True');
  assert.equal(changed, roll.replace('bInvert=False', 'bInvert=True'));
  assert.equal(structGet(changed, 'Positive'), structGet(roll, 'Positive'), 'nested struct untouched');
  assert.equal(structSet('(A=1)', 'B', '2'), '(A=1,B=2)', 'missing fields are appended');
});

test('tag lists (Hold/Toggle behaviours) round-trip', () => {
  const value = loadFixture().get(U, 'ActionBehaviors');
  const items = tagList(value);
  assert.ok(items.length >= 3);
  assert.deepEqual(items[0], { tag: 'UserSettings.Controls.ActionBehavior.Crouch', v: 'Toggle' });
  assert.equal(tagListStr(items), value);
});

test('fmtNum keeps the number style the game wrote', () => {
  assert.equal(fmtNum(101, '95.000000'), '101.000000');
  assert.equal(fmtNum(0.5, '1.000000'), '0.500000');
  assert.equal(fmtNum(144, '60'), '144');
  assert.equal(fmtNum(2, undefined, true), '2.000000');
  assert.equal(fmtNum('abc', '1.0'), '1.0', 'invalid input keeps the old value');
});
