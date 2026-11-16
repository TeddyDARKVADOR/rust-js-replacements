import assert from 'node:assert/strict';
import { test } from 'node:test';
import originalStringWidth from 'string-width';
import defaultExport, { stringWidth, stringWidthMany, unicodeVersion } from '../src/index.ts';

test('the default export is stringWidth', () => {
  assert.equal(defaultExport, stringWidth);
});

test('reports the Unicode version of its tables', () => {
  assert.equal(unicodeVersion, '17.0');
  assert.equal(unicodeVersion, process.versions.unicode, 'the original depends on the runtime');
});

test('non-string input measures 0, like the original', () => {
  for (const input of [undefined, null, 1, true, {}, ['abc']]) {
    assert.equal(stringWidth(input as unknown as string), 0);
  }
});

test('null options throw the same TypeError as the original', () => {
  const nullOptions = null as unknown as undefined;
  assert.throws(() => originalStringWidth('a', nullOptions), TypeError);
  assert.throws(() => stringWidth('a', nullOptions), TypeError);
  // Like the original, the empty string returns before the options are read.
  assert.equal(stringWidth('', nullOptions), 0);
});

test('options are used for their truthiness, like the original', () => {
  const input = '\u00B1\u001B[31m';
  for (const value of [0, 1, '', 'yes', null, undefined]) {
    const options = {
      ambiguousIsNarrow: value,
      countAnsiEscapeCodes: value,
    } as unknown as Parameters<typeof stringWidth>[1];
    assert.equal(stringWidth(input, options), originalStringWidth(input, options), String(value));
  }
});

test('lone surrogates are measured as U+FFFD', () => {
  assert.equal(stringWidth('\uD800'), 1);
  assert.equal(stringWidth('a\uDC00b'), 3);
});

test('stringWidthMany returns widths in input order', () => {
  const inputs = ['hello', '\u53E4', 'Hello \u{1F30D}', '', '\u001B[1mbold\u001B[22m'];
  assert.deepEqual([...stringWidthMany(inputs)], [5, 2, 8, 0, 4]);
});

test('stringWidthMany applies options to every input', () => {
  assert.deepEqual(
    [...stringWidthMany(['\u00B1', 'a\u00B1'], { ambiguousIsNarrow: false })],
    [2, 3],
  );
});

test('stringWidthMany accepts an empty array', () => {
  const widths = stringWidthMany([]);
  assert.ok(widths instanceof Uint32Array);
  assert.equal(widths.length, 0);
});

test('stringWidthMany measures non-string entries as 0', () => {
  const inputs = ['ab', 42, null, '\u53E4'] as unknown as string[];
  assert.deepEqual([...stringWidthMany(inputs)], [2, 0, 0, 2]);
});

test('stringWidthMany rejects a non-array argument', () => {
  assert.throws(() => stringWidthMany('abc' as unknown as string[]), TypeError);
});
