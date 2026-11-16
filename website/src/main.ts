import './styles.css';
import {
  findLibrary,
  type HighlightRow,
  highlightRows,
  LIBRARIES,
  type Library,
  nativeSpeedRange,
} from './catalog.ts';
import { latestVersion } from './npm.ts';

/** Overridden at build time by the deployment workflow, so that forks link to themselves. */
const REPOSITORY_URL: string =
  import.meta.env.VITE_REPOSITORY_URL ?? 'https://github.com/TeddyDARKVADOR/rust-js-replacements';

/** A playground module renders an interactive demo into the given element. */
type MountPlayground = (container: HTMLElement) => Promise<void>;

const playgrounds = import.meta.glob<MountPlayground>('./playgrounds/*.ts', { import: 'mount' });

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`The ${selector} element is missing from index.html.`);
  }
  return element;
}

const app = requireElement('#app');

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatSpeed(value: number | undefined): string {
  if (value === undefined) {
    return '<span class="muted">n/a</span>';
  }

  const kind = value >= 1 ? 'faster' : 'slower';
  return `<span class="speed speed-${kind}">${value.toFixed(2)}x</span>`;
}

function repositoryLink(path: string, label: string): string {
  return REPOSITORY_URL === ''
    ? ''
    : `<a href="${escapeHtml(`${REPOSITORY_URL}/${path}`)}">${escapeHtml(label)}</a>`;
}

function installCommand(library: Library): string {
  return `npm install ${library.entry.packageName}`;
}

function badges(library: Library): string {
  const { status, targets, packageName } = library.entry;
  const targetLabels = targets.map((target) => (target === 'node' ? 'Node.js' : 'Browser'));
  return [
    `<span class="badge badge-status">${escapeHtml(status)}</span>`,
    ...targetLabels.map((label) => `<span class="badge">${label}</span>`),
    // Filled in by hydrateNpm() once the registry answers.
    `<span class="badge" data-npm-badge="${escapeHtml(packageName)}" hidden></span>`,
  ].join('');
}

function renderCatalog(): string {
  const cards = LIBRARIES.map((library) => {
    const { entry } = library;
    const range = nativeSpeedRange(library);
    const speed =
      range === undefined
        ? ''
        : `<p class="card-speed">Measured: ${formatSpeed(range.min)} to ${formatSpeed(range.max)} the speed of the original</p>`;
    return `
      <a class="card" href="#/${encodeURIComponent(entry.id)}">
        <div class="card-header">
          <h3>${escapeHtml(entry.packageName)}</h3>
          <div class="badges">${badges(library)}</div>
        </div>
        <p>${escapeHtml(entry.summary)}</p>
        <p class="muted">Replaces <strong>${escapeHtml(entry.original.name)}</strong> ${escapeHtml(entry.original.version)}</p>
        ${speed}
      </a>`;
  }).join('');

  return `
    <section class="hero">
      <h1>Rust-powered replacements for JavaScript libraries</h1>
      <p>
        Same API, same results, a Rust core. Each library runs as a native addon in Node.js and as
        WebAssembly in browsers, and is tested and benchmarked against the library it replaces.
      </p>
      <ul class="principles">
        <li><strong>Researched</strong>: added only when no equivalent Rust-powered package exists.</li>
        <li><strong>Compatible</strong>: verified against the original; every difference is listed.</li>
        <li><strong>Measured</strong>: speedups come from committed benchmarks, slower cases included.</li>
      </ul>
    </section>
    <section>
      <h2>Libraries <span class="count">${LIBRARIES.length}</span></h2>
      <div class="cards">${cards}</div>
    </section>`;
}

function renderPerformance(library: Library, rows: HighlightRow[]): string {
  if (rows.length === 0 || library.runs.length === 0) {
    return '<p class="muted">No benchmark results yet.</p>';
  }

  const header = library.runs
    .map(
      (run) =>
        `<th scope="col">${escapeHtml(run.runtime)}<br><span class="muted">native / WebAssembly</span></th>`,
    )
    .join('');
  const body = rows
    .map(
      (row) => `
        <tr>
          <th scope="row">${escapeHtml(row.label)}</th>
          ${row.values.map((value) => `<td>${formatSpeed(value.native)} / ${formatSpeed(value.webAssembly)}</td>`).join('')}
        </tr>`,
    )
    .join('');
  const first = library.runs[0];
  const environment =
    first === undefined
      ? ''
      : `Measured on ${escapeHtml(first.cpu)}, ${escapeHtml(first.platform)}, ${escapeHtml(first.date)}.`;
  const resultsLink = repositoryLink(
    `tree/main/packages/${library.entry.id}/benchmarks/results`,
    'full results',
  );

  return `
    <p>Throughput relative to ${escapeHtml(library.entry.original.name)} ${escapeHtml(library.entry.original.version)}, in the same process. Above 1.00x is faster.</p>
    <div class="table-wrapper">
      <table>
        <thead><tr><th scope="col">Workload</th>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="muted">${environment} ${resultsLink === '' ? '' : `See the ${resultsLink}.`}</p>`;
}

