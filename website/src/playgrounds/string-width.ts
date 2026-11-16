/**
 * Playground for @rust-js-replacements/string-width: runs the WebAssembly build next to the
 * original string-width in the visitor's browser.
 */

import stringWidth, { init, type Options } from '@rust-js-replacements/string-width/browser';
import originalStringWidth from 'string-width';

const ESC = '\x1B';

// Built from code points so that the source stays free of literal emoji.
const PRESETS: readonly { readonly label: string; readonly text: string }[] = [
  { label: 'Plain ASCII', text: 'Hello, world!' },
  { label: 'Chinese', text: String.fromCodePoint(0x4f60, 0x597d, 0xff0c, 0x4e16, 0x754c) },
  {
    label: 'Emoji',
    text: `family ${String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)} flag ${String.fromCodePoint(0x1f1fa, 0x1f1f8)} keycap 1${String.fromCodePoint(0xfe0f, 0x20e3)}`,
  },
  {
    label: 'ANSI colors',
    text: `${ESC}[32mpassed${ESC}[39m 12 tests, ${ESC}[1m0 failed${ESC}[22m`,
  },
  {
    label: 'Combining marks',
    text: `Tie${String.fromCodePoint(0x302, 0x301)}ng Vie${String.fromCodePoint(0x323, 0x302)}t`,
  },
  {
    label: 'Table row',
    text: `${String.fromCodePoint(0x2502)} ${String.fromCodePoint(0x6587, 0x4ef6)} ${String.fromCodePoint(0x2502)} OK ${String.fromCodePoint(0x2705)} ${String.fromCodePoint(0x2502)}`,
  },
];

const MAX_CLUSTERS = 80;
const SPEED_TEST_MS = 400;

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function codePoints(cluster: string): string {
  return [...cluster]
    .map(
      (character) =>
        `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`,
    )
    .join(' ');
}

/** Shows invisible characters (controls, ESC) so that the cluster table stays readable. */
function visible(cluster: string): string {
  return [...cluster]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0) ? '.' : character;
    })
    .join('');
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
        <span>Text to measure</span>
        <textarea rows="3" spellcheck="false"></textarea>
      </label>
      <div class="options">
        <label><input type="checkbox" name="ambiguousIsNarrow" checked> ambiguousIsNarrow</label>
        <label><input type="checkbox" name="countAnsiEscapeCodes"> countAnsiEscapeCodes</label>
      </div>
      <div class="results">
        <div class="result"><span class="muted">Rust (WebAssembly)</span><strong data-output="rust">0</strong></div>
        <div class="result"><span class="muted">Original string-width 9.0.0</span><strong data-output="original">0</strong></div>
        <div class="result" data-output="status"></div>
      </div>
      <details>
        <summary>Width of each grapheme cluster</summary>
        <div data-output="clusters"></div>
      </details>
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
  const ambiguous = query<HTMLInputElement>('input[name="ambiguousIsNarrow"]');
  const countAnsi = query<HTMLInputElement>('input[name="countAnsiEscapeCodes"]');
  const rustOutput = query<HTMLElement>('[data-output="rust"]');
  const originalOutput = query<HTMLElement>('[data-output="original"]');
  const statusOutput = query<HTMLElement>('[data-output="status"]');
  const clustersOutput = query<HTMLElement>('[data-output="clusters"]');
  const speedOutput = query<HTMLElement>('[data-output="speed"]');
  const segmenter = new Intl.Segmenter();

  const options = (): Options => ({
    ambiguousIsNarrow: ambiguous.checked,
    countAnsiEscapeCodes: countAnsi.checked,
  });

  const update = (): void => {
    const text = textarea.value;
    const rust = stringWidth(text, options());
    const original = originalStringWidth(text, options());
    rustOutput.textContent = String(rust);
    originalOutput.textContent = String(original);
    statusOutput.innerHTML =
      rust === original
        ? '<span class="speed speed-faster">Identical results</span>'
        : '<span class="speed speed-slower">Different results: please report this input</span>';

    if (text.includes(ESC) || text.includes('\x9B')) {
      clustersOutput.innerHTML =
        '<p class="muted">Not shown for text with escape codes: a sequence spans several clusters and only has a width as a whole.</p>';
      return;
    }

    const clusters = [...segmenter.segment(text)].slice(0, MAX_CLUSTERS);
    clustersOutput.innerHTML = `
      <div class="table-wrapper"><table>
        <thead><tr><th scope="col">Cluster</th><th scope="col">Code points</th><th scope="col">Width</th></tr></thead>
        <tbody>${clusters
          .map(
            ({ segment }) =>
              `<tr><td class="cluster">${escapeHtml(visible(segment))}</td><td><code>${codePoints(segment)}</code></td><td>${stringWidth(segment, options())}</td></tr>`,
          )
          .join('')}</tbody>
      </table></div>`;
  };

  container.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      textarea.value = PRESETS[Number(button.dataset.preset)]?.text ?? '';
      update();
    });
  });
  textarea.addEventListener('input', update);
  ambiguous.addEventListener('change', update);
  countAnsi.addEventListener('change', update);

  query<HTMLButtonElement>('[data-action="speed"]').addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    speedOutput.textContent = 'Measuring...';
    // Let the browser paint the message before the busy loop starts.
    setTimeout(() => {
      const text = textarea.value;
      const current = options();
      let sink = 0;
      const original = measureOpsPerSecond(() => {
        sink += originalStringWidth(text, current);
      });
      const rust = measureOpsPerSecond(() => {
        sink += stringWidth(text, current);
      });
      const ratio = rust / original;
      speedOutput.innerHTML = `Original: ${Math.round(original).toLocaleString('en-US')} calls/s. Rust (WebAssembly): ${Math.round(rust).toLocaleString('en-US')} calls/s, <span class="speed speed-${ratio >= 1 ? 'faster' : 'slower'}">${ratio.toFixed(2)}x</span>.<span hidden>${sink}</span>`;
      button.disabled = false;
    }, 50);
  });

  textarea.value = PRESETS[2]?.text ?? '';
  update();
}
