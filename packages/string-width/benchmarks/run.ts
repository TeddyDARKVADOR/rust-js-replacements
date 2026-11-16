/**
 * Benchmarks this package against the original string-width 9.0.0 in the same Node.js process.
 *
 * Usage (from packages/string-width):
 *   pnpm run build          # native addon, WebAssembly module, and dist/
 *   pnpm run bench
 *
 * Only the native addon is strictly required; WebAssembly columns and startup measurements are
 * skipped with a warning when their build outputs are missing.
 *
 * Environment variables:
 *   BENCH_TIME_MS     Measuring time per task in milliseconds (default 1000).
 *   BENCH_STARTUP_RUNS  Number of child processes per startup measurement (default 15).
 *
 * Results are printed and written to benchmarks/results/<platform>-<arch>-node<major>.{json,md}.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import originalStringWidth from 'string-width';
import { Bench } from 'tinybench';
import * as nodeEntry from '../src/index.ts';
import type { Binding } from '../src/types.ts';
import { BATCH_WORKLOADS, SINGLE_WORKLOADS, type Workload } from './workloads.ts';

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = join(PACKAGE_DIR, 'benchmarks', 'results');
const WASM_PATH = join(PACKAGE_DIR, 'wasm', 'string_width_wasm_bg.wasm');
const TIME_MS = Number(process.env.BENCH_TIME_MS ?? 1000);
const STARTUP_RUNS = Number(process.env.BENCH_STARTUP_RUNS ?? 15);

const require = createRequire(import.meta.url);
const nativeBinding = require('../native/binding.cjs') as Binding;

// The WebAssembly module is optional: it needs the wasm32 target and wasm-bindgen to build.
const hasWasm = existsSync(WASM_PATH);
const browserEntry = hasWasm ? await import('../src/browser.ts') : undefined;
const wasmBinding = hasWasm
  ? ((await import('../wasm/string_width_wasm.js')) as unknown as Binding)
  : undefined;
if (browserEntry === undefined) {
  console.warn('WebAssembly module not found; run `pnpm run build:wasm` to include it.\n');
} else {
  browserEntry.initSync(readFileSync(WASM_PATH));
}

type Implementation = {
  readonly name: string;
  readonly run: (inputs: readonly string[]) => number;
};

type TaskResult = {
  implementation: string;
  opsPerSecond: number;
  meanMicroseconds: number;
  medianMicroseconds: number;
  p99Microseconds: number;
  relativeMarginOfError: number;
  samples: number;
  /** Throughput relative to the original implementation (greater than 1 is faster). */
  relativeToOriginal: number;
};

type WorkloadResult = { workload: string; description: string; tasks: TaskResult[] };

/** Accumulates every result so that no measured call can be optimized away. */
let sink = 0;

function loopWith(measure: (input: string) => number): (inputs: readonly string[]) => number {
  return (inputs) => {
    let total = 0;
    for (const input of inputs) {
      total += measure(input);
    }
    return total;
  };
}

function sumOf(widths: Uint32Array): number {
  let total = 0;
  for (const width of widths) {
    total += width;
  }
  return total;
}

const SINGLE_IMPLEMENTATIONS: Implementation[] = [
  { name: 'original (JavaScript)', run: loopWith((input) => originalStringWidth(input)) },
  { name: 'native addon', run: loopWith((input) => nodeEntry.stringWidth(input)) },
  ...(browserEntry
    ? [{ name: 'WebAssembly', run: loopWith((input: string) => browserEntry.stringWidth(input)) }]
    : []),
];

const BATCH_IMPLEMENTATIONS: Implementation[] = [
  { name: 'original (JavaScript), loop', run: loopWith((input) => originalStringWidth(input)) },
  {
    name: 'native addon, stringWidth loop',
    run: loopWith((input) => nodeEntry.stringWidth(input)),
  },
  {
    name: 'native addon, stringWidthMany',
    run: (inputs) => sumOf(nodeEntry.stringWidthMany(inputs)),
  },
  ...(browserEntry
    ? [
        {
          name: 'WebAssembly, stringWidthMany',
          run: (inputs: readonly string[]) => sumOf(browserEntry.stringWidthMany(inputs)),
        },
      ]
    : []),
];

// Calls the bindings directly with a one-character non-ASCII string, so that the measured time is
// almost entirely the cost of crossing the boundary and converting the string.
const BOUNDARY_INPUT = String.fromCodePoint(0xe9);
const BOUNDARY_IMPLEMENTATIONS: Implementation[] = [
  { name: 'original (JavaScript)', run: loopWith((input) => originalStringWidth(input)) },
  {
    name: 'native binding, direct call',
    run: loopWith((input) => nativeBinding.stringWidth(input, true, false)),
  },
  ...(wasmBinding
    ? [
        {
          name: 'WebAssembly binding, direct call',
          run: loopWith((input: string) => wasmBinding.stringWidth(input, true, false)),
        },
      ]
    : []),
];

