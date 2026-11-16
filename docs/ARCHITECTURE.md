# Architecture

## Goals and non-goals

The repository is a collection of independent packages. Each one replaces, or provides a
compatible alternative to, one identified JavaScript or TypeScript library. It is not a framework:
there is no shared runtime, no plugin system, and no shared Rust core across packages.

## Repository layout

```text
.
|-- Cargo.toml              Rust workspace: every packages/*/rust/* crate, shared lints and profiles
|-- rust-toolchain.toml     Pinned Rust toolchain (rustup), with the wasm32 target
|-- package.json            Root scripts (build, test, lint, bench) and Biome
|-- pnpm-workspace.yaml     pnpm workspace: every packages/*
|-- biome.json              TypeScript formatting and linting
|-- docs/                   Conventions, policies, template, research records
|-- packages/
|   `-- <package>/          One replacement library (see below)
|-- website/                Catalog website (GitHub Pages): one page per library, with playgrounds
`-- .github/workflows/      ci.yml (blocking checks), benchmarks.yml (manual and weekly),
                            website.yml (deploys the website from main)
```

## Package layout

```text
packages/<package>/
|-- package.json            npm package: exports, scripts, NAPI-RS configuration
|-- catalog.json            Website entry: summary, description, highlighted benchmarks
|-- README.md               Usage, compatibility, differences, benchmark summary
|-- tsconfig.json           Type checking of sources, tests, scripts, and benchmarks
|-- tsconfig.build.json     Emits dist/ from src/
|-- src/
|   |-- index.ts            Node.js entry point (loads the native addon)
|   |-- browser.ts          Browser entry point (loads the WebAssembly module)
|   |-- api.ts              Public API built on top of either binding
|   `-- types.ts            Public and binding types
|-- rust/
|   |-- core/               Algorithm. No platform dependencies.
|   |-- node/               NAPI-RS bindings. As thin as possible.
|   `-- wasm/               wasm-bindgen bindings. As thin as possible.
|-- scripts/                Package-specific tooling (for example, table generators)
|-- tests/                  API, compatibility, vendored upstream, and WebAssembly tests
|-- fixtures/               Curated inputs shared by tests and benchmarks
`-- benchmarks/             Benchmark runner, workloads, and committed results
```

Build outputs are not committed: `native/` (addon and NAPI-RS loader), `wasm/` (wasm-bindgen
output), and `dist/` (compiled TypeScript).

## Layers and responsibilities

```text
JavaScript / TypeScript application (including React)
        |
        v
TypeScript API (src/api.ts)     argument validation, option defaults, cheap fast paths
        |                    \
        v                     v
Node.js binding (NAPI-RS)     WebAssembly binding (wasm-bindgen)
        \                    /
         v                  v
        Rust core (rust/core)    the algorithm, platform independent
```

- **Rust core**: all business logic. Depends only on general-purpose crates. Tested with
  `cargo test`.
- **Bindings**: convert arguments and results, nothing else. Option normalization happens in
  TypeScript so that bindings take plain values (cheaper to cross the boundary than objects).
- **TypeScript API**: matches the original library's API and semantics (argument checks, defaults,
  truthiness). It may answer inputs that need no Rust work (for example, printable ASCII) when
  crossing the boundary would cost more than the work itself; such fast paths must be exactly
  equivalent to the original and are reported in benchmarks.

## Decisions

| Decision | Reason |
| --- | --- |
| One Rust workspace and one pnpm workspace | Single lockfiles, shared lints and profiles, one CI. |
| No shared core across packages | Packages stay independent; share code only when two packages genuinely need it. |
| NAPI-RS 3 for Node.js | Standard tooling for Rust addons, generates the platform loader and types. |
| wasm-bindgen CLI directly, not wasm-pack | One tool fewer; the CLI version is pinned to the crate version. |
| `--target web` for WebAssembly | Works with bundlers (Vite, webpack) through `new URL(..., import.meta.url)` and in plain browsers. |
| ESM only, CommonJS through `require(esm)` | The supported Node.js versions (22.12 and later) load ESM from `require`; avoids a dual build. |
| Node.js built-in test runner | No test framework dependency; runs TypeScript directly through type stripping; can run vendored upstream suites unchanged. |
| tinybench for benchmarks | Small, maintained, reports latency percentiles and margin of error. |
| Biome for TypeScript | One dependency for formatting and linting. |
| Website built with Vite, no UI framework | Static pages from `catalog.json` files; playgrounds import each package's WebAssembly build, which Vite bundles with its `.wasm` file. |
| Website figures read from benchmark results | The site cannot drift from the measured numbers. |
| A separate `wasm-release` Cargo profile | Keeps the `target_features` section that wasm-bindgen reads, which `strip = "symbols"` removes. |

## Runtime support

Packages target the runtimes supported by the original library. When the original's behavior
depends on the runtime (for example, the Unicode version of Node.js), the package documents the
runtime versions its tests were run against.

Not every package needs both targets. A package ships a WebAssembly build only when the
functionality makes sense in browsers.
