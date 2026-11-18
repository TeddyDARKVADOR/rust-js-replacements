// Runs the browser entry point under Node.js. This verifies the WebAssembly module and the
// browser API, but not browser-specific loading (fetching the module from a URL in a bundle).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { init, initSync, wrapAnsi } from '../../src/browser.ts';
import type { Binding } from '../../src/types.ts';
import * as wasm from '../../wasm/wrap_ansi_wasm.js';
import { defineCompatibilitySuite } from '../compatibility-suite.ts';

test('calls before initialization fail with a clear error', () => {
  assert.throws(() => wrapAnsi('a', 10), /not initialized/);
});

test('initializes synchronously from the module bytes', async () => {
  initSync(readFileSync(new URL('../../wasm/wrap_ansi_wasm_bg.wasm', import.meta.url)));
  assert.equal(wrapAnsi('The quick brown fox', 10), 'The quick\nbrown fox');
  // A second initialization is a no-op.
  await init();
  assert.equal(wrapAnsi('a b', 1), 'a\nb');
});

// The module is initialized by the test above, which runs first.
defineCompatibilitySuite('WebAssembly', wrapAnsi, () => wasm as Binding);
