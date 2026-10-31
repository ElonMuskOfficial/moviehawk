/**
 * A provider's search, read by its provider: the posts that match a query, one page at a time.
 */
import { EngineError } from './errors.js';
import { retry } from './http.js';
import { providerOf } from './providers/index.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

/**
 * Searches a site's posts as its search box does (1 request; retried): 4KHDHub's search page,
 * HDHub4u's search API.
 *
 * @param {string} url - Any URL on the provider's site, such as "https://new10.hdhub4u.cl", on any
 *   of its domains.
 * @param {string} query - As a user types it.
 * @param {number} [page] - From 1.
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   `domains`: as for onCurrentDomain (urls.js).
 * @returns {Promise<{ posts: import('./providers/index.js').PostCard[], hasNextPage: boolean }>}
 *   As scrapeListing: the page's posts as cards, as many as the site gives (4KHDHub 18, HDHub4u
 *   15); none when nothing matches.
 * @throws {EngineError} `notFound` for a page after the last; `unsupported` for a URL on no site
 *   the engine reads; and the provider's errors.
 * @throws {TypeError} For a string that is not a web URL, a query without text, or a page that is
 *   not a whole number from 1.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function searchPosts(url, query, page = 1, { domains = {}, ...options } = {}) {
  const parsed = webUrlOf(url);
  if (!parsed) throw new TypeError(`Not a web URL: ${url}`);
  if (typeof query !== 'string' || !query.trim()) throw new TypeError(`Not a search query: ${query}`);
  if (!Number.isInteger(page) || page < 1) throw new TypeError(`Not a search page: ${page}`);
  const provider = providerOf(parsed.href);
  if (!provider) throw new EngineError('unsupported', 'The engine does not search posts of this site', { url });
  const { origin } = new URL(onCurrentDomain(parsed, domains));
  return retry(() => provider.search(origin, query.trim(), page, options));
}
