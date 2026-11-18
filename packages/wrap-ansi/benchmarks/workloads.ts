/**
 * Benchmark inputs. Every workload is wrapped by every implementation with the same columns and
 * options, and the runner checks that all outputs are identical before measuring.
 */

import type { Options } from '../src/types.ts';

export type Workload = {
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly string[];
  readonly columns: number;
  readonly options?: Options;
};

const ESC = '\u{1B}';
const red = (text: string): string => `${ESC}[31m${text}${ESC}[39m`;
const green = (text: string): string => `${ESC}[32m${text}${ESC}[39m`;
const bold = (text: string): string => `${ESC}[1m${text}${ESC}[22m`;
const dim = (text: string): string => `${ESC}[2m${text}${ESC}[22m`;
const link = (url: string, text: string): string => `${ESC}]8;;${url}\u{7}${text}${ESC}]8;;\u{7}`;

function repeatToLength(text: string, length: number): string {
  return text.repeat(Math.ceil(length / text.length)).slice(0, length);
}

const HELP_LINE =
  '  --output, -o   Write the generated files to this directory instead of the default build folder. [string]';
const COLORED_HELP_LINE = `  ${green('--output')}, ${green('-o')}   Write the generated files to this ${bold('directory')} instead of the default build folder. ${dim('[string]')}`;
const CHALK_SENTENCE = `The quick brown ${red('fox jumped over ')}the lazy ${green('dog and then ran away with the unicorn.')}`;
const JAPANESE =
  '\u{53E4}\u{6C60}\u{3084}\u{86D9}\u{98DB}\u{3073}\u{8FBC}\u{3080}\u{6C34}\u{306E}\u{97F3}\u{3001}\u{9759}\u{3051}\u{3055}\u{3084}\u{5CA9}\u{306B}\u{3057}\u{307F}\u{5165}\u{308B}\u{8749}\u{306E}\u{58F0}\u{3002}';
const EMOJI_SENTENCE =
  'Deploy finished \u{2705} in 12 s \u{1F680} by \u{1F468}\u{200D}\u{1F4BB} from \u{1F1EB}\u{1F1F7} \u{1F44D}\u{1F3FD} thanks';
const MIXED_WORDS = [
  'lorem',
  red('ipsum'),
  'dolor',
  '\u{53E4}\u{6C60}\u{3084}',
  'sit',
  '\u{1F44D}\u{1F3FD}',
  'amet,',
  bold('consectetur'),
  link('https://example.com', 'adipiscing'),
  'caf\u{E9}',
];
const LOG_LINE = `${dim('12:00:00')} ${ESC}[36minfo${ESC}[39m request ${ESC}[33m/api/users${ESC}[39m completed in 12 ms`;

export const WORKLOADS: readonly Workload[] = [
  {
    name: 'help-ascii',
    description: 'CLI help line, plain ASCII (120 characters), 40 columns',
    inputs: [HELP_LINE],
    columns: 40,
  },
  {
    name: 'help-colored',
    description: 'CLI help line with ANSI colors, 40 columns',
    inputs: [COLORED_HELP_LINE],
    columns: 40,
  },
  {
    name: 'chalk-sentence',
    description: "Colored sentence from the original's README, 20 columns",
    inputs: [CHALK_SENTENCE],
    columns: 20,
  },
  {
    name: 'emoji-short',
    description: 'Short sentence with emoji, a ZWJ sequence, and a flag, 20 columns',
    inputs: [EMOJI_SENTENCE],
    columns: 20,
  },
  {
    name: 'japanese-hard',
    description: 'Japanese text without spaces (650 characters), hard wrap at 40 columns',
    inputs: [JAPANESE.repeat(25)],
    columns: 40,
    options: { hard: true },
  },
  {
    name: 'long-word-hard',
    description: 'A 500-character word, hard wrap at 80 columns',
    inputs: ['x'.repeat(500)],
    columns: 80,
    options: { hard: true },
  },
  {
    name: 'help-screen-100',
    description: '100 CLI help lines (half colored), each wrapped separately at 60 columns',
    inputs: Array.from({ length: 100 }, (_, index) =>
      index % 2 === 0 ? HELP_LINE : COLORED_HELP_LINE,
    ),
    columns: 60,
  },
  {
    name: 'ascii-10kb',
    description: 'About 10,000 characters of plain ASCII prose, 80 columns',
    inputs: [
      repeatToLength(
        'The quick brown fox jumps over the lazy dog while the unicorn runs away. ',
        10_000,
      ),
    ],
    columns: 80,
  },
  {
    name: 'colored-logs-10kb',
    description: 'About 10,000 characters of colored log lines, 80 columns',
    inputs: [repeatToLength(`${LOG_LINE}\n`, 10_000)],
    columns: 80,
  },
  {
    name: 'mixed-10kb',
    description:
      'About 10,000 characters of colors, CJK, emoji, accents, and hyperlinks, 80 columns',
    inputs: [
      Array.from({ length: 1200 }, (_, index) => MIXED_WORDS[index % MIXED_WORDS.length]).join(' '),
    ],
    columns: 80,
  },
];
