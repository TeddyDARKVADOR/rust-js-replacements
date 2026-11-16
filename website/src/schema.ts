/**
 * Shape of `packages/<id>/catalog.json` and of the benchmark results files, with validation.
 * Used by the site and by `scripts/check-catalog.ts`, so an invalid entry fails the build.
 */

export const STATUSES = [
  'RESEARCH',
  'PROTOTYPE',
  'IMPLEMENTATION',
  'COMPATIBILITY',
  'BENCHMARKED',
  'RELEASED',
] as const;

export type Status = (typeof STATUSES)[number];
export type Target = 'node' | 'browser';

export type BenchmarkHighlight = {
  /** Workload name in the results files (for example, `emoji-short`). */
  readonly workload: string;
  /** Short label shown on the site. */
  readonly label: string;
  /** Implementation names in the results files. Default to `native addon` and `WebAssembly`. */
  readonly nativeImplementation?: string;
  readonly webAssemblyImplementation?: string;
};

export type CatalogEntry = {
  readonly id: string;
  readonly packageName: string;
  readonly status: Status;
  readonly targets: readonly Target[];
  readonly original: {
    readonly name: string;
    readonly version: string;
    readonly npmUrl: string;
    readonly repositoryUrl: string;
  };
  /** One sentence. */
  readonly summary: string;
  /** What it does and when to use it: one or two short paragraphs. */
  readonly description: readonly string[];
  readonly compatibility: readonly string[];
  readonly differences: readonly string[];
  /** Usage example, one line per entry. */
  readonly usage: readonly string[];
  /** Workloads shown on the site, read from the committed benchmark results. */
  readonly benchmarkHighlights: readonly BenchmarkHighlight[];
};

export type BenchmarkTask = {
  readonly implementation: string;
  readonly opsPerSecond: number;
  readonly relativeToOriginal: number;
};

export type BenchmarkResults = {
  readonly environment: Readonly<Record<string, string>>;
  readonly throughput: readonly {
    readonly workload: string;
    readonly description: string;
    readonly tasks: readonly BenchmarkTask[];
  }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Returns the problems found in a catalog entry; an empty array means it is valid. */
export function validateCatalogEntry(value: unknown, source: string): string[] {
  if (!isRecord(value)) {
    return [`${source}: expected a JSON object`];
  }

  const problems: string[] = [];
  const requireString = (key: string, container: Record<string, unknown> = value, prefix = '') => {
    const field = container[key];
    if (typeof field !== 'string' || field.trim() === '') {
      problems.push(`${source}: "${prefix}${key}" must be a non-empty string`);
    }
  };
  const requireStrings = (key: string) => {
    const field = value[key];
    if (!isStringArray(field) || field.length === 0) {
      problems.push(`${source}: "${key}" must be a non-empty array of strings`);
    }
  };

  for (const key of ['id', 'packageName', 'summary']) {
    requireString(key);
  }
  for (const key of ['description', 'compatibility', 'differences', 'usage']) {
    requireStrings(key);
  }

  if (!STATUSES.includes(value.status as Status)) {
    problems.push(`${source}: "status" must be one of ${STATUSES.join(', ')}`);
  }
  if (
    !Array.isArray(value.targets) ||
    value.targets.length === 0 ||
    !value.targets.every((target) => target === 'node' || target === 'browser')
  ) {
    problems.push(`${source}: "targets" must contain "node" and/or "browser"`);
  }

  if (isRecord(value.original)) {
    for (const key of ['name', 'version', 'npmUrl', 'repositoryUrl']) {
      requireString(key, value.original, 'original.');
    }
  } else {
    problems.push(`${source}: "original" must be an object`);
  }

  if (Array.isArray(value.benchmarkHighlights)) {
    value.benchmarkHighlights.forEach((highlight, index) => {
      if (!isRecord(highlight)) {
        problems.push(`${source}: "benchmarkHighlights[${index}]" must be an object`);
        return;
      }
      requireString('workload', highlight, `benchmarkHighlights[${index}].`);
      requireString('label', highlight, `benchmarkHighlights[${index}].`);
    });
  } else {
    problems.push(`${source}: "benchmarkHighlights" must be an array`);
  }

  return problems;
}

/** Checks that every highlighted workload and implementation exists in a results file. */
export function validateHighlights(
  entry: CatalogEntry,
  results: BenchmarkResults,
  source: string,
): string[] {
  const problems: string[] = [];
  for (const highlight of entry.benchmarkHighlights) {
    const workload = results.throughput.find((item) => item.workload === highlight.workload);
    if (workload === undefined) {
      problems.push(`${source}: workload "${highlight.workload}" not found`);
      continue;
    }

    const names = workload.tasks.map((task) => task.implementation);
    const native = highlight.nativeImplementation ?? 'native addon';
    if (!names.includes(native)) {
      problems.push(`${source}: implementation "${native}" not found in "${highlight.workload}"`);
    }
  }

  return problems;
}
