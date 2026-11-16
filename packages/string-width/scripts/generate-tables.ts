/**
 * Generates `rust/core/src/tables.rs`.
 *
 * Every table is derived from the same sources the original `string-width` package uses at
 * runtime, so the Rust core reproduces its behavior instead of approximating it:
 *
 * - Unicode properties come from the V8 regular expression engine of the running Node.js process.
 * - East Asian Width comes from the pinned `get-east-asian-width` package.
 * - Multi-code-point RGI emoji sequences come from the Unicode emoji data files of the Unicode
 *   version reported by Node.js, and every sequence is verified against `\p{RGI_Emoji}`.
 *
 * Usage: node scripts/generate-tables.ts
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eastAsianWidth } from 'get-east-asian-width';

type Range = [start: number, end: number];

const MAX_CODE_POINT = 0x10ffff;
const OUTPUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '../rust/core/src/tables.rs');

// Must stay identical to the character class used by string-width 9.0.0 (index.js).
const PREPENDED_CONCATENATION_MARKS = String.raw`\u{600}-\u{605}\u{6DD}\u{890}\u{891}\u{8E2}\u{110BD}\u{110CD}`;
const VISIBLE_CHARACTER = new RegExp(
  String.raw`^[^\p{Default_Ignorable_Code_Point}\p{Control}\p{Enclosing_Mark}\p{Nonspacing_Mark}[\p{Format}--[${PREPENDED_CONCATENATION_MARKS}]]]$`,
  'v',
);

function isSurrogate(codePoint: number): boolean {
  return codePoint >= 0xd800 && codePoint <= 0xdfff;
}

/** Collects the ranges of scalar values (surrogates excluded) for which `predicate` holds. */
function collectRanges(predicate: (codePoint: number) => boolean): Range[] {
  const ranges: Range[] = [];
  let start = -1;

  for (let codePoint = 0; codePoint <= MAX_CODE_POINT + 1; codePoint++) {
    const matches = codePoint <= MAX_CODE_POINT && !isSurrogate(codePoint) && predicate(codePoint);

    if (matches && start === -1) {
      start = codePoint;
    } else if (!matches && start !== -1) {
      ranges.push([start, codePoint - 1]);
      start = -1;
    }
  }

  return ranges;
}

function propertyRanges(property: string): Range[] {
  const regex = new RegExp(`^\\p{${property}}$`, 'v');
  return collectRanges((codePoint) => regex.test(String.fromCodePoint(codePoint)));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  return response.text();
}

function compareCodePoints(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) {
      return difference;
    }
  }

  return left.length - right.length;
}

/** Returns every multi-code-point RGI emoji sequence, sorted by code point order. */
async function rgiEmojiSequences(unicodeVersion: string): Promise<number[][]> {
  const baseUrl = `https://www.unicode.org/Public/${unicodeVersion}.0/emoji`;
  const files = ['emoji-sequences.txt', 'emoji-zwj-sequences.txt'];
  const rgiEmoji = /^\p{RGI_Emoji}$/v;
  const sequences: number[][] = [];

  for (const file of files) {
    const text = await fetchText(`${baseUrl}/${file}`);
    const version = /^# Version: (\S+)$/m.exec(text)?.[1];
    if (version !== unicodeVersion) {
      throw new Error(
        `${file} is for Unicode ${version}, but Node.js reports Unicode ${unicodeVersion}`,
      );
    }

    for (const line of text.split('\n')) {
      const field = line.split('#', 1)[0]?.split(';', 1)[0]?.trim();
      if (!field || field.includes('..')) {
        continue;
      }

      const codePoints = field.split(/\s+/).map((hex) => Number.parseInt(hex, 16));
      if (codePoints.length < 2) {
        continue;
      }

      if (!rgiEmoji.test(String.fromCodePoint(...codePoints))) {
        throw new Error(`V8 does not consider ${field} to be RGI_Emoji`);
      }

      sequences.push(codePoints);
    }
  }

  return sequences.sort(compareCodePoints);
}

