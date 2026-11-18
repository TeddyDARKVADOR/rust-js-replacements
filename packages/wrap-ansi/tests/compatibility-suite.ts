import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import stringWidth83 from 'string-width';
import originalWrapAnsi from 'wrap-ansi';
import type { WrapAnsiApi } from '../src/api.ts';
import type { Binding } from '../src/types.ts';
import {
  COLUMNS,
  loadFixtures,
  OPTION_COMBINATIONS,
  randomInput,
  seededRandom,
} from './helpers.ts';

type WrapAnsi = WrapAnsiApi['wrapAnsi'];

/** Compares with the original and returns a readable description of the difference, if any. */
function difference(
  wrapAnsi: WrapAnsi,
  input: string,
  columns: number,
  options: object,
): string | undefined {
  const expected = originalWrapAnsi(input, columns, options);
  const actual = wrapAnsi(input, columns, options);
  if (actual === expected) {
    return undefined;
  }

  return `input ${JSON.stringify(input)}, columns ${columns}, options ${JSON.stringify(options)}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`;
}

/**
 * Differential tests against string-width 8.3.0 (widths) and wrap-ansi 10.0.2 (output), shared by
 * the native addon and the WebAssembly module. `getBinding` is read when the tests run, so that
 * the WebAssembly module can be initialized first.
 */
export function defineCompatibilitySuite(
  name: string,
  wrapAnsi: WrapAnsi,
  getBinding: () => Binding,
): void {
  describe(`${name}: widths of string-width 8.3.0`, () => {
    const measure = (text: string): number => stringWidth83(text, { countAnsiEscapeCodes: true });

    test('every Unicode scalar value', () => {
      const binding = getBinding();
      const differences: string[] = [];
      for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
        if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
          continue;
        }

        const character = String.fromCodePoint(codePoint);
        const actual = binding.stringWidth(character);
        const expected = measure(character);
        if (actual !== expected && differences.length < 10) {
          differences.push(`U+${codePoint.toString(16).toUpperCase()}: ${actual} != ${expected}`);
        }
      }

      assert.deepEqual(differences, []);
    });

    test('every scalar value after a base letter, a Hangul jamo, and a prepended mark', () => {
      const binding = getBinding();
      const differences: string[] = [];
      for (const prefix of ['a', '\u{1100}', '\u{600}', '\u{FF76}', '\u{1F44D}']) {
        for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
          if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
            continue;
          }

          const text = prefix + String.fromCodePoint(codePoint);
          const actual = binding.stringWidth(text);
          const expected = measure(text);
          if (actual !== expected && differences.length < 10) {
            differences.push(`${JSON.stringify(text)}: ${actual} != ${expected}`);
          }
        }
      }

      assert.deepEqual(differences, []);
    });
  });

  describe(`${name}: output of wrap-ansi 10.0.2`, () => {
    test('curated fixtures, every column count and option combination', () => {
      const differences: string[] = [];
      for (const { input } of loadFixtures()) {
        for (const columns of COLUMNS) {
          for (const options of OPTION_COMBINATIONS) {
            const found = difference(wrapAnsi, input, columns, options);
            if (found !== undefined && differences.length < 5) {
              differences.push(found);
            }
          }
        }
      }

      assert.deepEqual(differences, []);
    });

    test('seeded random inputs', () => {
      const random = seededRandom(0x5eed);
      const differences: string[] = [];
      for (let iteration = 0; iteration < 20_000; iteration++) {
        const input = randomInput(random, 24);
        const columns = COLUMNS[Math.floor(random() * COLUMNS.length)] as number;
        const options = OPTION_COMBINATIONS[
          Math.floor(random() * OPTION_COMBINATIONS.length)
        ] as object;
        const found = difference(wrapAnsi, input, columns, options);
        if (found !== undefined && differences.length < 5) {
          differences.push(found);
        }
      }

      assert.deepEqual(differences, []);
    });
  });
}
