/**
 * The sites' current domains, from the moviehawk-domains repo, which heals them twice a day
 * (github.com/ElonMuskOfficial/moviehawk-domains). Read at start, and again when a request comes
 * and the last read is 30 minutes old: in the background, so no request waits for GitHub
 * (stale-while-revalidate, RFC 5861). No timer: an idle server reads nothing.
 */
import { SITES } from './sites.js';

export const DOMAINS_URL = 'https://raw.githubusercontent.com/ElonMuskOfficial/moviehawk-domains/main/domains.json';

// Only for when DOMAINS_URL cannot be read: the domains of 2026-11-01. A site that moved since
// still answers on its old domain while it redirects to the new one (for days).
export const FALLBACK_DOMAINS = Object.freeze({
  hdhub4u: 'https://new10.hdhub4u.cl',
  '4khdhub': 'https://4khdhub.one',
  hblinks: 'https://hblinks.lol',
  hubdrive: 'https://hubdrive.bar',
  hubcloud: 'https://hubcloud.ist',
});

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
 * Reads the domains from DOMAINS_URL.
 *
 * @param {{ url?: string, fetch?: typeof fetch }} [options]
 * @returns {Promise<Record<string, string>>}
 * @throws {Error} When the URL does not answer, or gives domains that cannot be used.
 */
export async function readDomains({ url = DOMAINS_URL, fetch = globalThis.fetch } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const domains = await response.json();
  const problem = problemOf(domains);
  if (problem) throw new Error(problem);
  return domains;
}

/**
 * The domains to start with: DOMAINS_URL's, or FALLBACK_DOMAINS when it cannot be read.
 *
 * @param {{ url?: string, fetch?: typeof fetch }} [options]
 * @returns {Promise<{ domains: Record<string, string>, fallbackBecause: string | null }>}
 *   `fallbackBecause`: why the URL's were not used, or null.
 */
export async function startDomains(options) {
  try {
    return { domains: await readDomains(options), fallbackBecause: null };
  } catch (error) {
    return { domains: FALLBACK_DOMAINS, fallbackBecause: error.message };
  }
}

/**
 * @typedef {{ domains: Record<string, string>, engine: ReturnType<typeof import('../engine/index.js').createEngine> }} Config
 * @typedef {{ info: (message: string) => void, warn: (message: string) => void }} Log
 */

/**
 * Reads the domains, and gives the config each request uses.
 *
 * @param {{ makeEngine: (domains: Record<string, string>) => Config['engine'],
 *   url?: string, fetch?: typeof fetch, now?: () => number }} options
 *   `makeEngine`: a new engine for new domains (an engine's config never changes).
 * @returns {Promise<{ current: (log: Log) => Config, fallbackBecause: string | null }>}
 *   `current`: the config for a request; when the last read is 30 minutes old, it starts the next
 *   one, whose domains later requests get. `log`: the request's, for what that read found.
 *   `fallbackBecause`: why it started with FALLBACK_DOMAINS, or null.
 */
export async function liveConfig({ makeEngine, url = DOMAINS_URL, fetch = globalThis.fetch, now = Date.now }) {
  const read = () => readDomains({ url, fetch });
  const configOf = (domains) => ({ domains, engine: makeEngine(domains) });

  const start = await startDomains({ url, fetch });
  let config = configOf(start.domains);
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
    fallbackBecause: start.fallbackBecause,
  };
}
