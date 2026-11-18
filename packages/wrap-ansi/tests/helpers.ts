import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Binding, Options } from '../src/types.ts';

/** Every combination of options, so that each comparison covers all code paths. */
export const OPTION_COMBINATIONS: readonly Options[] = [
  {},
  { hard: true },
  { wordWrap: false },
  { trim: false },
  { hard: true, wordWrap: false },
  { hard: true, trim: false },
  { wordWrap: false, trim: false },
  { hard: true, wordWrap: false, trim: false },
];

/** Column counts, including the edge cases that the original compares as JavaScript numbers. */
export const COLUMNS: readonly number[] = [1, 2, 3, 5, 8, 10, 16, 20, 40, 80, 0, 2.5, -1, Infinity];

type Fixture = { readonly description: string; readonly input: string };

export function loadFixtures(): Fixture[] {
  const url = new URL('../fixtures/wrap-cases.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Fixture[];
}

/** The native addon itself, for the internal width function. */
export function loadBinding(): Binding {
  const require = createRequire(import.meta.url);
  return require('../native/binding.cjs') as Binding;
}

/** Deterministic pseudo-random numbers (mulberry32), so that failures are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pieces that random inputs are assembled from: text of every kind and escape sequences. */
const PIECES: readonly string[] = [
  'a',
  'word',
  'longerword',
  'supercalifragilistic',
  ' ',
  '  ',
  '\t',
  '\n',
  '\r\n',
  '\u{A0}',
  '\u{3000}',
  '\u{FEFF}',
  '\u{53E4}',
  '\u{6C60}\u{3084}',
  '\u{1F44D}',
  '\u{1F44D}\u{1F3FD}',
  '\u{1F1EB}\u{1F1F7}',
  '\u{1F1EB}',
  '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}',
  '1\u{20E3}',
  'e\u{301}',
  '\u{301}',
  '\u{1100}\u{1161}',
  '\u{1100}',
  '\u{FF76}\u{FF9E}',
  '\u{600}',
  '\u{915}\u{93E}',
  '\u{200B}',
  '\u001b[31m',
  '\u001b[39m',
  '\u001b[1m',
  '\u001b[22m',
  '\u001b[0m',
  '\u001b[m',
  '\u001b[4;32m',
  '\u001b[38;5;208m',
  '\u001b[48;2;1;2;3m',
  '\u001b[38:2::9:8:7m',
  '\u001b[38;2;1m',
  '\u009b33m',
  '\u001b[2K',
  '\u001b]8;;https://example.com\u0007',
  '\u001b]8;;\u0007',
  '\u001b]8;id=1;https://x.y\u001b\\',
  '\u001b]0;title\u0007',
  '\u001b',
  '\u001b[',
];

/** A random string of up to `maxPieces` pieces. */
export function randomInput(random: () => number, maxPieces: number): string {
  const count = Math.floor(random() * maxPieces);
  let input = '';
  for (let index = 0; index < count; index++) {
    input += PIECES[Math.floor(random() * PIECES.length)] as string;
  }

  return input;
}
