# Website

Catalog of the libraries in this repository, deployed to GitHub Pages. Each library page shows the
install command, what the library does, why to use it (compatibility and measured performance),
and, when available, a playground that runs it in the browser next to the original.

## Adding a library

1. Create `packages/<id>/catalog.json`. Its shape is `CatalogEntry` in
   [src/schema.ts](src/schema.ts); [the string-width entry](../packages/string-width/catalog.json)
   is a complete example. Keep it short: one sentence of summary, one or two paragraphs of
   description.
2. List the workloads to show in `benchmarkHighlights`. Their numbers are read from
   `packages/<id>/benchmarks/results/*.json`, so commit the results first.
3. Optionally add `src/playgrounds/<id>.ts` exporting
   `mount(container: HTMLElement): Promise<void>`, and add the package and its original library to
   `dependencies` in `package.json`.
4. Run `pnpm run build` from the repository root. `scripts/check-catalog.ts` fails the build if an
   entry is missing, incomplete, or refers to a benchmark that does not exist.

Nothing else needs to change: pages are generated from the catalog entries.

## Commands

```sh
pnpm --filter website run dev        # needs the packages to be built first
pnpm --filter website run build
pnpm --filter website run preview
```
