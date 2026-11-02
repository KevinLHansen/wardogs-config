import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBytes, encode, fileKey } from '../js/store.js';
import { FIXTURE_BYTES } from './helpers.js';

const SAMPLE = '[Section]\r\nKey=½ value\r\nOther=(A="x,y")\r\n';

test('the fixture decodes as UTF-8 without BOM and encodes back to the same bytes', () => {
  const { text, enc } = decodeBytes(FIXTURE_BYTES);
  assert.equal(enc, 'utf8');
  assert.ok(text.includes('Key=½'), 'non-ASCII key name survives decoding');
  assert.deepEqual(encode(text, enc), FIXTURE_BYTES);
});

for (const enc of ['utf8', 'utf8bom', 'utf16le']) {
  test(`${enc} round-trips byte for byte`, () => {
    const bytes = encode(SAMPLE, enc);
    const decoded = decodeBytes(bytes);
    assert.equal(decoded.enc, enc);
    assert.equal(decoded.text, SAMPLE);
    assert.deepEqual(encode(decoded.text, decoded.enc), bytes);
  });
}

test('encodings get the right byte order marks', () => {
  assert.deepEqual([...encode('A', 'utf8')], [0x41]);
  assert.deepEqual([...encode('A', 'utf8bom')], [0xEF, 0xBB, 0xBF, 0x41]);
  assert.deepEqual([...encode('A', 'utf16le')], [0xFF, 0xFE, 0x41, 0x00]);
});

test('only GameUserSettings.ini is accepted for loading', () => {
  assert.equal(fileKey('GameUserSettings.ini'), 'gus');
  assert.equal(fileKey('gameusersettings.INI'), 'gus');
  assert.equal(fileKey('GameUserSettings (1).ini'), 'gus');
  assert.equal(fileKey('Engine.ini'), null);
  assert.equal(fileKey('GameUserSettings.txt'), null);
  assert.equal(fileKey('notes.txt'), null);
});
