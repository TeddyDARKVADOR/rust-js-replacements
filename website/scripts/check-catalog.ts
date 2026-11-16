/**
 * Validates every `packages/<id>/catalog.json` and its benchmark results before the site is built.
 * Usage: node scripts/check-catalog.ts
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BenchmarkResults,
  type CatalogEntry,
  validateCatalogEntry,
  validateHighlights,
} from '../src/schema.ts';

const PACKAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages');

const problems: string[] = [];
let entries = 0;

for (const id of readdirSync(PACKAGES_DIR)) {
  const catalogPath = join(PACKAGES_DIR, id, 'catalog.json');
  if (!existsSync(catalogPath)) {
    problems.push(`packages/${id}: missing catalog.json (every package appears on the website)`);
    continue;
  }

  const entry: unknown = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const entryProblems = validateCatalogEntry(entry, `packages/${id}/catalog.json`);
  problems.push(...entryProblems);
  if (entryProblems.length > 0) {
    continue;
  }

  const catalogEntry = entry as CatalogEntry;
  if (catalogEntry.id !== id) {
    problems.push(`packages/${id}/catalog.json: "id" must be "${id}", the directory name`);
  }

  const resultsDir = join(PACKAGES_DIR, id, 'benchmarks', 'results');
  const resultFiles = existsSync(resultsDir)
    ? readdirSync(resultsDir).filter((file) => file.endsWith('.json'))
    : [];
  if (catalogEntry.benchmarkHighlights.length > 0 && resultFiles.length === 0) {
    problems.push(`packages/${id}: benchmark highlights listed but no results file committed`);
  }
  for (const file of resultFiles) {
    const results = JSON.parse(readFileSync(join(resultsDir, file), 'utf8')) as BenchmarkResults;
    problems.push(
      ...validateHighlights(catalogEntry, results, `packages/${id}/benchmarks/results/${file}`),
    );
  }

  entries++;
}

if (problems.length > 0) {
  console.error(`Invalid catalog:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

console.log(`Catalog is valid (${entries} package${entries === 1 ? '' : 's'}).`);
