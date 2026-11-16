# Research record: string-width

- Date of research: 2026-11-16
- Researcher: project maintainers (assisted research session)
- Classification: **PARTIAL ALTERNATIVE**
- Decision: implement, as a compatibility-focused Rust replacement for string-width 9.0.0

## 1. Original library

| Item | Finding |
| --- | --- |
| npm package | [`string-width`](https://www.npmjs.com/package/string-width) |
| Repository | <https://github.com/sindresorhus/string-width> |
| Author | Sindre Sorhus |
| License | MIT |
| Latest version | 9.0.0, published 2026-11-11 |
| Runtime | ESM only, `engines.node >= 22` |
| Dependencies | `strip-ansi` 7.2.0 (which uses `ansi-regex` 6.6.0), `get-east-asian-width` 1.7.0 |
| Weekly downloads | 714,645,128 (all versions, 2026-11-09 to 2026-11-15, npm downloads API) |
| Maintenance | Active: 9.0.0 rewrote the width rules five days before this research |

### Public API

```ts
export type Options = {
  readonly ambiguousIsNarrow?: boolean; // default true
  readonly countAnsiEscapeCodes?: boolean; // default false
};
export default function stringWidth(string: string, options?: Options): number;
```

Behavior worth noting for compatibility:

- Non-string input and the empty string return 0 before the options are read.
- `null` options throw a `TypeError` (destructuring); option values are used for their truthiness.
- Printable ASCII is answered by a regular expression test and `string.length`.
- ANSI codes are removed by `strip-ansi` only when the string contains ESC (U+001B) or CSI (U+009B).
- Everything else is split with `Intl.Segmenter` and measured with rules that depend on Unicode
  properties evaluated by V8 (`\p{RGI_Emoji}`, `Default_Ignorable_Code_Point`, and others). The
  result therefore depends on the Unicode version of the Node.js runtime.
- Lone surrogates are measured as U+FFFD, but only after ANSI codes are removed from the raw
  UTF-16 string.

### Is the original already optimized?

Yes, for printable ASCII: it never reaches the segmenter. Non-ASCII input goes through
`Intl.Segmenter` and several Unicode property regular expressions per grapheme cluster, which is
where a native implementation can help.

## 2. Native platform alternatives

- Node.js: no public API. `util.getStringWidth` is internal (`typeof` is `undefined` on Node.js
  24.21.0).
- Browsers: no API for terminal column width. `Intl.Segmenter` only splits graphemes; canvas text
  metrics measure pixels, not terminal columns.

Classification `NATIVE IMPLEMENTATION EXISTS` does not apply.

## 3. Existing Rust implementations

Searched on crates.io (API search for `string-width`, `string width`, `unicode-width`,
`ansi-width`, `display-width`) and on GitHub. Sources were downloaded and read where relevant.

| Crate | Version | Relationship to string-width | Usable as our core? |
| --- | --- | --- | --- |
| [`unicode-width`](https://docs.rs/unicode-width/) | 0.2.3 | Own width rules (UAX #11 with terminal heuristics). Different results for emoji, prepended marks, Hangul, and zero-width rules. No ANSI handling. | No: different semantics |
| [`unicode-display-width`](https://crates.io/crates/unicode-display-width) | 0.3.0 (2023) | Unicode 15.1 grapheme-based width, own rules, no ANSI handling | No: different semantics, outdated Unicode |
| [`runefix-core`](https://github.com/runefix-labs/runefix-core) | 0.1.10 (2025) | Own width engine with JSON data tables | No: different semantics |
| [`string-width`](https://github.com/sabry-awad97/string-width) (crate) | 0.1.0 (2025) | Independent approximation inspired by the npm package; not tied to any npm version | No: not compatible with 9.0.0 |
| [`inkferro-core`](https://github.com/metaphorics/inkferro) | 0.1.0 | Contains a port of string-width **8.2.1** inside a terminal UI engine (taffy layout, regex, and others); approximates `\p{RGI_Emoji}` with rules | No: targets 8.2.1, heavy dependencies, not a standalone crate |
| [`ansi-width`](https://github.com/uutils/ansi-width) | 0.1.1 | `unicode-width` plus ANSI skipping | No: different semantics |
| [`cellwidth`](https://github.com/singhpratech/cellwidth) | 1.0.1 | Own rules | No: different semantics |

Reused crate: [`unicode-segmentation`](https://crates.io/crates/unicode-segmentation) 1.13.3
(Unicode 17.0.0) for extended grapheme clusters, the same algorithm as `Intl.Segmenter` on
Node.js 22.23 and 24.21 (ICU 78, Unicode 17).

## 4. Existing Rust-powered npm packages

- npm search (`string-width rust`, `string-width napi`, `string-width wasm`, `terminal width wasm`,
  `inkferro`, `east asian width rust`): no Rust-powered replacement for `string-width`.
- [`inkferro`](https://www.npmjs.com/package/inkferro) 0.1.0 is a Rust-backed `ink` replacement.
  Its JavaScript API does not export a string width function (checked in its published `dist`).
- `@hyrious/string-width` is a JavaScript port of the Rust `unicode-width` crate (the opposite
  direction), with different semantics.

## 5. amigo-native

- Catalog: <https://native.amigo-labs.dev/> lists 36 packages in 7 categories (crypto, text,
  search, document, archive, util, graph). None measures string width; the text category contains
  CommonMark, encoding, language detection, linkify-it, sanitize-html, sentences, slugify, stemmer,
  text splitters, and turndown.
- GitHub: <https://github.com/amigo-labs/amigo-native> repository tree (2,057 paths) contains no
  path mentioning width, ANSI, or East Asian width. The expansion plan
  `docs/specs/expansion-2026.md` does not list string-width.
- Other repositories of <https://github.com/amigo-labs> (13 in total) are unrelated to text width.

## 6. Classification

**PARTIAL ALTERNATIVE.** Rust crates implement terminal width with their own rules, and one crate
ports an older version (8.2.1) inside a larger engine. What is missing, and what this package
provides:

1. Exact compatibility with the current version (9.0.0), verified differentially.
2. A standalone, dependency-light Rust core.
3. Node.js bindings (NAPI-RS) and browser bindings (WebAssembly) published as an npm package.
4. A batch API.

## 7. Technical feasibility

- Complexity: moderate. The rules are small, but exact compatibility needs the same Unicode
  property data as V8. Tables are generated from the running Node.js (V8 regular expressions),
  from `get-east-asian-width`, and from the Unicode 17.0 emoji data files.
- Node.js support: yes (NAPI-RS). Browser support: yes (wasm-bindgen); the algorithm has no
  platform dependencies.
- Compatibility risks: the original's output depends on the runtime's Unicode version; the Rust
  tables are pinned to Unicode 17. String conversion at the boundary replaces lone surrogates
  before ANSI removal (handled in the TypeScript layer, see the package README).
- Performance expectation: ASCII cannot be faster than the original's regular expression test,
  so it stays in JavaScript. Gains are realistic for non-ASCII text, where the original creates
  segments and runs several regular expressions per cluster.

## 8. Sources consulted

- <https://registry.npmjs.org/string-width>, <https://registry.npmjs.org/strip-ansi>,
  <https://registry.npmjs.org/ansi-regex>, <https://registry.npmjs.org/get-east-asian-width>
- <https://github.com/sindresorhus/string-width/blob/v9.0.0/test.js>
- <https://api.npmjs.org/downloads/point/last-week/string-width>
- <https://crates.io/api/v1/crates?q=...> (queries listed in section 3) and the crate sources
- <https://registry.npmjs.org/-/v1/search?text=...> (queries listed in section 4)
- <https://native.amigo-labs.dev/>, <https://api.github.com/orgs/amigo-labs/repos>,
  <https://github.com/amigo-labs/amigo-native>
- <https://www.unicode.org/Public/17.0.0/emoji/>
