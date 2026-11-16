/**
 * Looks up packages on the npm registry from the browser (the registry allows cross-origin
 * requests), so that pages switch to the npm install instructions as soon as a package is
 * published, without rebuilding the site.
 */

/** The latest version, `null` when the package is not on npm, `undefined` when npm is unreachable. */
export type NpmVersion = string | null | undefined;

const REGISTRY_URL = 'https://registry.npmjs.org';
const cache = new Map<string, Promise<NpmVersion>>();

async function fetchLatestVersion(packageName: string): Promise<NpmVersion> {
  try {
    const response = await fetch(`${REGISTRY_URL}/${packageName.replace('/', '%2F')}/latest`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      return undefined;
    }

    const manifest: unknown = await response.json();
    const version =
      typeof manifest === 'object' && manifest !== null && 'version' in manifest
        ? manifest.version
        : undefined;
    return typeof version === 'string' ? version : undefined;
  } catch {
    // Offline, blocked by an extension, or a network error: the caller shows a neutral state.
    return undefined;
  }
}

export function latestVersion(packageName: string): Promise<NpmVersion> {
  let pending = cache.get(packageName);
  if (pending === undefined) {
    pending = fetchLatestVersion(packageName);
    cache.set(packageName, pending);
  }
  return pending;
}
