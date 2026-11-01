/**
 * The sites' current domains, from the moviehawk-domains repo, which heals them twice a day
 * (github.com/ElonMuskOfficial/moviehawk-domains). Read at start, and again when a request comes
 * and the last read is 30 minutes old: in the background, so no request waits for GitHub
 * (stale-while-revalidate, RFC 5861). No timer: an idle server reads nothing.
 */
import { SITES } from './sites.js';

export const DOMAINS_URL = 'https://raw.githubusercontent.com/ElonMuskOfficial/moviehawk-domains/main/domains.json';

// A domain fixed by hand in the repo reaches the API within 30 minutes (GitHub caches the raw
// file for 5).
const MAX_AGE_MS = 30 * 60_000;
const TIMEOUT_MS = 10_000;

/**
 * @param {unknown} domains
 * @returns {string | null} Why `domains` cannot be used (each of a site's requests would fail),
 *   or null.
 */
function problemOf(domains) {
  if (typeof domains !== 'object' || domains === null || Array.isArray(domains)) return 'not an object';
  for (const [label, origin] of Object.entries(domains)) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      return `${label}: not a URL`;
    }
    if (url.protocol !== 'https:' || url.origin !== origin) return `${label}: not an https origin: ${origin}`;
  }
  const missing = SITES.filter((site) => !domains[site]);
  return missing.length ? `no domain for ${missing.join(', ')}` : null;
}

/**
 * @typedef {{ domains: Record<string, string>, engine: ReturnType<typeof import('../engine/index.js').createEngine> }} Config
 * @typedef {{ info: (message: string) => void, warn: (message: string) => void }} Log
 */

/**
 * Reads the domains, and gives the config each request uses.
 *
 * @param {{ bundled: Record<string, string>, makeEngine: (domains: Record<string, string>) => Config['engine'],
 *   url?: string, fetch?: typeof fetch, now?: () => number }} options
 *   `bundled`: domains.json in this repo, used when GitHub does not answer at start. `makeEngine`:
 *   a new engine for new domains (an engine's config never changes).
 * @returns {Promise<{ current: (log: Log) => Config, startedWith: 'github' | 'bundled', startError: string | null }>}
 *   `current`: the config for a request; when the last read is 30 minutes old, it starts the next
 *   one, whose domains later requests get. `log`: the request's, for what that read found.
 * @throws {TypeError} When GitHub does not answer and `bundled` cannot be used either.
 */
export async function liveConfig({ bundled, makeEngine, url = DOMAINS_URL, fetch = globalThis.fetch, now = Date.now }) {
  const read = async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const domains = await response.json();
    const problem = problemOf(domains);
    if (problem) throw new Error(problem);
    return domains;
  };
  const configOf = (domains) => ({ domains, engine: makeEngine(domains) });

  let config;
  let startedWith = 'github';
  let startError = null;
  try {
    config = configOf(await read());
  } catch (error) {
    const problem = problemOf(bundled);
    if (problem) throw new TypeError(`No domains: ${url}: ${error.message}; domains.json: ${problem}`);
    config = configOf(bundled);
    startedWith = 'bundled';
    startError = error.message;
  }
  // From the last try, not the last success: while GitHub fails, it is asked again in 30 minutes,
  // not by every request.
  let lastTry = now();
  let reading = false;

  const refresh = async (log) => {
    try {
      const domains = await read();
      if (JSON.stringify(domains) === JSON.stringify(config.domains)) return;
      config = configOf(domains);
      log.info(`Domains changed: ${JSON.stringify(domains)}`);
    } catch (error) {
      log.warn(`Domains not read from ${url}: ${error.message}; still ${JSON.stringify(config.domains)}`);
    } finally {
      reading = false;
    }
  };

  return {
    current(log) {
      if (!reading && now() - lastTry >= MAX_AGE_MS) {
        lastTry = now();
        reading = true;
        refresh(log);
      }
      return config;
    },
    startedWith,
    startError,
  };
}
