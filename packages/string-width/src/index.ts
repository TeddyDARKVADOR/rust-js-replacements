/**
 * Node.js entry point, backed by the native addon built with NAPI-RS.
 *
 * @example
 * ```ts
 * import stringWidth from '@rust-js-replacements/string-width';
 *
 * stringWidth('a'); // 1
 * stringWidth('\u53E4'); // 2
 * stringWidth('\u001B[1m\u53E4\u001B[22m'); // 2
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

/** Returns the visual width of a string: the number of terminal columns required to display it. */
export const stringWidth = api.stringWidth;

/**
 * Returns the visual width of every string in `inputs`, in order. Measures many strings with a
 * single call into the native addon.
 */
export const stringWidthMany = api.stringWidthMany;

/** Unicode version of the character tables compiled into the native addon. */
export const unicodeVersion: string = binding.unicodeVersion();

export default stringWidth;
