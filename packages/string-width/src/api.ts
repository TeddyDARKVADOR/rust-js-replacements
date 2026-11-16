import { hasEscapeIntroducer, stripAnsi } from './ansi.ts';
import type { Binding, Options, StringWidthApi } from './types.ts';

// Any character outside printable ASCII (U+0020..U+007E) requires the Rust implementation.
// Printable ASCII has a width equal to its length, exactly as in the original package, and
// answering it here avoids the cost of crossing the JavaScript/Rust boundary.
const NON_PRINTABLE_ASCII = /[^\u0020-\u007E]/;

// Up to this length, ANSI escape codes are stripped in JavaScript, as the original does: for short
// colored ASCII, such as a log line, the result is then printable ASCII, answered without calling
// into Rust. Longer strings are faster in Rust (measured crossover: about 150 to 300 code units).
const SHORT_INPUT_LENGTH = 128;

type NormalizedOptions = [ambiguousIsNarrow: boolean, countAnsiEscapeCodes: boolean];

/**
 * Returns the input without its ANSI escape codes when they must be stripped in JavaScript: for
 * short strings (see above), and for strings that are not well-formed UTF-16 (see ansi.ts).
 * Returns `undefined` when the Rust core handles the input unchanged.
 */
function stripInJavaScript(input: string, countAnsiEscapeCodes: boolean): string | undefined {
  if (
    countAnsiEscapeCodes ||
    !hasEscapeIntroducer(input) ||
    (input.length > SHORT_INPUT_LENGTH && input.isWellFormed())
  ) {
    return undefined;
  }

  return stripAnsi(input);
}

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

    const stripped = stripInJavaScript(input, countAnsiEscapeCodes);
    if (stripped !== undefined) {
      // Already stripped: Rust must not strip again, as the original strips only once.
      return NON_PRINTABLE_ASCII.test(stripped)
        ? binding.stringWidth(stripped, ambiguousIsNarrow, true)
        : stripped.length;
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
    // Inputs measured in one call each: as given, and already stripped in JavaScript.
    const pending = { inputs: [] as string[], indexes: [] as number[] };
    const pendingStripped = { inputs: [] as string[], indexes: [] as number[] };

    for (let index = 0; index < inputs.length; index++) {
      const input: unknown = inputs[index];
      if (typeof input !== 'string' || input.length === 0) {
        continue;
      }

      if (!NON_PRINTABLE_ASCII.test(input)) {
        widths[index] = input.length;
        continue;
      }

      const stripped = stripInJavaScript(input, countAnsiEscapeCodes);
      if (stripped === undefined) {
        pending.inputs.push(input);
        pending.indexes.push(index);
      } else if (NON_PRINTABLE_ASCII.test(stripped)) {
        pendingStripped.inputs.push(stripped);
        pendingStripped.indexes.push(index);
      } else {
        widths[index] = stripped.length;
      }
    }

    for (const [batch, count] of [
      [pending, countAnsiEscapeCodes],
      [pendingStripped, true],
    ] as const) {
      if (batch.inputs.length === 0) {
        continue;
      }

      const batchWidths = binding.stringWidthMany(batch.inputs, ambiguousIsNarrow, count);
      for (let index = 0; index < batch.indexes.length; index++) {
        widths[batch.indexes[index] as number] = batchWidths[index] as number;
      }
    }

    return widths;
  }

  return { stringWidth, stringWidthMany };
}
