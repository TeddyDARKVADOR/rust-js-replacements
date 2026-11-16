import { readFileSync } from 'node:fs';
import type { Options } from '../src/types.ts';

/** Every combination of options, so that each comparison covers all code paths. */
export const OPTION_COMBINATIONS: readonly Options[] = [
  {},
  { ambiguousIsNarrow: false },
  { countAnsiEscapeCodes: true },
  { ambiguousIsNarrow: false, countAnsiEscapeCodes: true },
];

type Fixture = { readonly description: string; readonly input: string };

export function loadFixtures(): Fixture[] {
  const url = new URL('../fixtures/unicode-cases.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Fixture[];
}

/** Multi-code-point RGI emoji sequences, read from the generated Rust tables. */
export function loadRgiEmojiSequences(): string[] {
  const url = new URL('../rust/core/src/tables.rs', import.meta.url);
  const source = readFileSync(url, 'utf8');
  const block = /RGI_EMOJI_SEQUENCES: &\[&str\] = &\[([^\]]*)\]/.exec(source)?.[1];
  if (block === undefined) {
    throw new Error('RGI_EMOJI_SEQUENCES not found in tables.rs');
  }

  return [...block.matchAll(/"([^"]+)"/g)].map(([, escaped]) =>
    (escaped as string).replaceAll(/\\u\{([0-9A-F]+)\}/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    ),
  );
}

/** Every scalar value, plus each lone surrogate, as a one-character string. */
export function allCodePoints(): string[] {
  const characters: string[] = [];
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
    characters.push(String.fromCodePoint(codePoint));
  }

  return characters;
}

/** Deterministic pseudo-random generator (mulberry32), so that failures are reproducible. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Building blocks that exercise every rule: ASCII, ANSI introducers and payload characters,
// C0 and C1 controls, marks, joiners, selectors, emoji parts, Hangul, prepended concatenation
// marks, Kirat Rai, Indic conjuncts, Thai, wide and ambiguous characters, and lone surrogates.
const FUZZ_ATOMS: readonly string[] = [
  'a',
  'Z',
  '0',
  '1',
  '#',
  '*',
  ' ',
  '~',
  ';',
  '[',
  ']',
  '\\',
  'm',
  'P',
  'R',
  'k',
  '7',
  '(',
  '\u001B',
  '\u001B[',
  '\u001B]',
  '\u001B]8;;',
  '\u001BP',
  '\u001B\\',
  '\u0007',
  '\u0018',
  '\u009B',
  '\u009C',
  '\u009D',
  '\u0090',
  '\u0085',
  '\t',
  '\n',
  '\r',
  '\u0000',
  '\u007F',
  '\u0301',
  '\u20E3',
  '\u0488',
  '\u200B',
  '\u200C',
  '\u200D',
  '\u00AD',
  '\u2028',
  '\uFE0E',
  '\uFE0F',
  '\u{E0061}',
  '\u{E007F}',
  '\u{1F3FB}',
  '\u{1F3FF}',
  '\u{1F44B}',
  '\u{1F468}',
  '\u{1F469}',
  '\u{1F467}',
  '\u{1F600}',
  '\u2764',
  '\u2614',
  '\u231A',
  '\u00A9',
  '\u{1F3F4}',
  '\u{1F1FA}',
  '\u{1F1F8}',
  '\u{1F1E6}',
  '\u{1F9D1}',
  '\u{1F91D}',
  '\u{1FAEF}',
  '\u1100',
  '\u1161',
  '\u11A8',
  '\u115F',
  '\u1160',
  '\uAC00',
  '\uD7A3',
  '\uA960',
  '\uD7B0',
  '\u0600',
  '\u0601',
  '\u06DD',
  '\u08E2',
  '\u{110BD}',
  '\u0661',
  '\u0915',
  '\u094D',
  '\u0937',
  '\u0D4E',
  '\u0E33',
  '\u0E01',
  '\u0EB3',
  '\u{16D43}',
  '\u{16D63}',
  '\u{16D67}',
  '\u{16D68}',
  '\uFF9E',
  '\uFF76',
  '\u4E00',
  '\u53E4',
  '\u{20000}',
  '\u00B1',
  '\u00E9',
  '\u0410',
  '\u05D0',
  '\uFFFD',
  '\uD800',
  '\uDC00',
  '\u{10FFFF}',
  '\u{E0100}',
];

export function randomString(random: () => number, maxAtoms: number): string {
  const count = 1 + Math.floor(random() * maxAtoms);
  let result = '';
  for (let index = 0; index < count; index++) {
    result += FUZZ_ATOMS[Math.floor(random() * FUZZ_ATOMS.length)];
  }

  return result;
}

export type Measure = (input: string, options?: Options) => number;
export type MeasureMany = (inputs: readonly string[], options?: Options) => Uint32Array;

type Mismatch = { input: string; options: Options; expected: number; actual: number };

/**
 * Compares a batch implementation against the reference for every input and option combination.
 * Returns at most `limit` mismatches, with code points spelled out for readable failures.
 */
export function findMismatches(
  inputs: readonly string[],
  reference: Measure,
  measureMany: MeasureMany,
  optionCombinations: readonly Options[] = OPTION_COMBINATIONS,
  limit = 20,
): Mismatch[] {
  const mismatches: Mismatch[] = [];
  for (const options of optionCombinations) {
    const actual = measureMany(inputs, options);
    for (let index = 0; index < inputs.length && mismatches.length < limit; index++) {
      const input = inputs[index] as string;
      const expected = reference(input, options);
      if (actual[index] !== expected) {
        mismatches.push({ input, options, expected, actual: actual[index] as number });
      }
    }
  }

  return mismatches;
}

export function describeMismatches(mismatches: readonly Mismatch[]): string {
  return mismatches
    .map(({ input, options, expected, actual }) => {
      const codePoints = [...input]
        .map((character) => `U+${(character.codePointAt(0) as number).toString(16).toUpperCase()}`)
        .join(' ');
      return `[${codePoints}] ${JSON.stringify(options)}: expected ${expected}, got ${actual}`;
    })
    .join('\n');
}
