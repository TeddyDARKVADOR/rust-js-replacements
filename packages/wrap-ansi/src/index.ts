/**
 * Node.js entry point, backed by the native addon built with NAPI-RS.
 *
 * @example
 * ```ts
 * import wrapAnsi from '@rust-js-replacements/wrap-ansi';
 *
 * wrapAnsi('The quick brown fox', 10); // 'The quick\nbrown fox'
 * ```
 */

import { createRequire } from 'node:module';
import { createApi } from './api.ts';
import type { Binding } from './types.ts';

export type { Options } from './types.ts';

const require = createRequire(import.meta.url);

// Loaded eagerly so that a missing or incompatible addon fails at import time with the loader's
// own error message, which lists the platform packages it tried.
const binding = require('../native/binding.cjs') as Binding;

const api = createApi(() => binding);

/**
 * Wrap words to the specified column width.
 *
 * @param string - A string with ANSI escape codes, like one styled by `chalk`. Newline characters
 * will be normalized to `\n`. Tab characters are expanded to spaces using 8-column tab stops
 * before wrapping.
 * @param columns - The number of columns to wrap the text to.
 */
export const wrapAnsi = api.wrapAnsi;

export default wrapAnsi;