function formatRanges(name: string, documentation: string, ranges: Range[]): string {
  const hex = (value: number): string => {
    const digits = value.toString(16).toUpperCase().padStart(4, '0');
    // Group digits by four from the right, as required by clippy::unreadable_literal.
    return `0x${digits.length > 4 ? `${digits.slice(0, -4).padStart(4, '0')}_${digits.slice(-4)}` : digits}`;
  };
  const rows = ranges.map(([start, end]) => `    (${hex(start)}, ${hex(end)}),`).join('\n');
  return `/// ${documentation}\npub(crate) static ${name}: &[(u32, u32)] = &[\n${rows}\n];\n`;
}

function formatSequences(sequences: number[][]): string {
  const rows = sequences
    .map((codePoints) => {
      const escaped = codePoints.map((codePoint) => `\\u{${codePoint.toString(16).toUpperCase()}}`);
      return `    "${escaped.join('')}",`;
    })
    .join('\n');
  const maxLength = Math.max(...sequences.map((codePoints) => codePoints.length));

  return [
    '/// Multi-code-point RGI emoji sequences (`\\p{RGI_Emoji}` strings), sorted by code point.',
    `pub(crate) static RGI_EMOJI_SEQUENCES: &[&str] = &[\n${rows}\n];\n`,
    '/// Number of code points in the longest entry of `RGI_EMOJI_SEQUENCES`.',
    `pub(crate) const RGI_EMOJI_SEQUENCE_MAX_CHARS: usize = ${maxLength};\n`,
  ].join('\n');
}

async function main(): Promise<void> {
  const unicodeVersion = process.versions.unicode;
  if (!unicodeVersion) {
    throw new Error('process.versions.unicode is not available');
  }

  const sequences = await rgiEmojiSequences(unicodeVersion);

  const sections = [
    '// @generated by packages/string-width/scripts/generate-tables.ts. Do not edit by hand.',
    `// Node.js ${process.version}, V8 ${process.versions.v8}, ICU ${process.versions.icu}, Unicode ${unicodeVersion}.`,
    '',
    '/// Unicode version of the tables.',
    `pub(crate) const UNICODE_VERSION: &str = "${unicodeVersion}";\n`,
    formatRanges(
      'INVISIBLE',
      'Code points that string-width does not consider visible (zero-width when standing alone).',
      collectRanges((codePoint) => !VISIBLE_CHARACTER.test(String.fromCodePoint(codePoint))),
    ),
    formatRanges(
      'EAST_ASIAN_WIDE',
      'Code points with an East Asian Width of 2 regardless of the ambiguous-width option.',
      collectRanges((codePoint) => eastAsianWidth(codePoint, { ambiguousAsWide: false }) === 2),
    ),
    formatRanges(
      'EAST_ASIAN_AMBIGUOUS',
      'Code points that are 2 columns wide only when ambiguous characters are treated as wide.',
      collectRanges(
        (codePoint) =>
          eastAsianWidth(codePoint, { ambiguousAsWide: false }) === 1 &&
          eastAsianWidth(codePoint, { ambiguousAsWide: true }) === 2,
      ),
    ),
    formatRanges(
      'EMOJI_PRESENTATION',
      '`Emoji_Presentation`.',
      propertyRanges('Emoji_Presentation'),
    ),
    formatRanges('EMOJI_MODIFIER', '`Emoji_Modifier`.', propertyRanges('Emoji_Modifier')),
    formatRanges(
      'EMOJI_MODIFIER_BASE',
      '`Emoji_Modifier_Base`.',
      propertyRanges('Emoji_Modifier_Base'),
    ),
    formatRanges(
      'EXTENDED_PICTOGRAPHIC',
      '`Extended_Pictographic`.',
      propertyRanges('Extended_Pictographic'),
    ),
    formatRanges(
      'REGIONAL_INDICATOR',
      '`Regional_Indicator`.',
      propertyRanges('Regional_Indicator'),
    ),
    formatRanges(
      'RGI_EMOJI_SINGLE',
      'Single code points matched by `\\p{RGI_Emoji}`.',
      propertyRanges('RGI_Emoji'),
    ),
    formatSequences(sequences),
  ];

  writeFileSync(OUTPUT_PATH, sections.join('\n'));
  execFileSync('cargo', ['fmt', '--package', 'string-width-core'], { stdio: 'inherit' });
  console.log(`Wrote ${OUTPUT_PATH} (${sequences.length} RGI emoji sequences).`);
}

await main();