function renderInstall(library: Library): string {
  const { packageName } = library.entry;
  const command = installCommand(library);
  return `
    <div class="install">
      <code>${escapeHtml(command)}</code>
      <button type="button" class="copy" data-copy="${escapeHtml(command)}">Copy</button>
    </div>
    <p class="muted">Or <code>pnpm add ${escapeHtml(packageName)}</code>, <code>yarn add ${escapeHtml(packageName)}</code>. Prebuilt for Linux, macOS, and Windows (x64 and arm64): no Rust toolchain needed.</p>
    <div data-npm-status="${escapeHtml(packageName)}" data-id="${escapeHtml(library.entry.id)}">
      <p class="muted">Checking npm...</p>
    </div>`;
}

function renderNpmStatus(
  packageName: string,
  id: string,
  version: string | null | undefined,
): string {
  if (typeof version === 'string') {
    const url = `https://www.npmjs.com/package/${packageName}`;
    return `<p class="muted">Latest version on npm: <a href="${escapeHtml(url)}">${escapeHtml(version)}</a>.</p>`;
  }
  if (version === undefined) {
    return '<p class="muted">Could not reach the npm registry to check the latest version.</p>';
  }

  return `
    <p class="notice">Not published on npm yet. Until then, build it from source:</p>
    <pre><code>git clone ${escapeHtml(`${REPOSITORY_URL}.git`)}
cd rust-js-replacements
pnpm install
pnpm run build
pnpm add ./rust-js-replacements/packages/${escapeHtml(id)}   # from your project</code></pre>`;
}

/** Replaces the npm placeholders of the current page with the registry's answer. */
function hydrateNpm(): void {
  for (const badge of document.querySelectorAll<HTMLElement>('[data-npm-badge]')) {
    const packageName = badge.dataset.npmBadge ?? '';
    void latestVersion(packageName).then((version) => {
      if (version === undefined) {
        return;
      }
      badge.hidden = false;
      if (version === null) {
        badge.className = 'badge badge-warning';
        badge.textContent = 'Not on npm yet';
      } else {
        badge.className = 'badge badge-npm';
        badge.textContent = `npm ${version}`;
      }
    });
  }

  for (const status of document.querySelectorAll<HTMLElement>('[data-npm-status]')) {
    const packageName = status.dataset.npmStatus ?? '';
    void latestVersion(packageName).then((version) => {
      status.innerHTML = renderNpmStatus(packageName, status.dataset.id ?? '', version);
    });
  }
}

function renderLibrary(library: Library): string {
  const { entry } = library;
  const list = (items: readonly string[]) =>
    `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  const readme = repositoryLink(`tree/main/packages/${entry.id}#readme`, 'Documentation');

  return `
    <nav class="breadcrumb"><a href="#/">All libraries</a></nav>
    <section class="library-header">
      <h1>${escapeHtml(entry.packageName)}</h1>
      <div class="badges">${badges(library)}</div>
      <p class="lead">${escapeHtml(entry.summary)}</p>
      <p class="muted">
        Replaces <a href="${escapeHtml(entry.original.npmUrl)}">${escapeHtml(entry.original.name)} ${escapeHtml(entry.original.version)}</a>
        (<a href="${escapeHtml(entry.original.repositoryUrl)}">source</a>)${readme === '' ? '' : ` &middot; ${readme}`}
      </p>
    </section>

    <section><h2>Install</h2>${renderInstall(library)}</section>

    <section>
      <h2>What it does</h2>
      ${entry.description.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      <pre><code>${escapeHtml(entry.usage.join('\n'))}</code></pre>
    </section>

    <section>
      <h2>Why use it</h2>
      <h3>Compatibility</h3>
      ${list(entry.compatibility)}
      <h3>Performance</h3>
      ${renderPerformance(library, highlightRows(library))}
      <h3>Differences from the original</h3>
      ${list(entry.differences)}
    </section>

    <section>
      <h2>Try it</h2>
      <div id="playground"><p class="muted">Loading the playground...</p></div>
    </section>`;
}

async function mountPlayground(id: string): Promise<void> {
  const container = document.querySelector<HTMLElement>('#playground');
  if (container === null) {
    return;
  }

  const load = playgrounds[`./playgrounds/${id}.ts`];
  if (load === undefined) {
    container.innerHTML = '<p class="muted">No playground for this library yet.</p>';
    return;
  }

  try {
    const mount = await load();
    await mount(container);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    container.innerHTML = `<p class="error">The playground failed to load: ${escapeHtml(message)}</p>`;
  }
}

function route(): void {
  const id = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  const library = id === '' ? undefined : findLibrary(id);

  if (library === undefined) {
    document.title = 'rust-js-replacements';
    app.innerHTML =
      id === ''
        ? renderCatalog()
        : `<p class="error">Unknown library "${escapeHtml(id)}".</p>${renderCatalog()}`;
  } else {
    document.title = `${library.entry.packageName} - rust-js-replacements`;
    app.innerHTML = renderLibrary(library);
    void mountPlayground(library.entry.id);
  }

  hydrateNpm();

  window.scrollTo(0, 0);
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button.copy');
  const text = button?.dataset.copy;
  if (button == null || text === undefined) {
    return;
  }

  navigator.clipboard.writeText(text).then(
    () => {
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1500);
    },
    () => {
      button.textContent = 'Copy failed';
    },
  );
});

const siteLinks = document.querySelector<HTMLElement>('#site-links');
if (siteLinks !== null && REPOSITORY_URL !== '') {
  siteLinks.innerHTML = `<a href="${escapeHtml(REPOSITORY_URL)}">GitHub</a>`;
}

window.addEventListener('hashchange', route);
route();
