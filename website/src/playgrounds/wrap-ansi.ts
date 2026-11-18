/**
 * Playground for @rust-js-replacements/wrap-ansi: runs the WebAssembly build next to the original
 * wrap-ansi in the visitor's browser and renders both outputs like a terminal.
 */

import wrapAnsi, { init, type Options } from '@rust-js-replacements/wrap-ansi/browser';
import originalWrapAnsi from 'wrap-ansi';

const ESC = '\x1B';
const red = (text: string): string => `${ESC}[31m${text}${ESC}[39m`;
const green = (text: string): string => `${ESC}[32m${text}${ESC}[39m`;
const bold = (text: string): string => `${ESC}[1m${text}${ESC}[22m`;
const link = (url: string, text: string): string => `${ESC}]8;;${url}\x07${text}${ESC}]8;;\x07`;

// Built from code points so that the source stays free of literal emoji.
const PRESETS: readonly { readonly label: string; readonly text: string }[] = [
  {
    label: 'Colored sentence',
    text: `The quick brown ${red('fox jumped over ')}the lazy ${green('dog and then ran away with the unicorn.')}`,
  },
  {
    label: 'CLI help',
    text: `  ${green('--output')}, ${green('-o')}   Write the generated files to this ${bold('directory')} instead of the default build folder. ${ESC}[90m[string]${ESC}[39m`,
  },
  {
    label: 'Japanese',
    text: String.fromCodePoint(
      0x53e4,
      0x6c60,
      0x3084,
      0x86d9,
      0x98db,
      0x3073,
      0x8fbc,
      0x3080,
      0x6c34,
      0x306e,
      0x97f3,
      0x3001,
      0x9759,
      0x3051,
      0x3055,
      0x3084,
      0x5ca9,
      0x306b,
      0x3057,
      0x307f,
      0x5165,
      0x308b,
      0x8749,
      0x306e,
      0x58f0,
    ),
  },
  {
    label: 'Emoji',
    text: `Deploy finished ${String.fromCodePoint(0x2705)} by ${String.fromCodePoint(0x1f468, 0x200d, 0x1f4bb)} from ${String.fromCodePoint(0x1f1eb, 0x1f1f7)} ${String.fromCodePoint(0x1f44d, 0x1f3fd)} thanks to the whole team`,
  },
  {
    label: 'Hyperlink',
    text: `Read ${link('https://github.com/chalk/wrap-ansi', 'the documentation of the original library')} before upgrading.`,
  },
  { label: 'Long word', text: `a ${'supercalifragilisticexpialidocious'.repeat(2)} word` },
];

const SPEED_TEST_MS = 400;
const MAX_COLUMNS = 120;

type Style = { fg?: string; bg?: string; bold?: boolean; dim?: boolean; italic?: boolean };

// SGR sequences and OSC 8 hyperlinks. Assembled from pieces because Biome forbids control
// characters in regular expression literals.
const ESC_PATTERN = String.raw`\u001B`;
const CSI_8BIT_PATTERN = String.raw`\u009B`;
const BEL_PATTERN = String.raw`\u0007`;
const SEQUENCE = new RegExp(
  `${ESC_PATTERN}\\[([0-9;:]*)m|${CSI_8BIT_PATTERN}([0-9;:]*)m|${ESC_PATTERN}\\]8;[^;${BEL_PATTERN}${ESC_PATTERN}]*;([^${BEL_PATTERN}${ESC_PATTERN}]*)(?:${BEL_PATTERN}|${ESC_PATTERN}\\\\)`,
  'y',
);
const INTRODUCER = new RegExp(`[${ESC_PATTERN}${CSI_8BIT_PATTERN}]`);

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function applySgr(style: Style, parameters: string): void {
  const codes = parameters === '' ? [0] : parameters.split(';').map((code) => Number(code));
  for (const code of codes) {
    if (code === 0) {
      for (const key of Object.keys(style) as (keyof Style)[]) {
        delete style[key];
      }
    } else if (code === 1) {
      style.bold = true;
    } else if (code === 2) {
      style.dim = true;
    } else if (code === 3) {
      style.italic = true;
    } else if (code === 22) {
      delete style.bold;
      delete style.dim;
    } else if (code === 23) {
      delete style.italic;
    } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      style.fg = `ansi-${code}`;
    } else if (code === 39) {
      delete style.fg;
    } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      style.bg = `ansi-bg-${code}`;
    } else if (code === 49) {
      delete style.bg;
    }
  }
}

