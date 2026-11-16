# Benchmark rules

Performance is a goal, but every claim must be reproducible and honest.

## What every package measures

- Throughput (operations per second) and latency (mean, median, p99) with the margin of error.
- Small, large, typical real-world, and edge-case inputs.
- Batch processing when the package has a batch API.
- The cost of crossing the JavaScript/Rust boundary (a direct binding call on a minimal input).
- Startup overhead and resident memory of a fresh process that imports the package.
- Artifact size: native addon, WebAssembly module, and the original's JavaScript (raw and gzip).

## How

- Compare against the original library in the **same process**, on the same inputs, producing the
  same outputs. The runner checks that every implementation returns identical results before
  measuring.
- Benchmark the Node.js addon and the WebAssembly module separately.
- Report fast paths that never reach Rust (for example, printable ASCII answered in TypeScript).
- Use the package's `pnpm run bench`. It prints Markdown and writes
  `benchmarks/results/<platform>-<arch>-node<major>.{md,json}`, including the date, Node.js, V8,
  ICU, and Unicode versions, platform, and CPU.
- Run on an otherwise idle machine, on AC power. Shared CI runners are noisy, so the benchmark
  workflow only uploads artifacts; committed results come from a documented machine.

## Reporting

- Never invent or round results favorably. Copy numbers from a results file.
- Report slower workloads as prominently as faster ones.
- A package is advertised as faster only for the workloads where results show it, with the
  runtime and platform they were measured on.
- When a result has a large margin of error, say so and compare medians as well.
- Re-run and update committed results when the implementation, the original library, or the
  runtime changes.
