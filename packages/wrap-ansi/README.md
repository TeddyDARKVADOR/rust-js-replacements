# @rust-js-replacements/wrap-ansi

> Status: `BENCHMARKED`. Not published on npm yet.

Rust-powered alternative to [`wrap-ansi`](https://github.com/chalk/wrap-ansi) 10.0.2: wordwrap a
string with ANSI escape codes, with the same API and the same output.

```ts
import wrapAnsi from '@rust-js-replacements/wrap-ansi';

wrapAnsi('The quick brown fox', 10);
// 'The quick\nbrown fox'

wrapAnsi('\u001B[31mred text here\u001B[39m', 8);
// '\u001B[31mred text\u001B[39m\n\u001B[31mhere\u001B[39m'
```

In Node.js the package loads a native addon. In browsers (bundlers pick the `browser` export
condition, or import `@rust-js-replacements/wrap-ansi/browser`), it uses a WebAssembly module that
must be initialized once:

```ts
import wrapAnsi, { init } from '@rust-js-replacements/wrap-ansi/browser';

await init(); // or initSync(bytes)
wrapAnsi('The quick brown fox', 10);
```

The WebAssembly module is 358 KB (149 KB gzipped), mostly Unicode tables (emoji sequences and NFC
normalization data).

## API

`wrapAnsi(string, columns, options?)`, identical to wrap-ansi 10.0.2:

| Option | Default | Effect |
| --- | --- | --- |
| `hard` | `false` | Break words longer than `columns`, so that no row is wider. |
| `wordWrap` | `true` | Break rows at spaces. When `false`, rows are filled completely and words are split. |
| `trim` | `true` | Remove the whitespace around rows. |

Plain text is normalized to NFC, `\r\n` becomes `\n`, tabs are expanded to 8-column tab stops,
and every row break closes the active styles and hyperlink, then reopens them on the next row.

## Compatibility

The original's own test suite (85 tests, `tests/upstream/`) passes unchanged, apart from its
import. The output is also compared with wrap-ansi 10.0.2 by the same suite (`tests/compatibility-suite.ts`)
for the native addon (`tests/compatibility.test.ts`) and the WebAssembly module
(`tests/wasm/browser.test.ts`):

- Widths: wrap-ansi measures text with string-width **8.3.0**, whose rules differ from the 9.0.0
  rules of [`@rust-js-replacements/string-width`](../string-width). This package implements the
  8.3.0 rules (`rust/core/src/width.rs`) and is checked against string-width 8.3.0 on every Unicode
  scalar value, alone and after five different base characters.
- Wrapping: identical output on curated fixtures (`fixtures/wrap-cases.json`) for 14 column counts
  (including 0, fractional, negative, and infinite values) and all 8 option combinations, and on
  20,000 seeded random inputs made of text, emoji, combining marks, tabs, newlines, SGR sequences,
  hyperlinks, and malformed escapes.

Known differences:

- Lone surrogates (strings that are not well-formed UTF-16) are replaced with U+FFFD when the
  string enters Rust.
- `columns` is converted with `Number()`. The original compares a non-number `columns` with both
  `>` (which converts it) and `===` (which does not), so passing a string is not supported.
- NFC normalization uses Unicode 18 data (`unicode-normalization` 0.1.26), while Node.js 22 and
  24 use Unicode 17: only characters added in Unicode 18 can differ.

## Performance

Measured with `pnpm run bench` on an AMD Ryzen 5 PRO 7640HS, Linux x64, on 2026-11-18. The full
results, including latency percentiles and margins of error, are in
[benchmarks/results](benchmarks/results). Values are throughput relative to the original
(wrap-ansi 10.0.2 with string-width 8.3.0) in the same process: above 1.00x is faster.

| Workload | Node.js 24: native | Node.js 24: WebAssembly | Node.js 22: native | Node.js 22: WebAssembly |
| --- | ---: | ---: | ---: | ---: |
| CLI help line, plain ASCII (120 characters) | 1.64x | 1.18x | 1.67x | 1.18x |
| CLI help line with ANSI colors | 3.15x | 2.16x | 3.17x | 2.00x |
| Colored sentence from the original's README | 2.83x | 2.01x | 2.95x | 1.87x |
| Short sentence with emoji, ZWJ sequence, flag | 12.83x | 8.59x | 19.14x | 12.39x |
| Japanese text without spaces, hard wrap | 16.44x | 10.25x | 24.64x | 14.83x |
| A 500-character word, hard wrap | 2.34x | 1.33x | 2.38x | 1.39x |
| 100 CLI help lines, wrapped one by one | 2.73x | 1.90x | 2.81x | 1.83x |
| 10,000 characters of plain ASCII prose | 2.63x | 1.64x | 3.10x | 1.89x |
| 10,000 characters of colored log lines | 3.78x | 2.49x | 4.14x | 2.33x |
| 10,000 characters of colors, CJK, emoji, and links | 7.20x | 5.21x | 11.94x | 7.94x |

What this means:

- Every measured workload is faster, including short plain ASCII, so no input is answered in
  JavaScript: everything goes through Rust.
- The smallest gains are on plain ASCII (1.18x with WebAssembly on a short help line): the
  original is already fast there, and crossing the boundary costs about 0.43 microseconds with the
  native addon and 0.72 with WebAssembly (Node.js 24, one-character string).
- The largest gains are on text that the original measures cluster by cluster with
  `Intl.Segmenter` and Unicode regular expressions: emoji, CJK, and mixed text.
- The Japanese workload has a +/-15.4% margin of error for the native addon on Node.js 24
  (garbage collection pauses); its median gives 15.8x (108 against 1,713 microseconds).

Startup and size (Node.js 24, median of 15 processes that import the package and wrap one
string):

| | Wall time | Resident memory | Size (gzip -9) |
| --- | ---: | ---: | ---: |
| Empty Node.js process | 38.4 ms | 43.3 MB | |
| Original (wrap-ansi and its 5 dependencies) | 64.2 ms | 50.6 MB | 44,293 B (13,998 B) |
| Native addon (linux-x64-gnu) | 40.0 ms | 47.4 MB | 832,312 B (366,719 B) |
| WebAssembly module and glue | 43.3 ms | 50.2 MB | 365,839 B (156,022 B) |

The native addon is about 19 times larger than the original's JavaScript (26 times gzipped), and
the WebAssembly module about 8 times larger (11 times gzipped), mostly because of the Unicode
tables (emoji sequences and NFC normalization data). For browser bundles where size matters more
than speed, the original remains a reasonable choice.

## Layout

Everything specific to wrap-ansi lives in this directory:

| Path | Content |
| --- | --- |
| `rust/core/src/lib.rs` | The wrapping algorithm, one function per function of the original `index.js`. |
| `rust/core/src/width.rs` | Width rules of string-width 8.3.0. |
| `rust/core/src/ansi.rs` | Escape sequence grammar and the text/escape segmenter. |
| `rust/core/src/sgr.rs` | Style tracking across row breaks. |
| `rust/core/src/js.rs` | JavaScript built-ins the algorithm relies on (`parseInt`, `trim`). |
| `rust/core/src/tables.rs` | Generated by `scripts/generate-tables.ts`. |
| `rust/node/` | NAPI-RS binding. |
| `rust/wasm/` | wasm-bindgen binding. |
| `src/` | TypeScript API: `api.ts` (shared), `index.ts` (Node.js), `browser.ts` (WebAssembly). |
| `tests/`, `fixtures/` | API tests, and the differential suite run against both bindings. |
| `tests/upstream/` | The test suite of wrap-ansi 10.0.2, vendored with its license. |

The only shared code is the Unicode property tables of `string-width-core`
(`string_width_core::unicode`); see [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#decisions).
