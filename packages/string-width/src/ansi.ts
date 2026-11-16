// The pattern below is copied from ansi-regex 6.6.0 (https://github.com/chalk/ansi-regex),
// Copyright (c) Sindre Sorhus, released under the MIT license.
//
// The Rust core strips ANSI escape codes itself. This JavaScript copy is used in two cases:
// - Short strings, where crossing into Rust costs more than the work itself: the original also
//   strips them with this regular expression, so the result is the same by construction.
// - Strings that are not well-formed UTF-16: the original strips escape codes before replacing
//   lone surrogates, so removing a sequence between a lone high and a lone low surrogate joins
//   them into one character. Strings crossing into Rust have their lone surrogates replaced
//   first, which would prevent that, so those rare strings are stripped here instead.

const ST = String.raw`(?:\u001B\u005C|\u009C)`;
const stringControls = String.raw`\u0018\u001A\u001B\u0080-\u009F`;
const osc = String.raw`(?:\u001B\]|\u009D)[^\u0007${stringControls}]*(?:\u0007|${ST})`;
const controlString = String.raw`(?:\u001B[PX^_k]|[\u0090\u0098\u009E\u009F])[^${stringControls}]*${ST}`;
const linuxPalette = String.raw`\u001B\](?:P[\dA-Fa-f]{7}|R)(?:\u0007|${ST})?`;
const csi = String.raw`(?:\u001B\[|\u009B)[\u0030-\u003F]*[\u0020-\u002F]*[\u0040-\u007E]`;
const escapeSequence = String.raw`\u001B(?:[\u0020-\u002F]+[\u0030-\u007E]|[\dA-PR-TZcf-oq-uy=><~|}])`;

const ANSI_REGEX = new RegExp(
  `${linuxPalette}|${osc}|${controlString}|${csi}|${escapeSequence}`,
  'g',
);

/** Whether the input contains an ANSI escape introducer (ESC or the 8-bit CSI). */
export function hasEscapeIntroducer(input: string): boolean {
  return input.includes('\u001B') || input.includes('\u009B');
}

/** Removes ANSI escape codes exactly as strip-ansi does. */
export function stripAnsi(input: string): string {
  return input.replace(ANSI_REGEX, '');
}