async function measure(
  workload: Workload,
  implementations: Implementation[],
): Promise<WorkloadResult> {
  const expected = implementations[0]?.run(workload.inputs);
  for (const implementation of implementations) {
    const actual = implementation.run(workload.inputs);
    if (actual !== expected) {
      throw new Error(
        `${implementation.name} computed ${actual} instead of ${expected} for ${workload.name}`,
      );
    }
  }

  const bench = new Bench({
    name: workload.name,
    time: TIME_MS,
    warmupTime: Math.min(TIME_MS, 250),
  });
  for (const implementation of implementations) {
    bench.add(implementation.name, () => {
      sink += implementation.run(workload.inputs);
    });
  }
  await bench.run();

  const tasks: TaskResult[] = bench.tasks.map((task) => {
    const result = task.result;
    if (result.state !== 'completed') {
      throw new Error(`Benchmark task ${task.name} did not complete: ${result.state}`);
    }

    return {
      implementation: task.name ?? 'unknown',
      opsPerSecond: result.throughput.mean,
      meanMicroseconds: result.latency.mean * 1000,
      medianMicroseconds: result.latency.p50 * 1000,
      p99Microseconds: result.latency.p99 * 1000,
      relativeMarginOfError: result.latency.rme,
      samples: result.latency.samplesCount,
      relativeToOriginal: 0,
    };
  });

  const baseline = tasks[0]?.opsPerSecond ?? 1;
  for (const task of tasks) {
    task.relativeToOriginal = task.opsPerSecond / baseline;
  }

  console.log(`  measured ${workload.name}`);
  return { workload: workload.name, description: workload.description, tasks };
}

type StartupResult = {
  implementation: string;
  medianMilliseconds: number;
  medianRssMegabytes: number;
};

const STARTUP_SCRIPTS: Record<string, string> = {
  'empty Node.js process (baseline)': '',
  'original (JavaScript)':
    "import stringWidth from 'string-width'; stringWidth(String.fromCodePoint(0x53e4));",
  'native addon':
    "import stringWidth from './dist/index.js'; stringWidth(String.fromCodePoint(0x53e4));",
  ...(hasWasm
    ? {
        WebAssembly:
          "import { readFileSync } from 'node:fs'; import stringWidth, { initSync } from './dist/browser.js'; initSync(readFileSync('./wasm/string_width_wasm_bg.wasm')); stringWidth(String.fromCodePoint(0x53e4));",
      }
    : {}),
};

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

/** Wall time and resident memory of a fresh process that imports the package and calls it once. */
function measureStartup(): StartupResult[] {
  if (!existsSync(join(PACKAGE_DIR, 'dist', 'index.js'))) {
    console.warn('dist/ not found; run `pnpm run build` to include startup measurements.\n');
    return [];
  }

  return Object.entries(STARTUP_SCRIPTS).map(([implementation, script]) => {
    const durations: number[] = [];
    const rssValues: number[] = [];
    const code = `${script} process.stdout.write(String(process.memoryUsage().rss));`;
    for (let run = 0; run < STARTUP_RUNS; run++) {
      const start = process.hrtime.bigint();
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: PACKAGE_DIR,
        encoding: 'utf8',
      });
      const end = process.hrtime.bigint();
      if (child.status !== 0) {
        throw new Error(`Startup script for ${implementation} failed:\n${child.stderr}`);
      }
      durations.push(Number(end - start) / 1e6);
      rssValues.push(Number(child.stdout) / 1024 / 1024);
    }

    console.log(`  measured startup: ${implementation}`);
    return {
      implementation,
      medianMilliseconds: median(durations),
      medianRssMegabytes: median(rssValues),
    };
  });
}

type SizeResult = { artifact: string; bytes: number; gzipBytes: number };

function sizeOf(artifact: string, paths: string[]): SizeResult {
  const contents = paths.map((path) => readFileSync(path));
  return {
    artifact,
    bytes: contents.reduce((total, content) => total + content.length, 0),
    gzipBytes: gzipSync(Buffer.concat(contents), { level: 9 }).length,
  };
}

