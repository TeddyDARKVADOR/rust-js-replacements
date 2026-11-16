# Development

## Prerequisites

| Tool | Version | Used for |
| --- | --- | --- |
| Rust | 1.99.0 (pinned in `rust-toolchain.toml`) | All crates |
| `wasm32-unknown-unknown` target | same toolchain | WebAssembly builds |
| `wasm-bindgen-cli` | 0.2.130, exactly the `wasm-bindgen` crate version | WebAssembly bindings |
| Node.js | 22.12 or later (tested with 22.23.1 and 24.21.0) | Builds, tests, benchmarks |
| pnpm | 11.28.9 (the `packageManager` field) | JavaScript workspace |

With rustup, the pinned toolchain and the wasm32 target install automatically from
`rust-toolchain.toml`. Install the WebAssembly bindings generator with:

```sh
cargo install wasm-bindgen-cli --version 0.2.130 --locked
```

Without a global pnpm, run it through npm: `npm exec --package=pnpm@11.28.9 -- pnpm <command>`.

## Common commands

From the repository root:

```sh
pnpm install            # install JavaScript dependencies
pnpm run build          # build every package (native addon, WebAssembly module, TypeScript)
pnpm run test           # API, compatibility, and upstream tests of every package
pnpm run test:rust      # cargo test --workspace
pnpm run lint           # Biome, cargo fmt --check, clippy -D warnings
pnpm run bench          # benchmarks of every package
```

From a package directory (for example, `packages/string-width`):

```sh
pnpm run build:native     # NAPI-RS addon into native/
pnpm run build:wasm       # WebAssembly module into wasm/
pnpm run build:ts         # TypeScript into dist/ (needs build:wasm: src/browser.ts imports its types)
pnpm run typecheck        # needs build:wasm
pnpm run test             # needs build:native
pnpm run test:wasm        # needs build:wasm
pnpm run bench            # needs build
```

`build` runs the three build steps in order. Tests import the TypeScript sources directly
(Node.js type stripping), so `test` only needs the native addon.

## Website

```sh
pnpm run build                       # the playgrounds need the packages' WebAssembly builds
pnpm --filter website run dev        # local server with hot reload
pnpm --filter website run build      # validates every catalog.json, then builds website/dist
pnpm --filter website run preview    # serves website/dist
```

Set `VITE_REPOSITORY_URL` to show GitHub links locally; the deployment workflow sets it.

## Generated code

Generated files say how to regenerate them in their header. For example, the Unicode tables of
string-width:

```sh
cd packages/string-width
pnpm run generate:tables  # needs network access to unicode.org
```

Regenerate them with the Node.js version the package targets, then run the compatibility tests.

## Adding a package

Follow [RESEARCH_POLICY.md](RESEARCH_POLICY.md) first, then [LIBRARY_TEMPLATE.md](LIBRARY_TEMPLATE.md).
