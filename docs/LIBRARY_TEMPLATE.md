# Library template

Every new package follows this workflow and structure. `packages/string-width` is the reference
implementation of this template.

## Phase 1: research

Write `docs/research/<package>.md` following [RESEARCH_POLICY.md](RESEARCH_POLICY.md). If the
classification is `DUPLICATE`, `NOT WORTH IMPLEMENTING`, or `UNVERIFIED`, stop there and record why.

## Phase 2: technical feasibility

Add to the research record:

- Implementation complexity.
- Rust crates that can be reused.
- Whether Node.js and browser support are possible and useful.
- Compatibility risks (runtime-dependent behavior, string encoding, error behavior).
- Whether performance gains are realistic, including boundary and conversion costs.

## Phase 3: architecture

Create the package directory. Include only what the package needs:

```text
packages/<package>/
|-- package.json
|-- catalog.json           Website entry (see phase 7)
|-- CHANGELOG.md           One `## <version>` section per release
|-- README.md
|-- tsconfig.json
|-- tsconfig.build.json
|-- src/index.ts           Node.js entry point
|-- src/browser.ts         Browser entry point (only with a WebAssembly build)
|-- src/api.ts             Shared API (only when there are two entry points)
|-- src/types.ts
|-- rust/core/             <package>-core crate
|-- rust/node/             <package>-node crate (NAPI-RS)
|-- rust/wasm/             <package>-wasm crate (only with a WebAssembly build)
|-- tests/
|-- fixtures/
`-- benchmarks/
```

### package.json checklist

- `name`: `@rust-js-replacements/<package>`, with `repository` (including `directory`),
  `homepage`, `bugs`, and `publishConfig: { "access": "public", "provenance": true }`.
- `keywords`: the original package name first, then `rust`, `napi`, `wasm`, and the domain terms,
  so that an npm search for the original also lists the replacement.
- `files`: only what the main package ships (`CHANGELOG.md`, `dist`, the NAPI-RS loader, the
  WebAssembly module); binaries go to the per-platform packages. A `LICENSE` file in the package
  directory.
- `type: "module"`, `engines` matching the original, `sideEffects: false`.
- `exports` with `types`, a `browser` condition when there is a WebAssembly build, and `default`.
- Scripts: `build`, `build:native`, `build:ts`, `typecheck`, `test`, `bench`, plus `build:wasm` and
  `test:wasm` when relevant.
- The original library as an exact-version `devDependency`, for compatibility tests and benchmarks.
- A `napi` block with `binaryName` and `targets`.

### Crates checklist

- `Cargo.toml` uses the workspace `edition`, `rust-version`, `license`, `publish`, and `lints`.
- `core`: `#![forbid(unsafe_code)]`, documented public API, unit tests, no binding dependencies.
- `node`: `crate-type = ["cdylib"]`, `napi`, `napi-derive`, `napi-build` in `build.rs`.
- `wasm`: `crate-type = ["cdylib", "rlib"]`, `wasm-bindgen` pinned with `=` to the CLI version.

## Phase 4: implementation

1. Rust core first, with unit tests.
2. Bindings: plain argument types, no business logic.
3. TypeScript API: same names, defaults, argument checks, and error types as the original.
4. Documentation comments on every public item.

## Phase 5: testing

- `tests/api.test.ts`: the public API, argument handling, errors, and additions such as batch
  functions.
- `tests/compatibility.test.ts`: differential tests against the original library over curated
  fixtures, exhaustive inputs where feasible, and seeded random inputs, for every option
  combination.
- `tests/upstream/`: the original's test suite, vendored with its license, when available.
- `tests/wasm/`: the same compatibility suite against the WebAssembly build.

## Phase 6: benchmarking

Follow [BENCHMARK_RULES.md](BENCHMARK_RULES.md). Commit the results files and summarize them in
the package README, including slower workloads.

## Phase 7: integration

- Add a row to the catalog in the root README.
- Add the package to the website (see [website/README.md](../website/README.md)):
  - `packages/<package>/catalog.json`: install name, one-sentence summary, a short description of
    what it does, compatibility facts, differences, a usage example, and the benchmark workloads to
    highlight. The site discovers it automatically, and the build fails if it is incomplete.
  - Optionally, `website/src/playgrounds/<package>.ts`, exporting
    `mount(container: HTMLElement): Promise<void>`, so that visitors can try the library in their
    browser next to the original.
  - Performance figures are never typed into `catalog.json`: the site reads them from the committed
    files in `benchmarks/results/`.
- Make sure CI passes (`pnpm run lint`, `pnpm run test`, `cargo test --workspace`).
- Release it by pushing a `<package>-v<version>` tag ([RELEASING.md](RELEASING.md)), after adding
  the `CHANGELOG.md` section of that version. The release workflow needs no change for a new
  package, but its first release needs a one-time npm authentication step (see RELEASING.md).
- Set the development status honestly:

| Status | Criteria |
| --- | --- |
| `RESEARCH` | Research record written and classified. |
| `PROTOTYPE` | Core algorithm works on basic cases. |
| `IMPLEMENTATION` | Complete API with bindings and unit tests. |
| `COMPATIBILITY` | Compatibility tests against the original pass; differences documented. |
| `BENCHMARKED` | Reproducible benchmark results committed and summarized. |
| `RELEASED` | Published to npm with prebuilt binaries for every listed target, CI green on all platforms. |
