import type { Binding, Options } from './types.ts';

/** Public API shared by the Node.js and browser entry points. */
export type WrapAnsiApi = {
  /** Wrap words to the specified column width. */
  wrapAnsi(string: string, columns: number, options?: Options): string;
};

/**
 * Builds the public API on top of a native or WebAssembly binding. `getBinding` is called at the
 * start of every call so that an uninitialized binding fails consistently, whatever the input.
 */
export function createApi(getBinding: () => Binding): WrapAnsiApi {
  function wrapAnsi(string: string, columns: number, options: Options = {}): string {
    const binding = getBinding();
    // Same reads as the original: `hard` is used for its truthiness, `wordWrap` and `trim` are only
    // disabled by `false`, and `null` options throw the same TypeError when `trim` is read.
    const trim = options.trim !== false;
    const wordWrap = options.wordWrap !== false;
    const hard = Boolean(options.hard);
    return binding.wrapAnsi(String(string), Number(columns), hard, wordWrap, trim);
  }

  return { wrapAnsi };
}
