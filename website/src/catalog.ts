/**
 * Loads every `packages/<id>/catalog.json` and the committed benchmark results. Adding a package
 * with a catalog.json is enough for it to appear on the site.
 */

import type { BenchmarkHighlight, BenchmarkResults, CatalogEntry } from './schema.ts';

const catalogModules = import.meta.glob<CatalogEntry>('../../packages/*/catalog.json', {
  eager: true,
  import: 'default',
});

const resultModules = import.meta.glob<BenchmarkResults>(
  '../../packages/*/benchmarks/results/*.json',
  { eager: true, import: 'default' },
);

/** Benchmark results measured on one runtime. */
export type Run = {
  /** For example, `Node.js 24.21.0`. */
  readonly runtime: string;
  readonly major: number;
  readonly platform: string;
  readonly cpu: string;
  readonly date: string;
  readonly results: BenchmarkResults;
};

export type Library = { readonly entry: CatalogEntry; readonly runs: readonly Run[] };

export type HighlightValue = {
  readonly runtime: string;
  readonly native: number | undefined;
  readonly webAssembly: number | undefined;
};

export type HighlightRow = {
  readonly label: string;
  readonly description: string;
  readonly values: readonly HighlightValue[];
};

/** `../../packages/<id>/...` to `<id>`. */
function packageId(path: string): string {
  return path.split('/')[3] ?? '';
}

function toRun(results: BenchmarkResults): Run {
  const node = results.environment['Node.js'] ?? '';
  const version = /^v(\d+)\.(\d+)\.(\d+)/.exec(node);
  return {
    runtime: version ? `Node.js ${version[1]}.${version[2]}.${version[3]}` : node,
    major: Number(version?.[1] ?? 0),
    platform: (results.environment.Platform ?? '').split(' (')[0] ?? '',
    cpu: (results.environment.CPU ?? '').split(' (')[0] ?? '',
    date: (results.environment.Date ?? '').slice(0, 10),
    results,
  };
}

export const LIBRARIES: readonly Library[] = Object.entries(catalogModules)
  .map(([path, entry]) => {
    const id = packageId(path);
    const runs = Object.entries(resultModules)
      .filter(([resultPath]) => packageId(resultPath) === id)
      .map(([, results]) => toRun(results))
      .sort((left, right) => right.major - left.major);
    return { entry, runs };
  })
  .sort((left, right) => left.entry.id.localeCompare(right.entry.id));

function relativeSpeed(run: Run, workload: string, implementation: string): number | undefined {
  return run.results.throughput
    .find((item) => item.workload === workload)
    ?.tasks.find((task) => task.implementation === implementation)?.relativeToOriginal;
}

export function highlightRows(library: Library): HighlightRow[] {
  return library.entry.benchmarkHighlights.map((highlight: BenchmarkHighlight) => {
    const description =
      library.runs[0]?.results.throughput.find((item) => item.workload === highlight.workload)
        ?.description ?? '';
    return {
      label: highlight.label,
      description,
      values: library.runs.map((run) => ({
        runtime: run.runtime,
        native: relativeSpeed(
          run,
          highlight.workload,
          highlight.nativeImplementation ?? 'native addon',
        ),
        webAssembly: relativeSpeed(
          run,
          highlight.workload,
          highlight.webAssemblyImplementation ?? 'WebAssembly',
        ),
      })),
    };
  });
}

/** Lowest and highest native speedups across the highlighted workloads and runtimes. */
export function nativeSpeedRange(library: Library): { min: number; max: number } | undefined {
  const values = highlightRows(library)
    .flatMap((row) => row.values.map((value) => value.native))
    .filter((value): value is number => value !== undefined);
  return values.length === 0 ? undefined : { min: Math.min(...values), max: Math.max(...values) };
}

export function findLibrary(id: string): Library | undefined {
  return LIBRARIES.find((library) => library.entry.id === id);
}
