import assert from 'node:assert/strict';
import { test } from 'node:test';
import originalWrapAnsi from 'wrap-ansi';
import defaultExport, { wrapAnsi } from '../src/index.ts';

test('default and named exports are the same function', () => {
  assert.equal(defaultExport, wrapAnsi);
});

test('wraps words and preserves styles', () => {
  assert.equal(wrapAnsi('The quick brown fox', 10), 'The quick\nbrown fox');
  assert.equal(
    wrapAnsi('\u001B[31mred text here\u001B[39m', 8),
    '\u001B[31mred text\u001B[39m\n\u001B[31mhere\u001B[39m',
  );
});

test('options are read like the original', () => {
  const input = 'abcdefghij klm';
  for (const options of [
    { hard: 1 },
    { hard: '' },
    { wordWrap: 0 },
    { wordWrap: undefined },
    { trim: null },
    { trim: 0 },
  ]) {
    const typed = options as never;
    assert.equal(wrapAnsi(input, 4, typed), originalWrapAnsi(input, 4, typed));
  }
});

test('non-string input is converted with String()', () => {
  for (const input of [12_345_678, null, undefined, true, { toString: () => 'an object' }]) {
    const typed = input as never;
    assert.equal(wrapAnsi(typed, 3, { hard: true }), originalWrapAnsi(typed, 3, { hard: true }));
  }
});

test('null options throw the same TypeError', () => {
  const typed = null as never;
  assert.throws(
    () => originalWrapAnsi('text', 10, typed),
    (error: unknown) => {
      assert.throws(() => wrapAnsi('text', 10, typed), {
        name: 'TypeError',
        message: (error as Error).message,
      });
      return true;
    },
  );
});
