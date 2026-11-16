import { stripAnsiFromMalformed } from './ansi.ts';
import type { Binding, Options, StringWidthApi } from './types.ts';

// Any character outside printable ASCII (U+0020..U+007E) requires the Rust implementation.
// Printable ASCII has a width equal to its length, exactly as in the original package, and
// answering it here avoids the cost of crossing the JavaScript/Rust boundary.
const NON_PRINTABLE_ASCII = /[^\u0020-\u007E]/;

type NormalizedOptions = [ambiguousIsNarrow: boolean, countAnsiEscapeCodes: boolean];

function normalizeOptions(options: Options): NormalizedOptions {
  // Same destructuring as the original: defaults apply only to `undefined`, `null` throws a
  // TypeError, and the values are then used for their truthiness.
  const { ambiguousIsNarrow = true, countAnsiEscapeCodes = false } = options;
  return [Boolean(ambiguousIsNarrow), Boolean(countAnsiEscapeCodes)];
}

/**
 * Builds the public API on top of a native or WebAssembly binding. `getBinding` is called at the
 * start of every call so that an uninitialized binding fails consistently, whatever the input.
 */
export function createApi(getBinding: () => Binding): StringWidthApi {
  function stringWidth(input: string, options: Options = {}): number {
    const binding = getBinding();
    if (typeof input !== 'string' || input.length === 0) {
      return 0;
    }

    const [ambiguousIsNarrow, countAnsiEscapeCodes] = normalizeOptions(options);
    if (!NON_PRINTABLE_ASCII.test(input)) {
      return input.length;
    }

    if (!countAnsiEscapeCodes) {
      const stripped = stripAnsiFromMalformed(input);
      if (stripped !== undefined) {
        return binding.stringWidth(stripped, ambiguousIsNarrow, true);
      }
    }

    return binding.stringWidth(input, ambiguousIsNarrow, countAnsiEscapeCodes);
  }

  function stringWidthMany(inputs: readonly string[], options: Options = {}): Uint32Array {
    const binding = getBinding();
    if (!Array.isArray(inputs)) {
      throw new TypeError(`Expected an array of strings, got \`${typeof inputs}\``);
    }

    const [ambiguousIsNarrow, countAnsiEscapeCodes] = normalizeOptions(options);
    const widths = new Uint32Array(inputs.length);
    const pendingInputs: string[] = [];
    const pendingIndexes: number[] = [];

    for (let index = 0; index < inputs.length; index++) {
      const input: unknown = inputs[index];
      if (typeof input !== 'string' || input.length === 0) {
        continue;
      }

      if (!NON_PRINTABLE_ASCII.test(input)) {
        widths[index] = input.length;
        continue;
      }

      const stripped = countAnsiEscapeCodes ? undefined : stripAnsiFromMalformed(input);
      if (stripped === undefined) {
        pendingInputs.push(input);
        pendingIndexes.push(index);
      } else {
        widths[index] = binding.stringWidth(stripped, ambiguousIsNarrow, true);
      }
    }

    if (pendingInputs.length > 0) {
      const pendingWidths = binding.stringWidthMany(
        pendingInputs,
        ambiguousIsNarrow,
        countAnsiEscapeCodes,
      );
      for (let index = 0; index < pendingIndexes.length; index++) {
        widths[pendingIndexes[index] as number] = pendingWidths[index] as number;
      }
    }

    return widths;
  }

  return { stringWidth, stringWidthMany };
}
