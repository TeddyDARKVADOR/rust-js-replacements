import assert from 'node:assert/strict';
import { test } from 'node:test';
import originalStringWidth from 'string-width';
import type { Options } from '../src/types.ts';
import {
  allCodePoints,
  createRandom,
  describeMismatches,
  findMismatches,
  loadFixtures,
  loadRgiEmojiSequences,
  type Measure,
  type MeasureMany,
  OPTION_COMBINATIONS,
  randomString,
} from './helpers.ts';

const reference: Measure = originalStringWidth;

// The context strings contain no escape codes, so only the ambiguous-width option matters.
const CONTEXT_OPTIONS = [{}, { ambiguousIsNarrow: false }] as const;

function assertSameWidths(
  inputs: readonly string[],
  measureMany: MeasureMany,
  optionCombinations: readonly Options[] = OPTION_COMBINATIONS,
): void {
  const mismatches = findMismatches(inputs, reference, measureMany, optionCombinations);
  assert.equal(mismatches.length, 0, describeMismatches(mismatches));
}

/**
 * Differential tests against the original string-width 9.0.0, shared by the Node.js addon and the
 * WebAssembly module.
 */
export function defineCompatibilitySuite(
  name: string,
  stringWidth: Measure,
  stringWidthMany: MeasureMany,
): void {
  test(`${name}: curated fixtures, single and batch APIs`, () => {
    const inputs = loadFixtures().map(({ input }) => input);
    assertSameWidths(inputs, stringWidthMany);

    for (const input of inputs) {
      for (const options of OPTION_COMBINATIONS) {
        assert.equal(stringWidth(input, options), reference(input, options), JSON.stringify(input));
      }
    }
  });

  test(`${name}: every code point and lone surrogate`, () => {
    assertSameWidths(allCodePoints(), stringWidthMany);
  });

  test(`${name}: every code point of planes 0, 1, and 14 in context`, () => {
    const contexts = [
      (character: string) => `a${character}`,
      (character: string) => `${character}a`,
      (character: string) => `${character}\u0301`,
      (character: string) => `${character}\uFE0F`,
      (character: string) => `${character}\uFE0E`,
      (character: string) => `${character}\u{1F3FB}`,
      (character: string) => `${character}\u200D\u{1F466}`,
      (character: string) => `\u0600${character}`,
      (character: string) => `\u1100${character}`,
    ];
    // Planes 2 and 3 hold only ideographs, and planes 15 and 16 only private use characters,
    // which the single code point test already covers.
    const characters = allCodePoints().filter((character) => {
      const plane = (character.codePointAt(0) as number) >> 16;
      return plane === 0 || plane === 1 || plane === 14;
    });
    for (const context of contexts) {
      assertSameWidths(characters.map(context), stringWidthMany, CONTEXT_OPTIONS);
    }
  });

  test(`${name}: every RGI emoji sequence and its variants`, () => {
    const sequences = loadRgiEmojiSequences();
    assert.ok(sequences.length > 2000, 'expected the full list of RGI emoji sequences');

    const variants = sequences.flatMap((sequence) => [
      sequence,
      `x${sequence}y`,
      `${sequence}\u200D`,
      `${sequence}\u{1F3FD}`,
      `${sequence}\uFE0E`,
      `\u0600${sequence}`,
      `\u200B${sequence}`,
      sequence.replaceAll('\uFE0F', ''),
      sequence.slice(0, -1),
    ]);
    assertSameWidths(variants, stringWidthMany);
  });

  test(`${name}: seeded random strings`, () => {
    const random = createRandom(0x5eed);
    const inputs = Array.from({ length: 200_000 }, () => randomString(random, 12));
    assertSameWidths(inputs, stringWidthMany);

    for (const input of inputs.slice(0, 5_000)) {
      assert.equal(stringWidth(input), reference(input), JSON.stringify(input));
    }
  });

  test(`${name}: long inputs`, () => {
    const random = createRandom(42);
    const inputs = [
      'a'.repeat(100_000),
      '\u53E4'.repeat(100_000),
      `a${'\u0301'.repeat(100_000)}`,
      '\u{1F468}\u200D'.repeat(10_000),
      '\u001B[31m'.repeat(10_000),
      '\u009D'.repeat(10_000),
      Array.from({ length: 2_000 }, () => randomString(random, 50)).join(''),
    ];
    assertSameWidths(inputs, stringWidthMany);
  });
}
