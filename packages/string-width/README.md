# @rust-js-replacements/string-width

Rust-powered alternative to [`string-width`](https://github.com/sindresorhus/string-width) by Sindre
Sorhus: get the visual width of a string, the number of terminal columns required to display it.

- Compatible with **string-width 9.0.0**: same API, same options, same results (see
  [Compatibility](#compatibility)).
- Node.js native addon (NAPI-RS) and browser build (WebAssembly).
- Additional batch API, `stringWidthMany`.
- Status: `BENCHMARKED`. Not published to npm yet (see [Limitations](#limitations)).

## Usage

```ts
import stringWidth, { stringWidthMany } from '@rust-js-replacements/string-width';

stringWidth('a'); // 1
stringWidth('古'); // 2
stringWidth('\u001B[1m古\u001B[22m'); // 2
stringWidth('±', { ambiguousIsNarrow: false }); // 2

stringWidthMany(['hello', '古', 'Hello \u{1F30D}']); // Uint32Array [5, 2, 8]
```

CommonJS works on Node.js 22.12 and later through `require(esm)`:

```js
const { stringWidth } = require('@rust-js-replacements/string-width');
```

### Browser

The `browser` export condition (used by Vite, webpack, and other bundlers) or the explicit
`/browser` subpath selects the WebAssembly build. Initialize it once before use:

```ts
import stringWidth, { init } from '@rust-js-replacements/string-width/browser';

await init(); // fetches string_width_wasm_bg.wasm next to the module
stringWidth('古'); // 2
```

`init(input?)` accepts a URL, a `Response`, bytes, or a compiled `WebAssembly.Module`.
`initSync(bytesOrModule)` initializes synchronously. Calling either function more than once has
no effect. Every call made before initialization throws an `Error`.

## API

### `stringWidth(string, options?)`

Identical to the original. Returns 0 for non-string input and for the empty string.

Options:

- `ambiguousIsNarrow` (default `true`): count East Asian Ambiguous characters as one column
  instead of two.
- `countAnsiEscapeCodes` (default `false`): count the characters of ANSI escape codes instead of
  removing them.

### `stringWidthMany(strings, options?)`

Measures every string of an array with a single call into Rust and returns a `Uint32Array` of
widths in the same order. Non-string entries measure 0; a non-array argument throws a `TypeError`.

### `unicodeVersion` (Node.js entry point)

The Unicode version of the compiled tables (`'17.0'`).

## Compatibility

The original computes widths with Unicode data from the JavaScript runtime (V8 regular expression
properties and `Intl.Segmenter`). This package compiles the same data into Rust tables:

- Unicode properties are generated from V8 regular expressions, East Asian Width from
  `get-east-asian-width` 1.7.0, and RGI emoji sequences from the Unicode 17.0 emoji data
  (`scripts/generate-tables.ts`).
- Grapheme clusters come from `unicode-segmentation` 1.13.3 (Unicode 17.0), matching
  `Intl.Segmenter` on ICU 78.
- ANSI escape codes are removed by a scanner equivalent to `strip-ansi` 7.2.0 and `ansi-regex`
  6.6.0.

Verified on Node.js 24.21.0 (ICU 78.3) and Node.js 22.23.1 (ICU 78.2), both with Unicode 17.0, on
Linux x64:

| Test | Scope | Result |
| --- | --- | --- |
| Upstream suite | The 466 tests of string-width 9.0.0, vendored unchanged | 466 passed |
| Every code point | All 1,114,112 code points (including lone surrogates), 4 option combinations | identical |
| Code points in context | Planes 0, 1, and 14 in 9 contexts (combining mark, VS15, VS16, ZWJ, skin tone, prepended mark, Hangul, ASCII before and after), 2 option combinations | identical |
| RGI emoji | All 2,760 multi-code-point RGI emoji sequences in 10 variants each | identical |
| Random strings | 200,000 seeded strings of mixed ANSI, emoji, marks, Hangul, controls, and lone surrogates, 4 option combinations | identical |
| Long inputs | 100,000-character inputs, long ZWJ chains, unterminated escape sequences | identical |
| API behavior | Non-string input, `null` options, option truthiness, lone surrogates | identical |

The same differential suite runs against the WebAssembly build.

### Differences

- **Unicode version.** The original's results change with the Unicode version of the runtime;
  this package always uses Unicode 17.0. On a runtime with a different Unicode version, results
  can differ for characters whose properties changed. The API tests fail when the runtime's
  Unicode version differs from the tables, so that regeneration is not forgotten.
- **Browser initialization.** The browser build must be initialized with `init()` or `initSync()`
  before use; the original is synchronous everywhere.
- **Additions.** `stringWidthMany`, `unicodeVersion`, and named exports do not exist in the
  original.

Lone surrogates adjacent to ANSI escape codes are handled like the original (the escape codes are
removed before the surrogates are replaced with U+FFFD) by stripping such strings in TypeScript
before they cross into Rust. This affects only strings that are not well-formed UTF-16.

## Performance

Measured with `pnpm run bench` on an AMD Ryzen 5 PRO 7640HS, Linux x64, on 2026-11-16. The full
results, including latency percentiles and margins of error, are in
[benchmarks/results](benchmarks/results). Values are throughput relative to the original in the
same process (above 1.00x is faster).

| Workload | Node.js 24: native | Node.js 24: WebAssembly | Node.js 22: native | Node.js 22: WebAssembly |
| --- | ---: | ---: | ---: | ---: |
| Short printable ASCII (JavaScript fast path, never reaches Rust) | 1.22x | 1.27x | 1.16x | 1.17x |
| **Short ASCII with ANSI colors** | **0.65x** | **0.67x** | **0.81x** | **0.88x** |
| Short Latin text with an accent | 4.34x | 3.06x | 11.14x | 7.90x |
| Short Chinese sentence | 4.03x | 2.75x | 9.23x | 6.90x |
| Short text with emoji, ZWJ sequence, flag, keycap | 6.63x | 5.45x | 9.41x | 7.52x |
| Colored table row (ASCII, CJK, box drawing, emoji) | 4.24x | 2.74x | 13.54x | 8.67x |
| Decomposed text with combining marks | 3.35x | 3.03x | 5.75x | 5.07x |
| 10,000 code units of mixed text | 5.17x | 3.38x | 15.02x | 10.48x |
| 10,000 code units of colored ASCII logs | 4.03x | 1.97x | 20.96x | 10.59x |
| 1,000 mixed strings, `stringWidthMany` | 7.51x | 4.95x | 12.00x | 8.43x |
| 1,000 CLI table cells (80% plain ASCII), `stringWidthMany` | 1.67x | 1.35x | 1.86x | 1.53x |

What this means:

- **Slower for short ANSI-colored ASCII** (for example `chalk` output of a few dozen characters):
  about 0.1 microseconds more per call, because crossing into Rust and converting the string costs
  more than the original's regular expression. Long colored strings are faster.
- Printable ASCII never reaches Rust; it is answered in TypeScript exactly like the original does.
  Its small advantage most likely comes from skipping the original's two escape-character
  searches; it is not a Rust gain.
- A direct call into the native addon with a one-character string costs about 0.19 microseconds
  (Node.js 24), which bounds the gain on very short strings.
- `stringWidthMany` is only slightly faster than calling `stringWidth` in a loop (7.51x against
  6.70x on mixed strings, Node.js 24): converting each string dominates, not the call itself.
- The original is 1.3 to 5 times slower on Node.js 22 (V8 12.4) than on Node.js 24 (V8 13.6),
  while the native addon's throughput is essentially the same on both, so the relative gains are
  larger on Node.js 22.

Startup and size (Node.js 24, median of 15 processes that import the package and measure one
string):

| | Wall time | Resident memory | Size (gzip -9) |
| --- | ---: | ---: | ---: |
| Empty Node.js process | 37.4 ms | 43.4 MB | |
| Original (4 JavaScript modules) | 62.5 ms | 50.3 MB | 23,964 B (8,656 B) |
| Native addon (linux-x64-gnu) | 40.9 ms | 47.3 MB | 630,128 B (253,820 B) |
| WebAssembly module and glue | 42.0 ms | 49.5 MB | 163,594 B (55,164 B) |

The native addon is about 26 times larger than the original's JavaScript, and the WebAssembly
module about 7 times larger. For browser bundles where size matters more than speed, the original
remains a reasonable choice.

## Limitations

- Not published to npm. Publishing needs the NAPI-RS multi-platform pipeline (one optional
  dependency per target listed in `package.json`); only `linux-x64-gnu` has been built and tested
  locally. The CI workflow builds and tests macOS and Windows but has not run yet.
- The browser build has been tested in Node.js through the browser entry point, not in a browser.
- The package name and npm scope are placeholders until release.

## Development

```sh
pnpm run build          # native addon, WebAssembly module, and dist/
                        # (needs the wasm32 target and wasm-bindgen-cli 0.2.130)
pnpm run test           # API, compatibility, and upstream tests (native addon)
pnpm run test:wasm      # compatibility tests against the WebAssembly build
pnpm run bench          # benchmarks; writes benchmarks/results/
pnpm run generate:tables  # regenerate the Unicode tables (network access to unicode.org)
cargo test -p string-width-core
```

## License

MIT. The vendored upstream test suite in `tests/upstream` and the ANSI pattern in `src/ansi.ts` are
copyright Sindre Sorhus, under the MIT license.
