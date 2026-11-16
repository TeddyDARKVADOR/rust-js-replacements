# Changelog

Changes to `@rust-js-replacements/string-width`, newest first. Benchmark figures are throughput
relative to string-width 9.0.0 on Linux x64 ([full results](https://github.com/TeddyDARKVADOR/rust-js-replacements/tree/main/packages/string-width/benchmarks/results)).

## 0.1.1

- Short strings with ANSI escape codes (up to 128 code units, such as a colored log line) are now
  stripped in JavaScript with the original's regular expression instead of crossing into Rust.
  Short colored ASCII is now on par with the original instead of slower: 1.01x (was 0.65x) on
  Node.js 24 and 0.97x (was 0.88x) on Node.js 22 with the native addon. Results are unchanged:
  identical to the original on every tested input.
- `stringWidthMany` measures strings stripped in JavaScript in one batch call instead of one call
  per string.
- Added npm keywords, so that the package can be found by searching for `string-width`.
- The npm package now includes this changelog.

## 0.1.0

First release.

- Same API and results as string-width 9.0.0 (Unicode 17.0), plus `stringWidthMany` and
  `unicodeVersion`.
- Native addon for Linux (glibc and musl), macOS, and Windows, on x64 and arm64; WebAssembly
  build for browsers (`@rust-js-replacements/string-width/browser`).
