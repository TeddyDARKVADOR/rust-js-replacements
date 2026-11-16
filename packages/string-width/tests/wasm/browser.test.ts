// Runs the browser entry point under Node.js. This verifies the WebAssembly module and the
// browser API, but not browser-specific loading (fetching the module from a URL in a bundle).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { init, initSync, stringWidth, stringWidthMany } from '../../src/browser.ts';
import { defineCompatibilitySuite } from '../compatibility-suite.ts';

test('calls before initialization fail with a clear error', () => {
  assert.throws(() => stringWidth('a'), /not initialized/);
  assert.throws(() => stringWidthMany(['a']), /not initialized/);
});

test('initializes synchronously from the module bytes', async () => {
  initSync(readFileSync(new URL('../../wasm/string_width_wasm_bg.wasm', import.meta.url)));
  assert.equal(stringWidth('\u53E4'), 2);
  // A second initialization is a no-op.
  await init();
  assert.equal(stringWidth('a'), 1);
});

defineCompatibilitySuite('WebAssembly', stringWidth, stringWidthMany);
