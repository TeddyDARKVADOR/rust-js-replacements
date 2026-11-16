# Research and duplicate-checking policy

No library is added to this repository without a research phase. Its goal is to avoid
reimplementing something that already exists in Rust, WebAssembly, or NAPI form, and to avoid
packages where Rust brings complexity without measurable value.

## When it applies

Before any code is written for a new package, and again before a package changes its compatibility
target (for example, a new major version of the original library).

## Required steps

1. Identify the original JavaScript or TypeScript library.
2. Find its official repository and npm package.
3. Record its API, options, defaults, dependencies, maintenance status, and license.
4. Search crates.io for Rust implementations.
5. Search GitHub for Rust implementations.
6. Search npm for Rust-powered alternatives (NAPI, WebAssembly, WASI).
7. Check whether Node.js or browsers already provide the functionality natively.
8. Check whether an existing Rust implementation already ships Node.js or WebAssembly bindings.
9. Decide whether existing alternatives are equivalent or only partial, and say precisely what is
   missing.
10. Evaluate whether the original is already well optimized (for example, ASCII fast paths).

At minimum, consult:

- <https://crates.io/>
- <https://github.com/>
- <https://www.npmjs.com/>
- <https://native.amigo-labs.dev/> (the amigo-native catalog, checked before every proposal)
- <https://github.com/amigo-labs>

Use several queries per source (package name, purpose, "rust", "napi", "wasm"). Read the source of
candidate crates instead of relying on their descriptions. Never conclude that something does not
exist because a first search returned nothing.

## Classification

Assign exactly one:

| Classification | Meaning | Outcome |
| --- | --- | --- |
| `DUPLICATE` | An equivalent Rust-powered package already exists. | Do not implement. |
| `PARTIAL ALTERNATIVE` | Existing projects cover only part of the functionality. | Implement only the missing value, documented precisely. |
| `NATIVE IMPLEMENTATION EXISTS` | Node.js or browsers provide it efficiently. | Implement only with a measured justification. |
| `POTENTIAL OPPORTUNITY` | Nothing equivalent was found after thorough research. | Candidate for implementation. |
| `NOT WORTH IMPLEMENTING` | Too simple, unlikely to gain, or too costly to maintain. | Do not implement. |
| `UNVERIFIED` | Research was inconclusive. | Do not present as an opportunity; research further. |

## Selection criteria

Prefer libraries that have a small, understandable API, perform CPU-intensive work, are widely used,
can be implemented cleanly in Rust, have a realistic chance of measurable gains (including the cost
of crossing the JavaScript/Rust boundary), and have manageable compatibility requirements.

## Research record

Each package has a record in `docs/research/<package>.md`, written before implementation and kept
up to date. It must contain:

- The date of the research.
- The original library facts (API, version, license, dependencies, maintenance).
- Native platform alternatives.
- Existing Rust crates and Rust-powered npm packages, with versions and why each is or is not
  sufficient.
- The amigo-native check.
- The classification and the decision.
- The technical feasibility assessment (complexity, reusable crates, Node.js and browser support,
  compatibility risks, realistic performance expectations).
- Every source consulted.

See [research/string-width.md](research/string-width.md) for an example.
