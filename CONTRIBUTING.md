# Contributing

Thank you for helping. Please read these documents first:

- [Code conventions](docs/CODE_CONVENTIONS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development setup](docs/DEVELOPMENT.md)

## Proposing a new package

1. Open an issue with a research record that follows the [research policy](docs/RESEARCH_POLICY.md),
   including the amigo-native check and a classification.
2. Wait for agreement before writing code. Candidates classified `DUPLICATE`,
   `NOT WORTH IMPLEMENTING`, or `UNVERIFIED` are not accepted.
3. Implement it following the [library template](docs/LIBRARY_TEMPLATE.md).

## Changing an existing package

- Keep the original library's API and behavior. If a change introduces a difference, document it
  in the package README.
- Add or update tests: compatibility tests against the original are required for behavior changes.
- Re-run the benchmarks when a change can affect performance, and update the committed results and
  README summary following the [benchmark rules](docs/BENCHMARK_RULES.md).

## Before opening a pull request

```sh
pnpm run lint
pnpm run test:rust
pnpm run build
pnpm run test
```

Commit messages are in English, in the imperative mood, one logical change per commit.