/** Renders the basic SGR styles and OSC 8 hyperlinks as HTML; other sequences are dropped. */
function renderAnsi(text: string): string {
  const style: Style = {};
  let link: string | undefined;
  let html = '';
  let index = 0;

  const appendText = (plain: string): void => {
    if (plain === '') {
      return;
    }

    const classes = [
      style.fg,
      style.bg,
      style.bold ? 'ansi-bold' : '',
      style.dim ? 'ansi-dim' : '',
      style.italic ? 'ansi-italic' : '',
      link === undefined ? '' : 'ansi-link',
    ].filter(Boolean);
    const escaped = escapeHtml(plain);
    html += classes.length > 0 ? `<span class="${classes.join(' ')}">${escaped}</span>` : escaped;
  };

  while (index < text.length) {
    const next = text.slice(index).search(INTRODUCER);
    if (next === -1) {
      appendText(text.slice(index));
      break;
    }

    appendText(text.slice(index, index + next));
    index += next;
    SEQUENCE.lastIndex = index;
    const match = SEQUENCE.exec(text);
    if (match === null) {
      // Not a sequence the renderer knows: skip the introducer, keep the rest as text.
      index++;
      continue;
    }

    const sgr = match[1] ?? match[2];
    if (sgr !== undefined) {
      applySgr(style, sgr.includes(':') ? '' : sgr);
    } else {
      link = match[3] === '' ? undefined : match[3];
    }
    index += match[0].length;
  }

  return html;
}

function ruler(columns: number): string {
  let line = '';
  for (let column = 1; column <= columns; column++) {
    line += column % 10 === 0 ? String((column / 10) % 10) : column % 5 === 0 ? '+' : '.';
  }
  return line;
}

function measureOpsPerSecond(run: () => void): number {
  let iterations = 0;
  let batch = 1;
  const start = performance.now();
  let elapsed = 0;
  while (elapsed < SPEED_TEST_MS) {
    for (let index = 0; index < batch; index++) {
      run();
    }
    iterations += batch;
    batch = Math.min(batch * 2, 4096);
    elapsed = performance.now() - start;
  }
  return (iterations / elapsed) * 1000;
}