function measureSizes(): SizeResult[] {
  const originalDir = dirname(fileURLToPath(import.meta.resolve('string-width')));
  const originalRequire = createRequire(join(originalDir, 'index.js'));
  const dependencyFiles = ['strip-ansi', 'get-east-asian-width'].flatMap((name) => {
    const directory = dirname(originalRequire.resolve(name));
    const nested =
      name === 'strip-ansi'
        ? [
            join(
              dirname(createRequire(join(directory, 'index.js')).resolve('ansi-regex')),
              'index.js',
            ),
          ]
        : [];
    const own = readdirSync(directory)
      .filter((file) => file.endsWith('.js'))
      .map((file) => join(directory, file));
    return [...own, ...nested];
  });

  const nativeFiles = readdirSync(join(PACKAGE_DIR, 'native'))
    .filter((file) => file.endsWith('.node'))
    .map((file) => join(PACKAGE_DIR, 'native', file));

  return [
    sizeOf('original: string-width and its dependencies (JavaScript)', [
      join(originalDir, 'index.js'),
      ...dependencyFiles,
    ]),
    ...nativeFiles.map((file) => sizeOf(`native addon (${file.split('/').pop()})`, [file])),
    ...(hasWasm
      ? [
          sizeOf('WebAssembly module and wasm-bindgen glue', [
            WASM_PATH,
            join(PACKAGE_DIR, 'wasm', 'string_width_wasm.js'),
          ]),
        ]
      : []),
  ];
}

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function toMarkdown(
  environment: Record<string, string>,
  throughput: WorkloadResult[],
  startup: StartupResult[],
  sizes: SizeResult[],
): string {
  const lines: string[] = ['# string-width benchmark results', ''];
  lines.push('Generated by `pnpm run bench`. Do not edit by hand.', '');
  for (const [key, value] of Object.entries(environment)) {
    lines.push(`- ${key}: ${value}`);
  }

  lines.push('', '## Throughput and latency', '');
  lines.push(
    "Relative speed is mean throughput divided by the original's mean throughput: above 1.00 is faster. The original allocates more (Intl.Segmenter, regular expressions), so garbage collection pauses widen its margin of error; compare medians as well.",
    '',
  );
  for (const { workload, description, tasks } of throughput) {
    lines.push(`### ${workload}`, '', description, '');
    lines.push(
      '| Implementation | ops/s | mean (us) | median (us) | p99 (us) | margin of error | relative speed |',
    );
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const task of tasks) {
      lines.push(
        `| ${task.implementation} | ${formatNumber(task.opsPerSecond)} | ${formatNumber(task.meanMicroseconds, 3)} | ${formatNumber(task.medianMicroseconds, 3)} | ${formatNumber(task.p99Microseconds, 3)} | +/-${formatNumber(task.relativeMarginOfError, 2)}% | ${formatNumber(task.relativeToOriginal, 2)}x |`,
      );
    }
    lines.push('');
  }

  if (startup.length > 0) {
    lines.push('## Startup and memory', '');
    lines.push(
      `Median of ${STARTUP_RUNS} fresh processes that import the package and measure one string.`,
      '',
    );
    lines.push('| Implementation | wall time (ms) | resident memory (MB) |');
    lines.push('| --- | ---: | ---: |');
    for (const result of startup) {
      lines.push(
        `| ${result.implementation} | ${formatNumber(result.medianMilliseconds, 1)} | ${formatNumber(result.medianRssMegabytes, 1)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Size', '');
  lines.push('| Artifact | bytes | gzip -9 bytes |');
  lines.push('| --- | ---: | ---: |');
  for (const size of sizes) {
    lines.push(
      `| ${size.artifact} | ${formatNumber(size.bytes)} | ${formatNumber(size.gzipBytes)} |`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

async function main(): Promise<void> {
  const environment = {
    Date: new Date().toISOString(),
    'Node.js': `${process.version} (V8 ${process.versions.v8}, ICU ${process.versions.icu}, Unicode ${process.versions.unicode})`,
    Platform: `${process.platform} ${process.arch} (${os.release()})`,
    CPU: `${os.cpus()[0]?.model ?? 'unknown'} (${os.cpus().length} logical cores)`,
    'Measuring time per task': `${TIME_MS} ms`,
    'Original package': 'string-width 9.0.0',
  };

  console.log('Throughput:');
  const throughput: WorkloadResult[] = [];
  throughput.push(
    await measure(
      {
        name: 'boundary-overhead',
        description: 'One-character non-ASCII string (U+00E9), bindings called directly',
        inputs: [BOUNDARY_INPUT],
      },
      BOUNDARY_IMPLEMENTATIONS,
    ),
  );
  for (const workload of SINGLE_WORKLOADS) {
    throughput.push(await measure(workload, SINGLE_IMPLEMENTATIONS));
  }
  for (const workload of BATCH_WORKLOADS) {
    throughput.push(await measure(workload, BATCH_IMPLEMENTATIONS));
  }

  console.log('Startup:');
  const startup = measureStartup();
  const sizes = measureSizes();

  const markdown = toMarkdown(environment, throughput, startup, sizes);
  const baseName = `${process.platform}-${process.arch}-node${process.versions.node.split('.')[0]}`;
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, `${baseName}.md`), markdown);
  writeFileSync(
    join(RESULTS_DIR, `${baseName}.json`),
    `${JSON.stringify({ environment, throughput, startup, sizes }, null, 2)}\n`,
  );

  console.log(`\n${markdown}`);
  console.log(
    `Results written to ${join(RESULTS_DIR, baseName)}.{md,json} (checksum ${sink % 10})`,
  );
}

await main();
