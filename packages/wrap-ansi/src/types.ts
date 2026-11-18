/** Options accepted by `wrapAnsi`. Identical to wrap-ansi 10.0.2. */
export type Options = {
  /**
   * By default the wrap is soft, meaning long words may extend past the column width. Setting this
   * to `true` will make it hard wrap at the column width.
   *
   * @default false
   */
  readonly hard?: boolean;

  /**
   * By default, an attempt is made to split words at spaces, ensuring that they don't extend past
   * the configured columns. If wordWrap is `false`, each column will instead be completely filled
   * splitting words as necessary.
   *
   * @default true
   */
  readonly wordWrap?: boolean;

  /**
   * Whitespace on all lines is removed by default. Set this option to `false` if you don't want to
   * trim.
   *
   * @default true
   */
  readonly trim?: boolean;
};

/** Functions exported by the Node.js addon. */
export type Binding = {
  wrapAnsi(input: string, columns: number, hard: boolean, wordWrap: boolean, trim: boolean): string;
  /** Width with the rules of string-width 8.3.0. Used by the compatibility tests only. */
  stringWidth(input: string): number;
};