export async function mount(container: HTMLElement): Promise<void> {
  await init();

  container.innerHTML = `
    <div class="playground">
      <div class="presets" role="group" aria-label="Examples">
        ${PRESETS.map((preset, index) => `<button type="button" data-preset="${index}">${escapeHtml(preset.label)}</button>`).join('')}
      </div>
      <label class="field">
        <span>Text to wrap (ANSI escape codes are shown as <code>\\x1B</code>)</span>
        <textarea rows="4" spellcheck="false"></textarea>
      </label>
      <label class="field">
        <span>Columns: <strong data-output="columns">20</strong></span>
        <input type="range" name="columns" min="1" max="${MAX_COLUMNS}" value="20">
      </label>
      <div class="options">
        <label><input type="checkbox" name="hard"> hard</label>
        <label><input type="checkbox" name="wordWrap" checked> wordWrap</label>
        <label><input type="checkbox" name="trim" checked> trim</label>
      </div>
      <div class="results">
        <div class="result" data-output="status"></div>
      </div>
      <div class="terminals">
        <figure>
          <figcaption class="muted">Rust (WebAssembly)</figcaption>
          <pre class="terminal" data-output="rust"></pre>
        </figure>
        <figure>
          <figcaption class="muted">Original wrap-ansi 10.0.2</figcaption>
          <pre class="terminal" data-output="original"></pre>
        </figure>
      </div>
      <div class="speed-test">
        <button type="button" data-action="speed">Compare speed in this browser</button>
        <p data-output="speed" class="muted">Runs each implementation on the text above for ${SPEED_TEST_MS} ms. The native Node.js addon is faster than WebAssembly; see the benchmarks above.</p>
      </div>
    </div>`;

  const query = <T extends Element>(selector: string): T => {
    const element = container.querySelector<T>(selector);
    if (element === null) {
      throw new Error(`Playground element ${selector} is missing.`);
    }
    return element;
  };

  const textarea = query<HTMLTextAreaElement>('textarea');
  const columnsInput = query<HTMLInputElement>('input[name="columns"]');
  const columnsOutput = query<HTMLElement>('[data-output="columns"]');
  const hard = query<HTMLInputElement>('input[name="hard"]');
  const wordWrap = query<HTMLInputElement>('input[name="wordWrap"]');
  const trim = query<HTMLInputElement>('input[name="trim"]');
  const rustOutput = query<HTMLElement>('[data-output="rust"]');
  const originalOutput = query<HTMLElement>('[data-output="original"]');
  const statusOutput = query<HTMLElement>('[data-output="status"]');
  const speedOutput = query<HTMLElement>('[data-output="speed"]');

  // The textarea shows ESC as the four characters `\x1B`, so that escape codes can be typed.
  const toEditable = (text: string): string =>
    text.replaceAll(ESC, '\\x1B').replaceAll('\x07', '\\x07');
  const fromEditable = (text: string): string =>
    text.replaceAll('\\x1B', ESC).replaceAll('\\x1b', ESC).replaceAll('\\x07', '\x07');

  const options = (): Options => ({
    hard: hard.checked,
    wordWrap: wordWrap.checked,
    trim: trim.checked,
  });

  const update = (): void => {
    const text = fromEditable(textarea.value);
    const columns = Number(columnsInput.value);
    columnsOutput.textContent = String(columns);
    const rust = wrapAnsi(text, columns, options());
    const original = originalWrapAnsi(text, columns, options());
    const guide = `<span class="terminal-ruler">${ruler(columns)}</span>\n`;
    rustOutput.innerHTML = guide + renderAnsi(rust);
    originalOutput.innerHTML = guide + renderAnsi(original);
    statusOutput.innerHTML =
      rust === original
        ? '<span class="speed speed-faster">Identical output</span>'
        : '<span class="speed speed-slower">Different output: please report this input</span>';
  };

  container.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      textarea.value = toEditable(PRESETS[Number(button.dataset.preset)]?.text ?? '');
      update();
    });
  });
  textarea.addEventListener('input', update);
  columnsInput.addEventListener('input', update);
  for (const checkbox of [hard, wordWrap, trim]) {
    checkbox.addEventListener('change', update);
  }

  query<HTMLButtonElement>('[data-action="speed"]').addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    speedOutput.textContent = 'Measuring...';
    // Let the browser paint the message before the busy loop starts.
    setTimeout(() => {
      const text = fromEditable(textarea.value);
      const columns = Number(columnsInput.value);
      const current = options();
      let sink = 0;
      const original = measureOpsPerSecond(() => {
        sink += originalWrapAnsi(text, columns, current).length;
      });
      const rust = measureOpsPerSecond(() => {
        sink += wrapAnsi(text, columns, current).length;
      });
      const ratio = rust / original;
      speedOutput.innerHTML = `Original: ${Math.round(original).toLocaleString('en-US')} calls/s. Rust (WebAssembly): ${Math.round(rust).toLocaleString('en-US')} calls/s, <span class="speed speed-${ratio >= 1 ? 'faster' : 'slower'}">${ratio.toFixed(2)}x</span>.<span hidden>${sink}</span>`;
      button.disabled = false;
    }, 50);
  });

  textarea.value = toEditable(PRESETS[0]?.text ?? '');
  update();
}
