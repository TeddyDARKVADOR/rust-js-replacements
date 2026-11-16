/** Inputs shared by every implementation, so that each benchmark compares identical work. */

import { loadFixtures } from '../tests/helpers.ts';

export type Workload = {
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly string[];
};

const fixtures = loadFixtures()
  .map(({ input }) => input)
  .filter((input) => input.length > 0);

function repeatToLength(text: string, length: number): string {
  return text.repeat(Math.ceil(length / text.length)).slice(0, length);
}

/** Workloads measured one string per call. */
export const SINGLE_WORKLOADS: readonly Workload[] = [
  {
    name: 'ascii-short',
    description: 'Short printable ASCII (answered in JavaScript, never reaches Rust)',
    inputs: ['hello world'],
  },
  {
    name: 'ansi-short',
    description: 'Short ASCII with ANSI color codes',
    inputs: ['\u001B[32mINFO\u001B[39m server started on port 3000'],
  },
  {
    name: 'latin-accents',
    description: 'Short Latin text with one accented letter',
    inputs: ['Cr\u00E8me br\u00FBl\u00E9e recipe'],
  },
  {
    name: 'cjk-short',
    description: 'Short Chinese sentence',
    inputs: ['\u4F60\u597D\uFF0C\u4E16\u754C\uFF01\u6B22\u8FCE\u4F7F\u7528'],
  },
  {
    name: 'emoji-short',
    description: 'Short text with emoji, a ZWJ sequence, a flag, and a keycap',
    inputs: [
      'Hello \u{1F30D}! \u{1F468}\u200D\u{1F469}\u200D\u{1F467} \u{1F1FA}\u{1F1F8} 1\uFE0F\u20E3',
    ],
  },
  {
    name: 'table-row',
    description: 'Colored table row mixing ASCII, CJK, box drawing, and emoji',
    inputs: [
      '\u2502 \u001B[1m\u6587\u4EF6\u001B[22m \u2502 \u001B[32mOK\u001B[39m \u2705 \u2502 12.4 KB \u2502 2026-11-16 \u2502',
    ],
  },
  {
    name: 'mixed-10kb',
    description: 'About 10,000 UTF-16 code units of mixed fixture text',
    inputs: [repeatToLength(fixtures.join(' '), 10_000)],
  },
  {
    name: 'ascii-ansi-10kb',
    description: 'About 10,000 UTF-16 code units of colored ASCII log lines',
    inputs: [
      repeatToLength(
        '\u001B[2m12:00:00\u001B[22m \u001B[36mdebug\u001B[39m request handled in 4 ms\n',
        10_000,
      ),
    ],
  },
  {
    name: 'combining-marks',
    description: 'Decomposed Vietnamese and Devanagari text (many multi-code-point clusters)',
    inputs: ['Tie\u0302\u0301ng Vie\u0323\u0302t \u0915\u094D\u0937\u0924\u094D\u0930\u093F\u092F'],
  },
];

function tableCell(index: number): string {
  // 80% plain ASCII, 15% colored ASCII, 5% CJK or emoji: a typical CLI table.
  const bucket = index % 20;
  if (bucket < 16) {
    return `item-${index} ${index * 7} KB`;
  }

  if (bucket < 19) {
    return `\u001B[32mpassed\u001B[39m ${index}`;
  }

  return index % 40 < 20 ? `\u6587\u4EF6 ${index}` : `\u2705 done ${index}`;
}

/** Workloads measured as a batch of strings, for the batch API. */
export const BATCH_WORKLOADS: readonly Workload[] = [
  {
    name: 'batch-fixtures-1000',
    description: '1,000 strings cycling through the curated fixtures (4% printable ASCII)',
    inputs: Array.from(
      { length: 1_000 },
      (_, index) => fixtures[index % fixtures.length] as string,
    ),
  },
  {
    name: 'batch-cli-table-1000',
    description: '1,000 table cells: 80% plain ASCII, 15% colored ASCII, 5% CJK or emoji',
    inputs: Array.from({ length: 1_000 }, (_, index) => tableCell(index)),
  },
];
