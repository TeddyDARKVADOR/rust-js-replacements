/** Options accepted by `stringWidth` and `stringWidthMany`. Identical to string-width 9.0.0. */
export type Options = {
  /**
   * Count [ambiguous width characters](https://www.unicode.org/reports/tr11/#Ambiguous) as having
   * narrow width (count of 1) instead of wide width (count of 2).
   *
   * @default true
   */
  readonly ambiguousIsNarrow?: boolean;

  /**
   * Whether [ANSI escape codes](https://en.wikipedia.org/wiki/ANSI_escape_code) should be counted.
   *
   * @default false
   */
  readonly countAnsiEscapeCodes?: boolean;
};

/** Functions exported by the Node.js addon and by the WebAssembly module. */
export type Binding = {
  stringWidth(input: string, ambiguousIsNarrow: boolean, countAnsiEscapeCodes: boolean): number;
  stringWidthMany(
    inputs: string[],
    ambiguousIsNarrow: boolean,
    countAnsiEscapeCodes: boolean,
  ): Uint32Array;
  unicodeVersion(): string;
};

/** Public API shared by the Node.js and browser entry points. */
export type StringWidthApi = {
  /** Returns the visual width of a string: the number of terminal columns required to display it. */
  stringWidth(input: string, options?: Options): number;
  /** Returns the visual width of every string in `inputs`, in order. */
  stringWidthMany(inputs: readonly string[], options?: Options): Uint32Array;
};
