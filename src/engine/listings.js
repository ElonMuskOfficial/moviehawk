/**
 * A provider's listing pages, read by its provider: the posts on one page.
 */
import { EngineError } from './errors.js';
import { retry } from './http.js';
import { providerOf } from './providers/index.js';
import { onCurrentDomain, webUrlOf } from './urls.js';

/**
 * Reads one listing page (1 request; retried). Both providers number them the same way: page 1 is
 * "/", page n is "/page/<n>/". To read a whole catalog, read pages 1, 2, 3… while `hasNextPage`.
 *
 * @param {string} url - Any URL on the provider's site, such as "https://new10.hdhub4u.cl", on any
 *   of its domains.
 * @param {number} [page] - From 1.
 * @param {import('./http.js').RequestOptions & { domains?: Record<string, string> }} [options]
 *   `domains`: as for onCurrentDomain (urls.js).
 * @returns {Promise<{ posts: import('./providers/index.js').PostCard[], hasNextPage: boolean }>}
 *   `posts`: the page's posts, in page order, as their cards show them: `{ url, title, posterUrl }`;
 *   as many as the page has (HDHub4u: 85 on page 1, 15 on the others). Pages can share posts
 *   (HDHub4u's page 1 lists those of its pages 2 to 6 too). `hasNextPage`: whether the page's
 *   pagination links a next one.
 * @throws {EngineError} `notFound` for a page after the last; `unsupported` for a URL on no site
 *   the engine reads; and the provider's errors.
 * @throws {TypeError} For a string that is not a web URL, or a page that is not a whole number
 *   from 1.
 * @throws {unknown} The caller's own reason, as it is, when the caller cancels (`signal`).
 */
export async function scrapeListing(url, page = 1, { domains = {}, ...options } = {}) {
  const parsed = webUrlOf(url);
  if (!parsed) throw new TypeError(`Not a web URL: ${url}`);
  if (!Number.isInteger(page) || page < 1) throw new TypeError(`Not a listing page: ${page}`);
  const provider = providerOf(parsed.href);
  if (!provider) throw new EngineError('unsupported', `The engine does not read listings of ${parsed.hostname}`, { url });
  const { origin } = new URL(onCurrentDomain(parsed, domains));
  return retry(() => provider.listing(page === 1 ? `${origin}/` : `${origin}/page/${page}/`, options));
}
