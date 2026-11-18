# Changelog

Changes to `@rust-js-replacements/wrap-ansi`, newest first. Benchmark figures are throughput
relative to wrap-ansi 10.0.2 on Linux x64 ([full results](https://github.com/TeddyDARKVADOR/rust-js-replacements/tree/main/packages/wrap-ansi/benchmarks/results)).

## 0.1.0

First release: a Rust replacement for wrap-ansi 10.0.2, with the same API, options, and output.

- Native addon for Node.js (Linux glibc and musl, macOS, and Windows, on x64 and arm64) and a
  WebAssembly build for browsers (`@rust-js-replacements/wrap-ansi/browser`, or the `browser`
  export condition used by bundlers).
- Text is measured with the rules of string-width 8.3.0, the version wrap-ansi 10.0.2 depends on.
- The original's test suite (85 tests) passes, and the output is identical to the original on
  curated fixtures for every option combination and on 20,000 random strings, with both builds.
- Faster than the original on every measured workload, from 1.64x (native) and 1.18x
  (WebAssembly) on a short plain ASCII help line to 16.44x and 10.25x on Japanese text (Node.js
  24).
- Known differences: lone surrogates are replaced with U+FFFD, the column count is converted with
  `Number()`, and the native addon and WebAssembly module are much larger than the original's
  JavaScript.
