/**
 * Browser entry point, backed by a WebAssembly module built with wasm-bindgen.
 *
 * WebAssembly must be compiled before use, so call `init()` once before wrapping strings.
 *
 * @example
 * ```ts
 * import wrapAnsi, { init } from '@rust-js-replacements/wrap-ansi/browser';
 *
 * await init();
 * wrapAnsi('The quick brown fox', 10); // 'The quick\nbrown fox'
 * ```
 */

import initWasm, * as wasm from '../wasm/wrap_ansi_wasm.js';
import { createApi } from './api.ts';
import type { Binding } from './types.ts';

export type { Options } from './types.ts';

/** Sources accepted by `init`: a URL, a fetch `Response`, raw bytes, or a compiled module. */
export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

let binding: Binding | undefined;

function getBinding(): Binding {
  if (binding === undefined) {
    throw new Error('The WebAssembly module is not initialized. Call and await init() first.');
  }

  return binding;
}

/**
 * Loads and instantiates the WebAssembly module. By default it is fetched from next to this file,
 * which bundlers such as Vite and webpack resolve automatically. Calling it again is a no-op.
 */
export async function init(input?: InitInput | Promise<InitInput>): Promise<void> {
  if (binding !== undefined) {
    return;
  }

  await initWasm(input === undefined ? undefined : { module_or_path: input });
  binding = wasm;
}

/** Instantiates the WebAssembly module synchronously from its bytes or a compiled module. */
export function initSync(module: BufferSource | WebAssembly.Module): void {
  if (binding !== undefined) {
    return;
  }

  wasm.initSync({ module });
  binding = wasm;
}

const api = createApi(getBinding);

/** Wrap words to the specified column width. Requires `init()` or `initSync()` first. */
export const wrapAnsi = api.wrapAnsi;

export default wrapAnsi;
