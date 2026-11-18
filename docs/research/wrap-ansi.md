# Research record: wrap-ansi

- Date of research: 2026-11-18
- Researcher: project maintainers (assisted research session)
- Classification: **PARTIAL ALTERNATIVE**
- Decision: implement, as a compatibility-focused Rust replacement for wrap-ansi 10.0.2, reusing
  the string-width core of this repository

## 1. Original library

| Item | Finding |
| --- | --- |
| npm package | [`wrap-ansi`](https://www.npmjs.com/package/wrap-ansi) |
| Repository | <https://github.com/chalk/wrap-ansi> |
| Maintainers | Sindre Sorhus and the chalk organization |
| License | MIT |
| Latest version | 10.0.2, published 2026-09-21 (10.0.0 on 2026-02-20, 10.0.1 on 2026-08-17) |
| Runtime | ESM only, `engines.node >= 20` |
| Dependencies | `string-width` ^8.2.0 (8.3.0 resolved), `ansi-styles` ^6.2.3 (6.2.3 resolved) |
| Weekly downloads | 607,066,321 (all versions, 2026-11-10 to 2026-11-16, npm downloads API) |
| Maintenance | Active: three releases in 2026, 10.0.x rewrote ANSI parsing and fixed quadratic paths |

Main dependents include yargs and cliui, inquirer, ink, and many CLI tools that print help text or
boxed output.

### Public API

```ts
export type Options = {
  readonly hard?: boolean; // default false
  readonly wordWrap?: boolean; // default true
  readonly trim?: boolean; // default true
};
export default function wrapAnsi(string: string, columns: number, options?: Options): string;
```

Behavior worth noting for compatibility (read from the 10.0.2 source, `index.js`, 662 lines):

- The input goes through `String(string)`, then plain text (not the escape sequences) is
  normalized to NFC, `\r\n` becomes `\n`, and each input line is wrapped separately.
- Tabs are expanded to spaces with 8-column tab stops before wrapping.
- Recognized sequences: CSI (7-bit `ESC [` and 8-bit U+009B), SGR with `;` and `:` parameters
  (256-color and RGB forms included), OSC 8 hyperlinks terminated by BEL or `ESC \`, and other
  complete OSC strings, kept as opaque zero-width units. Anything else stays plain text. The
  source documents this boundary explicitly ("intentionally not a terminal emulator").
- Words are split on U+0020 only. Widths come from `string-width` 8.3.0 with
  `countAnsiEscapeCodes: true` (escape sequences are removed beforehand). Printable ASCII skips
  `Intl.Segmenter`; other text is split into grapheme clusters for hard and character wrapping.
- After wrapping, every row break closes the active SGR styles and hyperlink and reopens them on
  the next row. Which styles are active is tracked per family (foreground, background, underline
  color, each modifier with its `ansi-styles` close code).
- `trim: true` (default) removes leading spaces per row and trailing spaces while keeping the
  invisible sequences among them; whitespace-only input returns `''`.
- Option values are read for truthiness, except `trim` and `wordWrap`, which are compared with
  `=== false`.

### Is the original already optimized?

Partly. 10.0.x removed the quadratic paths (row width and trimming are tracked incrementally) and
skips plain text with native regular expressions. Printable ASCII is fast. Text with non-ASCII
characters is slow, because every grapheme cluster or word goes through `string-width` 8.3.0
(`Intl.Segmenter` and Unicode property regular expressions) and the result is rebuilt with string
concatenation.

Measured on Linux x64, Node.js 24.21.0, wrap at 40 or 80 columns (quick timing, not a benchmark
under the [benchmark rules](../BENCHMARK_RULES.md)):

| Input | wrap-ansi 10.0.2 | fast-wrap-ansi 0.2.2 |
| --- | --- | --- |
| CLI help line, ASCII, 120 characters | 3.2 µs | 4.4 µs |
| CLI help line with colors, 120 characters | 9.9 µs | 6.3 µs |
| Colored log, 2,000 characters | 175 µs | 109 µs |
| Japanese text, 600 characters | 708 µs | 58 µs |
| Mixed text (colors, CJK, emoji, links), 8,500 characters | 2.9 ms | 0.69 ms |
| Mixed text, 85,000 characters | 29.6 ms | 6.0 ms |
| ASCII words, 65,000 characters | 1.36 ms | 3.04 ms |

## 2. Native platform alternatives

- Node.js: no wrapping API. `util.stripVTControlCharacters` only removes escape codes.
- Browsers: CSS wraps rendered text in pixels; there is no API that wraps a string to terminal
  columns or understands ANSI codes.

Classification `NATIVE IMPLEMENTATION EXISTS` does not apply.

## 3. Existing Rust implementations

Searched on crates.io (API search for `wrap-ansi`, `wrap ansi`, `ansi wrap`, `word wrap`,
`textwrap`, `wrap text terminal`) and on GitHub. The sources of the relevant crates were
downloaded and read.

| Crate | Version | Relationship to wrap-ansi | Usable as our core? |
| --- | --- | --- | --- |
| [`wrap-ansi`](https://github.com/sabry-awad97/wrap-ansi) | 0.1.0 (2025-09-08) | Described as a "faithful Rust port" of the JavaScript library, 1,916 lines. Ports the pre-10.0 algorithm: no tab expansion, no NFC normalization, no 8-bit CSI, no colon SGR. Widths come from the `string-width` 0.1.0 crate, an independent approximation (see the [string-width record](string-width.md)). | No: targets an older version, different width rules |
| [`textwrap`](https://crates.io/crates/textwrap) | 0.16.4 | General word wrapping with its own options (indentation, several algorithms). Skips ANSI codes when measuring, but does not close and reopen styles across rows. | No: different semantics |
| [`drape`](https://github.com/devashishdxt/drape) | 0.1.0 (2026-06-29) | ANSI-aware wrapping on top of `textwrap`, with textwrap's options (tab width 4). | No: different semantics |
| [`termwrap`](https://github.com/qtfkwk/termwrap) | 0.2.3 | 220 lines, wraps text with color codes using its own rules. | No: different semantics |
| TUI crates (`ftui-text`, `ctl-text`, `rich-rs`) | various | Wrapping inside terminal UI frameworks, with their own models of styled text. | No: different semantics, heavy dependencies |

Reused code: this repository's `string-width` Rust core (Unicode 17.0, compatible with
string-width 9.0.0) and `unicode-segmentation` 1.13.3 for grapheme clusters, the same algorithm as
`Intl.Segmenter` on Node.js 22.23 and 24.21. NFC normalization needs `unicode-normalization` or an
equivalent, to be checked against V8's `String.prototype.normalize` on Unicode 17.

## 4. Existing Rust-powered npm packages

- npm search (`wrap-ansi rust`, `wrap-ansi napi`, `wrap-ansi wasm`, `wrap ansi fast`,
  `fast-wrap-ansi`, `word wrap wasm`, `textwrap wasm`): no Rust-powered replacement for
  `wrap-ansi`.
- [`fast-wrap-ansi`](https://www.npmjs.com/package/fast-wrap-ansi) 0.2.2 (James Garbutt, MIT,
  68,547,458 weekly downloads) is a pure JavaScript fork of wrap-ansi using `fast-string-width`. It
  is faster on non-ASCII text (table above) but slower on plain ASCII, and its output differs from
  wrap-ansi 10.0.2 in 30 of 160 sampled cases (tab handling among them), so it is not a drop-in
  replacement for the current version.

## 5. amigo-native

- Catalog: <https://native.amigo-labs.dev/> lists 36 packages in 7 categories. None wraps text;
  only `slugify` and `diff` overlap with the libraries considered in this session.
- GitHub: the <https://github.com/amigo-labs/amigo-native> repository tree (2,057 paths) has no
  path mentioning wrap, ANSI, width, or terminal (the only matches are `wrapper.js` files). The
  expansion plan `docs/specs/expansion-2026.md` does not list wrap-ansi.
- Other repositories of <https://github.com/amigo-labs> (13 in total) are unrelated.

## 6. Classification

**PARTIAL ALTERNATIVE.** A Rust port exists but targets the pre-10.0 behavior with approximate
widths, and a faster JavaScript fork exists but diverges from 10.0.2. What is missing, and what
this package would provide:

1. Exact compatibility with the current version (10.0.2), verified differentially, including the
   widths of string-width 8.3.0.
2. A Rust core that reuses the string-width core of this repository.
3. Node.js bindings (NAPI-RS) and browser bindings (WebAssembly) published as an npm package.

## 7. Technical feasibility

- Complexity: moderate. The algorithm is about 660 lines of JavaScript with no platform
  dependencies. The delicate parts are the SGR state machine (per-family style tracking with the
  `ansi-styles` close codes) and the exact trimming and hard-wrap rules, which the upstream tests
  and differential tests will cover.
- Width compatibility: wrap-ansi 10.0.2 depends on string-width 8.3.0, while our string-width
  core reproduces 9.0.0. Taken one by one, the 1,112,064 Unicode scalar values differ on only 38
  code points: 12 prepended concatenation marks (U+0600 to U+0605 and others: 0 in 8.3.0, 1 in
  9.0.0) and the 26 regional indicators alone (1 in 8.3.0, 2 in 9.0.0). The two versions also use
  different rules inside multi-code-point clusters (Hangul jamo, code points after the base,
  emoji modifiers, VS15, keycaps), found by reading both sources during the prototype phase.
  Decision: `wrap-ansi-core` implements the 8.3.0 rules itself (`width.rs`) and only reuses the
  Unicode property tables of `string-width-core`, exposed as `string_width_core::unicode` without
  changing string-width's behavior. The tables specific to 8.3.0 (`Spacing_Mark`) and the
  `ansi-styles` codes are generated by the package's own script.
- NFC normalization: needed on non-ASCII input before wrapping; it must match V8 on Unicode 17.
- Node.js support: yes (NAPI-RS). Browser support: yes (wasm-bindgen).
- Compatibility risks: string conversion at the boundary (lone surrogates, as for string-width),
  the `String(string)` coercion, and option truthiness, handled in the TypeScript layer.
- Performance expectation: short ASCII lines (about 3 µs) were expected not to beat the original
  once the boundary crossing is counted. The prototype measured them about 2.4x faster (1.4 µs
  for a 120-character help line), so no JavaScript fast path is planned unless the benchmarks
  show otherwise. Gains are realistic for non-ASCII and
  colored text, where the original spends most of its time in string-width and in string
  concatenation: 85,000 mixed characters take 29.6 ms in wrap-ansi, and the string-width Rust core
  measures 46,000 non-ASCII characters in about 1.3 ms. These are expectations to be confirmed by
  benchmarks, not results.

## 8. Sources consulted

- <https://registry.npmjs.org/wrap-ansi>, <https://registry.npmjs.org/string-width>,
  <https://registry.npmjs.org/ansi-styles>, <https://registry.npmjs.org/fast-wrap-ansi>
- The published sources of `wrap-ansi` 10.0.2 (`index.js`, `index.d.ts`) and `fast-wrap-ansi`
  0.2.2
- <https://api.npmjs.org/downloads/point/last-week/wrap-ansi>,
  <https://api.npmjs.org/downloads/point/last-week/fast-wrap-ansi>
- <https://crates.io/api/v1/crates?q=...> (queries listed in section 3) and the sources of
  `wrap-ansi` 0.1.0, `drape` 0.1.0, and `termwrap` 0.2.3
- <https://registry.npmjs.org/-/v1/search?text=...> (queries listed in section 4)
- <https://native.amigo-labs.dev/>, <https://api.github.com/orgs/amigo-labs/repos>,
  <https://github.com/amigo-labs/amigo-native> (tree and `docs/specs/expansion-2026.md`)
