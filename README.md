# rust-js-replacements

Rust-powered replacements for JavaScript and TypeScript libraries.

Each package reimplements one existing library, or a clearly identified part of it, with a Rust
core, Node.js bindings (NAPI-RS), and a browser build (WebAssembly) when it makes sense. Packages
keep the original API, are tested against the original, and are benchmarked against it. They work
in any JavaScript or TypeScript project, React applications included.

Rules that every package follows:

- A package is added only after researching existing alternatives
  ([research policy](docs/RESEARCH_POLICY.md)). Libraries already covered by a Rust-powered package
  (for example, in [amigo-native](https://native.amigo-labs.dev/)) are not duplicated.
- Compatibility is verified against the original library, and every difference is documented.
- A package is called faster only for the workloads where reproducible benchmarks show it, and
  slower workloads are reported as well ([benchmark rules](docs/BENCHMARK_RULES.md)).

## Catalog

| Package | Original library | Status | Rust core | Node.js | Browser | Compatibility | Benchmarks | Docs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`@rust-js-replacements/string-width`](packages/string-width) | [`string-width`](https://github.com/sindresorhus/string-width) 9.0.0 ([npm](https://www.npmjs.com/package/string-width)) | `BENCHMARKED` | Complete | NAPI-RS addon | WebAssembly | Full API; differential tests identical on Unicode 17.0 ([details](packages/string-width/README.md#compatibility)) | Linux x64, Node.js 22 and 24: non-ASCII text 2.7x to 15x faster; long colored logs 2.0x to 21x faster; short ANSI-colored ASCII 0.65x to 0.88x (slower) ([details](packages/string-width/README.md#performance)) | [README](packages/string-width/README.md) |

Statuses, in order: `RESEARCH`, `PROTOTYPE`, `IMPLEMENTATION`, `COMPATIBILITY`, `BENCHMARKED`,
`RELEASED`. Their criteria are defined in the [library template](docs/LIBRARY_TEMPLATE.md#phase-7-integration).

## Website

The catalog website, <https://teddydarkvador.github.io/rust-js-replacements/> (`website/`, deployed to GitHub Pages by
`.github/workflows/website.yml`), has
one page per library: the install command, what it does, why use it (compatibility and measured
performance), and a playground that runs the library in the browser next to the original.

## Installation

Each package is published on npm with prebuilt binaries for Linux (glibc and musl), macOS, and
Windows, on x64 and arm64. No Rust toolchain is needed:

```sh
npm install @rust-js-replacements/string-width
```

To build from source instead, see [DEVELOPMENT.md](docs/DEVELOPMENT.md). Releases are described in
[RELEASING.md](docs/RELEASING.md).

## Requirements

- Node.js 22.12 or later.
- Only to build from source: Rust 1.99.0 (pinned in `rust-toolchain.toml`), pnpm 11, and for browser
  builds the `wasm32-unknown-unknown` target and `wasm-bindgen-cli` 0.2.130. See
  [DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Commands

```sh
pnpm run build       # build every package
pnpm run test        # API, compatibility, and upstream tests
pnpm run test:rust   # Rust unit tests
pnpm run lint        # Biome, rustfmt, clippy
pnpm run bench       # benchmarks against the original libraries
```

## Documentation

- [Code conventions](docs/CODE_CONVENTIONS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Research policy](docs/RESEARCH_POLICY.md) and [research records](docs/research)
- [Library template](docs/LIBRARY_TEMPLATE.md)
- [Benchmark rules](docs/BENCHMARK_RULES.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE). Vendored third-party code keeps its own license notice.
