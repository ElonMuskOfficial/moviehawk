/**
 * The current domains (of the sites, gateways and hosts whose domain rotates, by hostname label),
 * from the moviehawk-domains repo, which heals them twice a day
 * (github.com/ElonMuskOfficial/moviehawk-domains). Read once, at start: Wasmer starts the API again
 * on every deploy, and after a few idle minutes, so new domains reach it then. A site that moved
 * still answers on its old domain meanwhile, while it redirects to the new one (for days).
 */

export const DOMAINS_URL = 'https://raw.githubusercontent.com/ElonMuskOfficial/moviehawk-domains/main/domains.json';

// Only for when DOMAINS_URL cannot be read: the domains of 2026-11-03. A site that moved since
// still answers on its old domain while it redirects to the new one (for days). Every site,
// gateway and host the engine reads has one, so the API reads each on its own domain, never on the
// one a link names.
export const FALLBACK_DOMAINS = Object.freeze({
  hdhub4u: 'https://new10.hdhub4u.cl',
  '4khdhub': 'https://4khdhub.one',
  vegamovies: 'https://vegamovies.lease',
  rogmovies: 'https://rogmovies.im',
  greenmotors: 'https://greenmotors.cc',
  hblinks: 'https://hblinks.lol',
  hubdrive: 'https://hubdrive.bar',
  nexdrive: 'https://nexdrive.beer',
  hubcloud: 'https://hubcloud.ist',
  hubcdn: 'https://hubcdn.wiki',
  vcloud: 'https://vcloud.beer',
  fastdl: 'https://fastdl.beer',
  // Posts link one.vegadrive.app, which redirects here.
  vegadrive: 'https://one.vegadrive.me',
});

const TIMEOUT_MS = 10_000;

/**
 * @param {unknown} domains
 * @returns {string | null} Why `domains` cannot be used (each of a site's requests would fail),
 *   or null.
 */
function unusableBecause(domains) {
  if (typeof domains !== 'object' || domains === null || Array.isArray(domains)) return 'not an object';
  for (const [label, origin] of Object.entries(domains)) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      return `${label}: not a URL`;
    }
    // An origin, without a path: "https://new10.hdhub4u.cl/" would make "https://new10.hdhub4u.cl//<post>/".
    if (url.origin !== origin) return `${label}: not an origin: ${origin}`;
  }
  // Every label of FALLBACK_DOMAINS, or its URLs would be read on whatever domain a link names.
  const missing = Object.keys(FALLBACK_DOMAINS).filter((label) => !domains[label]);
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
  const reason = unusableBecause(domains);
  if (reason) throw new Error(reason);
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
